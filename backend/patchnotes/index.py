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


def handler(event: dict, context) -> dict:
    '''Журнал патчноутов по серверам: список записей за сервер, сгруппированных для отображения как текстовый файл
    (дата/время — название задачи). Заполняется автоматически при архивации задачи из раздела "К рестарту"
    (см. backend/tasks). Просмотр доступен всем авторизованным участникам команды. Действие update
    (только для администраторов) позволяет вручную отредактировать текст записи.'''
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

    if method == 'POST':
        body = {}
        if event.get('body'):
            try:
                body = json.loads(event['body'])
            except Exception:
                body = {}
        action = body.get('action')
        if action == 'update':
            if me['role'] != 'admin':
                cur.close(); conn.close()
                return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
            entry_id = body.get('id')
            task_title = (body.get('taskTitle') or '').strip()
            if not entry_id or not task_title:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
            cur.execute(
                f"UPDATE {schema}.patchnotes SET task_title = %s WHERE id = %s "
                f"RETURNING id, server, task_id, task_title, created_at",
                (task_title, int(entry_id))
            )
            row = cur.fetchone()
            cur.close(); conn.close()
            if not row:
                return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
            entry = {
                'id': row[0],
                'server': row[1],
                'taskId': str(row[2]) if row[2] is not None else None,
                'taskTitle': row[3],
                'createdAt': row[4].isoformat() if row[4] else None,
            }
            return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'entry': entry})}
        cur.close(); conn.close()
        return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}

    qs = event.get('queryStringParameters') or {}
    server = qs.get('server')

    if server:
        cur.execute(
            f"SELECT id, server, task_id, task_title, created_at FROM {schema}.patchnotes "
            f"WHERE server = %s ORDER BY created_at DESC LIMIT 500",
            (server,)
        )
    else:
        cur.execute(
            f"SELECT id, server, task_id, task_title, created_at FROM {schema}.patchnotes "
            f"ORDER BY created_at DESC LIMIT 1000"
        )
    entries = [{
        'id': r[0],
        'server': r[1],
        'taskId': str(r[2]) if r[2] is not None else None,
        'taskTitle': r[3],
        'createdAt': r[4].isoformat() if r[4] else None,
    } for r in cur.fetchall()]
    cur.close(); conn.close()
    return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'entries': entries})}