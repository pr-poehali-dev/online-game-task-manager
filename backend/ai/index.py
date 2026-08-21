import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import psycopg2


def _cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json',
    }


def _schema():
    return os.environ.get('MAIN_DB_SCHEMA', 'public')


def _db():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    return conn


def _bad(err, status=400):
    return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps({'error': err})}


def _ok(payload):
    return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps(payload, default=str)}


def _current_user(cur, schema, token):
    '''Право ai_access — ОТДЕЛЬНОЕ привилегированное право (см. db_migrations V0076,
    backend/admin/index.py ALL_PERMISSIONS/PRIVILEGED_PERMISSIONS), по умолчанию False даже для
    role == 'admin', пока не выдано явно владельцем проекта — тот же паттерн, что logs_view в
    backend/logs/index.py. team_manage/role проверяются отдельно там, где это нужно (action=balance
    — общий остаток аккаунта AI Tunnel виден только тем, кто управляет командой).'''
    if not token:
        return None
    cur.execute(
        f"SELECT u.id, u.role, u.permissions FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
        f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
        (token,)
    )
    row = cur.fetchone()
    if not row:
        return None
    uid, role, perms_raw = row
    perms = perms_raw if isinstance(perms_raw, dict) else {}
    can_access = perms.get('ai_access')
    can_access = False if can_access is None else bool(can_access)
    can_manage_team = role == 'admin' or bool(perms.get('team_manage'))
    return {'id': uid, 'role': role, 'can_access': can_access, 'can_manage_team': can_manage_team}


def _service_key(cur, schema, key):
    cur.execute(f"SELECT value FROM {schema}.service_keys WHERE key = %s", (key,))
    row = cur.fetchone()
    return row[0] if row and row[0] else None


AITUNNEL_BASE = 'https://api.aitunnel.ru/v1'
AITUNNEL_PUBLIC_BASE = 'https://api.aitunnel.ru/public/aitunnel'

# Сколько последних сообщений диалога отправляем модели как контекст — защита от неограниченного
# роста запроса (и его стоимости) в очень длинных чатах. AI Tunnel считает стоимость по фактически
# отправленным токенам, поэтому урезаем историю на нашей стороне.
MAX_HISTORY_MESSAGES = 30

# Публичный каталог моделей (см. docs/ai-tunnel-api-reference.md, раздел "Список моделей") не
# требует ключа и общий для всех пользователей — кешируем в памяти процесса на 10 минут, чтобы не
# дёргать AI Tunnel на каждое открытие раздела "AI". Кеш переживает только "тёплые" вызовы одного
# инстанса функции — это нормально, это просто снижение частоты внешних запросов, а не источник
# истины.
_MODELS_CACHE: dict = {}
_MODELS_CACHE_TTL = 600


def _fetch_models(group):
    now = time.time()
    cached = _MODELS_CACHE.get(group)
    if cached and now - cached[0] < _MODELS_CACHE_TTL:
        return cached[1]
    req = urllib.request.Request(f'{AITUNNEL_PUBLIC_BASE}/models/{group}', method='GET')
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    _MODELS_CACHE[group] = (now, data)
    return data


def _aitunnel_request(path, api_key, payload, timeout=45):
    '''POST-запрос к AI Tunnel (chat/completions и т.д.) с ключом проекта. Возвращает (data, None)
    при успехе либо (None, (statusCode, error_payload)) при ошибке — единый формат для отдачи
    клиенту без изменений (AI Tunnel уже отдаёт понятный {"error": {"code","message"}}).'''
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        f'{AITUNNEL_BASE}{path}', data=body, method='POST',
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8')), None
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'ignore')
        try:
            parsed = json.loads(raw)
            message = (parsed.get('error') or {}).get('message') or raw
        except Exception:
            message = raw or str(e)
        return None, (e.code if 400 <= e.code < 600 else 502, {'error': 'aitunnel_error', 'message': message})
    except urllib.error.URLError as e:
        return None, (502, {'error': 'aitunnel_unreachable', 'message': str(e.reason)})


def _current_month():
    return datetime.now(timezone.utc).date().replace(day=1)


def _get_or_create_usage(cur, schema, user_id):
    month = _current_month()
    cur.execute(
        f"INSERT INTO {schema}.ai_usage (user_id, month) VALUES (%s, %s) "
        f"ON CONFLICT (user_id, month) DO NOTHING",
        (user_id, month)
    )
    cur.execute(
        f"SELECT spent_rub, limit_rub FROM {schema}.ai_usage WHERE user_id = %s AND month = %s",
        (user_id, month)
    )
    spent, limit_ = cur.fetchone()
    return float(spent), float(limit_)


