import base64
import json
import os
import re
import urllib.request
import urllib.error
import urllib.parse
import uuid

import boto3
from botocore.config import Config
import psycopg2


SNIPPET_LEN = 100


def _snippet(text, length=SNIPPET_LEN):
    '''Первые N символов текста для превью в уведомлении: убирает HTML-теги (описание идеи — rich text)
    и схлопывает пробелы/переносы строк, добавляет многоточие, если текст обрезан.'''
    if not text:
        return ''
    plain = re.sub(r'<[^>]+>', ' ', text)
    plain = re.sub(r'\s+', ' ', plain).strip()
    if len(plain) <= length:
        return plain
    return plain[:length].rstrip() + '…'


def _tg_send(chat_id, text, button_url=None):
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {'chat_id': chat_id, 'text': text}
    if button_url:
        payload['reply_markup'] = {
            'inline_keyboard': [[{'text': '🔗 Открыть идею', 'url': button_url}]]
        }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        print(f"[ideas] tg send HTTP {e.code}: {e.read().decode('utf-8', 'ignore')}")
    except Exception as e:
        print(f"[ideas] tg send error: {e}")


def _telegram_targets(cur, schema, user_ids):
    '''Возвращает telegram_id пользователей из списка, которые вошли через бота, активны и не отключили уведомления в Telegram.'''
    if not user_ids:
        return []
    cur.execute(
        f"SELECT telegram_id FROM {schema}.users "
        f"WHERE id = ANY(%s) AND telegram_id > 0 AND is_active = true AND tg_notify_muted = false",
        (user_ids,)
    )
    return [r[0] for r in cur.fetchall()]


def _idea_url(topic_id=None):
    '''Прямая постоянная ссылка на идею (если известен её id) или просто на приложение.'''
    app_url = (os.environ.get('APP_URL') or '').rstrip('/')
    if not app_url:
        return None
    return f"{app_url}/idea/{topic_id}" if topic_id else app_url


def _notify_reply_or_mention(cur, schema, user_id, topic_id, topic_title, kind, comment_text=None):
    '''Уведомляет одного пользователя об ответе на его комментарий или упоминании в идее — сообщение в Telegram (если вошёл через бота).'''
    if not user_id:
        return
    label = 'Вам ответили в обсуждении идеи' if kind == 'reply' else 'Вас упомянули в обсуждении идеи'
    icon = '↩️' if kind == 'reply' else '📣'
    snippet = _snippet(comment_text)
    text = f"{icon} {label}:\n\n«{topic_title}»" + (f'\n{snippet}' if snippet else '')
    button_url = _idea_url(topic_id)
    for tg_id in _telegram_targets(cur, schema, [user_id]):
        _tg_send(tg_id, text, button_url)


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


def _topic_row(r):
    return {
        'id': str(r[0]),
        'title': r[1],
        'body': r[2],
        'status': r[3],
        'authorId': r[4],
        'createdAt': r[5].isoformat() if r[5] else None,
        'updatedAt': r[6].isoformat() if r[6] else None,
        'attachments': r[7] if len(r) > 7 and r[7] is not None else [],
    }


MAX_FILE_SIZE = 300 * 1024 * 1024  # 300 МБ на файл


try:
    _S3_CONFIG = Config(request_checksum_calculation='when_required', response_checksum_validation='when_required')
except TypeError:
    _S3_CONFIG = Config()


def _s3_client():
    return boto3.client(
        's3',
        endpoint_url=os.environ.get('S3_ENDPOINT', 'https://bucket.poehali.dev'),
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        config=_S3_CONFIG,
    )


def _public_url(key):
    public_url = os.environ.get('S3_PUBLIC_URL', '').rstrip('/')
    if public_url:
        return f"{public_url}/{key}"
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


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
    key = f"ideas/{uuid.uuid4().hex}.{ext}"
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
    key = f"ideas/files/{uuid.uuid4().hex}.{ext}" if ext else f"ideas/files/{uuid.uuid4().hex}"
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


def _comment_row(r):
    return {
        'id': str(r[0]),
        'topicId': str(r[1]),
        'authorId': r[2],
        'text': r[3],
        'createdAt': r[4].isoformat() if r[4] else None,
        'parentId': str(r[5]) if len(r) > 5 and r[5] else None,
        'mentions': (r[6] if len(r) > 6 and r[6] is not None else []),
        'attachments': (r[7] if len(r) > 7 and r[7] is not None else []),
    }


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


TOPIC_COLS = "id, title, body, status, author_id, created_at, updated_at, attachments"
COMMENT_COLS = "id, topic_id, author_id, text, created_at, parent_id, mentions, attachments"


