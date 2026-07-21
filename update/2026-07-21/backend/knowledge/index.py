import base64
import json
import os
import urllib.parse
import uuid

import boto3
from botocore.config import Config
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


LIST_COLUMNS = "id, title, category, excerpt, author_id, updated_by, created_at, updated_at, visibility, allowed_user_ids"
FULL_COLUMNS = LIST_COLUMNS + ", content, attachments"


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
        'visibility': r[8] or 'public',
        'allowedUserIds': r[9] if r[9] is not None else [],
    }


def _row_full(r):
    d = _row_list(r)
    d['content'] = r[10] or ''
    d['attachments'] = r[11] if r[11] is not None else []
    return d


def _can_view(article_dict, me):
    '''Админ видит всё. Публичная статья доступна всем. Приватная — только тем, кто в списке допущенных, плюс автору.'''
    if me['role'] == 'admin':
        return True
    if article_dict.get('visibility', 'public') != 'private':
        return True
    if article_dict.get('authorId') == me['id']:
        return True
    return me['id'] in (article_dict.get('allowedUserIds') or [])


def _favorite_ids(cur, schema, user_id):
    cur.execute(f"SELECT article_id FROM {schema}.kb_favorites WHERE user_id = %s", (user_id,))
    return {row[0] for row in cur.fetchall()}


def _norm_ids(raw):
    result = []
    for v in (raw or []):
        try:
            iv = int(v)
        except (TypeError, ValueError):
            continue
        if iv not in result:
            result.append(iv)
    return result


MAX_FILE_SIZE = 300 * 1024 * 1024  # 300 МБ на файл


try:
    _S3_CONFIG = Config(request_checksum_calculation='when_required', response_checksum_validation='when_required')
except TypeError:
    _S3_CONFIG = Config()


def _s3_client():
    return boto3.client(
        's3',
        endpoint_url=os.environ.get('S3_ENDPOINT', 'http://127.0.0.1:9000'),
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        config=_S3_CONFIG,
    )


def _public_url(key: str) -> str:
    # приоритет: S3_PUBLIC_URL, потом CDN_BASE_URL
    base_url = (
        os.environ.get('S3_PUBLIC_URL')
        or os.environ.get('CDN_BASE_URL', '')
    ).rstrip('/')

    if base_url:
        # https://ВАШ-ДОМЕН.РУ/files/<key>
        return f"{base_url}/{key}"

    # если ни одна переменная не задана — как запасной вариант
    bucket = os.environ.get('S3_BUCKET', 'files')
    endpoint = os.environ.get('S3_ENDPOINT', 'http://127.0.0.1:9000').rstrip('/')
    # http://127.0.0.1:9000/files/<key>
    return f"{endpoint}/{bucket}/{key}"


def _decode_data(data_b64):
    if ',' in data_b64 and data_b64.strip().startswith('data:'):
        data_b64 = data_b64.split(',', 1)[1]
    return base64.b64decode(data_b64)


def _content_disposition(name):
    '''Формирует заголовок Content-Disposition с оригинальным именем файла (в т.ч. кириллица/спецсимволы),
    чтобы при скачивании из S3/MinIO браузер сохранял файл под его настоящим именем, а не под ключом-хэшем.'''
    ascii_fallback = name.encode('ascii', 'ignore').decode('ascii') or 'file'
    encoded = urllib.parse.quote(name)
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"


def _upload_image(body):
    data_b64 = body.get('data')
    if not data_b64:
        return None
    raw = _decode_data(data_b64)
    ext = (body.get('ext') or 'png').lstrip('.').lower()
    content_type = body.get('contentType') or f'image/{ext}'
    key = f"kb/{uuid.uuid4().hex}.{ext}"
    bucket = os.environ.get('S3_BUCKET', 'files')
    _s3_client().put_object(Bucket=bucket, Key=key, Body=raw, ContentType=content_type)
    return _public_url(key)


def _upload_file(body):
    '''Загружает произвольный файл (документ, архив и т.д.) в S3/MinIO и возвращает метаданные вложения.'''
    data_b64 = body.get('data')
    if not data_b64:
        return None, 'no_data'
    try:
        raw = _decode_data(data_b64)
    except Exception:
        return None, 'bad_data'
    if len(raw) > MAX_FILE_SIZE:
        return None, 'file_too_large'
    name = (body.get('name') or 'file').strip() or 'file'
    name_ext = name.rsplit('.', 1)[-1] if '.' in name else ''
    ext = (body.get('ext') or name_ext).lstrip('.').lower()
    content_type = body.get('contentType') or 'application/octet-stream'
    key = f"kb/files/{uuid.uuid4().hex}.{ext}" if ext else f"kb/files/{uuid.uuid4().hex}"
    bucket = os.environ.get('S3_BUCKET', 'files')
    _s3_client().put_object(
        Bucket=bucket, Key=key, Body=raw, ContentType=content_type,
        ContentDisposition=_content_disposition(name),
    )
    attachment = {
        'id': uuid.uuid4().hex,
        'name': name,
        'url': _public_url(key),
        'size': len(raw),
        'contentType': content_type,
    }
    return attachment, None


