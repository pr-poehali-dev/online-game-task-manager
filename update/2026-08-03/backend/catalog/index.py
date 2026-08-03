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
    }


def handler(event: dict, context) -> dict:
    '''Справочники категорий (для задач, статей базы знаний и идей) и серверов. Чтение доступно любому авторизованному участнику, создание/редактирование/удаление — только администраторам.'''
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
            f"launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml "
            f"FROM {schema}.servers ORDER BY sort_order ASC, id ASC"
        )
        srvs = [_server_row(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'categories': cats, 'servers': srvs})}

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
            f"launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
            f"RETURNING id, label, color, sort_order, protocol, description, "
            f"launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml",
            (new_id, label, color, sort_order, protocol, description,
             launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml)
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
        cur.execute(
            f"UPDATE {schema}.servers SET label = %s, color = %s, protocol = %s, description = %s, "
            f"launcher_fast_dir = %s, launcher_fast_xml = %s, launcher_full_dir = %s, launcher_full_xml = %s "
            f"WHERE id = %s "
            f"RETURNING id, label, color, sort_order, protocol, description, "
            f"launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml",
            (label, color, protocol, description,
             launcher_fast_dir, launcher_fast_xml, launcher_full_dir, launcher_full_xml, srv_id)
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

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}