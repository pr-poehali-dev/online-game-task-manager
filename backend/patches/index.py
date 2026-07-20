import base64
import io
import json
import os
import re
import struct
import time
import urllib.parse
import uuid
import zlib
import zipfile

import boto3
import psycopg2


PART_MAX = 60 * 1024 * 1024  # защитный предел на один кусок при загрузке (реально шлём по ~20 МБ)
BATCH_TIME_BUDGET = 90  # секунд — оставляем запас под таймаут функции (рекомендовано 120с)
BATCH_SIZE_TARGET = 8 * 1024 * 1024  # набираем не меньше 8 МБ на порцию (минимум для части S3, кроме последней)


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


class S3RangeReader(io.RawIOBase):
    '''Читает объект S3 небольшими диапазонами по запросу — позволяет модулю zipfile работать
    с архивом в несколько гигабайт, не загружая его целиком в память функции.'''

    def __init__(self, s3, bucket, key, size):
        self.s3 = s3
        self.bucket = bucket
        self.key = key
        self.size = size
        self.pos = 0

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

    def readinto(self, b):
        length = len(b)
        if self.pos >= self.size or length == 0:
            return 0
        end = min(self.pos + length, self.size) - 1
        resp = self.s3.get_object(Bucket=self.bucket, Key=self.key, Range=f'bytes={self.pos}-{end}')
        data = resp['Body'].read()
        n = len(data)
        b[:n] = data
        self.pos += n
        return n


