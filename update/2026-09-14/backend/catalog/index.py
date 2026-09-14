import json
import os

import psycopg2


def _cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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


def _current_user(cur, schema, token):
    if not token:
        return None
    cur.execute(
        f"SELECT u.id, u.role FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
        f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
        (token,)
    )
    row = cur.fetchone()
    if not row:
        return None
    return {'id': row[0], 'role': row[1]}


# Транслитерация кириллицы в латиницу для _slugify() — без неё label вида "Тест" превращался в
# id "тест", который потом отклоняется валидацией server/category id в других backend-функциях
# (например _safe_server в backend/patches/index.py принимает только [a-zA-Z0-9_-]), из-за чего
# запросы к такому серверу молча проваливались, а фронтенд по ошибке продолжал показывать список
# файлов от ПРЕДЫДУЩЕГО открытого сервера (см. usePatches.ts — при неуспешном ответе список файлов
# не сбрасывался), что выглядело как "чужие" файлы у нового сервера.
_CYRILLIC_TRANSLIT = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}


def _slugify(label: str) -> str:
    s = label.strip().lower()
    transliterated = ''.join(_CYRILLIC_TRANSLIT.get(ch, ch) for ch in s)
    out = []
    for ch in transliterated:
        if ch.isascii() and ch.isalnum():
            out.append(ch)
        elif ch in (' ', '-', '_', '·'):
            out.append('-')
    slug = ''.join(out).strip('-')
    while '--' in slug:
        slug = slug.replace('--', '-')
    return slug or 'item'


def _category_row(r):
    return {'id': r[0], 'label': r[1], 'icon': r[2], 'color': r[3], 'sortOrder': r[4]}


def _server_row(r):
    return {
        'id': r[0], 'label': r[1], 'color': r[2], 'sortOrder': r[3],
        'protocol': r[4], 'description': r[5],
        'launcherFastDir': r[6], 'launcherFastXml': r[7],
        'launcherFullDir': r[8], 'launcherFullXml': r[9],
        'logsDir': r[10],
    }


def _deploy_status_row(r):
    return {
        'id': r[0], 'label': r[1], 'icon': r[2], 'color': r[3],
        'column': r[4], 'sortOrder': r[5], 'isSystem': bool(r[6]),
    }


# Колонки доски, к которым администратор может привязывать СВОИ статусы деплоя.
# 'done' исключена: единственный статус в ней — системный 'ready_live', на нём держится бейдж
# «Требуется залить в лаунчер» и уведомления, поэтому её содержимое не редактируется.
# 'hold' («На удержании») исключена принципиально: эта колонка НЕ привязана к статусам деплоя —
# отложить можно задачу в любом статусе, и при переносе на удержание её статус сохраняется
# (см. Board.tsx, handleDragEnd), а при снятии пользователь сам выбирает колонку возврата.
EDITABLE_STATUS_COLUMNS = ('todo', 'progress')

DEPLOY_STATUS_COLUMNS = "id, label, icon, color, column_id, sort_order, is_system"


