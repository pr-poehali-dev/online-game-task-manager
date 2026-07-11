import json
import os

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


def _row(r):
    return {
        'id': str(r[0]),
        'type': r[1],
        'title': r[2],
        'body': r[3],
        'entityType': r[4],
        'entityId': r[5],
        'actorId': r[6],
        'isRead': bool(r[7]),
        'createdAt': r[8].isoformat() if r[8] else None,
    }


COLS = "id, type, title, body, entity_type, entity_id, actor_id, is_read, created_at"


def handler(event: dict, context) -> dict:
    '''Внутренние уведомления пользователя: список, счётчик непрочитанных, отметка прочитанным. Доступно авторизованному пользователю только для своих уведомлений.'''
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

    # Список уведомлений + счётчик непрочитанных
    if action == 'list' or method == 'GET':
        cur.execute(
            f"SELECT {COLS} FROM {schema}.notifications WHERE user_id = %s ORDER BY created_at DESC LIMIT 50",
            (me['id'],)
        )
        items = [_row(r) for r in cur.fetchall()]
        cur.execute(
            f"SELECT COUNT(*) FROM {schema}.notifications WHERE user_id = %s AND is_read = false",
            (me['id'],)
        )
        unread = cur.fetchone()[0]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'notifications': items, 'unread': unread})}

    # Отметить одно уведомление прочитанным
    if action == 'mark_read':
        nid = body.get('id')
        if not nid:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(
            f"UPDATE {schema}.notifications SET is_read = true WHERE id = %s AND user_id = %s",
            (int(nid), me['id'])
        )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Отметить все прочитанными
    if action == 'mark_all':
        cur.execute(
            f"UPDATE {schema}.notifications SET is_read = true WHERE user_id = %s AND is_read = false",
            (me['id'],)
        )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Полностью очистить список уведомлений пользователя
    if action == 'clear_all':
        cur.execute(
            f"DELETE FROM {schema}.notifications WHERE user_id = %s",
            (me['id'],)
        )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}