'''Потоковая (SSE) отдача ответа в обычном чате — ТОЛЬКО для self-hosted-развёртывания
(см. deploy/server.py, маршрут POST /api/ai/stream). Облачные функции poehali.dev не
поддерживают долгие потоковые HTTP-ответы: у них жёсткий контракт handler(event, context) -> dict
(весь ответ одним куском) и таймаут выполнения — там сотрудник по-прежнему получает ответ обычным
способом через action=send_message (см. generate.py, handle_send_message), это НЕ меняется.
На self-hosted сервере пользователя backend работает как обычный процесс FastAPI (deploy/server.py)
без этих ограничений — там доступен честный token-by-token стриминг.

Этот модуль НЕ участвует в обычной карте ACTIONS (backend/ai/index.py) и не задействован в облаке —
его вызывает напрямую только deploy/server.py, если файл присутствует (self-hosted). Если файла нет
(например, self-hosted-пользователь ещё не скопировал этот апдейт) — deploy/server.py отвечает 404,
а фронт (см. useAiSection.ts, AI_STREAM_URL) сам переходит на обычный запрос.

Формат SSE-события для фронта (см. src/pages/index/useAiSection.ts, sendMessageStream):
  data: {"chatId": ..., "userMessageId": ..., "userCreatedAt": "..."}\n\n  — подтверждение старта
  data: {"reasoningDelta": "кусочек мыслей"}\n\n                          — кусочек ХОДА РАССУЖДЕНИЙ
                                                                            (только у thinking-моделей,
                                                                            приходит РАНЬШЕ delta)
  data: {"delta": "кусочек текста"}\n\n                                    — очередной кусочек ответа
  data: {"error": "код", "message": "текст"}\n\n                          — ошибка
  data: {"done": true, "assistantMessageId": ..., "costRub": ..., ...}\n\n — поток завершён

Дублирует часть логики handle_send_message (generate.py) — сохранение сообщений в БД, лимиты,
историю диалога, кеширование промпта, veb-поиск. Так и должно быть: SSE-генератор и обычный
dict-handler — разные HTTP-контракты, объединять их ценой усложнения обоих не стоит. Поддерживает
только режимы chat/code (как обычный чат) — заполнение документов, генерация изображений/видео
по-прежнему идут обычным запросом.'''
import json
import traceback
import urllib.error
import urllib.request

from common import (
    _schema, _db, _current_user, _service_key, _get_or_create_usage, _current_month,
    _history_row_to_message, _log_ai_error, _cacheable_system_message,
    MAX_HISTORY_MESSAGES, CODE_SYSTEM_PROMPT, AITUNNEL_BASE,
)

# Единый таймаут с обычным (нестримовым) чатом — см. generate.py, CHAT_TIMEOUT_SEC. Значение
# продублировано здесь (не импортировано), чтобы этот модуль оставался самодостаточным и не тянул
# лишние зависимости из generate.py — но должно совпадать с CHAT_TIMEOUT_SEC при правках.
CHAT_TIMEOUT_SEC = 150


def _sse(payload: dict) -> bytes:
    return f'data: {json.dumps(payload, ensure_ascii=False)}\n\n'.encode('utf-8')


