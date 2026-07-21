import base64
import io
import json
import os
import re
import urllib.parse
import uuid
import zipfile

import boto3
from botocore.config import Config
import psycopg2


MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 МБ на один файл (собирается в памяти функции из кусочков)

# Новые версии botocore по умолчанию добавляют контрольную сумму запроса через
# chunked-кодирование (trailer). Кастомный (не-AWS) S3-эндпоинт не всегда его корректно
# разбирает — трейлер попадает прямо в тело файла (особенно заметно на 0-байтных файлах).
# Отключаем эту проверку, чтобы файлы сохранялись байт-в-байт как есть.
_S3_CONFIG = Config(request_checksum_calculation='when_required', response_checksum_validation='when_required')

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
        config=_S3_CONFIG,
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


def _safe_root_name(name):
    '''Проверяет имя пользовательской корневой папки — только буквы/цифры/подчёркивание/дефис,
    без служебных сегментов и не совпадает с уже зафиксированными системными корнями.'''
    if not name or not re.match(r'^[a-zA-Z0-9_-]+$', name) or name in FIXED_ROOTS:
        return None
    return name


def _safe_rel_path(path, extra_roots):
    '''Нормализует относительный путь файла в дереве патча: убирает служебные сегменты, защищает от
    выхода за пределы дерева и требует, чтобы путь начинался с одной из фиксированных корневых папок
    либо с одной из пользовательских корневых папок этого сервера.'''
    norm = path.replace('\\', '/').strip('/')
    if not norm or norm.startswith('.') or '..' in norm.split('/'):
        return None
    parts = [p for p in norm.split('/') if p and p != '.']
    if len(parts) < 2 or parts[0] not in FIXED_ROOTS and parts[0] not in extra_roots:
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
    maps, staticmeshes, System, System_eng, systextures, textures) в разрезе серверов. Каждый файл
    (в т.ч. из перетащенной целиком папки) грузится кусочками по ~1.5 МБ (file_init/file_chunk/
    file_complete/file_abort — одиночный HTTP-запрос физически ограничен ~3 МБ) и собирается на
    сервере в готовый файл до 200 МБ. Действие toggle_task прикрепляет/открепляет уже загруженный
    файл к выбранной задаче (один файл может относиться сразу к нескольким задачам). Помимо
    фиксированных корней можно создавать (add_root) и удалять (delete_root, только если папка
    пустая) собственные корневые папки для конкретного сервера. Поддерживает скачивание отдельного
    файла и сборку архива файлов конкретной задачи, удаление файла и полную очистку дерева сервера.
    Просмотр и скачивание доступны всем авторизованным участникам, загрузка/удаление/привязка к
    задаче/управление папками — администраторам и участникам с правом полного редактирования задач.'''
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
        cur.execute(
            f"SELECT name FROM {schema}.patch_custom_roots WHERE server = %s ORDER BY name",
            (server,)
        )
        custom_roots = [r[0] for r in cur.fetchall()]
        cur.close(); conn.close()
        return _ok({'files': files, 'roots': FIXED_ROOTS, 'customRoots': custom_roots})

    if action in ('file_init', 'file_chunk', 'file_complete', 'file_abort', 'delete', 'clear_server', 'toggle_task', 'add_root', 'delete_root'):
        if not me['can_manage']:
            cur.close(); conn.close()
            return _forbidden()

    if action == 'add_root':
        server = _safe_server(body.get('server'))
        name = _safe_root_name((body.get('name') or '').strip())
        if not server or not name:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"INSERT INTO {schema}.patch_custom_roots (server, name, created_by) VALUES (%s, %s, %s) "
            f"ON CONFLICT (server, name) DO NOTHING",
            (server, name, me['id'])
        )
        cur.close(); conn.close()
        return _ok({'ok': True, 'name': name})

    if action == 'delete_root':
        server = _safe_server(body.get('server'))
        name = (body.get('name') or '').strip()
        if not server or not name:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"SELECT 1 FROM {schema}.patch_files WHERE server = %s AND (path = %s OR path LIKE %s) LIMIT 1",
            (server, name, f"{name}/%")
        )
        if cur.fetchone():
            cur.close(); conn.close()
            return _bad('root_not_empty')
        cur.execute(
            f"DELETE FROM {schema}.patch_custom_roots WHERE server = %s AND name = %s",
            (server, name)
        )
        cur.close(); conn.close()
        return _ok({'ok': True})

    s3 = _s3_client()
    bucket = _bucket()

    if action == 'file_init':
        # Инициализация загрузки одного файла — каждый файл дерева патча грузится отдельными
        # кусочками (одиночный HTTP-запрос к функции физически ограничен ~3 МБ), кусочки временно
        # складываются в S3 и склеиваются в file_complete.
        server = _safe_server(body.get('server'))
        cur.execute(
            f"SELECT name FROM {schema}.patch_custom_roots WHERE server = %s",
            (server,)
        )
        extra_roots = [r[0] for r in cur.fetchall()] if server else []
        rel_path = _safe_rel_path(body.get('path') or '', extra_roots)
        task_id = body.get('taskId')
        if not server or not rel_path:
            cur.close(); conn.close()
            return _bad('bad_request')
        try:
            task_id_int = int(task_id) if task_id else None
        except (TypeError, ValueError):
            task_id_int = None
        file_id = uuid.uuid4().hex
        meta = {'server': server, 'path': rel_path, 'taskId': task_id_int}
        s3.put_object(Bucket=bucket, Key=f"patches/_chunks/{file_id}/meta.json", Body=json.dumps(meta).encode())
        cur.close(); conn.close()
        return _ok({'fileId': file_id})

    if action == 'file_chunk':
        file_id = body.get('fileId')
        part_number = body.get('partNumber')
        data_b64 = body.get('data')
        # data_b64 может быть пустой строкой для 0-байтных файлов (пустые placeholder-файлы в
        # клиентском патче — нормальное явление) — проверяем именно на None, а не на пустоту.
        if not file_id or not re.match(r'^[a-f0-9]{32}$', file_id) or part_number is None or data_b64 is None:
            cur.close(); conn.close()
            return _bad('bad_request')
        try:
            raw = _decode_b64(data_b64)
        except Exception:
            cur.close(); conn.close()
            return _bad('bad_data')
        chunk_key = f"patches/_chunks/{file_id}/{int(part_number):06d}"
        s3.put_object(Bucket=bucket, Key=chunk_key, Body=raw)
        cur.close(); conn.close()
        return _ok({'ok': True})

    if action == 'file_complete':
        file_id = body.get('fileId')
        total_parts = body.get('totalParts')
        if not file_id or not re.match(r'^[a-f0-9]{32}$', file_id) or not total_parts:
            cur.close(); conn.close()
            return _bad('bad_request')
        prefix = f"patches/_chunks/{file_id}/"
        try:
            meta_obj = s3.get_object(Bucket=bucket, Key=f"{prefix}meta.json")
            meta = json.loads(meta_obj['Body'].read())
        except Exception:
            cur.close(); conn.close()
            return _bad('not_found', 404)
        server = meta['server']
        rel_path = meta['path']
        task_id_int = meta.get('taskId')

        buf = io.BytesIO()
        chunk_keys = []
        for i in range(int(total_parts)):
            chunk_key = f"{prefix}{i:06d}"
            try:
                obj = s3.get_object(Bucket=bucket, Key=chunk_key)
            except Exception:
                cur.close(); conn.close()
                return _bad('missing_chunk')
            buf.write(obj['Body'].read())
            chunk_keys.append(chunk_key)
            if buf.tell() > MAX_FILE_SIZE:
                cur.close(); conn.close()
                return _bad('file_too_large')
        raw = buf.getvalue()

        file_key = f"patches/{server}/{rel_path}"
        s3.put_object(
            Bucket=bucket, Key=file_key, Body=raw,
            ContentDisposition=_content_disposition(rel_path.rsplit('/', 1)[-1]),
        )
        for key in chunk_keys:
            try:
                s3.delete_object(Bucket=bucket, Key=key)
            except Exception:
                pass
        try:
            s3.delete_object(Bucket=bucket, Key=f"{prefix}meta.json")
        except Exception:
            pass

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
        cur.close(); conn.close()
        return _ok({'ok': True, 'path': rel_path, 'size': len(raw)})

    if action == 'file_abort':
        file_id = body.get('fileId')
        total_parts = body.get('totalParts') or 0
        if file_id and re.match(r'^[a-f0-9]{32}$', file_id):
            prefix = f"patches/_chunks/{file_id}/"
            for i in range(int(total_parts) + 1):
                try:
                    s3.delete_object(Bucket=bucket, Key=f"{prefix}{i:06d}")
                except Exception:
                    pass
            try:
                s3.delete_object(Bucket=bucket, Key=f"{prefix}meta.json")
            except Exception:
                pass
        cur.close(); conn.close()
        return _ok({'ok': True})

    if action == 'toggle_task':
        # Прикрепляет или открепляет уже загруженный файл к выбранной задаче (один файл может
        # относиться сразу к нескольким задачам).
        server = _safe_server(body.get('server'))
        path = body.get('path')
        task_id = body.get('taskId')
        try:
            task_id_int = int(task_id)
        except (TypeError, ValueError):
            task_id_int = None
        if not server or not path or task_id_int is None:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"SELECT task_ids FROM {schema}.patch_files WHERE server = %s AND path = %s",
            (server, path)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return _bad('not_found', 404)
        task_ids = list(row[0]) if row[0] else []
        if task_id_int in task_ids:
            task_ids.remove(task_id_int)
        else:
            task_ids.append(task_id_int)
        cur.execute(
            f"UPDATE {schema}.patch_files SET task_ids = %s, updated_at = now() WHERE server = %s AND path = %s",
            (json.dumps(task_ids), server, path)
        )
        cur.close(); conn.close()
        return _ok({'ok': True, 'taskIds': [str(t) for t in task_ids]})

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