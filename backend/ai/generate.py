'''Обращения к моделям AI Tunnel: текстовый чат, генерация изображений и видео, опрос статуса
видео, автоназвание диалога и перегенерация ответа. Логика перенесена из index.py без изменений.'''

import base64
import json
import urllib.error
import urllib.request
import uuid

from common import (
    _cors_headers, _bad, _ok, _service_key, _get_or_create_usage, _current_month,
    _history_row_to_message, _aitunnel_request, _aitunnel_get, _upload_bytes,
    AITUNNEL_BASE, MAX_HISTORY_MESSAGES, CODE_SYSTEM_PROMPT, TITLE_MODEL, TITLE_SYSTEM_PROMPT,
)


def handle_send_message(cur, conn, schema, me, body, qs):
    model = (body.get('model') or '').strip()
    content = (body.get('content') or '').strip()
    chat_id = body.get('chatId')
    mode = body.get('mode') if body.get('mode') in ('chat', 'code') else 'chat'
    attachments = body.get('attachments') or []
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
        cur.execute(f"SELECT id, mode FROM {schema}.ai_chats WHERE id = %s AND user_id = %s", (chat_id, me['id']))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return _bad('not_found', 404)
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
        messages = [{'role': 'system', 'content': CODE_SYSTEM_PROMPT}] + messages

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
        'userMessage': {'id': user_msg_id, 'role': 'user', 'content': content, 'attachments': attachments or None, 'createdAt': user_created_at.isoformat()},
        'assistantMessage': {
            'id': assistant_msg_id, 'role': 'assistant', 'content': answer, 'model': used_model,
            'costRub': float(cost_rub), 'createdAt': assistant_created_at.isoformat(),
        },
        'usage': {'spentRub': spent + float(cost_rub), 'limitRub': limit_},
    })


def handle_generate_image(cur, conn, schema, me, body, qs):
    model = (body.get('model') or '').strip()
    prompt = (body.get('prompt') or '').strip()
    chat_id = body.get('chatId')
    aspect_ratio = body.get('aspectRatio')
    resolution = body.get('resolution')
    n = body.get('n')
    quality = body.get('quality')
    output_format = body.get('outputFormat')
    background = body.get('background')
    # input_references — референсные изображения для image-to-image редактирования (см.
    # docs/ai-tunnel-api-reference.md, "Редактирование существующих изображений") — ожидаем
    # массив уже загруженных вложений [{url, contentType, ...}] от upload_attachment/
    # file_complete (та же кнопка-скрепка, что в обычном чате, см. AI_MANAGER_PLAN.md).
    input_refs = body.get('inputReferences') or []
    if not model or not prompt:
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
        title = 'Изображение: ' + (prompt[:45] + ('…' if len(prompt) > 45 else ''))
        cur.execute(
            f"INSERT INTO {schema}.ai_chats (user_id, title, mode, model) VALUES (%s, %s, 'image', %s) RETURNING id",
            (me['id'], title, model)
        )
        chat_id = cur.fetchone()[0]

    # Референсные изображения показываем сотруднику как вложения его же сообщения (видно, что
    # именно редактировалось), а не только передаём в запрос модели.
    user_attachments = [
        {'id': uuid.uuid4().hex, 'name': r.get('name', 'reference.png'), 'url': r['url'], 'size': r.get('size', 0), 'contentType': r.get('contentType', 'image/png')}
        for r in input_refs if isinstance(r, dict) and r.get('url')
    ]
    cur.execute(
        f"INSERT INTO {schema}.ai_messages (chat_id, role, content, attachments) VALUES (%s, 'user', %s, %s) RETURNING id, created_at",
        (chat_id, prompt, json.dumps(user_attachments) if user_attachments else None)
    )
    user_msg_id, user_created_at = cur.fetchone()

    payload = {'model': model, 'prompt': prompt}
    if aspect_ratio:
        payload['aspect_ratio'] = aspect_ratio
    if resolution:
        payload['resolution'] = resolution
    if n:
        payload['n'] = int(n)
    if quality:
        payload['quality'] = quality
    if output_format:
        payload['output_format'] = output_format
    if background:
        payload['background'] = background
    if user_attachments:
        payload['input_references'] = [{'type': 'image_url', 'image_url': {'url': a['url']}} for a in user_attachments]
    data, err = _aitunnel_request('/images/generations', api_key, payload, timeout=90)
    if err:
        cur.close(); conn.close()
        status, payload_err = err
        payload_err['userMessageId'] = user_msg_id
        payload_err['chatId'] = chat_id
        return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps(payload_err)}

    items = data.get('data') or []
    used_model = data.get('model') or model
    usage = data.get('usage') or {}
    cost_rub = usage.get('cost_rub') or 0
    attachments = []
    for item in items:
        b64 = item.get('b64_json')
        if not b64:
            continue
        media_type = item.get('media_type') or 'image/png'
        ext = media_type.split('/')[-1] or 'png'
        raw = base64.b64decode(b64)
        url = _upload_bytes(raw, ext, media_type, 'images')
        attachments.append({'id': uuid.uuid4().hex, 'name': f'image.{ext}', 'url': url, 'size': len(raw), 'contentType': media_type})

    cur.execute(
        f"INSERT INTO {schema}.ai_messages (chat_id, role, content, attachments, model, cost_rub) "
        f"VALUES (%s, 'assistant', %s, %s, %s, %s) RETURNING id, created_at",
        (chat_id, '', json.dumps(attachments) if attachments else None, used_model, cost_rub)
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
        'userMessage': {'id': user_msg_id, 'role': 'user', 'content': prompt, 'attachments': user_attachments or None, 'createdAt': user_created_at.isoformat()},
        'assistantMessage': {
            'id': assistant_msg_id, 'role': 'assistant', 'content': '', 'attachments': attachments,
            'model': used_model, 'costRub': float(cost_rub), 'createdAt': assistant_created_at.isoformat(),
        },
        'usage': {'spentRub': spent + float(cost_rub), 'limitRub': limit_},
    })


