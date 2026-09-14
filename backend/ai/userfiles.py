'''Раздел "AI" → "Мои файлы": персональный список файлов сотрудника с возможностью самостоятельно
их очищать. Источник данных — реестр ai_files (см. db_migrations V0082), физическое хранилище —
S3. Лимит на ОБЩИЙ ОБЪЁМ файлов задаёт администратор в разделе "Команда"
(users.ai_size_limit_mb) — в него входят и загрузки, и всё сгенерированное моделью.'''

import os

from common import (
    _bad, _ok, _s3_client, _size_limit_mb, _file_usage, MB,
)

# Человекочитаемые группы для дерева файлов на фронте. Ключ — kind из ai_files.
KIND_GROUPS = {
    'upload': 'Загруженные в чат',
    'template': 'Бланки документов',
    'image': 'Сгенерированные изображения',
    'video': 'Сгенерированные видео',
    'document': 'Собранные документы',
}


def handle_list_files(cur, conn, schema, me, body, qs):
    '''Все файлы сотрудника с разбивкой по типу плюс текущий расход лимита. Чужие файлы не видны
    никогда — выборка всегда ограничена user_id из сессии.'''
    cur.execute(
        f"SELECT id, name, url, size, content_type, kind, chat_id, created_at, rel_path "
        f"FROM {schema}.ai_files WHERE user_id = %s ORDER BY created_at DESC",
        (me['id'],)
    )
    files = []
    total_size = 0
    for fid, name, url, size, content_type, kind, chat_id, created_at, rel_path in cur.fetchall():
        total_size += int(size or 0)
        files.append({
            'id': fid, 'name': name, 'url': url, 'size': int(size or 0),
            'contentType': content_type, 'kind': kind,
            'group': KIND_GROUPS.get(kind, 'Прочее'),
            'chatId': chat_id,
            # relPath — путь внутри загруженной папки, чтобы дерево показывало структуру, а не
            # плоский список одинаковых имён (index.ts из разных папок).
            'relPath': rel_path or '',
            'createdAt': created_at.isoformat() if created_at else None,
        })
    size_limit_mb = _size_limit_mb(cur, schema, me['id'])
    used, used_bytes = _file_usage(cur, schema, me['id'])
    cur.close(); conn.close()
    return _ok({
        'files': files, 'totalSize': total_size,
        'usedFiles': used,
        # В лимит объёма входят ВСЕ файлы сотрудника, поэтому usedMb совпадает с totalSize.
        'usedMb': round(used_bytes / MB, 1), 'limitMb': size_limit_mb,
    })


def _drop_keys(cur, schema, user_id, ids):
    '''Убирает файлы из S3 и из реестра. Сбой удаления отдельного объекта в хранилище не прерывает
    процесс: лучше оставить "осиротевший" объект, чем не дать сотруднику освободить лимит.'''
    if not ids:
        return 0
    cur.execute(
        f"SELECT id, file_key FROM {schema}.ai_files WHERE user_id = %s AND id IN %s",
        (user_id, tuple(ids))
    )
    rows = cur.fetchall()
    if not rows:
        return 0
    bucket = os.environ.get('S3_BUCKET', 'files')
    s3 = _s3_client()
    for _fid, key in rows:
        try:
            s3.delete_object(Bucket=bucket, Key=key)
        except Exception:
            pass
    found_ids = tuple(r[0] for r in rows)
    cur.execute(
        f"DELETE FROM {schema}.ai_files WHERE user_id = %s AND id IN %s",
        (user_id, found_ids)
    )
    return len(found_ids)


def handle_delete_file(cur, conn, schema, me, body, qs):
    '''Очистка ОДНОГО файла сотрудником. Сообщения в переписке остаются как есть — исчезает только
    сам файл (ссылка в старом сообщении перестанет открываться, это ожидаемо).'''
    file_id = body.get('fileId')
    if not file_id:
        cur.close(); conn.close()
        return _bad('bad_request')
    removed = _drop_keys(cur, schema, me['id'], [file_id])
    if not removed:
        cur.close(); conn.close()
        return _bad('not_found', 404)
    size_limit_mb = _size_limit_mb(cur, schema, me['id'])
    used, used_bytes = _file_usage(cur, schema, me['id'])
    cur.close(); conn.close()
    return _ok({'ok': True, 'usedFiles': used,
                'usedMb': round(used_bytes / MB, 1), 'limitMb': size_limit_mb})


def handle_clear_files(cur, conn, schema, me, body, qs):
    '''Очистка ВСЕХ файлов сотрудника либо одной группы (kind) — быстрый способ освободить лимит,
    не удаляя файлы по одному.'''
    kind = (body.get('kind') or '').strip()
    if kind and kind not in KIND_GROUPS:
        cur.close(); conn.close()
        return _bad('bad_request')
    if kind:
        cur.execute(f"SELECT id FROM {schema}.ai_files WHERE user_id = %s AND kind = %s", (me['id'], kind))
    else:
        cur.execute(f"SELECT id FROM {schema}.ai_files WHERE user_id = %s", (me['id'],))
    ids = [r[0] for r in cur.fetchall()]
    removed = _drop_keys(cur, schema, me['id'], ids)
    size_limit_mb = _size_limit_mb(cur, schema, me['id'])
    used, used_bytes = _file_usage(cur, schema, me['id'])
    cur.close(); conn.close()
    return _ok({'ok': True, 'removed': removed, 'usedFiles': used,
                'usedMb': round(used_bytes / MB, 1), 'limitMb': size_limit_mb})