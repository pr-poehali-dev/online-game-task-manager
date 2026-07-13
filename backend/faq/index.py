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


COLUMNS = "id, question, answer, sort_order, author_id, updated_by, created_at, updated_at"


def _row(r):
    return {
        'id': str(r[0]),
        'question': r[1],
        'answer': r[2],
        'sortOrder': r[3],
        'authorId': r[4],
        'updatedById': r[5],
        'createdAt': r[6].isoformat() if r[6] else None,
        'updatedAt': r[7].isoformat() if r[7] else None,
    }


def handler(event: dict, context) -> dict:
    '''Раздел FAQ: вопросы и ответы о работе задачника. Список и чтение доступны всем авторизованным участникам. Создание, редактирование, изменение порядка и удаление — только администраторам.'''
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

    # Список вопросов-ответов — доступно всем авторизованным
    if action == 'list' or method == 'GET':
        cur.execute(f"SELECT {COLUMNS} FROM {schema}.faq_items ORDER BY sort_order ASC, id ASC")
        items = [_row(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'items': items})}

    # Дальше — только администраторам
    if me['role'] != 'admin':
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    # Создание вопроса
    if action == 'create':
        question = (body.get('question') or '').strip()
        if not question:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_question'})}
        cur.execute(f"SELECT COALESCE(MAX(sort_order), -1) + 1 FROM {schema}.faq_items")
        sort_order = cur.fetchone()[0]
        cur.execute(
            f"INSERT INTO {schema}.faq_items (question, answer, sort_order, author_id, updated_by) "
            f"VALUES (%s, %s, %s, %s, %s) RETURNING {COLUMNS}",
            (question, body.get('answer') or '', sort_order, me['id'], me['id'])
        )
        item = _row(cur.fetchone())
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'item': item})}

    # Редактирование вопроса
    if action == 'update':
        item_id = body.get('id')
        if not item_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        question = (body.get('question') or '').strip()
        if not question:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_question'})}
        cur.execute(
            f"UPDATE {schema}.faq_items SET question = %s, answer = %s, updated_by = %s, updated_at = NOW() "
            f"WHERE id = %s RETURNING {COLUMNS}",
            (question, body.get('answer') or '', me['id'], int(item_id))
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'item': _row(row)})}

    # Изменение порядка (полный список id в нужном порядке)
    if action == 'reorder':
        ids = body.get('ids') or []
        for idx, item_id in enumerate(ids):
            try:
                iid = int(item_id)
            except (TypeError, ValueError):
                continue
            cur.execute(f"UPDATE {schema}.faq_items SET sort_order = %s WHERE id = %s", (idx, iid))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Удаление вопроса
    if action == 'delete':
        item_id = body.get('id')
        if not item_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"DELETE FROM {schema}.faq_items WHERE id = %s", (int(item_id),))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}