def handle_generate_video(cur, conn, schema, me, body, qs):
    model = (body.get('model') or '').strip()
    prompt = (body.get('prompt') or '').strip()
    chat_id = body.get('chatId')
    duration = body.get('duration')
    size = body.get('size')
    if not model or not prompt:
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
        title = 'Видео: ' + (prompt[:45] + ('…' if len(prompt) > 45 else ''))
        cur.execute(
            f"INSERT INTO {schema}.ai_chats (user_id, title, mode, model) VALUES (%s, %s, 'video', %s) RETURNING id",
            (me['id'], title, model)
        )
        chat_id = cur.fetchone()[0]

    cur.execute(
        f"INSERT INTO {schema}.ai_messages (chat_id, role, content) VALUES (%s, 'user', %s) RETURNING id, created_at",
        (chat_id, prompt)
    )
    user_msg_id, user_created_at = cur.fetchone()

    payload = {'model': model, 'prompt': prompt}
    if duration:
        payload['duration'] = duration
    if size:
        payload['size'] = size
    # Задача отправляется через _aitunnel_request (POST), но это НЕ chat/completions — путь
    # передаётся явно. AI Tunnel сразу начисляет резерв стоимости при старте (см.
    # docs/ai-tunnel-api-reference.md, "Отмены задач нет") — job_status='pending' до готовности.
    data, err = _aitunnel_request('/videos', api_key, payload, timeout=30)
    if err:
        cur.close(); conn.close()
        status, payload_err = err
        payload_err['userMessageId'] = user_msg_id
        payload_err['chatId'] = chat_id
        return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps(payload_err)}

    job_id = data.get('id')
    cur.execute(
        f"INSERT INTO {schema}.ai_messages (chat_id, role, content, model, job_id, job_status) "
        f"VALUES (%s, 'assistant', '', %s, %s, 'pending') RETURNING id, created_at",
        (chat_id, model, job_id)
    )
    assistant_msg_id, assistant_created_at = cur.fetchone()
    cur.execute(f"UPDATE {schema}.ai_chats SET updated_at = NOW() WHERE id = %s", (chat_id,))

    cur.close(); conn.close()
    return _ok({
        'chatId': chat_id,
        'userMessage': {'id': user_msg_id, 'role': 'user', 'content': prompt, 'createdAt': user_created_at.isoformat()},
        'assistantMessage': {
            'id': assistant_msg_id, 'role': 'assistant', 'content': '', 'model': model,
            'jobId': job_id, 'jobStatus': 'pending', 'createdAt': assistant_created_at.isoformat(),
        },
    })


