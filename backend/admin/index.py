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


def _current_admin(cur, schema, token):
    if not token:
        return None
    cur.execute(
        f"SELECT u.id, u.role FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
        f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
        (token,)
    )
    row = cur.fetchone()
    if not row or row[1] != 'admin':
        return None
    return row[0]


def handler(event: dict, context) -> dict:
    '''Управление пользователями команды: список, выдача/снятие прав доступа и роли admin. Доступно только администраторам.'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    schema = _schema()
    headers = event.get('headers', {})
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token')

    conn = _db()
    cur = conn.cursor()

    admin_id = _current_admin(cur, schema, token)
    if not admin_id:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    if method == 'GET':
        cur.execute(
            f"SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.photo_url, u.role, u.member_id, "
            f"u.tg_username, u.is_active, u.created_at, u.specialization, "
            f"(SELECT MAX(s.expires_at) FROM {schema}.sessions s WHERE s.user_id = u.id) AS last_session, "
            f"(SELECT COUNT(*) FROM {schema}.sessions s WHERE s.user_id = u.id AND s.expires_at > NOW()) AS active_sessions "
            f"FROM {schema}.users u WHERE u.is_hidden = false ORDER BY u.created_at ASC"
        )
        rows = cur.fetchall()
        users = [{
            'id': r[0], 'telegram_id': r[1], 'username': r[2], 'first_name': r[3], 'last_name': r[4],
            'photo_url': r[5], 'role': r[6], 'member_id': r[7], 'tg_username': r[8],
            'is_active': r[9], 'created_at': r[10].isoformat() if r[10] else None,
            'specialization': r[11],
            'online': (r[13] or 0) > 0,
            'active_sessions': r[13] or 0,
        } for r in rows]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'users': users})}

    # POST: обновление роли / активности / приглашение по username
    action = body.get('action')

    if action == 'invite':
        username = (body.get('tg_username') or '').lstrip('@').strip()
        role = body.get('role', 'member')
        specialization = (body.get('specialization') or '').strip() or None
        first_name = body.get('first_name') or username or 'Участник'
        if not username:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_username'})}
        if role not in ('member', 'admin'):
            role = 'member'
        # уже есть такой username в белом списке?
        cur.execute(f"SELECT id FROM {schema}.users WHERE lower(tg_username) = lower(%s) AND is_hidden = false", (username,))
        if cur.fetchone():
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'already_exists'})}
        # плейсхолдер с уникальным отрицательным telegram_id
        cur.execute(f"SELECT COALESCE(MIN(telegram_id), 0) FROM {schema}.users WHERE telegram_id < 0")
        min_tg = cur.fetchone()[0]
        placeholder_tg = min(min_tg, 0) - 1
        cur.execute(
            f"INSERT INTO {schema}.users (telegram_id, username, first_name, role, tg_username, specialization, is_active) "
            f"VALUES (%s, %s, %s, %s, %s, %s, true) RETURNING id",
            (placeholder_tg, username, first_name, role, username, specialization)
        )
        new_id = cur.fetchone()[0]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True, 'id': new_id})}

    if action == 'sessions':
        target = body.get('user_id')
        if not target:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_user_id'})}
        cur.execute(
            f"SELECT id, created_at, expires_at, (expires_at > NOW()) AS active "
            f"FROM {schema}.sessions WHERE user_id = %s ORDER BY created_at DESC LIMIT 50",
            (target,)
        )
        sessions = [{
            'id': r[0],
            'created_at': r[1].isoformat() if r[1] else None,
            'expires_at': r[2].isoformat() if r[2] else None,
            'active': r[3],
        } for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'sessions': sessions})}

    user_id = body.get('user_id')
    if not user_id:
        cur.close(); conn.close()
        return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_user_id'})}

    if action == 'set_role':
        role = body.get('role')
        if role not in ('member', 'admin'):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_role'})}
        cur.execute(f"UPDATE {schema}.users SET role = %s, updated_at = NOW() WHERE id = %s", (role, user_id))
    elif action == 'set_active':
        is_active = bool(body.get('is_active'))
        if int(user_id) == admin_id and not is_active:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'cant_disable_self'})}
        cur.execute(f"UPDATE {schema}.users SET is_active = %s, updated_at = NOW() WHERE id = %s", (is_active, user_id))
    elif action == 'set_member':
        member_id = body.get('member_id')
        cur.execute(f"UPDATE {schema}.users SET member_id = %s, updated_at = NOW() WHERE id = %s", (member_id, user_id))
    elif action == 'set_specialization':
        specialization = (body.get('specialization') or '').strip() or None
        cur.execute(f"UPDATE {schema}.users SET specialization = %s, updated_at = NOW() WHERE id = %s", (specialization, user_id))
    elif action == 'set_hidden':
        is_hidden = bool(body.get('is_hidden'))
        if int(user_id) == admin_id and is_hidden:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'cant_hide_self'})}
        # При скрытии деактивируем и убираем из белого списка, чтобы аккаунт не мог войти
        if is_hidden:
            cur.execute(
                f"UPDATE {schema}.users SET is_hidden = true, is_active = false, tg_username = NULL, updated_at = NOW() WHERE id = %s",
                (user_id,)
            )
            cur.execute(f"UPDATE {schema}.sessions SET expires_at = NOW() WHERE user_id = %s", (user_id,))
        else:
            cur.execute(f"UPDATE {schema}.users SET is_hidden = false, updated_at = NOW() WHERE id = %s", (user_id,))
    else:
        cur.close(); conn.close()
        return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}

    cur.close(); conn.close()
    return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}