def _dos_datetime(ts=None):
    t = time.localtime(ts)
    dos_time = (t.tm_hour << 11) | (t.tm_min << 5) | (t.tm_sec // 2)
    dos_date = ((max(t.tm_year, 1980) - 1980) << 9) | (t.tm_mon << 5) | t.tm_mday
    return dos_time, dos_date


def _local_file_header(name_bytes, crc, size, dos_time, dos_date):
    return struct.pack(
        '<4sHHHHHIII HH'.replace(' ', ''),
        b'PK\x03\x04', 20, 0x0800, 0, dos_time, dos_date, crc, size, size, len(name_bytes), 0
    ) + name_bytes


def _central_dir_entry(name_bytes, crc, size, dos_time, dos_date, offset):
    return struct.pack(
        '<4sHHHHHHIIIHHHHHII',
        b'PK\x01\x02', 20, 20, 0x0800, 0, dos_time, dos_date, crc, size, size,
        len(name_bytes), 0, 0, 0, 0, 0, offset
    ) + name_bytes


def _eocd(entry_count, cd_size, cd_offset):
    return struct.pack('<4sHHHHIIH', b'PK\x05\x06', 0, 0, entry_count, entry_count, cd_size, cd_offset, 0)


def handler(event: dict, context) -> dict:
    '''Файловое дерево клиентского патча по серверам: список файлов, потоковая загрузка ZIP-архива
    частями (без ограничения на общий размер патча — поддерживает архивы в несколько гигабайт) с
    последующей пакетной распаковкой в дерево S3, скачивание отдельного файла (прямая ссылка), потоковая
    сборка и скачивание всего патча сервера одним архивом, удаление файла. Просмотр и скачивание доступны
    всем авторизованным участникам, загрузка/удаление — администраторам и участникам с правом полного
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
    if action in ('mpu_init', 'mpu_part', 'mpu_complete', 'mpu_abort', 'zip_ingest_batch', 'delete'):
        if not me['can_manage']:
            cur.close(); conn.close()
            return _forbidden()

    s3 = _s3_client()
    bucket = _bucket()

    if action == 'mpu_init':
        server = _safe_server(body.get('server'))
        if not server:
            cur.close(); conn.close()
            return _bad('no_server')
        staging_key = f"patches/_staging/{uuid.uuid4().hex}.zip"
        res = s3.create_multipart_upload(Bucket=bucket, Key=staging_key, ContentType='application/zip')
        cur.close(); conn.close()
        return _ok({'stagingKey': staging_key, 'uploadId': res['UploadId']})

    if action == 'mpu_part':
        staging_key = body.get('stagingKey')
        upload_id = body.get('uploadId')
        part_number = body.get('partNumber')
        data_b64 = body.get('data')
        if not staging_key or not staging_key.startswith('patches/_staging/') or not upload_id or not part_number or not data_b64:
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
        res = s3.upload_part(Bucket=bucket, Key=staging_key, UploadId=upload_id, PartNumber=int(part_number), Body=raw)
        cur.close(); conn.close()
        return _ok({'etag': res['ETag']})

    if action == 'mpu_complete':
        staging_key = body.get('stagingKey')
        upload_id = body.get('uploadId')
        parts = body.get('parts') or []
        if not staging_key or not upload_id or not parts:
            cur.close(); conn.close()
            return _bad('bad_request')
        try:
            s3.complete_multipart_upload(
                Bucket=bucket, Key=staging_key, UploadId=upload_id,
                MultipartUpload={'Parts': [{'ETag': p['etag'], 'PartNumber': int(p['partNumber'])} for p in parts]},
            )
        except Exception:
            cur.close(); conn.close()
            return _bad('complete_failed')
        cur.close(); conn.close()
        return _ok({'ok': True})

    if action == 'mpu_abort':
        staging_key = body.get('stagingKey')
        upload_id = body.get('uploadId')
        if staging_key and upload_id:
            try:
                s3.abort_multipart_upload(Bucket=bucket, Key=staging_key, UploadId=upload_id)
            except Exception:
                pass
        cur.close(); conn.close()
        return _ok({'ok': True})

    if action == 'zip_ingest_batch':
        server = _safe_server(body.get('server'))
        staging_key = body.get('stagingKey')
        task_id = body.get('taskId')
        offset = int(body.get('offset') or 0)
        if not server or not staging_key or not staging_key.startswith('patches/_staging/'):
            cur.close(); conn.close()
            return _bad('bad_request')
        try:
            head = s3.head_object(Bucket=bucket, Key=staging_key)
        except Exception:
            cur.close(); conn.close()
            return _bad('not_found', 404)
        size = head['ContentLength']
        reader = io.BufferedReader(S3RangeReader(s3, bucket, staging_key, size), buffer_size=2 * 1024 * 1024)
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
            try:
                s3.delete_object(Bucket=bucket, Key=staging_key)
            except Exception:
                pass
        cur.close(); conn.close()
        return _ok({'done': done, 'nextOffset': idx, 'totalFiles': total, 'processed': processed})

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

    if action == 'zip_all_init':
        server = _safe_server(qs.get('server') or body.get('server'))
        if not server:
            cur.close(); conn.close()
            return _bad('no_server')
        cur.execute(
            f"SELECT path, file_key, size FROM {schema}.patch_files WHERE server = %s ORDER BY path",
            (server,)
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        if not rows:
            return _bad('empty', 404)
        archive_key = f"patches/_archives/{server}-{uuid.uuid4().hex}.zip"
        res = s3.create_multipart_upload(
            Bucket=bucket, Key=archive_key, ContentType='application/zip',
            ContentDisposition=_content_disposition(f'{server}-patch.zip'),
        )
        return _ok({
            'archiveKey': archive_key,
            'uploadId': res['UploadId'],
            'totalFiles': len(rows),
            'totalSize': sum(r[2] or 0 for r in rows),
        })

    if action == 'zip_all_batch':
        server = _safe_server(body.get('server'))
        archive_key = body.get('archiveKey')
        upload_id = body.get('uploadId')
        from_index = int(body.get('fromIndex') or 0)
        cd_entries = body.get('cdEntries') or []
        bytes_written = int(body.get('bytesWritten') or 0)
        part_number = int(body.get('partNumber') or 1)
        pending_b64 = body.get('pendingChunkB64')
        if not server or not archive_key or not upload_id:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"SELECT path, file_key, size FROM {schema}.patch_files WHERE server = %s ORDER BY path",
            (server,)
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        total = len(rows)
        start_ts = time.monotonic()
        idx = from_index
        buf = io.BytesIO()
        if pending_b64:
            buf.write(base64.b64decode(pending_b64))
        new_cd_entries = list(cd_entries)
        while idx < total and (time.monotonic() - start_ts) < BATCH_TIME_BUDGET:
            path, file_key, _size = rows[idx]
            obj = s3.get_object(Bucket=bucket, Key=file_key)
            data = obj['Body'].read()
            crc = zlib.crc32(data) & 0xFFFFFFFF
            dos_time, dos_date = _dos_datetime()
            name_bytes = path.encode('utf-8')
            entry_offset = bytes_written + buf.tell()
            buf.write(_local_file_header(name_bytes, crc, len(data), dos_time, dos_date))
            buf.write(data)
            new_cd_entries.append({
                'name': path, 'crc': crc, 'size': len(data),
                'dosTime': dos_time, 'dosDate': dos_date, 'offset': entry_offset,
            })
            idx += 1
            if buf.tell() >= BATCH_SIZE_TARGET:
                break
        done_files = idx >= total
        chunk = buf.getvalue()
        result_part = None
        pending_out = chunk
        # Часть (кроме самой последней в архиве) обязана быть не меньше 5 МБ (требование хранилища).
        # Пока файлы не закончились — отправляем накопленный кусок сразу; последний «хвост» (даже
        # маленький) передаём на шаг zip_all_finalize, который допишет к нему центральный каталог
        # и отправит одной финальной частью.
        if chunk and not done_files and len(chunk) >= 5 * 1024 * 1024:
            res = s3.upload_part(Bucket=bucket, Key=archive_key, UploadId=upload_id, PartNumber=part_number, Body=chunk)
            result_part = {'partNumber': part_number, 'etag': res['ETag']}
            bytes_written += len(chunk)
            part_number += 1
            pending_out = b''
        return _ok({
            'done': done_files,
            'nextIndex': idx,
            'totalFiles': total,
            'cdEntries': new_cd_entries,
            'bytesWritten': bytes_written,
            'partNumber': part_number,
            'part': result_part,
            'pendingChunkB64': base64.b64encode(pending_out).decode() if pending_out else None,
        })

    if action == 'zip_all_finalize':
        archive_key = body.get('archiveKey')
        upload_id = body.get('uploadId')
        cd_entries = body.get('cdEntries') or []
        bytes_written = int(body.get('bytesWritten') or 0)
        part_number = int(body.get('partNumber') or 1)
        parts = body.get('parts') or []
        pending_b64 = body.get('pendingChunkB64')
        if not archive_key or not upload_id:
            cur.close(); conn.close()
            return _bad('bad_request')
        cd_buf = io.BytesIO()
        if pending_b64:
            pending = base64.b64decode(pending_b64)
        else:
            pending = b''
        cd_offset = bytes_written + len(pending)
        for e in cd_entries:
            name_bytes = e['name'].encode('utf-8')
            cd_buf.write(_central_dir_entry(name_bytes, e['crc'], e['size'], e['dosTime'], e['dosDate'], e['offset']))
        cd_bytes = cd_buf.getvalue()
        final_chunk = pending + cd_bytes + _eocd(len(cd_entries), len(cd_bytes), cd_offset)
        res = s3.upload_part(Bucket=bucket, Key=archive_key, UploadId=upload_id, PartNumber=part_number, Body=final_chunk)
        all_parts = list(parts) + [{'partNumber': part_number, 'etag': res['ETag']}]
        try:
            s3.complete_multipart_upload(
                Bucket=bucket, Key=archive_key, UploadId=upload_id,
                MultipartUpload={'Parts': [{'ETag': p['etag'], 'PartNumber': int(p['partNumber'])} for p in all_parts]},
            )
        except Exception:
            cur.close(); conn.close()
            return _bad('complete_failed')
        cur.close(); conn.close()
        return _ok({'url': _public_url(archive_key)})

    if action == 'zip_all_abort':
        archive_key = body.get('archiveKey')
        upload_id = body.get('uploadId')
        if archive_key and upload_id:
            try:
                s3.abort_multipart_upload(Bucket=bucket, Key=archive_key, UploadId=upload_id)
            except Exception:
                pass
        cur.close(); conn.close()
        return _ok({'ok': True})

    cur.close(); conn.close()
    return _bad('unknown_action')