import json
import os
import time

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


def _row_to_sprint(r):
    return {
        'id': r[0],
        'title': r[1],
        'goal': r[2],
        'startDate': r[3].isoformat() if hasattr(r[3], 'isoformat') else r[3],
        'endDate': r[4].isoformat() if hasattr(r[4], 'isoformat') else r[4],
        'status': r[5],
    }


SPRINT_COLUMNS = "id, title, goal, start_date, end_date, status"


def handler(event: dict, context) -> dict:
    '''CRUD спринтов таск-менеджера: список, создание, обновление, удаление.'''
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

    action = body.get('action') or (event.get('queryStringParameters') or {}).get('action') or ('list' if method == 'GET' else '')

    if action == 'list' or method == 'GET':
        cur.execute(f"SELECT {SPRINT_COLUMNS} FROM {schema}.sprints ORDER BY start_date ASC")
        sprints = [_row_to_sprint(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'sprints': sprints})}

    if action == 'create':
        title = (body.get('title') or '').strip()
        if not title:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_title'})}
        sprint_id = body.get('id') or f"s{int(time.time() * 1000)}"
        cur.execute(
            f"INSERT INTO {schema}.sprints (id, title, goal, start_date, end_date, status, created_by) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING {SPRINT_COLUMNS}",
            (
                sprint_id,
                title,
                body.get('goal') or '',
                body.get('startDate'),
                body.get('endDate'),
                body.get('status') or 'planned',
                me['id'],
            )
        )
        sprint = _row_to_sprint(cur.fetchone())
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'sprint': sprint})}

    if action == 'update':
        sprint_id = body.get('id')
        if not sprint_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(
            f"UPDATE {schema}.sprints SET title = %s, goal = %s, start_date = %s, end_date = %s, status = %s, "
            f"updated_at = NOW() WHERE id = %s RETURNING {SPRINT_COLUMNS}",
            (
                (body.get('title') or '').strip(),
                body.get('goal') or '',
                body.get('startDate'),
                body.get('endDate'),
                body.get('status') or 'planned',
                sprint_id,
            )
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'sprint': _row_to_sprint(row)})}

    if action == 'delete':
        sprint_id = body.get('id')
        if not sprint_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"DELETE FROM {schema}.sprints WHERE id = %s", (sprint_id,))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}