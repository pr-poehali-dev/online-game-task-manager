import base64
import json
import os
import uuid

import boto3
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


LIST_COLUMNS = "id, title, category, excerpt, author_id, updated_by, created_at, updated_at"
FULL_COLUMNS = LIST_COLUMNS + ", content"


def _row_list(r):
    return {
        'id': str(r[0]),
        'title': r[1],
        'category': r[2],
        'excerpt': r[3],
        'authorId': r[4],
        'updatedById': r[5],
        'createdAt': r[6].isoformat() if r[6] else None,
        'updatedAt': r[7].isoformat() if r[7] else None,
    }


def _row_full(r):
    d = _row_list(r)
    d['content'] = r[8] or ''
    return d


def _favorite_ids(cur, schema, user_id):
    cur.execute(f"SELECT article_id FROM {schema}.kb_favorites WHERE user_id = %s", (user_id,))
    return {row[0] for row in cur.fetchall()}


def _upload_image(body):
    data_b64 = body.get('data')
    if not data_b64:
        return None
    if ',' in data_b64 and data_b64.strip().startswith('data:'):
        data_b64 = data_b64.split(',', 1)[1]
    raw = base64.b64decode(data_b64)
    ext = (body.get('ext') or 'png').lstrip('.').lower()
    content_type = body.get('contentType') or f'image/{ext}'
    key = f"kb/{uuid.uuid4().hex}.{ext}"
    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )
    s3.put_object(Bucket='files', Key=key, Body=raw, ContentType=content_type)
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def handler(event: dict, context) -> dict:
    '''База знаний: статьи с решениями рабочих задач. Список, чтение, создание, редактирование и удаление статей, загрузка изображений, добавление статей в избранное. Доступно всем авторизованным участникам команды.'''
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

    # Список статей (без тяжёлого content)
    if action == 'list' or (method == 'GET' and not qs.get('id')):
        cur.execute(f"SELECT {LIST_COLUMNS} FROM {schema}.kb_articles ORDER BY updated_at DESC")
        rows = cur.fetchall()
        fav_ids = _favorite_ids(cur, schema, me['id'])
        items = []
        for r in rows:
            d = _row_list(r)
            d['isFavorite'] = r[0] in fav_ids
            items.append(d)
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'articles': items})}

    # Одна статья с полным содержимым
    if action == 'get' or (method == 'GET' and qs.get('id')):
        art_id = body.get('id') or qs.get('id')
        cur.execute(f"SELECT {FULL_COLUMNS} FROM {schema}.kb_articles WHERE id = %s", (int(art_id),))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        art = _row_full(row)
        fav_ids = _favorite_ids(cur, schema, me['id'])
        art['isFavorite'] = int(art_id) in fav_ids
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'article': art})}

    # Добавить/убрать статью из избранного — доступно любому авторизованному
    if action == 'toggle_favorite':
        art_id = body.get('id')
        if not art_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(
            f"SELECT 1 FROM {schema}.kb_favorites WHERE user_id = %s AND article_id = %s",
            (me['id'], int(art_id))
        )
        exists = cur.fetchone()
        if exists:
            cur.execute(
                f"DELETE FROM {schema}.kb_favorites WHERE user_id = %s AND article_id = %s",
                (me['id'], int(art_id))
            )
            is_fav = False
        else:
            cur.execute(
                f"INSERT INTO {schema}.kb_favorites (user_id, article_id) VALUES (%s, %s) "
                f"ON CONFLICT (user_id, article_id) DO NOTHING",
                (me['id'], int(art_id))
            )
            is_fav = True
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'isFavorite': is_fav})}

    # Загрузка изображения — нужно право на создание или редактирование статей
    if action == 'upload_image':
        if not (me['perms']['kb_create'] or me['perms']['kb_edit']):
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        url = _upload_image(body)
        cur.close(); conn.close()
        if not url:
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_data'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'url': url})}

    # Создание статьи — по праву kb_create
    if action == 'create':
        if not me['perms']['kb_create']:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        title = (body.get('title') or '').strip()
        if not title:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_title'})}
        cur.execute(
            f"INSERT INTO {schema}.kb_articles (title, category, excerpt, content, author_id, updated_by) "
            f"VALUES (%s, %s, %s, %s, %s, %s) RETURNING {FULL_COLUMNS}",
            (
                title,
                body.get('category') or 'other',
                body.get('excerpt'),
                body.get('content') or '',
                me['id'],
                me['id'],
            )
        )
        art = _row_full(cur.fetchone())
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'article': art})}

    # Редактирование статьи — по праву kb_edit
    if action == 'update':
        if not me['perms']['kb_edit']:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        art_id = body.get('id')
        if not art_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(
            f"UPDATE {schema}.kb_articles SET title = %s, category = %s, excerpt = %s, content = %s, "
            f"updated_by = %s, updated_at = NOW() WHERE id = %s RETURNING {FULL_COLUMNS}",
            (
                (body.get('title') or '').strip(),
                body.get('category') or 'other',
                body.get('excerpt'),
                body.get('content') or '',
                me['id'],
                int(art_id),
            )
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'article': _row_full(row)})}

    # Удаление статьи — только администратор
    if action == 'delete':
        if me['role'] != 'admin':
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        art_id = body.get('id')
        if not art_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"DELETE FROM {schema}.kb_articles WHERE id = %s", (int(art_id),))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}