def _add_notification(cur, schema, user_id, ntype, title, body_text, entity_id, actor_id):
    '''Создаёт внутреннее уведомление (не для самого себя).'''
    if not user_id or user_id == actor_id:
        return
    cur.execute(
        f"INSERT INTO {schema}.notifications (user_id, type, title, body, entity_type, entity_id, actor_id) "
        f"VALUES (%s, %s, %s, %s, 'idea', %s, %s)",
        (user_id, ntype, title, body_text, str(entity_id) if entity_id else None, actor_id)
    )


def handler(event: dict, context) -> dict:
    '''Раздел «Идеи»: треды-обсуждения с комментариями и статусами (открыт, решено не делать, отправлено на реализацию). Редактировать текст и вложения (action=update), закрывать топик может автор или админ. Загрузка изображений (upload_image) и файлов-вложений (upload_file) в S3/MinIO. При ответе на комментарий или упоминании (@) участнику также приходит сообщение в Telegram, если он входил через бота. Создание/редактирование/смена статуса/удаление идеи пишется в журнал активности (activity_log). Доступно авторизованным участникам.'''
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

    # Загрузка изображения для описания идеи (вставка в RichEditor) — нужно право на создание идей
    if action == 'upload_image':
        if not me['perms']['idea_create']:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        url = _upload_image(body)
        cur.close(); conn.close()
        if not url:
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_data'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'url': url})}

    # Загрузка произвольного файла-вложения к идее
    if action == 'upload_file':
        if not me['perms']['idea_create']:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        attachment, err = _upload_file(body)
        cur.close(); conn.close()
        if err:
            status = 413 if err == 'file_too_large' else 400
            return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps({'error': err})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'attachment': attachment})}

    # Загрузка файла-вложения к комментарию — доступно любому авторизованному участнику
    if action == 'comment_upload_file':
        attachment, err = _upload_file(body)
        cur.close(); conn.close()
        if err:
            status = 413 if err == 'file_too_large' else 400
            return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps({'error': err})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'attachment': attachment})}

    # Список топиков (+ количество комментариев)
    if action == 'list' or (method == 'GET' and not qs.get('id')):
        cur.execute(
            f"SELECT t.id, t.title, t.body, t.status, t.author_id, t.created_at, t.updated_at, "
            f"(SELECT COUNT(*) FROM {schema}.idea_comments c WHERE c.topic_id = t.id) AS cnt "
            f"FROM {schema}.idea_topics t ORDER BY t.updated_at DESC"
        )
        items = []
        for r in cur.fetchall():
            d = _topic_row(r[:7])
            d['commentsCount'] = r[7]
            items.append(d)
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'topics': items})}

    # Один топик с комментариями
    if action == 'get' or (method == 'GET' and qs.get('id')):
        tid = body.get('id') or qs.get('id')
        cur.execute(f"SELECT {TOPIC_COLS} FROM {schema}.idea_topics WHERE id = %s", (int(tid),))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        topic = _topic_row(row)
        cur.execute(f"SELECT {COMMENT_COLS} FROM {schema}.idea_comments WHERE topic_id = %s ORDER BY created_at ASC", (int(tid),))
        comments = [_comment_row(c) for c in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'topic': topic, 'comments': comments})}

    # Создать топик — по праву idea_create
    if action == 'create':
        if not me['perms']['idea_create']:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        title = (body.get('title') or '').strip()
        if not title:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_title'})}
        attachments = json.dumps(body.get('attachments') or [])
        cur.execute(
            f"INSERT INTO {schema}.idea_topics (title, body, author_id, attachments) VALUES (%s, %s, %s, %s) RETURNING {TOPIC_COLS}",
            (title, body.get('body') or '', me['id'], attachments)
        )
        topic = _topic_row(cur.fetchone())
        _log_activity(cur, schema, me['id'], 'idea_create', 'idea', topic['id'], topic['title'])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'topic': topic})}

    # Редактировать топик (текст идеи и вложения) — автор или админ
    if action == 'update':
        tid = body.get('id')
        if not tid:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT author_id FROM {schema}.idea_topics WHERE id = %s", (int(tid),))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        if row[0] != me['id'] and me['role'] != 'admin':
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        title = (body.get('title') or '').strip()
        if not title:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_title'})}
        attachments = json.dumps(body.get('attachments') or [])
        cur.execute(
            f"UPDATE {schema}.idea_topics SET title = %s, body = %s, attachments = %s, updated_at = NOW() "
            f"WHERE id = %s RETURNING {TOPIC_COLS}",
            (title, body.get('body') or '', attachments, int(tid))
        )
        topic = _topic_row(cur.fetchone())
        _log_activity(cur, schema, me['id'], 'idea_update', 'idea', topic['id'], topic['title'])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'topic': topic})}

    # Добавить комментарий (+ ответ + упоминания + вложения)
    if action == 'comment':
        tid = body.get('topicId')
        text = (body.get('text') or '').strip()
        attachments = body.get('attachments') or []
        if not tid or (not text and not attachments):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
        parent_id = body.get('parentId')
        parent_id = int(parent_id) if parent_id else None
        mentions = _norm_ids(body.get('mentions'))
        cur.execute(
            f"INSERT INTO {schema}.idea_comments (topic_id, author_id, text, parent_id, mentions, attachments) "
            f"VALUES (%s, %s, %s, %s, %s, %s) RETURNING {COMMENT_COLS}",
            (int(tid), me['id'], text, parent_id, json.dumps(mentions), json.dumps(attachments))
        )
        comment = _comment_row(cur.fetchone())
        cur.execute(f"UPDATE {schema}.idea_topics SET updated_at = NOW() WHERE id = %s", (int(tid),))
        cur.execute(f"SELECT author_id, title FROM {schema}.idea_topics WHERE id = %s", (int(tid),))
        trow = cur.fetchone()
        topic_title = trow[1] if trow else 'идея'
        notified = set()
        # Ответ автору родительского комментария
        snippet = _snippet(text)
        notif_body = f'«{topic_title}»' + (f'\n{snippet}' if snippet else '')
        if parent_id:
            cur.execute(f"SELECT author_id FROM {schema}.idea_comments WHERE id = %s", (parent_id,))
            prow = cur.fetchone()
            if prow and prow[0] and prow[0] != me['id']:
                _add_notification(cur, schema, prow[0], 'idea_reply', 'Ответ на ваш комментарий', notif_body, tid, me['id'])
                _notify_reply_or_mention(cur, schema, prow[0], tid, topic_title, 'reply', text)
                notified.add(prow[0])
        # Упоминания
        for uid in mentions:
            if uid not in notified:
                _add_notification(cur, schema, uid, 'idea_mention', 'Вас упомянули в обсуждении', notif_body, tid, me['id'])
                _notify_reply_or_mention(cur, schema, uid, tid, topic_title, 'mention', text)
                notified.add(uid)
        # Уведомить автора темы (если это не ответ и не упоминание ему)
        if trow and trow[0] and trow[0] != me['id'] and trow[0] not in notified:
            _add_notification(cur, schema, trow[0], 'idea_comment', 'Новый комментарий к вашей идее', notif_body, tid, me['id'])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'comment': comment})}

    # Удалить комментарий идеи (автор или админ)
    if action == 'comment_delete':
        cid = body.get('id')
        if not cid:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT author_id FROM {schema}.idea_comments WHERE id = %s", (int(cid),))
        crow = cur.fetchone()
        if not crow:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        if crow[0] != me['id'] and me['role'] != 'admin':
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        cur.execute(f"UPDATE {schema}.idea_comments SET parent_id = NULL WHERE parent_id = %s", (int(cid),))
        cur.execute(f"DELETE FROM {schema}.idea_comments WHERE id = %s", (int(cid),))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Сменить статус топика (закрыть/переоткрыть). Только автор или админ.
    if action == 'set_status':
        tid = body.get('id')
        status = body.get('status')
        if not tid or status not in ('open', 'wont_do', 'sent'):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
        cur.execute(f"SELECT author_id, title FROM {schema}.idea_topics WHERE id = %s", (int(tid),))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        if row[0] != me['id'] and me['role'] != 'admin':
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        cur.execute(
            f"UPDATE {schema}.idea_topics SET status = %s, updated_at = NOW() WHERE id = %s RETURNING {TOPIC_COLS}",
            (status, int(tid))
        )
        topic = _topic_row(cur.fetchone())
        status_label = {'sent': 'Отправлено на реализацию', 'wont_do': 'Решено не делать', 'open': 'Переоткрыто'}.get(status, status)
        _add_notification(cur, schema, row[0], 'idea_status', f'Статус идеи: {status_label}', row[1], tid, me['id'])
        _log_activity(cur, schema, me['id'], 'idea_status', 'idea', tid, row[1], status_label)
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'topic': topic})}

    # Удалить топик. Только автор или админ.
    if action == 'delete':
        tid = body.get('id')
        if not tid:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT author_id, title FROM {schema}.idea_topics WHERE id = %s", (int(tid),))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        if row[0] != me['id'] and me['role'] != 'admin':
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        cur.execute(f"DELETE FROM {schema}.idea_comments WHERE topic_id = %s", (int(tid),))
        cur.execute(f"DELETE FROM {schema}.idea_topics WHERE id = %s", (int(tid),))
        _log_activity(cur, schema, me['id'], 'idea_delete', 'idea', tid, row[1])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}