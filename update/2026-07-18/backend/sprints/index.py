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


def _log_activity(cur, schema, user_id, action, entity_type=None, entity_id=None, entity_title=None, details=None):
    '''Записывает значимое действие пользователя в журнал активности (хранится 7 дней).'''
    cur.execute(
        f"INSERT INTO {schema}.activity_log (user_id, action, entity_type, entity_id, entity_title, details) "
        f"VALUES (%s, %s, %s, %s, %s, %s)",
        (user_id, action, entity_type, str(entity_id) if entity_id is not None else None, entity_title, details)
    )


ALL_PERMISSIONS = [
    'task_create', 'task_edit_own', 'task_view_others', 'task_restart',
    'idea_create',
    'kb_create', 'kb_edit',
    'sprint_create', 'sprint_edit',
]


def _effective_perms(role, raw):
    result = {}
    for key in ALL_PERMISSIONS:
        if isinstance(raw, dict) and key in raw and raw[key] is not None:
            result[key] = bool(raw[key])
        else:
            result[key] = (role == 'admin')
    return result


def _current_user(cur, schema, token):
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
    return {'id': row[0], 'role': row[1], 'perms': _effective_perms(row[1], row[2])}


def _row_to_sprint(r):
    return {
        'id': r[0],
        'title': r[1],
        'goal': r[2],
        'startDate': r[3].isoformat() if hasattr(r[3], 'isoformat') else r[3],
        'endDate': r[4].isoformat() if hasattr(r[4], 'isoformat') else r[4],
        'status': r[5],
        'server': r[6],
    }


SPRINT_COLUMNS = "id, title, goal, start_date, end_date, status, server"


def handler(event: dict, context) -> dict:
    '''CRUD спринтов таск-менеджера: список, создание, обновление, удаление. Создание/обновление/удаление пишется в журнал активности (activity_log).'''
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

    if action == 'create' and not me['perms']['sprint_create']:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    if action == 'update' and not me['perms']['sprint_edit']:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    if action == 'delete' and me['role'] != 'admin':
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    if action == 'create':
        title = (body.get('title') or '').strip()
        if not title:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_title'})}
        sprint_id = body.get('id') or f"s{int(time.time() * 1000)}"
        cur.execute(
            f"INSERT INTO {schema}.sprints (id, title, goal, start_date, end_date, status, server, created_by) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING {SPRINT_COLUMNS}",
            (
                sprint_id,
                title,
                body.get('goal') or '',
                body.get('startDate'),
                body.get('endDate'),
                body.get('status') or 'planned',
                body.get('server'),
                me['id'],
            )
        )
        sprint = _row_to_sprint(cur.fetchone())
        _log_activity(cur, schema, me['id'], 'sprint_create', 'sprint', sprint['id'], sprint['title'])
        # Сразу привязать выбранные задачи с доски к новому спринту
        task_ids = body.get('taskIds') or []
        if task_ids:
            valid_ids = []
            for tid in task_ids:
                try:
                    valid_ids.append(int(tid))
                except (TypeError, ValueError):
                    continue
            if valid_ids:
                cur.execute(
                    f"UPDATE {schema}.tasks SET sprint_id = %s, updated_at = NOW() WHERE id = ANY(%s)",
                    (sprint_id, valid_ids)
                )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'sprint': sprint})}

    if action == 'update':
        sprint_id = body.get('id')
        if not sprint_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(
            f"UPDATE {schema}.sprints SET title = %s, goal = %s, start_date = %s, end_date = %s, status = %s, "
            f"server = %s, updated_at = NOW() WHERE id = %s RETURNING {SPRINT_COLUMNS}",
            (
                (body.get('title') or '').strip(),
                body.get('goal') or '',
                body.get('startDate'),
                body.get('endDate'),
                body.get('status') or 'planned',
                body.get('server'),
                sprint_id,
            )
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        sprint = _row_to_sprint(row)
        _log_activity(cur, schema, me['id'], 'sprint_update', 'sprint', sprint['id'], sprint['title'])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'sprint': sprint})}

    if action == 'delete':
        sprint_id = body.get('id')
        if not sprint_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT title FROM {schema}.sprints WHERE id = %s", (sprint_id,))
        trow = cur.fetchone()
        sprint_title = trow[0] if trow else None
        cur.execute(f"DELETE FROM {schema}.sprints WHERE id = %s", (sprint_id,))
        _log_activity(cur, schema, me['id'], 'sprint_delete', 'sprint', sprint_id, sprint_title)
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}