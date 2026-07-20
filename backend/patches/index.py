import base64
import io
import json
import os
import re
import time
import urllib.parse
import uuid
import zipfile

import boto3
import psycopg2


PART_MAX = 30 * 1024 * 1024  # защитный предел на один кусок при загрузке (реально шлём по ~20 МБ)
BATCH_TIME_BUDGET = 90  # секунд — оставляем запас под таймаут функции (рекомендовано 120с)


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


class MultiPartReader(io.RawIOBase):
    '''Читает набор частей загруженного архива (сохранённых как отдельные объекты в хранилище)
    как единый последовательный поток — позволяет модулю zipfile распаковывать архивы в
    несколько гигабайт, не загружая их целиком в память функции (доступно только 256 МБ).
    Хранилище не поддерживает частичное чтение объекта (Range игнорируется и всегда возвращает
    объект целиком), поэтому текущая часть докачивается полностью и кэшируется — сами части
    небольшие (около 20 МБ), поэтому это не создаёт нагрузки на память.'''

    def __init__(self, s3, bucket, part_keys, part_sizes):
        self.s3 = s3
        self.bucket = bucket
        self.part_keys = part_keys
        self.part_sizes = part_sizes
        self.offsets = []
        total = 0
        for sz in part_sizes:
            self.offsets.append(total)
            total += sz
        self.size = total
        self.pos = 0
        self._cache_idx = None
        self._cache_data = None

    def readable(self):
        return True

    def seekable(self):
        return True

    def seek(self, offset, whence=io.SEEK_SET):
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        elif whence == io.SEEK_END:
            self.pos = self.size + offset
        return self.pos

    def tell(self):
        return self.pos

    def _locate(self, pos):
        # Находит индекс части и смещение внутри неё для абсолютной позиции pos
        for i in range(len(self.offsets) - 1, -1, -1):
            if pos >= self.offsets[i]:
                return i, pos - self.offsets[i]
        return 0, 0

    def readinto(self, b):
        length = len(b)
        if self.pos >= self.size or length == 0:
            return 0
        part_idx, part_off = self._locate(self.pos)
        if self._cache_idx != part_idx:
            resp = self.s3.get_object(Bucket=self.bucket, Key=self.part_keys[part_idx])
            self._cache_data = resp['Body'].read()
            self._cache_idx = part_idx
        chunk = self._cache_data[part_off:part_off + length]
        n = len(chunk)
        b[:n] = chunk
        self.pos += n
        return n


def handler(event: dict, context) -> dict:
    '''Файловое дерево клиентского патча по серверам: список файлов, потоковая загрузка ZIP-архива
    небольшими частями (без ограничения на общий размер патча — поддерживает архивы в несколько
    гигабайт, части хранятся как отдельные объекты и склеиваются при чтении) с последующей пакетной
    распаковкой в дерево S3, скачивание отдельного файла (прямая ссылка), удаление файла. Сборка
    полного архива сервера выполняется на стороне браузера. Просмотр и скачивание доступны всем
    авторизованным участникам, загрузка/удаление — администраторам и участникам с правом полного
    редактирования задач.'''
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
            f"SELECT id, path, size, file_key, updated_at, task_id FROM {schema}.patch_files "
            f"WHERE server = %s ORDER BY path",
            (server,)
        )
        files = [_row_to_file(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return _ok({'files': files})

    # Загрузка и удаление — только для тех, кто может полностью редактировать задачи
    if action in ('upload_part', 'zip_ingest_batch', 'upload_abort', 'delete'):
        if not me['can_manage']:
            cur.close(); conn.close()
            return _forbidden()

    s3 = _s3_client()
    bucket = _bucket()

    if action == 'upload_part':
        upload_key = body.get('uploadKey') or uuid.uuid4().hex
        if not re.match(r'^[a-f0-9]{32}$', upload_key):
            cur.close(); conn.close()
            return _bad('bad_request')
        part_number = body.get('partNumber')
        data_b64 = body.get('data')
        if not part_number or not data_b64:
            cur.close(); conn.close()
            return _bad('bad_request')
        try:
            if ',' in data_b64 and data_b64.strip().startswith('data:'):
                data_b64 = data_b64.split(',', 1)[1]
            raw = base64.b64decode(data_b64)
        except Exception:
            cur.close(); conn.close()
            return _bad('bad_data')
        if len(raw) > PART_MAX:
            cur.close(); conn.close()
            return _bad('part_too_large')
        part_key = f"patches/_staging/{upload_key}/{int(part_number):06d}.part"
        s3.put_object(Bucket=bucket, Key=part_key, Body=raw)
        cur.close(); conn.close()
        return _ok({'uploadKey': upload_key, 'partNumber': int(part_number), 'size': len(raw)})

    if action == 'zip_ingest_batch':
        server = _safe_server(body.get('server'))
        upload_key = body.get('uploadKey')
        task_id = body.get('taskId')
        total_parts = body.get('totalParts')
        offset = int(body.get('offset') or 0)
        if not server or not upload_key or not re.match(r'^[a-f0-9]{32}$', upload_key) or not total_parts:
            cur.close(); conn.close()
            return _bad('bad_request')
        part_keys = []
        part_sizes = []
        for i in range(1, int(total_parts) + 1):
            key = f"patches/_staging/{upload_key}/{i:06d}.part"
            try:
                head = s3.head_object(Bucket=bucket, Key=key)
            except Exception:
                cur.close(); conn.close()
                return _bad('missing_part')
            part_keys.append(key)
            part_sizes.append(head['ContentLength'])
        reader = io.BufferedReader(MultiPartReader(s3, bucket, part_keys, part_sizes), buffer_size=2 * 1024 * 1024)
        try:
            zf = zipfile.ZipFile(reader)
        except zipfile.BadZipFile:
            cur.close(); conn.close()
            return _bad('bad_zip')
        entries = [info for info in zf.infolist() if not info.is_dir() and _safe_rel_path(info.filename)]
        total = len(entries)
        start_ts = time.monotonic()
        idx = offset
        processed = 0
        while idx < total and (time.monotonic() - start_ts) < BATCH_TIME_BUDGET:
            info = entries[idx]
            rel_path = _safe_rel_path(info.filename)
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
            idx += 1
            processed += 1
        done = idx >= total
        if done:
            for key in part_keys:
                try:
                    s3.delete_object(Bucket=bucket, Key=key)
                except Exception:
                    pass
        cur.close(); conn.close()
        return _ok({'done': done, 'nextOffset': idx, 'totalFiles': total, 'processed': processed})

    if action == 'upload_abort':
        upload_key = body.get('uploadKey')
        total_parts = body.get('totalParts') or 0
        if upload_key and re.match(r'^[a-f0-9]{32}$', upload_key):
            for i in range(1, int(total_parts) + 1):
                try:
                    s3.delete_object(Bucket=bucket, Key=f"patches/_staging/{upload_key}/{i:06d}.part")
                except Exception:
                    pass
        cur.close(); conn.close()
        return _ok({'ok': True})

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

    cur.close(); conn.close()
    return _bad('unknown_action')