'''Проекты раздела "AI" (этап 1 плана AI_PROJECTS_PLAN.md) — личное рабочее пространство
сотрудника: набор файлов плюс диалоги, которые ведутся в контексте этих файлов. Проекты строго
приватные: любая выборка ограничена user_id из сессии, чужой проект открыть нельзя.

Проекты — НАДСТРОЙКА над уже работающим разделом: файлы и диалоги без проекта (project_id IS NULL)
продолжают работать ровно как раньше, ничего переносить принудительно не нужно.'''

import json
import os

from common import (
    _bad, _ok, _s3_client, _file_limits, _file_usage, _delete_chat_attachments,
    _service_key, _get_or_create_usage, _current_month, _aitunnel_request, _cors_headers, MB,
)

# Модель для автосводки — дешёвая и быстрая: задача простая (пересказать, что за документы), а
# платить полную цену за каждое обновление состава файлов незачем. Тот же подход, что у
# автоназвания диалогов (TITLE_MODEL в common.py).
# ВАЖНО: модель должна быть ОБЫЧНОЙ, не «рассуждающей». Рассуждающие (gpt-5-nano и подобные)
# тратят весь бюджет токенов на внутренние размышления и возвращают ПУСТОЙ текст — сводка
# выходила пустой при полностью прочитанных файлах. gpt-4.1-nano отвечает сразу и стоит столько же.
SUMMARY_MODEL = 'gpt-4.1-nano'

# Сколько текста берём из КАЖДОГО файла на сводку. Начала документа почти всегда достаточно, чтобы
# понять, что это за материал, а весь текст стоил бы дорого и не влез бы в контекст.
SUMMARY_CHARS_PER_FILE = 1200
# Максимум файлов, попадающих в запрос — у проекта с сотней документов сводка всё равно должна
# оставаться короткой и дешёвой.
SUMMARY_MAX_FILES = 25

SUMMARY_SYSTEM_PROMPT = (
    'Ты кратко описываешь, что за материалы собраны в рабочем проекте. По присланным фрагментам '
    'документов напиши 2-4 предложения на русском языке: что это за документы, о чём они, что '
    'объединяет. Без вступлений вроде "В проекте собраны", без списков и заголовков — просто '
    'связный короткий текст. Не выдумывай того, чего нет во фрагментах.'
)


def _project_to_dict(row):
    (pid, name, description, instructions, summary, icon, color, archived,
     created_at, updated_at, files_count, files_size, chats_count,
     summary_files_count, summary_updated_at) = row
    return {
        'id': pid, 'name': name, 'description': description, 'instructions': instructions,
        'summary': summary, 'icon': icon or 'Folder', 'color': color or '',
        'archived': bool(archived),
        'filesCount': int(files_count or 0),
        'filesSizeMb': round(int(files_size or 0) / MB, 1),
        'chatsCount': int(chats_count or 0),
        'createdAt': created_at.isoformat() if created_at else None,
        'updatedAt': updated_at.isoformat() if updated_at else None,
        # summaryStale — состав файлов изменился с момента сборки сводки, её пора обновить.
        # Интерфейс по этому признаку сам запускает пересборку при открытии проекта.
        'summaryStale': int(files_count or 0) != int(summary_files_count or 0),
        'summaryUpdatedAt': summary_updated_at.isoformat() if summary_updated_at else None,
    }


# Общая выборка проекта вместе со счётчиками файлов и диалогов — чтобы карточка проекта сразу
# показывала, сколько в нём материалов, без отдельных запросов на каждый проект.
def _select_projects(schema, where):
    return (
        f"SELECT p.id, p.name, p.description, p.instructions, p.summary, p.icon, p.color, p.archived, "
        f"p.created_at, p.updated_at, "
        f"(SELECT COUNT(*) FROM {schema}.ai_files f WHERE f.project_id = p.id) AS files_count, "
        f"(SELECT COALESCE(SUM(f.size), 0) FROM {schema}.ai_files f WHERE f.project_id = p.id) AS files_size, "
        f"(SELECT COUNT(*) FROM {schema}.ai_chats c WHERE c.project_id = p.id) AS chats_count, "
        f"p.summary_files_count, p.summary_updated_at "
        f"FROM {schema}.ai_projects p WHERE {where}"
    )


