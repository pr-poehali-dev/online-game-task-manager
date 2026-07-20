import io
import json
import os
import re
import tempfile
import urllib.parse
import uuid
import zipfile

import boto3
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
    '''Нормализует относительный путь внутри архива, отбрасывает служебные записи и защищает от выхода за пределы дерева.'''
    norm = path.replace('\\', '/').strip('/')
    if not norm or norm.startswith('.') or '..' in norm.split('/'):
        return None
    parts = [p for p in norm.split('/') if p and p != '.']
    if not parts:
        return None
    return '/'.join(parts)


def _row_to_file(r):
    return {
        'id': r[0],
        'path': r[1],
        'size': r[2],
        'url': _public_url(r[3]),
        'updatedAt': r[4].isoformat() if r[4] else None,
        'taskId': str(r[5]) if r[5] is not None else None,
    }


def handler(event: dict, context) -> dict:
    '''Файловое дерево клиентского патча по серверам: список файлов, загрузка ZIP-архива с автоматической
    распаковкой в дерево S3, скачивание отдельного файла (прямая ссылка), сборка и скачивание всего патча
    сервера одним архивом, удаление файла. Просмотр доступен всем авторизованным участникам, загрузка/удаление —
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
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_server'})}
        cur.execute(
            f"SELECT id, path, size, file_key, updated_at, task_id FROM {schema}.patch_files "
            f"WHERE server = %s ORDER BY path",
            (server,)
        )
        files = [_row_to_file(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'files': files})}

    # Все действия ниже изменяют или собирают данные патча — только для тех, кто может полностью редактировать задачи
    if action in ('upload_init', 'zip_ingest', 'delete'):
        if not me['can_manage']:
            cur.close(); conn.close()
            return _forbidden()

    if action == 'upload_init':
        server = _safe_server(body.get('server'))
        if not server:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_server'})}
        staging_key = f"patches/_staging/{uuid.uuid4().hex}.zip"
        url = _s3_client().generate_presigned_url(
            'put_object',
            Params={'Bucket': _bucket(), 'Key': staging_key, 'ContentType': 'application/zip'},
            ExpiresIn=3600,
        )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'uploadUrl': url, 'stagingKey': staging_key})}

    if action == 'zip_ingest':
        server = _safe_server(body.get('server'))
        staging_key = body.get('stagingKey')
        task_id = body.get('taskId')
        if not server or not staging_key or not staging_key.startswith('patches/_staging/'):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
        s3 = _s3_client()
        bucket = _bucket()
        try:
            with tempfile.NamedTemporaryFile(suffix='.zip', delete=True) as tmp:
                s3.download_fileobj(bucket, staging_key, tmp)
                tmp.flush()
                count = 0
                total_size = 0
                with zipfile.ZipFile(tmp.name) as zf:
                    for info in zf.infolist():
                        if info.is_dir():
                            continue
                        rel_path = _safe_rel_path(info.filename)
                        if not rel_path:
                            continue
                        file_key = f"patches/{server}/{rel_path}"
                        with zf.open(info) as member:
                            data = member.read()
                        s3.put_object(
                            Bucket=bucket, Key=file_key, Body=data,
                            ContentDisposition=_content_disposition(rel_path.rsplit('/', 1)[-1]),
                        )
                        cur.execute(
                            f"INSERT INTO {schema}.patch_files (server, path, file_key, size, task_id, uploaded_by, updated_at) "
                            f"VALUES (%s, %s, %s, %s, %s, %s, now()) "
                            f"ON CONFLICT (server, path) DO UPDATE SET file_key = EXCLUDED.file_key, "
                            f"size = EXCLUDED.size, task_id = EXCLUDED.task_id, uploaded_by = EXCLUDED.uploaded_by, updated_at = now()",
                            (server, rel_path, file_key, len(data), int(task_id) if task_id else None, me['id'])
                        )
                        count += 1
                        total_size += len(data)
        except Exception:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_zip'})}
        finally:
            try:
                s3.delete_object(Bucket=bucket, Key=staging_key)
            except Exception:
                pass
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True, 'filesCount': count, 'totalSize': total_size})}

    if action == 'delete':
        server = _safe_server(body.get('server'))
        path = body.get('path')
        if not server or not path:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
        cur.execute(
            f"SELECT file_key FROM {schema}.patch_files WHERE server = %s AND path = %s",
            (server, path)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        try:
            _s3_client().delete_object(Bucket=_bucket(), Key=row[0])
        except Exception:
            pass
        cur.execute(f"DELETE FROM {schema}.patch_files WHERE server = %s AND path = %s", (server, path))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    if action == 'zip_all':
        server = _safe_server(qs.get('server') or body.get('server'))
        if not server:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_server'})}
        cur.execute(
            f"SELECT path, file_key FROM {schema}.patch_files WHERE server = %s ORDER BY path",
            (server,)
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        if not rows:
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'empty'})}
        s3 = _s3_client()
        bucket = _bucket()
        with tempfile.NamedTemporaryFile(suffix='.zip', delete=True) as tmp:
            with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zf:
                for path, file_key in rows:
                    buf = io.BytesIO()
                    s3.download_fileobj(bucket, file_key, buf)
                    zf.writestr(path, buf.getvalue())
            tmp.flush()
            tmp.seek(0)
            archive_key = f"patches/_archives/{server}-{uuid.uuid4().hex}.zip"
            s3.upload_fileobj(tmp, bucket, archive_key, ExtraArgs={
                'ContentType': 'application/zip',
                'ContentDisposition': _content_disposition(f'{server}-patch.zip'),
            })
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'url': _public_url(archive_key)})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}
