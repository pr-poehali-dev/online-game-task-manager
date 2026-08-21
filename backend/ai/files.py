'''Загрузка файлов-вложений раздела "AI" в S3: маленькие одним запросом, большие кусочками
(file_init/file_chunk/file_complete/file_abort). Логика перенесена из index.py без изменений.'''

import io
import json
import os
import re
import uuid

from common import (
    _bad, _ok, _decode_data, _upload_bytes, _s3_client, _extract_attachment_text,
    MAX_UPLOAD_SIZE,
)


def handle_upload_attachment(cur, conn, schema, me, body, qs):
    data_b64 = body.get('data')
    if not data_b64:
        cur.close(); conn.close()
        return _bad('no_data')
    try:
        raw = _decode_data(data_b64)
    except Exception:
        cur.close(); conn.close()
        return _bad('bad_data')
    if len(raw) > MAX_UPLOAD_SIZE:
        cur.close(); conn.close()
        return _bad('file_too_large', 413)
    name = (body.get('name') or 'file').strip() or 'file'
    ext = (body.get('ext') or (name.rsplit('.', 1)[-1] if '.' in name else '')).lstrip('.').lower() or 'bin'
    content_type = body.get('contentType') or 'application/octet-stream'
    url = _upload_bytes(raw, ext, content_type, 'uploads')
    attachment_text = _extract_attachment_text(raw, name, content_type)
    cur.close(); conn.close()
    attachment = {'id': uuid.uuid4().hex, 'name': name, 'url': url, 'size': len(raw), 'contentType': content_type}
    if attachment_text is not None:
        attachment['text'] = attachment_text
    return _ok({'attachment': attachment})

# --- Загрузка больших файлов по частям (до MAX_UPLOAD_SIZE = 200 МБ) — тот же паттерн, что
# file_init/file_chunk/file_complete/file_abort в backend/patches/index.py. upload_attachment
# выше остаётся для маленьких файлов (картинки/короткие документы) одним запросом — фронт сам
# выбирает путь по размеру файла (см. src/pages/index/aiUploadApi.ts).


def handle_file_init(cur, conn, schema, me, body, qs):
    name = (body.get('name') or 'file').strip() or 'file'
    content_type = body.get('contentType') or 'application/octet-stream'
    file_id = uuid.uuid4().hex
    meta = {'name': name, 'contentType': content_type}
    _s3_client().put_object(Bucket=os.environ.get('S3_BUCKET', 'files'), Key=f"ai/_chunks/{file_id}/meta.json", Body=json.dumps(meta).encode())
    cur.close(); conn.close()
    return _ok({'fileId': file_id})


def handle_file_chunk(cur, conn, schema, me, body, qs):
    file_id = body.get('fileId')
    part_number = body.get('partNumber')
    data_b64 = body.get('data')
    if not file_id or not re.match(r'^[a-f0-9]{32}$', file_id) or part_number is None or data_b64 is None:
        cur.close(); conn.close()
        return _bad('bad_request')
    try:
        raw = _decode_data(data_b64)
    except Exception:
        cur.close(); conn.close()
        return _bad('bad_data')
    chunk_key = f"ai/_chunks/{file_id}/{int(part_number):06d}"
    _s3_client().put_object(Bucket=os.environ.get('S3_BUCKET', 'files'), Key=chunk_key, Body=raw)
    cur.close(); conn.close()
    return _ok({'ok': True})


def handle_file_complete(cur, conn, schema, me, body, qs):
    file_id = body.get('fileId')
    total_parts = body.get('totalParts')
    if not file_id or not re.match(r'^[a-f0-9]{32}$', file_id) or not total_parts:
        cur.close(); conn.close()
        return _bad('bad_request')
    s3 = _s3_client()
    bucket = os.environ.get('S3_BUCKET', 'files')
    prefix = f"ai/_chunks/{file_id}/"
    try:
        meta_obj = s3.get_object(Bucket=bucket, Key=f"{prefix}meta.json")
        meta = json.loads(meta_obj['Body'].read())
    except Exception:
        cur.close(); conn.close()
        return _bad('not_found', 404)

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
        if buf.tell() > MAX_UPLOAD_SIZE:
            cur.close(); conn.close()
            return _bad('file_too_large', 413)
    raw = buf.getvalue()

    name = meta['name']
    content_type = meta['contentType']
    ext = (name.rsplit('.', 1)[-1] if '.' in name else '').lower() or 'bin'
    url = _upload_bytes(raw, ext, content_type, 'uploads')
    attachment_text = _extract_attachment_text(raw, name, content_type)

    for key in chunk_keys:
        try:
            s3.delete_object(Bucket=bucket, Key=key)
        except Exception:
            pass
    try:
        s3.delete_object(Bucket=bucket, Key=f"{prefix}meta.json")
    except Exception:
        pass

    cur.close(); conn.close()
    attachment = {'id': uuid.uuid4().hex, 'name': name, 'url': url, 'size': len(raw), 'contentType': content_type}
    if attachment_text is not None:
        attachment['text'] = attachment_text
    return _ok({'attachment': attachment})


def handle_file_abort(cur, conn, schema, me, body, qs):
    file_id = body.get('fileId')
    total_parts = body.get('totalParts') or 0
    if file_id and re.match(r'^[a-f0-9]{32}$', file_id):
        s3 = _s3_client()
        bucket = os.environ.get('S3_BUCKET', 'files')
        prefix = f"ai/_chunks/{file_id}/"
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