def handle_check_video_job(cur, conn, schema, me, body, qs):
    message_id = qs.get('messageId') or body.get('messageId')
    if not message_id:
        cur.close(); conn.close()
        return _bad('bad_request')
    cur.execute(
        f"SELECT m.id, m.chat_id, m.job_id, m.job_status FROM {schema}.ai_messages m "
        f"JOIN {schema}.ai_chats c ON c.id = m.chat_id WHERE m.id = %s AND c.user_id = %s",
        (message_id, me['id'])
    )
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return _bad('not_found', 404)
    msg_id, chat_id, job_id, job_status = row
    if job_status != 'pending' or not job_id:
        cur.close(); conn.close()
        return _ok({'jobStatus': job_status})

    api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
    if not api_key:
        cur.close(); conn.close()
        return _bad('aitunnel_not_configured')

    data, err = _aitunnel_get(f'/videos/{job_id}', api_key)
    if err:
        cur.close(); conn.close()
        status, payload_err = err
        return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps(payload_err)}

    status_val = data.get('status')
    if status_val == 'completed':
        video_req = urllib.request.Request(
            f'{AITUNNEL_BASE}/videos/{job_id}/content?index=0', method='GET',
            headers={'Authorization': f'Bearer {api_key}'},
        )
        try:
            with urllib.request.urlopen(video_req, timeout=60) as resp:
                raw = resp.read()
        except (urllib.error.HTTPError, urllib.error.URLError):
            cur.close(); conn.close()
            return _bad('aitunnel_unreachable', 502)
        url = _upload_bytes(raw, 'mp4', 'video/mp4', 'videos')
        attachment = {'id': uuid.uuid4().hex, 'name': 'video.mp4', 'url': url, 'size': len(raw), 'contentType': 'video/mp4'}
        usage = data.get('usage') or {}
        cost_rub = usage.get('cost_rub') or 0
        cur.execute(
            f"UPDATE {schema}.ai_messages SET job_status = 'done', attachments = %s, cost_rub = %s WHERE id = %s",
            (json.dumps([attachment]), cost_rub, msg_id)
        )
        if cost_rub:
            cur.execute(
                f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
                (cost_rub, me['id'], _current_month())
            )
        cur.close(); conn.close()
        return _ok({'jobStatus': 'done', 'attachments': [attachment], 'costRub': float(cost_rub)})
    elif status_val == 'failed':
        # Провайдер списывает деньги за видео СРАЗУ при старте задачи и не возвращает их,
        # если генерация провалилась (см. docs/ai-tunnel-api-reference.md, "Отмены задач
        # нет"). Раньше мы записывали расход только при успехе — деньги у AI Tunnel уже
        # списаны, а в нашей статистике трат их нет, и месячные лимиты сотрудников
        # занижались. Теперь досписываем стоимость и по провалившимся задачам, если AI
        # Tunnel вернул её в usage.
        usage = data.get('usage') or {}
        cost_rub = usage.get('cost_rub') or 0
        cur.execute(
            f"UPDATE {schema}.ai_messages SET job_status = 'failed', cost_rub = %s WHERE id = %s",
            (cost_rub, msg_id)
        )
        if cost_rub:
            cur.execute(
                f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
                (cost_rub, me['id'], _current_month())
            )
        cur.close(); conn.close()
        return _ok({'jobStatus': 'failed', 'costRub': float(cost_rub)})
    else:
        cur.close(); conn.close()
        return _ok({'jobStatus': 'pending'})


def handle_generate_title(cur, conn, schema, me, body, qs):
    '''Осмысленное название диалога силами дешёвой модели вместо обрезанных 60 символов
    первого сообщения. Вызывается фронтом ОТДЕЛЬНЫМ фоновым запросом после первого обмена, а
    не внутри send_message — иначе лишний поход к модели добавился бы ко времени основного
    ответа, который и так упирается в таймаут функции (см. docs/ai-section-overview.md).
    Стоимость мизерная (несколько десятков токенов на самой дешёвой модели), но всё равно
    честно списывается в ai_usage.'''
    chat_id = body.get('chatId')
    if not chat_id:
        cur.close(); conn.close()
        return _bad('bad_request')
    cur.execute(f"SELECT id FROM {schema}.ai_chats WHERE id = %s AND user_id = %s", (chat_id, me['id']))
    if not cur.fetchone():
        cur.close(); conn.close()
        return _bad('not_found', 404)

    api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
    if not api_key:
        cur.close(); conn.close()
        return _bad('aitunnel_not_configured')

    # Берём только первый вопрос и первый ответ — этого достаточно, чтобы понять тему, и не
    # раздувает стоимость на длинных диалогах.
    cur.execute(
        f"SELECT role, content FROM {schema}.ai_messages WHERE chat_id = %s AND content <> '' ORDER BY id ASC LIMIT 2",
        (chat_id,)
    )
    rows = cur.fetchall()
    if not rows:
        cur.close(); conn.close()
        return _bad('bad_request')
    excerpt = '\n\n'.join(f"{r[0]}: {(r[1] or '')[:600]}" for r in rows)

    data, err = _aitunnel_request('/chat/completions', api_key, {
        'model': TITLE_MODEL,
        'messages': [
            {'role': 'system', 'content': TITLE_SYSTEM_PROMPT},
            {'role': 'user', 'content': excerpt},
        ],
        'max_tokens': 30,
    }, timeout=20)
    if err:
        # Название — необязательная косметика: если модель не ответила, молча оставляем
        # старый заголовок, не показывая сотруднику ошибку на ровном месте.
        cur.close(); conn.close()
        return _ok({'title': None})

    choice = (data.get('choices') or [{}])[0]
    title = ((choice.get('message') or {}).get('content') or '').strip().strip('"«»').replace('\n', ' ')
    if not title:
        cur.close(); conn.close()
        return _ok({'title': None})
    title = title[:80]
    cost_rub = (data.get('usage') or {}).get('cost_rub') or 0
    cur.execute(f"UPDATE {schema}.ai_chats SET title = %s WHERE id = %s", (title, chat_id))
    if cost_rub:
        cur.execute(
            f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
            (cost_rub, me['id'], _current_month())
        )
    cur.close(); conn.close()
    return _ok({'title': title})


