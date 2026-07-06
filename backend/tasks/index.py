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


def _row_to_task(r):
    return {
        'id': str(r[0]),
        'title': r[1],
        'column': r[2],
        'assigneeId': r[3],
        'priority': r[4],
        'tag': r[5],
        'version': r[6],
        'server': r[7],
        'category': r[8],
        'sprintId': r[9],
        'deployStatus': r[10],
        'description': r[11],
        'links': r[12] if r[12] is not None else [],
    }


TASK_COLUMNS = (
    "id, title, column_id, assignee_id, priority, tag, version, server, category, "
    "sprint_id, deploy_status, description, links"
)


def handler(event: dict, context) -> dict:
    '''CRUD задач таск-менеджера с привязкой исполнителя к реальным сотрудникам. Список, создание, обновление и удаление задач. Доступно авторизованным участникам команды.'''
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

    # Список задач
    if action == 'list' or method == 'GET':
        cur.execute(f"SELECT {TASK_COLUMNS} FROM {schema}.tasks ORDER BY created_at ASC")
        tasks = [_row_to_task(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'tasks': tasks})}

    # Создание задачи
    if action == 'create':
        title = (body.get('title') or '').strip()
        if not title:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_title'})}
        assignee_id = body.get('assigneeId')
        links = json.dumps(body.get('links') or [])
        cur.execute(
            f"INSERT INTO {schema}.tasks "
            f"(title, column_id, assignee_id, priority, tag, version, server, category, sprint_id, deploy_status, description, links, created_by) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
            f"RETURNING {TASK_COLUMNS}",
            (
                title,
                body.get('column') or 'todo',
                assignee_id if assignee_id else None,
                body.get('priority') or 'medium',
                body.get('tag'),
                body.get('version'),
                body.get('server'),
                body.get('category') or 'other',
                body.get('sprintId'),
                body.get('deployStatus') or 'none',
                body.get('description'),
                links,
                me['id'],
            )
        )
        task = _row_to_task(cur.fetchone())
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': task})}

    # Обновление задачи
    if action == 'update':
        task_id = body.get('id')
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        assignee_id = body.get('assigneeId')
        links = json.dumps(body.get('links') or [])
        cur.execute(
            f"UPDATE {schema}.tasks SET "
            f"title = %s, column_id = %s, assignee_id = %s, priority = %s, tag = %s, version = %s, "
            f"server = %s, category = %s, sprint_id = %s, deploy_status = %s, description = %s, links = %s, updated_at = NOW() "
            f"WHERE id = %s RETURNING {TASK_COLUMNS}",
            (
                (body.get('title') or '').strip(),
                body.get('column') or 'todo',
                assignee_id if assignee_id else None,
                body.get('priority') or 'medium',
                body.get('tag'),
                body.get('version'),
                body.get('server'),
                body.get('category') or 'other',
                body.get('sprintId'),
                body.get('deployStatus') or 'none',
                body.get('description'),
                links,
                int(task_id),
            )
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': _row_to_task(row)})}

    # Быстрое перемещение по колонкам (drag&drop)
    if action == 'move':
        task_id = body.get('id')
        column = body.get('column')
        if not task_id or not column:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
        cur.execute(
            f"UPDATE {schema}.tasks SET column_id = %s, updated_at = NOW() WHERE id = %s",
            (column, int(task_id))
        )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Удаление задачи
    if action == 'delete':
        task_id = body.get('id')
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"DELETE FROM {schema}.tasks WHERE id = %s", (int(task_id),))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}