def _project_limit(cur, schema, user_id):
    cur.execute(f"SELECT ai_project_limit FROM {schema}.users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    return int(row[0]) if row and row[0] is not None else 10


def handle_list_projects(cur, conn, schema, me, body, qs):
    '''Список проектов сотрудника со счётчиками и расходом лимита проектов. Архивные отдаются
    вместе с остальными (флаг archived) — фильтрует их интерфейс, чтобы не гонять два запроса.'''
    cur.execute(_select_projects(schema, "p.user_id = %s") + " ORDER BY p.archived ASC, p.updated_at DESC", (me['id'],))
    projects = [_project_to_dict(r) for r in cur.fetchall()]
    limit_ = _project_limit(cur, schema, me['id'])
    active = sum(1 for p in projects if not p['archived'])
    cur.close(); conn.close()
    return _ok({'projects': projects, 'usedProjects': active, 'limitProjects': limit_})


def handle_get_project(cur, conn, schema, me, body, qs):
    '''Один проект вместе с его файлами и диалогами — всё, что нужно странице проекта за один
    запрос (вкладки "Обзор" и "Файлы" открываются без дополнительной загрузки).'''
    project_id = qs.get('projectId') or body.get('projectId')
    if not project_id:
        cur.close(); conn.close()
        return _bad('bad_request')
    cur.execute(_select_projects(schema, "p.id = %s AND p.user_id = %s"), (project_id, me['id']))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return _bad('not_found', 404)
    project = _project_to_dict(row)

    cur.execute(
        f"SELECT id, name, url, size, content_type, kind, created_at, index_status, chunks_count, rel_path "
        f"FROM {schema}.ai_files WHERE user_id = %s AND project_id = %s ORDER BY created_at DESC",
        (me['id'], project_id)
    )
    files = [{
        'id': r[0], 'name': r[1], 'url': r[2], 'size': int(r[3] or 0), 'contentType': r[4],
        'kind': r[5], 'createdAt': r[6].isoformat() if r[6] else None,
        'indexStatus': r[7], 'chunksCount': int(r[8] or 0), 'relPath': r[9] or '',
    } for r in cur.fetchall()]

    cur.execute(
        f"SELECT id, title, mode, model, pinned, created_at, updated_at "
        f"FROM {schema}.ai_chats WHERE user_id = %s AND project_id = %s ORDER BY pinned DESC, updated_at DESC",
        (me['id'], project_id)
    )
    chats = [{
        'id': r[0], 'title': r[1], 'mode': r[2], 'model': r[3], 'pinned': bool(r[4]),
        'createdAt': r[5].isoformat() if r[5] else None,
        'updatedAt': r[6].isoformat() if r[6] else None,
    } for r in cur.fetchall()]

    cur.close(); conn.close()
    return _ok({'project': project, 'files': files, 'chats': chats})


def handle_create_project(cur, conn, schema, me, body, qs):
    '''Создание проекта с проверкой личного лимита (users.ai_project_limit) — архивные проекты в
    лимит не считаются, чтобы старые работы можно было хранить, не блокируя новые.'''
    limit_ = _project_limit(cur, schema, me['id'])
    cur.execute(
        f"SELECT COUNT(*) FROM {schema}.ai_projects WHERE user_id = %s AND archived = false",
        (me['id'],)
    )
    used = int(cur.fetchone()[0])
    if used >= limit_:
        cur.close(); conn.close()
        return _bad('project_limit_exceeded', 403)

    name = (body.get('name') or '').strip() or 'Новый проект'
    description = (body.get('description') or '').strip()
    icon = (body.get('icon') or 'Folder').strip() or 'Folder'
    cur.execute(
        f"INSERT INTO {schema}.ai_projects (user_id, name, description, icon) VALUES (%s, %s, %s, %s) "
        f"RETURNING id",
        (me['id'], name[:200], description[:2000], icon)
    )
    project_id = cur.fetchone()[0]
    cur.execute(_select_projects(schema, "p.id = %s AND p.user_id = %s"), (project_id, me['id']))
    project = _project_to_dict(cur.fetchone())
    cur.close(); conn.close()
    return _ok({'project': project})


# Поля, которые сотрудник может править у своего проекта. summary в список НЕ входит: он будет
# пересобираться автоматически по содержимому (этап 4 плана), а не вводиться руками.
EDITABLE_FIELDS = {
    'name': 200,
    'description': 2000,
    'instructions': 8000,
    'icon': 60,
    'color': 60,
}


def handle_update_project(cur, conn, schema, me, body, qs):
    project_id = body.get('projectId')
    if not project_id:
        cur.close(); conn.close()
        return _bad('bad_request')
    cur.execute(f"SELECT id FROM {schema}.ai_projects WHERE id = %s AND user_id = %s", (project_id, me['id']))
    if not cur.fetchone():
        cur.close(); conn.close()
        return _bad('not_found', 404)

    sets, params = [], []
    for field, max_len in EDITABLE_FIELDS.items():
        if field in body:
            value = str(body.get(field) or '').strip()[:max_len]
            if field == 'name' and not value:
                continue
            sets.append(f"{field} = %s")
            params.append(value)
    if 'archived' in body:
        sets.append("archived = %s")
        params.append(bool(body.get('archived')))
    if not sets:
        cur.close(); conn.close()
        return _bad('bad_request')

    params.extend([project_id, me['id']])
    cur.execute(
        f"UPDATE {schema}.ai_projects SET {', '.join(sets)}, updated_at = NOW() "
        f"WHERE id = %s AND user_id = %s",
        tuple(params)
    )
    cur.execute(_select_projects(schema, "p.id = %s AND p.user_id = %s"), (project_id, me['id']))
    project = _project_to_dict(cur.fetchone())
    cur.close(); conn.close()
    return _ok({'project': project})


def handle_delete_project(cur, conn, schema, me, body, qs):
    '''Удаление проекта. По умолчанию файлы и диалоги НЕ пропадают — они просто выходят из проекта
    и остаются в личном хранилище сотрудника ("Мои файлы"), это наименее разрушительное поведение.
    Если сотрудник осознанно выбрал "удалить вместе с содержимым" (withContent), файлы убираются
    из хранилища, а диалоги проекта стираются.'''
    project_id = body.get('projectId')
    with_content = bool(body.get('withContent'))
    if not project_id:
        cur.close(); conn.close()
        return _bad('bad_request')
    cur.execute(f"SELECT id FROM {schema}.ai_projects WHERE id = %s AND user_id = %s", (project_id, me['id']))
    if not cur.fetchone():
        cur.close(); conn.close()
        return _bad('not_found', 404)

    if with_content:
        cur.execute(
            f"SELECT id, file_key FROM {schema}.ai_files WHERE user_id = %s AND project_id = %s",
            (me['id'], project_id)
        )
        rows = cur.fetchall()
        if rows:
            bucket = os.environ.get('S3_BUCKET', 'files')
            s3 = _s3_client()
            for _fid, key in rows:
                try:
                    s3.delete_object(Bucket=bucket, Key=key)
                except Exception:
                    pass
            cur.execute(
                f"DELETE FROM {schema}.ai_file_chunks WHERE user_id = %s AND project_id = %s",
                (me['id'], project_id)
            )
            cur.execute(
                f"DELETE FROM {schema}.ai_files WHERE user_id = %s AND project_id = %s",
                (me['id'], project_id)
            )
        cur.execute(
            f"SELECT id FROM {schema}.ai_chats WHERE user_id = %s AND project_id = %s",
            (me['id'], project_id)
        )
        for (chat_id,) in cur.fetchall():
            _delete_chat_attachments(cur, schema, chat_id)
            cur.execute(f"DELETE FROM {schema}.ai_messages WHERE chat_id = %s", (chat_id,))
            cur.execute(f"DELETE FROM {schema}.ai_chats WHERE id = %s", (chat_id,))
    else:
        cur.execute(
            f"DELETE FROM {schema}.ai_file_chunks WHERE user_id = %s AND project_id = %s",
            (me['id'], project_id)
        )
        cur.execute(
            f"UPDATE {schema}.ai_files SET project_id = NULL, index_status = 'pending', "
            f"index_offset = 0, chunks_count = 0 WHERE user_id = %s AND project_id = %s",
            (me['id'], project_id)
        )
        cur.execute(
            f"UPDATE {schema}.ai_chats SET project_id = NULL WHERE user_id = %s AND project_id = %s",
            (me['id'], project_id)
        )

    cur.execute(f"DELETE FROM {schema}.ai_projects WHERE id = %s AND user_id = %s", (project_id, me['id']))
    cur.close(); conn.close()
    return _ok({'ok': True})


def handle_attach_files(cur, conn, schema, me, body, qs):
    '''Привязка уже загруженных файлов к проекту (перенос из "Моих файлов" или из другого проекта).
    projectId = null убирает файлы из проекта, не удаляя их.'''
    file_ids = body.get('fileIds') or []
    project_id = body.get('projectId')
    if not isinstance(file_ids, list) or not file_ids:
        cur.close(); conn.close()
        return _bad('bad_request')

    if project_id is not None:
        cur.execute(f"SELECT id FROM {schema}.ai_projects WHERE id = %s AND user_id = %s", (project_id, me['id']))
        if not cur.fetchone():
            cur.close(); conn.close()
            return _bad('not_found', 404)

    # Файл, попавший в проект, отправляется в очередь разбора для поиска (index_status='pending'),
    # а вынутый из проекта — теряет свои фрагменты: искать по нему больше негде.
    cur.execute(
        f"UPDATE {schema}.ai_files SET project_id = %s, index_status = 'pending', index_offset = 0, "
        f"chunks_count = 0, index_error = '' WHERE user_id = %s AND id IN %s",
        (project_id, me['id'], tuple(int(f) for f in file_ids))
    )
    moved = cur.rowcount
    # Старые фрагменты убираем всегда: при добавлении в проект они пересоздадутся разбором с
    # правильным project_id, при удалении из проекта искать по файлу больше негде.
    cur.execute(
        f"DELETE FROM {schema}.ai_file_chunks WHERE user_id = %s AND file_id IN %s",
        (me['id'], tuple(int(f) for f in file_ids))
    )
    if project_id is not None:
        cur.execute(f"UPDATE {schema}.ai_projects SET updated_at = NOW() WHERE id = %s", (project_id,))
    cur.close(); conn.close()
    return _ok({'ok': True, 'moved': moved})


def handle_project_usage(cur, conn, schema, me, body, qs):
    '''Расход всех личных лимитов сотрудника разом — вкладка "Настройки" проекта показывает, сколько
    места и проектов у него ещё есть.'''
    count_limit, size_limit_mb = _file_limits(cur, schema, me['id'])
    used, used_bytes = _file_usage(cur, schema, me['id'])
    project_limit = _project_limit(cur, schema, me['id'])
    cur.execute(
        f"SELECT COUNT(*) FROM {schema}.ai_projects WHERE user_id = %s AND archived = false",
        (me['id'],)
    )
    used_projects = int(cur.fetchone()[0])
    cur.close(); conn.close()
    return _ok({
        'usedFiles': used, 'limitFiles': count_limit,
        'usedMb': round(used_bytes / MB, 1), 'limitMb': size_limit_mb,
        'usedProjects': used_projects, 'limitProjects': project_limit,
    })


def handle_project_summary(cur, conn, schema, me, body, qs):
    '''Автосводка по проекту: ассистент читает начала документов и коротко описывает, что за
    материалы внутри. Показывается на вкладке "Обзор", чтобы контекст проекта был виден сразу.

    Пересобирается НЕ при каждом открытии, а только когда изменился состав файлов (иначе каждое
    открытие проекта стоило бы денег). Стоимость списывается в общий месячный лимит сотрудника.
    '''
    project_id = body.get('projectId') or qs.get('projectId')
    if not project_id:
        cur.close(); conn.close()
        return _bad('bad_request')

    cur.execute(
        f"SELECT id, name, summary, summary_files_count FROM {schema}.ai_projects "
        f"WHERE id = %s AND user_id = %s",
        (project_id, me['id'])
    )
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return _bad('not_found', 404)
    _pid, project_name, old_summary, summary_files_count = row

    cur.execute(
        f"SELECT COUNT(*) FROM {schema}.ai_files WHERE user_id = %s AND project_id = %s",
        (me['id'], project_id)
    )
    files_count = int(cur.fetchone()[0])

    # Состав не менялся — отдаём готовую сводку, к модели не обращаемся (экономия денег).
    if files_count == int(summary_files_count or 0) and not body.get('force'):
        cur.close(); conn.close()
        return _ok({'summary': old_summary, 'cached': True, 'filesCount': files_count})

    if files_count == 0:
        cur.execute(
            f"UPDATE {schema}.ai_projects SET summary = '', summary_files_count = 0, "
            f"summary_updated_at = NOW() WHERE id = %s",
            (project_id,)
        )
        cur.close(); conn.close()
        return _ok({'summary': '', 'cached': False, 'filesCount': 0})

    # Берём НАЧАЛО каждого файла: этого достаточно, чтобы понять характер документа.
    cur.execute(
        f"SELECT f.id, f.name, "
        f"(SELECT c.content FROM {schema}.ai_file_chunks c WHERE c.file_id = f.id "
        f" ORDER BY c.chunk_index ASC LIMIT 1) AS head "
        f"FROM {schema}.ai_files f WHERE f.user_id = %s AND f.project_id = %s "
        f"ORDER BY f.id ASC LIMIT %s",
        (me['id'], project_id, SUMMARY_MAX_FILES)
    )
    parts = []
    for _fid, name, head in cur.fetchall():
        snippet = (head or '')[:SUMMARY_CHARS_PER_FILE].strip()
        parts.append(f'Файл «{name}»:\n{snippet}' if snippet else f'Файл «{name}» (текст недоступен)')

    spent, limit_ = _get_or_create_usage(cur, schema, me['id'])
    if spent >= limit_:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'limit_exceeded', 'spentRub': spent, 'limitRub': limit_})}

    api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
    if not api_key:
        cur.close(); conn.close()
        return _bad('aitunnel_not_configured')

    data, err = _aitunnel_request('/chat/completions', api_key, {
        'model': SUMMARY_MODEL,
        'messages': [
            {'role': 'system', 'content': SUMMARY_SYSTEM_PROMPT},
            {'role': 'user', 'content': f'Проект «{project_name}».\n\n' + '\n\n---\n\n'.join(parts)},
        ],
        'max_tokens': 400,
    })
    if err:
        # Неудачная сводка — не повод показывать сотруднику ошибку на весь экран: проект работает
        # и без неё. Оставляем прежний текст и просто сообщаем, что обновить не вышло.
        cur.close(); conn.close()
        return _ok({'summary': old_summary, 'cached': True, 'failed': True, 'filesCount': files_count})

    choice = (data.get('choices') or [{}])[0]
    summary = ((choice.get('message') or {}).get('content') or '').strip()
    cost_rub = (data.get('usage') or {}).get('cost_rub') or 0

    if not summary:
        # Пишем в лог, чтобы при повторении было видно, какая модель молчит и что она вернула.
        print(f'[summary] empty answer from {SUMMARY_MODEL}, usage={data.get("usage")}, '
              f'finish_reason={choice.get("finish_reason")}')
        # Модель вернула пустой текст — не запоминаем это как готовую сводку, иначе проект
        # навсегда остался бы с пустым описанием и пересборка больше не запустилась бы.
        if cost_rub:
            cur.execute(
                f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
                (cost_rub, me['id'], _current_month())
            )
        cur.close(); conn.close()
        return _ok({'summary': old_summary, 'cached': True, 'failed': True, 'filesCount': files_count})

    cur.execute(
        f"UPDATE {schema}.ai_projects SET summary = %s, summary_files_count = %s, "
        f"summary_updated_at = NOW() WHERE id = %s",
        (summary, files_count, project_id)
    )
    cur.execute(
        f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
        (cost_rub, me['id'], _current_month())
    )
    cur.close(); conn.close()
    return _ok({
        'summary': summary, 'cached': False, 'filesCount': files_count,
        'costRub': float(cost_rub),
    })