def handle_regenerate(cur, conn, schema, me, body, qs):
    '''Перегенерация ПОСЛЕДНЕГО ответа ассистента в диалоге: удаляет его и заново спрашивает
    модель по той же истории. Полезно, когда ответ не понравился или нужно сравнить с другой
    моделью — модель можно передать другую (параметр model), не меняя сам вопрос. Работает
    только для текстовых режимов (chat/code): у картинок и видео "перегенерация" — это просто
    новый платный запуск через generate_image/generate_video, отдельное действие не нужно.'''
    chat_id = body.get('chatId')
    model = (body.get('model') or '').strip()
    if not chat_id or not model:
        cur.close(); conn.close()
        return _bad('bad_request')

    cur.execute(f"SELECT id, mode FROM {schema}.ai_chats WHERE id = %s AND user_id = %s", (chat_id, me['id']))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return _bad('not_found', 404)
    mode = row[1] or 'chat'

    spent, limit_ = _get_or_create_usage(cur, schema, me['id'])
    if spent >= limit_:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'limit_exceeded', 'spentRub': spent, 'limitRub': limit_})}

    api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
    if not api_key:
        cur.close(); conn.close()
        return _bad('aitunnel_not_configured')

    # Удаляем именно ПОСЛЕДНЕЕ сообщение, и только если оно от ассистента — иначе сотрудник
    # мог бы случайно снести свой же вопрос (например, при двойном клике на кнопку).
    cur.execute(
        f"SELECT id, role FROM {schema}.ai_messages WHERE chat_id = %s ORDER BY id DESC LIMIT 1",
        (chat_id,)
    )
    last = cur.fetchone()
    if not last or last[1] != 'assistant':
        cur.close(); conn.close()
        return _bad('nothing_to_regenerate')
    old_msg_id = last[0]
    cur.execute(f"DELETE FROM {schema}.ai_messages WHERE id = %s", (old_msg_id,))

    cur.execute(
        f"SELECT role, content, attachments FROM {schema}.ai_messages WHERE chat_id = %s ORDER BY id DESC LIMIT %s",
        (chat_id, MAX_HISTORY_MESSAGES)
    )
    history = list(reversed(cur.fetchall()))
    if not history:
        cur.close(); conn.close()
        return _bad('nothing_to_regenerate')
    messages = [_history_row_to_message(role, text, atts) for role, text, atts in history]
    if mode == 'code':
        messages = [{'role': 'system', 'content': CODE_SYSTEM_PROMPT}] + messages

    data, err = _aitunnel_request('/chat/completions', api_key, {
        'model': model, 'messages': messages, 'max_tokens': 4000,
    })
    if err:
        cur.close(); conn.close()
        status, payload_err = err
        return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps(payload_err)}

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
    new_msg_id, new_created_at = cur.fetchone()
    cur.execute(
        f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
        (cost_rub, me['id'], _current_month())
    )
    cur.execute(f"UPDATE {schema}.ai_chats SET updated_at = NOW() WHERE id = %s", (chat_id,))
    cur.close(); conn.close()
    return _ok({
        'replacedMessageId': old_msg_id,
        'assistantMessage': {
            'id': new_msg_id, 'role': 'assistant', 'content': answer, 'model': used_model,
            'costRub': float(cost_rub), 'createdAt': new_created_at.isoformat(),
        },
        'usage': {'spentRub': spent + float(cost_rub), 'limitRub': limit_},
    })