def stream_send_message(headers: dict, body: dict):
    '''Генератор байтов в формате SSE — используется deploy/server.py внутри StreamingResponse.
    headers — заголовки HTTP-запроса (ключи в нижнем регистре у FastAPI Request.headers),
    body — уже распарсенное тело JSON запроса (action не нужен, эндпоинт всегда = send_message).'''
    token = headers.get('x-auth-token') or ''
    schema = _schema()
    conn = _db()
    cur = conn.cursor()

    try:
        me = _current_user(cur, schema, token)
        if not me:
            yield _sse({'error': 'unauthorized'})
            return
        if not me['can_access']:
            yield _sse({'error': 'forbidden'})
            return

        model = (body.get('model') or '').strip()
        content = (body.get('content') or '').strip()
        chat_id = body.get('chatId')
        mode = body.get('mode') if body.get('mode') in ('chat', 'code') else 'chat'
        attachments = body.get('attachments') or []
        if not model or not content:
            yield _sse({'error': 'bad_request'})
            return

        spent, limit_ = _get_or_create_usage(cur, schema, me['id'])
        if spent >= limit_:
            yield _sse({'error': 'limit_exceeded', 'spentRub': spent, 'limitRub': limit_})
            return

        api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
        if not api_key:
            yield _sse({'error': 'aitunnel_not_configured'})
            return

        if chat_id:
            cur.execute(f"SELECT id, mode FROM {schema}.ai_chats WHERE id = %s AND user_id = %s", (chat_id, me['id']))
            row = cur.fetchone()
            if not row:
                yield _sse({'error': 'not_found'})
                return
            mode = row[1] or mode
        else:
            title = content[:60] + ('…' if len(content) > 60 else '')
            cur.execute(
                f"INSERT INTO {schema}.ai_chats (user_id, title, mode, model) VALUES (%s, %s, %s, %s) RETURNING id",
                (me['id'], title, mode, model)
            )
            chat_id = cur.fetchone()[0]

        cur.execute(
            f"INSERT INTO {schema}.ai_messages (chat_id, role, content, attachments) VALUES (%s, 'user', %s, %s) RETURNING id, created_at",
            (chat_id, content, json.dumps(attachments) if attachments else None)
        )
        user_msg_id, user_created_at = cur.fetchone()

        cur.execute(
            f"SELECT role, content, attachments FROM {schema}.ai_messages WHERE chat_id = %s ORDER BY id DESC LIMIT %s",
            (chat_id, MAX_HISTORY_MESSAGES)
        )
        history = list(reversed(cur.fetchall()))
        messages = [_history_row_to_message(role, text, atts) for role, text, atts in history]
        if mode == 'code':
            # Кеширование промпта — тот же паттерн, что handle_send_message в generate.py (см.
            # common.py, _cacheable_system_message): CODE_SYSTEM_PROMPT одинаков на каждое
            # сообщение режима «код», выгодный кэшируемый префикс.
            messages = [_cacheable_system_message(CODE_SYSTEM_PROMPT)] + messages

        yield _sse({'chatId': chat_id, 'userMessageId': user_msg_id, 'userCreatedAt': user_created_at.isoformat()})

        payload = json.dumps({
            'model': model, 'messages': messages, 'max_tokens': 4000, 'stream': True,
            'tools': [{'type': 'aitunnel:web_search'}],
            # session_id — та же привязка к провайдеру кеша, что в обычном (нестримовом) запросе,
            # см. generate.py handle_send_message.
            'session_id': f'era-chat-{chat_id}',
        }).encode('utf-8')
        req = urllib.request.Request(
            f'{AITUNNEL_BASE}/chat/completions', data=payload, method='POST',
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'},
        )

        try:
            resp = urllib.request.urlopen(req, timeout=CHAT_TIMEOUT_SEC)
        except urllib.error.HTTPError as e:
            raw = e.read().decode('utf-8', 'ignore')
            try:
                message = (json.loads(raw).get('error') or {}).get('message') or raw
            except Exception:
                message = raw or str(e)
            yield _sse({'error': 'aitunnel_error', 'message': message, 'userMessageId': user_msg_id, 'chatId': chat_id})
            return
        except urllib.error.URLError as e:
            yield _sse({'error': 'aitunnel_unreachable', 'message': str(e.reason), 'userMessageId': user_msg_id, 'chatId': chat_id})
            return

        full_text = []
        full_reasoning = []
        used_model = model
        cost_rub = 0
        stream_error = None
        try:
            buffer = b''
            while True:
                chunk = resp.read(1024)
                if not chunk:
                    break
                buffer += chunk
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    line = line.strip()
                    if not line.startswith(b'data:'):
                        continue
                    data = line[5:].strip()
                    if data == b'[DONE]':
                        continue
                    try:
                        parsed = json.loads(data.decode('utf-8'))
                    except Exception:
                        continue
                    if parsed.get('error'):
                        stream_error = parsed['error'].get('message') or 'Ошибка модели во время генерации'
                        break
                    choice = (parsed.get('choices') or [{}])[0]
                    delta = choice.get('delta') or {}
                    # reasoning-дельты у "думающих" моделей приходят РАНЬШЕ, чем content — модель
                    # сначала "думает" вслух, потом выдаёт итоговый ответ (см.
                    # docs/ai-tunnel-api-reference.md, "Токены рассуждений", раздел "Стриминг").
                    reasoning_delta = delta.get('reasoning') or ''
                    if reasoning_delta:
                        full_reasoning.append(reasoning_delta)
                        yield _sse({'reasoningDelta': reasoning_delta})
                    delta_text = delta.get('content') or ''
                    if delta_text:
                        full_text.append(delta_text)
                        yield _sse({'delta': delta_text})
                    if parsed.get('model'):
                        used_model = parsed['model']
                    usage = parsed.get('usage')
                    if usage:
                        cost_rub = usage.get('cost_rub') or cost_rub
                if stream_error:
                    break
        finally:
            resp.close()

        answer = ''.join(full_text).strip()
        reasoning = ''.join(full_reasoning).strip() or None

        if stream_error and not answer:
            yield _sse({'error': 'aitunnel_error', 'message': stream_error, 'userMessageId': user_msg_id, 'chatId': chat_id})
            return

        cur.execute(
            f"INSERT INTO {schema}.ai_messages (chat_id, role, content, model, cost_rub, reasoning) "
            f"VALUES (%s, 'assistant', %s, %s, %s, %s) RETURNING id, created_at",
            (chat_id, answer, used_model, cost_rub, reasoning)
        )
        assistant_msg_id, assistant_created_at = cur.fetchone()
        cur.execute(
            f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
            (cost_rub, me['id'], _current_month())
        )
        cur.execute(f"UPDATE {schema}.ai_chats SET updated_at = NOW() WHERE id = %s", (chat_id,))

        yield _sse({
            'done': True,
            'chatId': chat_id,
            'assistantMessageId': assistant_msg_id,
            'assistantCreatedAt': assistant_created_at.isoformat(),
            'model': used_model,
            'costRub': float(cost_rub),
            'usage': {'spentRub': spent + float(cost_rub), 'limitRub': limit_},
            'warning': stream_error,
        })
    except Exception as e:
        try:
            _log_ai_error(schema, (locals().get('me') or {}).get('id'), 'send_message_stream', 'exception', 500,
                          f'{type(e).__name__}: {e}\n{traceback.format_exc()[-1500:]}',
                          model=body.get('model'), chat_id=body.get('chatId'))
        except Exception:
            pass
        yield _sse({'error': 'server_error'})
    finally:
        try:
            cur.close(); conn.close()
        except Exception:
            pass
