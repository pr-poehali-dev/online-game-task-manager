'''Действия раздела "AI", связанные с диалогами: каталог моделей, лимиты и баланс,
CRUD диалогов, поиск по переписке, закрепление сообщений и шаблоны промптов. Логика перенесена
из index.py без изменений.'''

import json
import urllib.error
import urllib.request

from common import (
    _cors_headers, _bad, _ok, _service_key, _fetch_models, _get_or_create_usage,
    _chat_to_dict, _message_to_dict, _delete_chat_attachments,
    AITUNNEL_BASE,
)


def handle_list_models(cur, conn, schema, me, body, qs):
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


def handle_usage(cur, conn, schema, me, body, qs):
    spent, limit_ = _get_or_create_usage(cur, schema, me['id'])
    cur.close(); conn.close()
    return _ok({'spentRub': spent, 'limitRub': limit_})


def handle_balance(cur, conn, schema, me, body, qs):
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


def handle_list_chats(cur, conn, schema, me, body, qs):
    cur.execute(
        f"SELECT id, title, mode, model, pinned, created_at, updated_at FROM {schema}.ai_chats "
        f"WHERE user_id = %s ORDER BY pinned DESC, updated_at DESC",
        (me['id'],)
    )
    chats = [_chat_to_dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return _ok({'chats': chats})


def handle_get_chat(cur, conn, schema, me, body, qs):
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
        f"SELECT id, role, content, attachments, model, cost_rub, job_id, job_status, created_at, pinned "
        f"FROM {schema}.ai_messages WHERE chat_id = %s ORDER BY id ASC",
        (chat_id,)
    )
    messages = [_message_to_dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    return _ok({'chat': _chat_to_dict(row), 'messages': messages})


def handle_search_messages(cur, conn, schema, me, body, qs):
    '''Поиск по СОДЕРЖИМОМУ сообщений во всех диалогах пользователя. Раньше искать можно было
    только по названиям чатов (фильтр в AiChatList.tsx) — в длинной переписке найти нужный
    ответ было практически невозможно. Возвращает совпадения с названием диалога и коротким
    фрагментом текста, чтобы фронт мог сразу открыть нужный чат и подсветить сообщение.'''
    query = (qs.get('query') or body.get('query') or '').strip()
    if len(query) < 2:
        cur.close(); conn.close()
        return _ok({'results': []})
    # ILIKE с экранированием спецсимволов LIKE — полнотекстовый индекс здесь избыточен:
    # объём переписки одного сотрудника невелик, а ts_query плохо работает с фрагментами слов.
    pattern = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
    cur.execute(
        f"SELECT m.id, m.chat_id, m.role, m.content, m.created_at, c.title "
        f"FROM {schema}.ai_messages m JOIN {schema}.ai_chats c ON c.id = m.chat_id "
        f"WHERE c.user_id = %s AND m.content ILIKE %s ORDER BY m.id DESC LIMIT 50",
        (me['id'], pattern)
    )
    results = []
    for mid, cid, role, content, created_at, title in cur.fetchall():
        # Фрагмент вокруг первого совпадения — так в списке результатов сразу видно контекст,
        # а не первые 120 символов сообщения, которые могут не содержать искомого слова.
        pos = (content or '').lower().find(query.lower())
        start = max(0, pos - 60)
        snippet = (content or '')[start:start + 160]
        if start > 0:
            snippet = '…' + snippet
        if start + 160 < len(content or ''):
            snippet += '…'
        results.append({
            'messageId': mid, 'chatId': cid, 'chatTitle': title, 'role': role,
            'snippet': snippet, 'createdAt': created_at.isoformat() if created_at else None,
        })
    cur.close(); conn.close()
    return _ok({'results': results})


def handle_set_message_pinned(cur, conn, schema, me, body, qs):
    # Закрепление ОТВЕТА АССИСТЕНТА внутри диалога — быстрый способ найти полезный ответ в
    # длинной переписке (см. AI_MANAGER_PLAN.md). В отличие от ai_chats.pinned (закрепление
    # целого диалога в списке слева), это закрепление ОДНОГО СООБЩЕНИЯ внутри чата.
    message_id = body.get('messageId')
    pinned = bool(body.get('pinned'))
    if not message_id:
        cur.close(); conn.close()
        return _bad('bad_request')
    cur.execute(
        f"UPDATE {schema}.ai_messages m SET pinned = %s "
        f"FROM {schema}.ai_chats c WHERE m.chat_id = c.id AND m.id = %s AND c.user_id = %s",
        (pinned, message_id, me['id'])
    )
    found = cur.rowcount > 0
    cur.close(); conn.close()
    return _ok({'ok': True}) if found else _bad('not_found', 404)


def handle_rename_chat(cur, conn, schema, me, body, qs):
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


def handle_set_pinned(cur, conn, schema, me, body, qs):
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


def handle_delete_chat(cur, conn, schema, me, body, qs):
    chat_id = body.get('chatId')
    if not chat_id:
        cur.close(); conn.close()
        return _bad('bad_request')
    cur.execute(f"SELECT id FROM {schema}.ai_chats WHERE id = %s AND user_id = %s", (chat_id, me['id']))
    if not cur.fetchone():
        cur.close(); conn.close()
        return _bad('not_found', 404)
    # Файлы вложений удаляются из S3 ДО удаления сообщений из БД (см. AI_MANAGER_PLAN.md) —
    # иначе после DELETE ai_messages ссылки на них уже нигде не найти.
    _delete_chat_attachments(cur, schema, chat_id)
    cur.execute(f"DELETE FROM {schema}.ai_messages WHERE chat_id = %s", (chat_id,))
    cur.execute(f"DELETE FROM {schema}.ai_chats WHERE id = %s", (chat_id,))
    cur.close(); conn.close()
    return _ok({'ok': True})


def handle_list_templates(cur, conn, schema, me, body, qs):
    # Шаблоны промптов — ИНДИВИДУАЛЬНЫ для каждого пользователя (см. AI_MANAGER_PLAN.md):
    # редактируются/добавляются/удаляются прямо из интерфейса, без изменения кода. При первом
    # обращении у нового сотрудника с ai_access список пуст — это нормально, фронт покажет
    # пустое состояние с предложением создать первый шаблон (шаблоны НЕ копируются
    # автоматически от других пользователей — принципиально приватны).
    cur.execute(
        f"SELECT id, icon, category, title, description, prompt, recommended_mode, sort_order "
        f"FROM {schema}.ai_prompt_templates WHERE user_id = %s ORDER BY sort_order ASC, id ASC",
        (me['id'],)
    )
    templates = [{
        'id': r[0], 'icon': r[1], 'category': r[2], 'title': r[3], 'description': r[4],
        'prompt': r[5], 'recommendedMode': r[6],
    } for r in cur.fetchall()]
    cur.close(); conn.close()
    return _ok({'templates': templates})


def handle_create_template(cur, conn, schema, me, body, qs):
    title = (body.get('title') or '').strip()
    prompt = (body.get('prompt') or '').strip()
    if not title or not prompt:
        cur.close(); conn.close()
        return _bad('bad_request')
    category = (body.get('category') or 'Мои шаблоны').strip()[:100] or 'Мои шаблоны'
    description = (body.get('description') or '').strip()[:300]
    icon = (body.get('icon') or 'FileText').strip()[:50] or 'FileText'
    recommended_mode = body.get('recommendedMode') if body.get('recommendedMode') in ('chat', 'code') else None
    cur.execute(
        f"SELECT COALESCE(MAX(sort_order), -1) + 1 FROM {schema}.ai_prompt_templates WHERE user_id = %s",
        (me['id'],)
    )
    next_order = cur.fetchone()[0]
    cur.execute(
        f"INSERT INTO {schema}.ai_prompt_templates (user_id, icon, category, title, description, prompt, recommended_mode, sort_order) "
        f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (me['id'], icon, category, title[:200], description, prompt, recommended_mode, next_order)
    )
    new_id = cur.fetchone()[0]
    cur.close(); conn.close()
    return _ok({'id': new_id})


def handle_update_template(cur, conn, schema, me, body, qs):
    template_id = body.get('id')
    title = (body.get('title') or '').strip()
    prompt = (body.get('prompt') or '').strip()
    if not template_id or not title or not prompt:
        cur.close(); conn.close()
        return _bad('bad_request')
    category = (body.get('category') or 'Мои шаблоны').strip()[:100] or 'Мои шаблоны'
    description = (body.get('description') or '').strip()[:300]
    icon = (body.get('icon') or 'FileText').strip()[:50] or 'FileText'
    recommended_mode = body.get('recommendedMode') if body.get('recommendedMode') in ('chat', 'code') else None
    cur.execute(
        f"UPDATE {schema}.ai_prompt_templates SET icon = %s, category = %s, title = %s, description = %s, "
        f"prompt = %s, recommended_mode = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
        (icon, category, title[:200], description, prompt, recommended_mode, template_id, me['id'])
    )
    found = cur.rowcount > 0
    cur.close(); conn.close()
    return _ok({'ok': True}) if found else _bad('not_found', 404)


def handle_delete_template(cur, conn, schema, me, body, qs):
    template_id = body.get('id')
    if not template_id:
        cur.close(); conn.close()
        return _bad('bad_request')
    cur.execute(
        f"DELETE FROM {schema}.ai_prompt_templates WHERE id = %s AND user_id = %s",
        (template_id, me['id'])
    )
    found = cur.rowcount > 0
    cur.close(); conn.close()
    return _ok({'ok': True}) if found else _bad('not_found', 404)