def handler(event: dict, context) -> dict:
    '''Справочники категорий (для задач, статей базы знаний и идей), серверов и статусов деплоя (таблица deploy_statuses, см. db_migrations V0095: статусы с is_system=true — 'none' и 'ready_live' — нельзя удалять и переносить в другую колонку, у остальных доступны колонки todo/progress/hold). Чтение доступно любому авторизованному участнику, создание/редактирование/удаление — только администраторам.'''
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

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or ('list' if method == 'GET' else '')

    # Список категорий и серверов — доступно всем авторизованным
    if action == 'list' or method == 'GET':
        cur.execute(f"SELECT id, label, icon, color, sort_order FROM {schema}.categories ORDER BY sort_order ASC, id ASC")
        cats = [_category_row(r) for r in cur.fetchall()]
        cur.execute(
            f"SELECT id, label, color, sort_order, protocol, description, "
            f"launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml, logs_dir "
            f"FROM {schema}.servers ORDER BY sort_order ASC, id ASC"
        )
        srvs = [_server_row(r) for r in cur.fetchall()]
        cur.execute(
            f"SELECT {DEPLOY_STATUS_COLUMNS} FROM {schema}.deploy_statuses ORDER BY sort_order ASC, id ASC"
        )
        statuses = [_deploy_status_row(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({
            'categories': cats, 'servers': srvs, 'deployStatuses': statuses,
        })}

    # Дальше — только администраторам
    if me['role'] != 'admin':
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    if action == 'create_category':
        label = (body.get('label') or '').strip()
        if not label:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_label'})}
        icon = body.get('icon') or 'MoreHorizontal'
        color = body.get('color') or '215 15% 55%'
        base_id = _slugify(label)
        new_id = base_id
        n = 1
        while True:
            cur.execute(f"SELECT 1 FROM {schema}.categories WHERE id = %s", (new_id,))
            if not cur.fetchone():
                break
            n += 1
            new_id = f"{base_id}-{n}"
        cur.execute(f"SELECT COALESCE(MAX(sort_order), -1) + 1 FROM {schema}.categories")
        sort_order = cur.fetchone()[0]
        cur.execute(
            f"INSERT INTO {schema}.categories (id, label, icon, color, sort_order) VALUES (%s, %s, %s, %s, %s) "
            f"RETURNING id, label, icon, color, sort_order",
            (new_id, label, icon, color, sort_order)
        )
        cat = _category_row(cur.fetchone())
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'category': cat})}

    if action == 'update_category':
        cat_id = body.get('id')
        if not cat_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        label = (body.get('label') or '').strip()
        if not label:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_label'})}
        icon = body.get('icon') or 'MoreHorizontal'
        color = body.get('color') or '215 15% 55%'
        cur.execute(
            f"UPDATE {schema}.categories SET label = %s, icon = %s, color = %s WHERE id = %s "
            f"RETURNING id, label, icon, color, sort_order",
            (label, icon, color, cat_id)
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'category': _category_row(row)})}

    if action == 'delete_category':
        cat_id = body.get('id')
        if not cat_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        if cat_id == 'other':
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'cant_delete_default'})}
        cur.execute(f"UPDATE {schema}.tasks SET category = 'other' WHERE category = %s", (cat_id,))
        cur.execute(f"UPDATE {schema}.kb_articles SET category = 'other' WHERE category = %s", (cat_id,))
        cur.execute(f"UPDATE {schema}.idea_topics SET category = NULL WHERE category = %s", (cat_id,))
        cur.execute(f"DELETE FROM {schema}.categories WHERE id = %s", (cat_id,))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    if action == 'create_server':
        label = (body.get('label') or '').strip()
        if not label:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_label'})}
        color = body.get('color') or '215 15% 55%'
        protocol = body.get('protocol') or 'hf'
        description = (body.get('description') or '').strip() or None
        # Настройки лаунчера (пути на диске VPS) — необязательны при создании, обычно заполняются
        # отдельно позже через "Настройки лаунчера" в форме сервера, см. LAUNCHER_UPLOAD.md.
        launcher_fast_dir = (body.get('launcherFastDir') or '').strip() or None
        launcher_fast_xml = (body.get('launcherFastXml') or '').strip() or None
        launcher_full_dir = (body.get('launcherFullDir') or '').strip() or None
        launcher_full_xml = (body.get('launcherFullXml') or '').strip() or None
        logs_dir = (body.get('logsDir') or '').strip() or None
        base_id = _slugify(label)
        new_id = base_id
        n = 1
        while True:
            cur.execute(f"SELECT 1 FROM {schema}.servers WHERE id = %s", (new_id,))
            if not cur.fetchone():
                break
            n += 1
            new_id = f"{base_id}-{n}"
        cur.execute(f"SELECT COALESCE(MAX(sort_order), -1) + 1 FROM {schema}.servers")
        sort_order = cur.fetchone()[0]
        cur.execute(
            f"INSERT INTO {schema}.servers "
            f"(id, label, color, sort_order, protocol, description, "
            f"launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml, logs_dir) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
            f"RETURNING id, label, color, sort_order, protocol, description, "
            f"launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml, logs_dir",
            (new_id, label, color, sort_order, protocol, description,
             launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml, logs_dir)
        )
        srv = _server_row(cur.fetchone())
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'server': srv})}

    if action == 'update_server':
        srv_id = body.get('id')
        if not srv_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        label = (body.get('label') or '').strip()
        if not label:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_label'})}
        color = body.get('color') or '215 15% 55%'
        protocol = body.get('protocol') or 'hf'
        description = (body.get('description') or '').strip() or None
        launcher_fast_dir = (body.get('launcherFastDir') or '').strip() or None
        launcher_fast_xml = (body.get('launcherFastXml') or '').strip() or None
        launcher_full_dir = (body.get('launcherFullDir') or '').strip() or None
        launcher_full_xml = (body.get('launcherFullXml') or '').strip() or None
        logs_dir = (body.get('logsDir') or '').strip() or None
        cur.execute(
            f"UPDATE {schema}.servers SET label = %s, color = %s, protocol = %s, description = %s, "
            f"launcher_fast_dir = %s, launcher_fast_xml = %s, launcher_full_dir = %s, launcher_full_xml = %s, "
            f"logs_dir = %s "
            f"WHERE id = %s "
            f"RETURNING id, label, color, sort_order, protocol, description, "
            f"launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml, logs_dir",
            (label, color, protocol, description,
             launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml, logs_dir, srv_id)
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'server': _server_row(row)})}

    if action == 'delete_server':
        srv_id = body.get('id')
        if not srv_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT COUNT(*) FROM {schema}.servers")
        total = cur.fetchone()[0]
        if total <= 1:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'cant_delete_last'})}
        cur.execute(f"SELECT id FROM {schema}.servers WHERE id != %s ORDER BY sort_order ASC LIMIT 1", (srv_id,))
        fallback = cur.fetchone()
        fallback_id = fallback[0] if fallback else None
        if fallback_id:
            cur.execute(f"UPDATE {schema}.tasks SET server = %s WHERE server = %s", (fallback_id, srv_id))
        cur.execute(f"DELETE FROM {schema}.servers WHERE id = %s", (srv_id,))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    if action == 'create_deploy_status':
        label = (body.get('label') or '').strip()
        if not label:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_label'})}
        column_id = body.get('column') or 'todo'
        if column_id not in EDITABLE_STATUS_COLUMNS:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_column'})}
        icon = body.get('icon') or 'Circle'
        color = body.get('color') or '215 15% 55%'
        base_id = _slugify(label)
        new_id = base_id
        n = 1
        while True:
            cur.execute(f"SELECT 1 FROM {schema}.deploy_statuses WHERE id = %s", (new_id,))
            if not cur.fetchone():
                break
            n += 1
            new_id = f"{base_id}-{n}"
        cur.execute(f"SELECT COALESCE(MAX(sort_order), -1) + 1 FROM {schema}.deploy_statuses")
        sort_order = cur.fetchone()[0]
        cur.execute(
            f"INSERT INTO {schema}.deploy_statuses (id, label, icon, color, column_id, sort_order, is_system) "
            f"VALUES (%s, %s, %s, %s, %s, %s, false) RETURNING {DEPLOY_STATUS_COLUMNS}",
            (new_id, label, icon, color, column_id, sort_order)
        )
        st = _deploy_status_row(cur.fetchone())
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'deployStatus': st})}

    if action == 'update_deploy_status':
        st_id = body.get('id')
        if not st_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        label = (body.get('label') or '').strip()
        if not label:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_label'})}
        cur.execute(f"SELECT is_system, column_id FROM {schema}.deploy_statuses WHERE id = %s", (st_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        is_system, current_column = bool(row[0]), row[1]
        # У системных статусов ('none', 'ready_live') разрешено менять только внешний вид —
        # подпись, цвет и иконку. Колонка остаётся прежней: на ней держится логика доски.
        if is_system:
            column_id = current_column
        else:
            column_id = body.get('column') or current_column
            if column_id not in EDITABLE_STATUS_COLUMNS:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_column'})}
        icon = body.get('icon') or 'Circle'
        color = body.get('color') or '215 15% 55%'
        cur.execute(
            f"UPDATE {schema}.deploy_statuses SET label = %s, icon = %s, color = %s, column_id = %s "
            f"WHERE id = %s RETURNING {DEPLOY_STATUS_COLUMNS}",
            (label, icon, color, column_id, st_id)
        )
        st = _deploy_status_row(cur.fetchone())
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'deployStatus': st})}

    if action == 'delete_deploy_status':
        st_id = body.get('id')
        if not st_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT is_system FROM {schema}.deploy_statuses WHERE id = %s", (st_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        if bool(row[0]):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'cant_delete_system'})}
        # Задачи с удаляемым статусом не теряются: их переводят в «без статуса» ('none'),
        # который защищён от удаления и всегда существует.
        cur.execute(f"UPDATE {schema}.tasks SET deploy_status = 'none' WHERE deploy_status = %s", (st_id,))
        cur.execute(f"DELETE FROM {schema}.deploy_statuses WHERE id = %s", (st_id,))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}