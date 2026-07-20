import base64
import io
import json
import os
import re
import urllib.parse
import uuid
import zipfile

import boto3
import psycopg2


MAX_TOTAL_SIZE = 300 * 1024 * 1024  # 300 МБ суммарно на один запрос загрузки

FIXED_ROOTS = [
    'animations', 'data', 'l2text', 'maps', 'staticmeshes',
    'System', 'System_eng', 'systextures', 'textures',
]


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
        f"SELECT u.id, u.role, u.permissions FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
        f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
        (token,)
    )
    row = cur.fetchone()
    if not row:
        return None
    perms = row[2] if isinstance(row[2], dict) else {}
    task_edit_own = perms.get('task_edit_own')
    can_manage = row[1] == 'admin' if task_edit_own is None else bool(task_edit_own)
    return {'id': row[0], 'role': row[1], 'can_manage': can_manage}


def _forbidden():
    return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}


def _bad(err, status=400):
    return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps({'error': err})}


def _ok(payload):
    return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps(payload)}


def _s3_client():
    return boto3.client(
        's3',
        endpoint_url=os.environ.get('S3_ENDPOINT', 'https://bucket.poehali.dev'),
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def _bucket():
    return os.environ.get('S3_BUCKET', 'files')


def _public_url(key):
    public_url = os.environ.get('S3_PUBLIC_URL', '').rstrip('/')
    if public_url:
        return f"{public_url}/{key}"
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def _content_disposition(name):
    ascii_fallback = name.encode('ascii', 'ignore').decode('ascii') or 'file'
    encoded = urllib.parse.quote(name)
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"


def _safe_server(server):
    if not server or not re.match(r'^[a-zA-Z0-9_-]+$', server):
        return None
    return server


def _safe_rel_path(path):
    '''Нормализует относительный путь файла в дереве патча: убирает служебные сегменты, защищает от
    выхода за пределы дерева и требует, чтобы путь начинался с одной из фиксированных корневых папок.'''
    norm = path.replace('\\', '/').strip('/')
    if not norm or norm.startswith('.') or '..' in norm.split('/'):
        return None
    parts = [p for p in norm.split('/') if p and p != '.']
    if len(parts) < 2 or parts[0] not in FIXED_ROOTS:
        return None
    return '/'.join(parts)


def _decode_b64(data_b64):
    if ',' in data_b64 and data_b64.strip().startswith('data:'):
        data_b64 = data_b64.split(',', 1)[1]
    return base64.b64decode(data_b64)


def _row_to_file(r):
    return {
        'id': r[0],
        'path': r[1],
        'size': r[2],
        'url': _public_url(r[3]),
        'updatedAt': r[4].isoformat() if r[4] else None,
        'taskIds': [str(t) for t in (r[5] or [])],
    }


def handler(event: dict, context) -> dict:
    '''Файловое дерево клиентского патча по фиксированным корневым папкам (animations, data, l2text,
    maps, staticmeshes, System, System_eng, systextures, textures) в разрезе серверов. Поддерживает
    пакетную загрузку файлов (в т.ч. перетаскиванием целой папки с сохранением структуры) суммарным
    объёмом до 300 МБ за запрос, привязку загруженных файлов к задаче (один файл может относиться сразу
    к нескольким задачам), скачивание отдельного файла и сборку архива файлов конкретной задачи,
    удаление файла. Просмотр и скачивание доступны всем авторизованным участникам, загрузка/удаление —
    администраторам и участникам с правом полного редактирования задач.'''
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
    action = body.get('action') or qs.get('action') or ('tree' if method == 'GET' else '')

    if action == 'tree':
        server = _safe_server(qs.get('server') or body.get('server'))
        if not server:
            cur.close(); conn.close()
            return _bad('no_server')
        cur.execute(
            f"SELECT id, path, size, file_key, updated_at, task_ids FROM {schema}.patch_files "
            f"WHERE server = %s ORDER BY path",
            (server,)
        )
        files = [_row_to_file(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return _ok({'files': files, 'roots': FIXED_ROOTS})

    if action in ('upload_batch', 'delete', 'clear_server'):
        if not me['can_manage']:
            cur.close(); conn.close()
            return _forbidden()

    s3 = _s3_client()
    bucket = _bucket()

    if action == 'upload_batch':
        server = _safe_server(body.get('server'))
        task_id = body.get('taskId')
        files_in = body.get('files') or []
        if not server or not files_in:
            cur.close(); conn.close()
            return _bad('bad_request')
        try:
            task_id_int = int(task_id) if task_id else None
        except (TypeError, ValueError):
            task_id_int = None

        decoded = []
        total_size = 0
        for f in files_in:
            rel_path = _safe_rel_path(f.get('path') or '')
            if not rel_path:
                continue
            try:
                raw = _decode_b64(f.get('data') or '')
            except Exception:
                cur.close(); conn.close()
                return _bad('bad_data')
            total_size += len(raw)
            if total_size > MAX_TOTAL_SIZE:
                cur.close(); conn.close()
                return _bad('file_too_large')
            decoded.append((rel_path, raw))

        if not decoded:
            cur.close(); conn.close()
            return _bad('no_valid_files')

        saved = 0
        for rel_path, raw in decoded:
            file_key = f"patches/{server}/{rel_path}"
            s3.put_object(
                Bucket=bucket, Key=file_key, Body=raw,
                ContentDisposition=_content_disposition(rel_path.rsplit('/', 1)[-1]),
            )
            cur.execute(
                f"SELECT task_ids FROM {schema}.patch_files WHERE server = %s AND path = %s",
                (server, rel_path)
            )
            existing = cur.fetchone()
            task_ids = list(existing[0]) if existing and existing[0] else []
            if task_id_int is not None and task_id_int not in task_ids:
                task_ids.append(task_id_int)
            cur.execute(
                f"INSERT INTO {schema}.patch_files (server, path, file_key, size, task_ids, uploaded_by, updated_at) "
                f"VALUES (%s, %s, %s, %s, %s, %s, now()) "
                f"ON CONFLICT (server, path) DO UPDATE SET file_key = EXCLUDED.file_key, "
                f"size = EXCLUDED.size, task_ids = EXCLUDED.task_ids, uploaded_by = EXCLUDED.uploaded_by, updated_at = now()",
                (server, rel_path, file_key, len(raw), json.dumps(task_ids), me['id'])
            )
            saved += 1
        cur.close(); conn.close()
        return _ok({'ok': True, 'savedCount': saved, 'skipped': len(files_in) - len(decoded)})

    if action == 'delete':
        server = _safe_server(body.get('server'))
        path = body.get('path')
        if not server or not path:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"SELECT file_key FROM {schema}.patch_files WHERE server = %s AND path = %s",
            (server, path)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return _bad('not_found', 404)
        try:
            s3.delete_object(Bucket=bucket, Key=row[0])
        except Exception:
            pass
        cur.execute(f"DELETE FROM {schema}.patch_files WHERE server = %s AND path = %s", (server, path))
        cur.close(); conn.close()
        return _ok({'ok': True})

    if action == 'clear_server':
        # Служебное действие — полностью очищает дерево файлов сервера (удаляет из S3 и из БД).
        # Используется, например, чтобы убрать ошибочно загруженные данные перед началом реальной работы с патчем.
        server = _safe_server(body.get('server'))
        if not server:
            cur.close(); conn.close()
            return _bad('no_server')
        cur.execute(f"SELECT file_key FROM {schema}.patch_files WHERE server = %s", (server,))
        keys = [r[0] for r in cur.fetchall()]
        for key in keys:
            try:
                s3.delete_object(Bucket=bucket, Key=key)
            except Exception:
                pass
        cur.execute(f"DELETE FROM {schema}.patch_files WHERE server = %s", (server,))
        cur.close(); conn.close()
        return _ok({'ok': True, 'deletedCount': len(keys)})

    if action == 'task_zip':
        server = _safe_server(qs.get('server') or body.get('server'))
        task_id = qs.get('taskId') or body.get('taskId')
        if not server or not task_id:
            cur.close(); conn.close()
            return _bad('bad_request')
        try:
            task_id_int = int(task_id)
        except (TypeError, ValueError):
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"SELECT path, file_key FROM {schema}.patch_files "
            f"WHERE server = %s AND task_ids @> %s ORDER BY path",
            (server, json.dumps([task_id_int]))
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        if not rows:
            return _bad('empty', 404)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for path, file_key in rows:
                obj = s3.get_object(Bucket=bucket, Key=file_key)
                zf.writestr(path, obj['Body'].read())
        buf.seek(0)
        archive_key = f"patches/_archives/task-{task_id_int}-{uuid.uuid4().hex}.zip"
        s3.put_object(
            Bucket=bucket, Key=archive_key, Body=buf.getvalue(), ContentType='application/zip',
            ContentDisposition=_content_disposition(f'task-{task_id_int}-patch.zip'),
        )
        return _ok({'url': _public_url(archive_key)})

    cur.close(); conn.close()
    return _bad('unknown_action')