def _chat_to_dict(row):
    cid, title, mode, model, pinned, created_at, updated_at = row
    return {
        'id': cid, 'title': title, 'mode': mode, 'model': model, 'pinned': pinned,
        'createdAt': created_at.isoformat() if created_at else None,
        'updatedAt': updated_at.isoformat() if updated_at else None,
    }


def _message_to_dict(row):
    mid, role, content, attachments, model, cost_rub, job_status, created_at = row
    return {
        'id': mid, 'role': role, 'content': content, 'attachments': attachments,
        'model': model, 'costRub': float(cost_rub) if cost_rub is not None else None,
        'jobStatus': job_status, 'createdAt': created_at.isoformat() if created_at else None,
    }


def handler(event: dict, context) -> dict:
    '''Раздел "AI" — чат сотрудников с ИИ-моделями через единый ключ AI Tunnel (aitunnel.ru,
    OpenAI-совместимый API, оплата в рублях). Этап 2 плана (AI_MANAGER_PLAN.md): только текстовый
    чат, без вложений/генерации картинок и видео (это Этап 4). Действия:
    list_models (каталог моделей AI Tunnel, публичный, кешируется), list_chats/get_chat/
    rename_chat/delete_chat (CRUD диалогов пользователя), send_message (отправка сообщения —
    создаёт чат при отсутствии chat_id, проверяет месячный лимит сотрудника в ai_usage, шлёт
    запрос в AI Tunnel НЕ в потоковом режиме — эта облачная платформа не даёт проксировать
    Server-Sent Events через функцию дольше её таймаута, поэтому используется обычный
    request/response; для медленных моделей администратору может понадобиться поднять таймаут
    функции в Ядро → Функции), usage (остаток месячного лимита текущего пользователя),
    balance (общий остаток аккаунта AI Tunnel — только для team_manage/admin). Доступ ко всем
    действиям — только с правом ai_access (отдельное привилегированное право, см. db_migrations
    V0076).'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    schema = _schema()
    headers = event.get('headers', {})
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token')

    conn = _db()
    cur = conn.cursor()

    me = _current_user(cur, schema, token)
    if not me:
        cur.close(); conn.close()
        return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unauthorized'})}
    if not me['can_access']:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or ('list_chats' if method == 'GET' else '')

    if action == 'list_models':
        group = (qs.get('group') or body.get('group') or 'chat').strip()
        if group not in ('chat', 'images', 'videos'):
            cur.close(); conn.close()
            return _bad('bad_group')
        cur.close(); conn.close()
        try:
            data = _fetch_models(group)
        except Exception as e:
            return _bad('aitunnel_unreachable', 502) if not isinstance(e, urllib.error.HTTPError) else _bad('aitunnel_error', 502)
        return _ok({'group': group, 'models': data})

    if action == 'usage':
        spent, limit_ = _get_or_create_usage(cur, schema, me['id'])
        cur.close(); conn.close()
        return _ok({'spentRub': spent, 'limitRub': limit_})

    if action == 'balance':
        if not me['can_manage_team']:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
        cur.close(); conn.close()
        if not api_key:
            return _bad('aitunnel_not_configured')
        req = urllib.request.Request(
            f'{AITUNNEL_BASE}/aitunnel/balance', method='GET',
            headers={'Authorization': f'Bearer {api_key}'},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            return _bad('aitunnel_error', e.code if 400 <= e.code < 600 else 502)
        except urllib.error.URLError:
            return _bad('aitunnel_unreachable', 502)
        return _ok(data)

    if action == 'list_chats':
        cur.execute(
            f"SELECT id, title, mode, model, pinned, created_at, updated_at FROM {schema}.ai_chats "
            f"WHERE user_id = %s ORDER BY pinned DESC, updated_at DESC",
            (me['id'],)
        )
        chats = [_chat_to_dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return _ok({'chats': chats})

    if action == 'get_chat':
        chat_id = qs.get('chatId') or body.get('chatId')
        if not chat_id:
            cur.close(); conn.close()
            return _bad('bad_chat_id')
        cur.execute(
            f"SELECT id, title, mode, model, pinned, created_at, updated_at FROM {schema}.ai_chats "
            f"WHERE id = %s AND user_id = %s",
            (chat_id, me['id'])
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return _bad('not_found', 404)
        cur.execute(
            f"SELECT id, role, content, attachments, model, cost_rub, job_status, created_at "
            f"FROM {schema}.ai_messages WHERE chat_id = %s ORDER BY id ASC",
            (chat_id,)
        )
        messages = [_message_to_dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return _ok({'chat': _chat_to_dict(row), 'messages': messages})

    if action == 'rename_chat':
        chat_id = body.get('chatId')
        title = (body.get('title') or '').strip()
        if not chat_id or not title:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"UPDATE {schema}.ai_chats SET title = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
            (title[:200], chat_id, me['id'])
        )
        found = cur.rowcount > 0
        cur.close(); conn.close()
        return _ok({'ok': True}) if found else _bad('not_found', 404)

    if action == 'set_pinned':
        chat_id = body.get('chatId')
        pinned = bool(body.get('pinned'))
        if not chat_id:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"UPDATE {schema}.ai_chats SET pinned = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
            (pinned, chat_id, me['id'])
        )
        found = cur.rowcount > 0
        cur.close(); conn.close()
        return _ok({'ok': True}) if found else _bad('not_found', 404)

    if action == 'delete_chat':
        chat_id = body.get('chatId')
        if not chat_id:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(f"SELECT id FROM {schema}.ai_chats WHERE id = %s AND user_id = %s", (chat_id, me['id']))
        if not cur.fetchone():
            cur.close(); conn.close()
            return _bad('not_found', 404)
        cur.execute(f"DELETE FROM {schema}.ai_messages WHERE chat_id = %s", (chat_id,))
        cur.execute(f"DELETE FROM {schema}.ai_chats WHERE id = %s", (chat_id,))
        cur.close(); conn.close()
        return _ok({'ok': True})

    if action == 'send_message':
        model = (body.get('model') or '').strip()
        content = (body.get('content') or '').strip()
        chat_id = body.get('chatId')
        if not model or not content:
            cur.close(); conn.close()
            return _bad('bad_request')

        spent, limit_ = _get_or_create_usage(cur, schema, me['id'])
        if spent >= limit_:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'limit_exceeded', 'spentRub': spent, 'limitRub': limit_})}

        api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
        if not api_key:
            cur.close(); conn.close()
            return _bad('aitunnel_not_configured')

        if chat_id:
            cur.execute(f"SELECT id FROM {schema}.ai_chats WHERE id = %s AND user_id = %s", (chat_id, me['id']))
            if not cur.fetchone():
                cur.close(); conn.close()
                return _bad('not_found', 404)
        else:
            title = content[:60] + ('…' if len(content) > 60 else '')
            cur.execute(
                f"INSERT INTO {schema}.ai_chats (user_id, title, mode, model) VALUES (%s, %s, 'chat', %s) RETURNING id",
                (me['id'], title, model)
            )
            chat_id = cur.fetchone()[0]

        cur.execute(
            f"INSERT INTO {schema}.ai_messages (chat_id, role, content) VALUES (%s, 'user', %s) RETURNING id, created_at",
            (chat_id, content)
        )
        user_msg_id, user_created_at = cur.fetchone()

        cur.execute(
            f"SELECT role, content FROM {schema}.ai_messages WHERE chat_id = %s ORDER BY id DESC LIMIT %s",
            (chat_id, MAX_HISTORY_MESSAGES)
        )
        history = list(reversed(cur.fetchall()))
        messages = [{'role': role, 'content': text} for role, text in history]

        data, err = _aitunnel_request('/chat/completions', api_key, {
            'model': model, 'messages': messages, 'max_tokens': 4000,
        })
        if err:
            cur.close(); conn.close()
            status, payload = err
            payload['userMessageId'] = user_msg_id
            payload['chatId'] = chat_id
            return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps(payload)}

        choice = (data.get('choices') or [{}])[0]
        answer = ((choice.get('message') or {}).get('content') or '').strip()
        used_model = data.get('model') or model
        usage = data.get('usage') or {}
        cost_rub = usage.get('cost_rub') or 0

        cur.execute(
            f"INSERT INTO {schema}.ai_messages (chat_id, role, content, model, cost_rub) "
            f"VALUES (%s, 'assistant', %s, %s, %s) RETURNING id, created_at",
            (chat_id, answer, used_model, cost_rub)
        )
        assistant_msg_id, assistant_created_at = cur.fetchone()

        cur.execute(
            f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
            (cost_rub, me['id'], _current_month())
        )
        cur.execute(f"UPDATE {schema}.ai_chats SET updated_at = NOW() WHERE id = %s", (chat_id,))

        cur.close(); conn.close()
        return _ok({
            'chatId': chat_id,
            'userMessage': {'id': user_msg_id, 'role': 'user', 'content': content, 'createdAt': user_created_at.isoformat()},
            'assistantMessage': {
                'id': assistant_msg_id, 'role': 'assistant', 'content': answer, 'model': used_model,
                'costRub': float(cost_rub), 'createdAt': assistant_created_at.isoformat(),
            },
            'usage': {'spentRub': spent + float(cost_rub), 'limitRub': limit_},
        })

    cur.close(); conn.close()
    return _bad('unknown_action')