def handler(event: dict, context) -> dict:
    '''База знаний: статьи с решениями рабочих задач. Список, чтение, создание, редактирование и удаление статей, загрузка изображений (upload_image) и произвольных файлов-вложений (upload_file) в S3/MinIO, добавление статей в избранное. Статья может быть публичной (видна всем) или приватной (видна только указанному списку участников, автору и админам) — поля visibility/allowedUserIds. Создание/редактирование/удаление статей пишется в журнал активности (activity_log). Доступно всем авторизованным участникам команды.'''
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

    # Список статей (без тяжёлого content) — приватные показываем только автору, допущенным и админам
    if action == 'list' or (method == 'GET' and not qs.get('id')):
        cur.execute(f"SELECT {LIST_COLUMNS} FROM {schema}.kb_articles ORDER BY updated_at DESC")
        rows = cur.fetchall()
        fav_ids = _favorite_ids(cur, schema, me['id'])
        items = []
        for r in rows:
            d = _row_list(r)
            if not _can_view(d, me):
                continue
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
        if not _can_view(art, me):
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
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

    # Загрузка произвольного файла-вложения (документ, архив и т.д.) — нужно право на создание или редактирование статей
    if action == 'upload_file':
        if not (me['perms']['kb_create'] or me['perms']['kb_edit']):
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        attachment, err = _upload_file(body)
        cur.close(); conn.close()
        if err:
            status = 413 if err == 'file_too_large' else 400
            return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps({'error': err})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'attachment': attachment})}

    # Создание статьи — по праву kb_create
    if action == 'create':
        if not me['perms']['kb_create']:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        title = (body.get('title') or '').strip()
        if not title:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_title'})}
        attachments = json.dumps(body.get('attachments') or [])
        visibility = 'private' if body.get('visibility') == 'private' else 'public'
        allowed_ids = json.dumps(_norm_ids(body.get('allowedUserIds')) if visibility == 'private' else [])
        cur.execute(
            f"INSERT INTO {schema}.kb_articles (title, category, excerpt, content, attachments, author_id, updated_by, visibility, allowed_user_ids) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING {FULL_COLUMNS}",
            (
                title,
                body.get('category') or 'other',
                body.get('excerpt'),
                body.get('content') or '',
                attachments,
                me['id'],
                me['id'],
                visibility,
                allowed_ids,
            )
        )
        art = _row_full(cur.fetchone())
        _log_activity(cur, schema, me['id'], 'kb_create', 'article', art['id'], art['title'])
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
        attachments = json.dumps(body.get('attachments') or [])
        visibility = 'private' if body.get('visibility') == 'private' else 'public'
        allowed_ids = json.dumps(_norm_ids(body.get('allowedUserIds')) if visibility == 'private' else [])
        cur.execute(
            f"UPDATE {schema}.kb_articles SET title = %s, category = %s, excerpt = %s, content = %s, "
            f"attachments = %s, updated_by = %s, visibility = %s, allowed_user_ids = %s, updated_at = NOW() WHERE id = %s RETURNING {FULL_COLUMNS}",
            (
                (body.get('title') or '').strip(),
                body.get('category') or 'other',
                body.get('excerpt'),
                body.get('content') or '',
                attachments,
                me['id'],
                visibility,
                allowed_ids,
                int(art_id),
            )
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        art = _row_full(row)
        _log_activity(cur, schema, me['id'], 'kb_update', 'article', art['id'], art['title'])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'article': art})}

    # Удаление статьи — только администратор
    if action == 'delete':
        if me['role'] != 'admin':
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        art_id = body.get('id')
        if not art_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT title FROM {schema}.kb_articles WHERE id = %s", (int(art_id),))
        trow = cur.fetchone()
        art_title = trow[0] if trow else None
        cur.execute(f"DELETE FROM {schema}.kb_articles WHERE id = %s", (int(art_id),))
        _log_activity(cur, schema, me['id'], 'kb_delete', 'article', art_id, art_title)
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}