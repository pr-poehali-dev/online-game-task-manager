import base64
import io
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

import boto3
from botocore.config import Config
import psycopg2

import ddf_parser
import ddf_raw
import ddf_registry
import ddf_registry_c4
import l2encdec

from ddf_parser import AscfStr


MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 МБ на один файл (собирается в памяти функции из кусочков)

# Клиент C4 (Chronicle 4) использует ту же схему шифрования (l2encdec, протокол 411-414), но
# заметно более простую и местами иначе устроенную бинарную структуру .dat файлов, чем клиенты
# High Five / H5 (например itemname-e.dat в C4 не содержит полей про сеты брони и зачарование).
# Поэтому для C4 используется отдельный реестр схем (ddf_registry_c4.py), для остальных серверов —
# основной (ddf_registry.py). Если появятся другие клиенты со своей структурой — добавить сюда.
DDF_C4_SERVERS = {'c4x1'}


def _ddf_registry_for(server):
    return ddf_registry_c4 if server in DDF_C4_SERVERS else ddf_registry


def _ddf_match(server, path):
    '''Возвращает (schema_key, fields, editable, has_reccnt_prefix, fixed_record_count,
    is_raw_only) для файла на данном сервере, выбирая нужный реестр схем (C4 или HF), либо
    None, если формат не поддерживается. Унифицирует разницу в сигнатуре match_ddf() между
    реестрами: основной ddf_registry.py возвращает 3-кортеж (все его файлы имеют стандартный
    4-байтный префикс счётчика записей и обычную форму редактирования), ddf_registry_c4.py —
    6-кортеж (некоторые файлы C4 имеют фиксированное число записей без префикса, и/или не
    имеют осмысленных текстовых полей — is_raw_only=True, требуют RAW-режима на фронтенде).'''
    registry = _ddf_registry_for(server)
    match = registry.match_ddf(path)
    if not match:
        return None
    if len(match) == 6:
        return match
    if len(match) == 5:
        key, fields, editable, has_reccnt_prefix, fixed_record_count = match
        return key, fields, editable, has_reccnt_prefix, fixed_record_count, False
    key, fields, editable = match
    return key, fields, editable, True, None, False


def _ddf_is_supported(server, path):
    return _ddf_registry_for(server).is_supported(path)

# Новые версии botocore (>=1.36) по умолчанию добавляют контрольную сумму запроса через
# chunked-кодирование (trailer). Кастомный (не-AWS) S3-эндпоинт не всегда его корректно
# разбирает — трейлер попадает прямо в тело файла (особенно заметно на 0-байтных файлах).
# Отключаем эту проверку, чтобы файлы сохранялись байт-в-байт как есть.
# Сами параметры request_checksum_calculation/response_checksum_validation появились в
# botocore только в версии 1.36 — на более старой версии (например при `boto3>=1.34.0` без
# принудительного апгрейда) Config(...) с этими аргументами упадёт с TypeError и вообще
# сломает загрузку файлов, поэтому оборачиваем в try/except с безопасным запасным вариантом.
try:
    _S3_CONFIG = Config(request_checksum_calculation='when_required', response_checksum_validation='when_required')
except TypeError:
    _S3_CONFIG = Config()

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


def _tg_send(chat_id, text, button_url=None):
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {'chat_id': chat_id, 'text': text}
    if button_url:
        payload['reply_markup'] = {
            'inline_keyboard': [[{'text': '🔗 Открыть задачу', 'url': button_url}]]
        }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        print(f"[patches] tg send HTTP {e.code}: {e.read().decode('utf-8', 'ignore')}")
    except Exception as e:
        print(f"[patches] tg send error: {e}")


def _task_url(task_id=None):
    app_url = (os.environ.get('APP_URL') or '').rstrip('/')
    if not app_url:
        return None
    return f"{app_url}/task/{task_id}" if task_id else app_url


def _add_notif(cur, schema, user_id, ntype, title, body_text, entity_type, entity_id, actor_id):
    if not user_id or user_id == actor_id:
        return
    cur.execute(
        f"INSERT INTO {schema}.notifications (user_id, type, title, body, entity_type, entity_id, actor_id) "
        f"VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (user_id, ntype, title, body_text, entity_type, str(entity_id) if entity_id else None, actor_id)
    )


def _needs_launcher_upload(column, deploy_status, launcher_uploaded, has_files):
    '''Та же логика, что и needsLauncherUpload на фронтенде (src/pages/index/shared.tsx) и в backend/tasks.'''
    if not has_files or launcher_uploaded:
        return False
    return column == 'restart' or deploy_status == 'ready_live'


def _notify_launcher_required(cur, schema, task_id, task_title, actor_id):
    '''Уведомляет всех пользователей с правом launcher_notify (кроме того, чьё действие вызвало появление
    бейджа) о том, что у задачи появился бейдж «Требуется залить в лаунчер» — запись в БД + Telegram.'''
    cur.execute(
        f"SELECT id, role, permissions, telegram_id, is_active, tg_notify_muted FROM {schema}.users WHERE is_active = true"
    )
    targets = []
    for uid, role, perms_raw, tg_id, is_active, tg_muted in cur.fetchall():
        if uid == actor_id:
            continue
        perms = perms_raw if isinstance(perms_raw, dict) else {}
        allowed = perms.get('launcher_notify')
        allowed = (role == 'admin') if allowed is None else bool(allowed)
        if allowed:
            targets.append((uid, tg_id, tg_muted))
    if not targets:
        return
    for uid, _, _ in targets:
        _add_notif(cur, schema, uid, 'launcher_required', 'Требуется залить в лаунчер', f'«{task_title}»', 'task', task_id, actor_id)
    button_url = _task_url(task_id)
    text = f"📦 Требуется залить в лаунчер:\n\n«{task_title}»"
    for uid, tg_id, tg_muted in targets:
        if tg_id and tg_id > 0 and not tg_muted:
            _tg_send(tg_id, text, button_url)


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


def _row_to_file(r, server):
    return {
        'id': r[0],
        'path': r[1],
        'size': r[2],
        'url': _public_url(r[3]),
        'updatedAt': r[4].isoformat() if r[4] else None,
        'taskIds': [str(t) for t in (r[5] or [])],
        'ddfSupported': _ddf_is_supported(server, r[1]),
    }


# ---------------------------------------------------------------------------
# DDF (текстовые .dat файлы) — поиск / просмотр / редактирование одной записи
# ---------------------------------------------------------------------------

def _ddf_quirk_bytes(server, schema_key):
    '''Некоторые файлы конкретного клиента имеют "приписку" вне стандартного формата .dat,
    добавленную пользователем вручную (см. ddf_registry_c4.ARMORGRP_TRAILING_QUIRK_BYTES) —
    N нулевых байт в САМЫЙ конец файла, после стандартного 20-байтного l2encdec-tail.
    Возвращает количество таких байт для данной схемы на данном сервере (0, если нет).'''
    if server in DDF_C4_SERVERS and schema_key == 'armorgrp':
        return ddf_registry_c4.ARMORGRP_TRAILING_QUIRK_BYTES
    return 0


def _ddf_load_plain(s3, bucket, schema, cur, server, path, quirk_bytes=0):
    '''Возвращает (file_key, protocol, plain_bytes) для текстового .dat файла или None,
    если файл не найден в БД. Может бросить l2encdec.L2CryptError, если протокол не
    распознан или файл повреждён. quirk_bytes — количество "защитных" байт, добавленных
    пользователем вручную в САМЫЙ конец файла (см. _ddf_quirk_bytes) — отрезаются перед
    detect_protocol/decode, чтобы не мешать стандартному разбору формата.'''
    cur.execute(
        f"SELECT file_key FROM {schema}.patch_files WHERE server = %s AND path = %s",
        (server, path)
    )
    row = cur.fetchone()
    if not row:
        return None
    file_key = row[0]
    obj = s3.get_object(Bucket=bucket, Key=file_key)
    raw = obj['Body'].read()
    if quirk_bytes:
        raw = raw[:-quirk_bytes]
    protocol = l2encdec.detect_protocol(raw)
    if protocol is None:
        raise l2encdec.L2CryptError('unknown_protocol')
    plain = l2encdec.decode(raw, protocol)
    return file_key, protocol, plain


def _ddf_field_defs(fields, editable_names):
    return [
        {'name': f['name'], 'type': f['type'], 'array': f['array'] is not None,
         'editable': f['name'] in editable_names}
        for f in fields
    ]


def _ddf_row_label(row, fields):
    '''Собирает человекочитаемую подпись записи из первых 1-2 скалярных числовых полей
    (обычно id [+ level/подуровень]) — для отображения в результатах поиска. Если у схемы вообще
    нет UINT/INT/HEX-полей (например hairgrp/helmetgrp — только CHAR, logongrp — только FLOAT —
    там записи идентифицируются исключительно порядковым номером, никакого id не существует),
    возвращающий пустую строку caller (search_records) подставит вместо неё индекс записи —
    см. вызов в action ddf_search.'''
    parts = []
    for f in fields:
        if f['array'] is not None:
            continue
        if f['type'] not in ('UINT', 'INT', 'HEX'):
            continue
        val = row.get(f['name'])
        if val is None:
            continue
        parts.append(f"{f['name']}={val}")
        if len(parts) >= 2:
            break
    return ', '.join(parts)


def _ddf_row_preview_text(row, editable_names, limit=140):
    for name in editable_names:
        val = row.get(name)
        if val:
            s = str(val).replace('\x00', '')
            if s:
                return s[:limit]
    return ''


def _ddf_serialize_row(row, fields):
    '''Готовит запись для JSON-ответа: AscfStr/UNICODE значения остаются строками (включая
    служебный завершающий '\\x00', если он есть — фронтенд должен ЕГО НЕ ПОКАЗЫВАТЬ явно, но
    мы всё равно передаём как есть для простоты; frontend обрежет trailing \\x00 сам при
    отображении). Списки (табличные поля) передаются как есть.'''
    out = {}
    for f in fields:
        name = f['name']
        val = row.get(name)
        if isinstance(val, list):
            out[name] = [str(v) if isinstance(v, str) else v for v in val]
        elif isinstance(val, str):
            out[name] = str(val)
        else:
            out[name] = val
    return out


def _ddf_row_matches_query(row, editable_names, query_lower):
    for name in editable_names:
        val = row.get(name)
        if val and query_lower in str(val).lower():
            return True
    return False


def handler(event: dict, context) -> dict:
    '''Файловое дерево клиентского патча по фиксированным корневым папкам (animations, data, l2text,
    maps, staticmeshes, System, System_eng, systextures, textures) в разрезе серверов. Каждый файл
    (в т.ч. из перетащенной целиком папки) грузится кусочками по ~1.5 МБ (file_init/file_chunk/
    file_complete/file_abort — одиночный HTTP-запрос физически ограничен ~3 МБ) и собирается на
    сервере в готовый файл до 200 МБ. Действие toggle_task прикрепляет/открепляет уже загруженный
    файл к выбранной задаче (один файл может относиться сразу к нескольким задачам); если прикрепление
    сразу делает задачу требующей заливки в лаунчер (колонка «К рестарту» или статус деплоя «Можно
    заливать на лайв»), уведомляются (в приложении и Telegram) пользователи с правом launcher_notify.
    Помимо фиксированных корней можно создавать (add_root) и удалять (delete_root, только если папка
    пустая) собственные корневые папки для конкретного сервера. Поддерживает скачивание отдельного
    файла, сборку архива файлов конкретной задачи (task_zip) или архива всего дерева сервера целиком
    (zip_all), удаление файла и полную очистку дерева сервера. Действие tasks_with_files возвращает
    список id задач (по всем серверам сразу), к которым прикреплён хотя бы один файл — используется
    для подсветки задач, ожидающих заливки в лаунчер.
    Для текстовых .dat файлов клиента (названия/описания предметов, скиллов, нпс и т.п. — список
    поддерживаемых схем в ddf_registry.py/ddf_registry_c4.py) доступны действия: ddf_search (поиск
    записи по подстроке в текстовых полях, возвращает короткий список совпадений), ddf_get (полная
    запись по индексу для редактирования), ddf_save (сохранение правок текстовых полей одной
    записи — файл на лету расшифровывается, запись обновляется, файл пересобирается и
    зашифровывается обратно в S3), ddf_new (пустой шаблон записи с значениями по умолчанию — для
    формы "создать новую запись") и ddf_create (добавляет одну или несколько новых записей в конец
    файла — для пакетного добавления из вставленного списка). Для схем без осмысленных отдельных
    текстовых полей (armorgrp/etcitemgrp/recipe — там основная ценность записи в MTX/MAT-таблицах
    путей к моделям/текстурам/звукам или списках материалов рецепта, см. ddf_raw.py) вместо
    ddf_get/ddf_save используются ddf_get_raw/ddf_save_raw — запись показывается и редактируется
    целиком одной таб-разделённой строкой, как в декомпилированном TSV-экспорте l2disasm.
    Просмотр и скачивание доступны всем авторизованным участникам, загрузка/удаление/привязка к
    задаче/управление папками/сохранение правок и добавление новых записей в DDF-файлах —
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
        files = [_row_to_file(r, server) for r in cur.fetchall()]
        cur.execute(
            f"SELECT name FROM {schema}.patch_custom_roots WHERE server = %s ORDER BY name",
            (server,)
        )
        custom_roots = [r[0] for r in cur.fetchall()]
        cur.close(); conn.close()
        return _ok({'files': files, 'roots': FIXED_ROOTS, 'customRoots': custom_roots})

    if action == 'tasks_with_files':
        # Список id задач (по всем серверам сразу), к которым прикреплён хотя бы один файл патча —
        # используется на доске/в разделе «К рестарту», чтобы подсветить задачи, ожидающие заливки в лаунчер.
        # jsonb_array_elements_text/jsonb_array_length не в белом списке БД — собираем множество id
        # и отфильтровываем пустые массивы на стороне Python.
        cur.execute(f"SELECT task_ids FROM {schema}.patch_files")
        task_ids = sorted({str(tid) for (row,) in cur.fetchall() for tid in (row or [])})
        cur.close(); conn.close()
        return _ok({'taskIds': task_ids})

    if action in ('file_init', 'file_chunk', 'file_complete', 'file_abort', 'delete', 'clear_server',
                  'toggle_task', 'add_root', 'delete_root', 'ddf_save', 'ddf_create', 'ddf_delete',
                  'ddf_save_raw'):
        if not me['can_manage']:
            cur.close(); conn.close()
            return _forbidden()

    if action == 'ddf_search':
        # Ищет записи в текстовом .dat файле по подстроке (регистронезависимо) среди его
        # редактируемых текстовых полей. Возвращает только КОРОТКИЙ список совпадений (индекс
        # записи + подпись + короткий превью текста) — сама запись целиком запрашивается
        # отдельно через ddf_get, весь массив записей на фронтенд не отдаётся (некоторые файлы,
        # например skillname-e, содержат более 76 тысяч записей).
        server = _safe_server(body.get('server'))
        path = body.get('path')
        query = (body.get('query') or '').strip()
        limit = min(int(body.get('limit') or 50), 200)
        if not server or not path:
            cur.close(); conn.close()
            return _bad('bad_request')
        match = _ddf_match(server, path)
        if not match:
            cur.close(); conn.close()
            return _bad('ddf_not_supported')
        key, fields, editable, has_reccnt_prefix, fixed_record_count, is_raw_only = match
        s3 = _s3_client()
        bucket = _bucket()
        try:
            loaded = _ddf_load_plain(s3, bucket, schema, cur, server, path, _ddf_quirk_bytes(server, key))
        except l2encdec.L2CryptError as e:
            cur.close(); conn.close()
            return _bad(f'decrypt_error_{e}')
        cur.close(); conn.close()
        if not loaded:
            return _bad('not_found', 404)
        _file_key, protocol, plain = loaded
        try:
            matches, total_rows = ddf_parser.search_records(
                plain, fields, editable, query.lower(), limit,
                has_reccnt_prefix=has_reccnt_prefix, fixed_record_count=fixed_record_count
            )
        except ddf_parser.DdfError as e:
            return _bad(f'ddf_parse_error_{e}')
        results = [
            {'index': idx, 'label': _ddf_row_label(row, fields) or f'#{idx}', 'preview': _ddf_row_preview_text(row, editable)}
            for idx, row in matches
        ]
        return _ok({
            'schema': key,
            'totalRows': total_rows,
            'matched': len(results),
            'results': results,
            'isRawOnly': is_raw_only,
        })

    if action == 'ddf_get':
        # Возвращает одну конкретную запись (по индексу) целиком — все поля схемы, с пометкой
        # какие из них editable (текстовые, доступные для правки на фронтенде).
        server = _safe_server(body.get('server'))
        path = body.get('path')
        index = body.get('index')
        if not server or not path or index is None:
            cur.close(); conn.close()
            return _bad('bad_request')
        match = _ddf_match(server, path)
        if not match:
            cur.close(); conn.close()
            return _bad('ddf_not_supported')
        key, fields, editable, has_reccnt_prefix, fixed_record_count, is_raw_only = match
        s3 = _s3_client()
        bucket = _bucket()
        try:
            loaded = _ddf_load_plain(s3, bucket, schema, cur, server, path, _ddf_quirk_bytes(server, key))
        except l2encdec.L2CryptError as e:
            cur.close(); conn.close()
            return _bad(f'decrypt_error_{e}')
        cur.close(); conn.close()
        if not loaded:
            return _bad('not_found', 404)
        _file_key, protocol, plain = loaded
        idx = int(index)
        try:
            total_rows = ddf_parser.get_record_count(plain, has_reccnt_prefix, fixed_record_count)
            row = ddf_parser.get_record_by_index(
                plain, fields, idx, has_reccnt_prefix=has_reccnt_prefix, fixed_record_count=fixed_record_count
            )
        except ddf_parser.DdfError as e:
            return _bad(f'ddf_parse_error_{e}', 404 if 'index_out_of_range' in str(e) else 400)
        return _ok({
            'schema': key,
            'index': idx,
            'totalRows': total_rows,
            'fields': _ddf_field_defs(fields, editable),
            'row': _ddf_serialize_row(row, fields),
            'isRawOnly': is_raw_only,
        })

    if action == 'ddf_get_raw':
        # Возвращает одну запись целиком в виде ОДНОЙ таб-разделённой строки (см. ddf_raw.py)
        # — как в декомпилированном TSV-экспорте l2disasm. Используется для схем без
        # осмысленных отдельных текстовых полей (armorgrp/etcitemgrp/recipe — там основная
        # ценность записи в MTX/MAT-таблицах путей к моделям/звукам или списках материалов
        # рецепта), где обычная форма "один инпут на editable-поле" неудобна. Дополнительно
        # возвращает 'columns' — тот же набор значений с человекочитаемыми подписями колонок
        # (совпадают по составу и порядку с l2disasm TSV-заголовком) для отображения на
        # фронтенде подписи над каждым значением.
        server = _safe_server(body.get('server'))
        path = body.get('path')
        index = body.get('index')
        if not server or not path or index is None:
            cur.close(); conn.close()
            return _bad('bad_request')
        match = _ddf_match(server, path)
        if not match:
            cur.close(); conn.close()
            return _bad('ddf_not_supported')
        key, fields, _editable, has_reccnt_prefix, fixed_record_count, _is_raw_only = match
        s3 = _s3_client()
        bucket = _bucket()
        try:
            loaded = _ddf_load_plain(s3, bucket, schema, cur, server, path, _ddf_quirk_bytes(server, key))
        except l2encdec.L2CryptError as e:
            cur.close(); conn.close()
            return _bad(f'decrypt_error_{e}')
        cur.close(); conn.close()
        if not loaded:
            return _bad('not_found', 404)
        _file_key, protocol, plain = loaded
        idx = int(index)
        try:
            total_rows = ddf_parser.get_record_count(plain, has_reccnt_prefix, fixed_record_count)
            row = ddf_parser.get_record_by_index(
                plain, fields, idx, has_reccnt_prefix=has_reccnt_prefix, fixed_record_count=fixed_record_count
            )
            line = ddf_raw.row_to_raw_line(row, fields)
            columns = ddf_raw.row_to_raw_columns(row, fields)
        except ddf_parser.DdfError as e:
            return _bad(f'ddf_parse_error_{e}', 404 if 'index_out_of_range' in str(e) else 400)
        return _ok({
            'schema': key,
            'index': idx,
            'totalRows': total_rows,
            'line': line,
            'columns': columns,
        })

    if action == 'ddf_save':
        # Сохраняет правки ОДНОЙ записи (по индексу) обратно в файл: расшифровывает файл,
        # разбирает на записи, заменяет текстовые поля указанной записи новыми значениями
        # (только editable-поля из схемы — остальное игнорируется), собирает обратно и
        # зашифровывает, перезаписывая тот же S3-объект (размер файла может немного
        # измениться из-за другой длины текста — это нормально и учитывается автоматически).
        server = _safe_server(body.get('server'))
        path = body.get('path')
        index = body.get('index')
        edits = body.get('edits')
        if not server or not path or index is None or not isinstance(edits, dict):
            cur.close(); conn.close()
            return _bad('bad_request')
        match = _ddf_match(server, path)
        if not match:
            cur.close(); conn.close()
            return _bad('ddf_not_supported')
        key, fields, editable, has_reccnt_prefix, fixed_record_count, is_raw_only = match
        quirk_bytes = _ddf_quirk_bytes(server, key)
        s3 = _s3_client()
        bucket = _bucket()
        try:
            loaded = _ddf_load_plain(s3, bucket, schema, cur, server, path, quirk_bytes)
        except l2encdec.L2CryptError as e:
            cur.close(); conn.close()
            return _bad(f'decrypt_error_{e}')
        if not loaded:
            cur.close(); conn.close()
            return _bad('not_found', 404)
        file_key, protocol, plain = loaded
        idx = int(index)

        def _apply_edits(row):
            for fname, new_value in edits.items():
                if fname not in editable:
                    continue  # игнорируем попытки править неразрешённые (не текстовые) поля
                old_value = row.get(fname)
                is_unicode = getattr(old_value, 'is_unicode', False)
                has_null = getattr(old_value, 'has_null_terminator', True)
                row[fname] = AscfStr(str(new_value), is_unicode, has_null)
            return row

        try:
            # Для файлов БЕЗ 4-байтного префикса-счётчика (eula/chargrp) реальный хвост файла
            # не совпадает со стандартным маркером "SafePackage" — нужно прочитать его точно.
            tail_bytes = None if has_reccnt_prefix else ddf_parser.get_tail_bytes(
                plain, fields, has_reccnt_prefix=has_reccnt_prefix, fixed_record_count=fixed_record_count
            )
            # Потоковая пересборка: читает записи одну за другой и сразу пишет в выходной
            # буфер, не накапливая список всех записей в памяти — критично для больших файлов
            # (skillname-e.dat, ~76 тысяч записей, иначе упирается в лимит памяти функции).
            new_plain = ddf_parser.transform_single_row(
                plain, fields, idx, _apply_edits,
                has_reccnt_prefix=has_reccnt_prefix, fixed_record_count=fixed_record_count, tail_bytes=tail_bytes
            )
            new_raw = l2encdec.encode(new_plain, protocol)
            if quirk_bytes:
                new_raw += bytes(quirk_bytes)
        except ddf_parser.DdfError as e:
            cur.close(); conn.close()
            status = 404 if 'index_out_of_range' in str(e) else 400
            return _bad(f'ddf_parse_error_{e}', status)
        except l2encdec.L2CryptError as e:
            cur.close(); conn.close()
            return _bad(f'encode_error_{e}')
        s3.put_object(Bucket=bucket, Key=file_key, Body=new_raw)
        cur.execute(
            f"UPDATE {schema}.patch_files SET size = %s, updated_at = now() WHERE server = %s AND path = %s",
            (len(new_raw), server, path)
        )
        cur.close(); conn.close()
        return _ok({'ok': True, 'index': idx, 'size': len(new_raw)})

    if action == 'ddf_save_raw':
        # Сохраняет ОДНУ запись, отредактированную ЦЕЛИКОМ как единая таб-разделённая строка
        # (см. ddf_raw.py) — обратная операция для ddf_get_raw. Строка разбирается обратно
        # в набор полей строго по схеме (тот же порядок, что при сериализации); если число
        # значений в строке не совпадает со схемой (пользователь случайно стёр/добавил
        # табуляцию) — возвращается ошибка ddf_parse_error, файл не трогается.
        server = _safe_server(body.get('server'))
        path = body.get('path')
        index = body.get('index')
        line = body.get('line')
        if not server or not path or index is None or not isinstance(line, str):
            cur.close(); conn.close()
            return _bad('bad_request')
        match = _ddf_match(server, path)
        if not match:
            cur.close(); conn.close()
            return _bad('ddf_not_supported')
        key, fields, _editable, has_reccnt_prefix, fixed_record_count, _is_raw_only = match
        quirk_bytes = _ddf_quirk_bytes(server, key)
        s3 = _s3_client()
        bucket = _bucket()
        try:
            loaded = _ddf_load_plain(s3, bucket, schema, cur, server, path, quirk_bytes)
        except l2encdec.L2CryptError as e:
            cur.close(); conn.close()
            return _bad(f'decrypt_error_{e}')
        if not loaded:
            cur.close(); conn.close()
            return _bad('not_found', 404)
        file_key, protocol, plain = loaded
        idx = int(index)

        def _apply_raw_line(row):
            return ddf_raw.raw_line_to_row(line, fields, base_row=row)

        try:
            tail_bytes = None if has_reccnt_prefix else ddf_parser.get_tail_bytes(
                plain, fields, has_reccnt_prefix=has_reccnt_prefix, fixed_record_count=fixed_record_count
            )
            new_plain = ddf_parser.transform_single_row(
                plain, fields, idx, _apply_raw_line,
                has_reccnt_prefix=has_reccnt_prefix, fixed_record_count=fixed_record_count, tail_bytes=tail_bytes
            )
            new_raw = l2encdec.encode(new_plain, protocol)
            if quirk_bytes:
                new_raw += bytes(quirk_bytes)
        except (ddf_parser.DdfError, ValueError) as e:
            cur.close(); conn.close()
            status = 404 if 'index_out_of_range' in str(e) else 400
            return _bad(f'ddf_parse_error_{e}', status)
        except l2encdec.L2CryptError as e:
            cur.close(); conn.close()
            return _bad(f'encode_error_{e}')
        s3.put_object(Bucket=bucket, Key=file_key, Body=new_raw)
        cur.execute(
            f"UPDATE {schema}.patch_files SET size = %s, updated_at = now() WHERE server = %s AND path = %s",
            (len(new_raw), server, path)
        )
        cur.close(); conn.close()
        return _ok({'ok': True, 'index': idx, 'size': len(new_raw)})

    if action == 'ddf_new':
        # Возвращает "пустой шаблон" записи (все поля — значения по умолчанию: 0 для чисел,
        # пустая строка для текста) для формы "создать новую запись с нуля". В отличие от
        # ddf_get не читает сам .dat файл — схема одна и та же для всех записей файла.
        server = _safe_server(body.get('server'))
        path = body.get('path')
        if not path:
            cur.close(); conn.close()
            return _bad('bad_request')
        match = _ddf_match(server, path)
        cur.close(); conn.close()
        if not match:
            return _bad('ddf_not_supported')
        key, fields, editable, _has_reccnt_prefix, _fixed_record_count, is_raw_only = match
        row = ddf_parser.default_row(fields)
        return _ok({
            'schema': key,
            'fields': _ddf_field_defs(fields, editable),
            'row': _ddf_serialize_row(row, fields),
            'isRawOnly': is_raw_only,
        })

    if action == 'ddf_create':
        # Добавляет одну ИЛИ несколько новых записей в конец файла (пакетное добавление —
        # для формы "вставить список текстом"). Каждый элемент body['rows'] — dict вида
        # {fieldName: value, ...} со значениями ВСЕХ нужных полей схемы (не только текстовых —
        # например id обязателен); отсутствующие поля берут значение по умолчанию (0/'').
        # Файл расшифровывается, существующие записи переносятся как есть (потоково, без
        # накопления в памяти), новые записи дописываются в конец, счётчик записей в
        # заголовке обновляется, файл зашифровывается обратно и перезаписывается в S3.
        server = _safe_server(body.get('server'))
        path = body.get('path')
        new_rows_input = body.get('rows')
        if not server or not path or not isinstance(new_rows_input, list) or not new_rows_input:
            cur.close(); conn.close()
            return _bad('bad_request')
        if len(new_rows_input) > 500:
            cur.close(); conn.close()
            return _bad('too_many_rows')
        match = _ddf_match(server, path)
        if not match:
            cur.close(); conn.close()
            return _bad('ddf_not_supported')
        key, fields, editable, has_reccnt_prefix, fixed_record_count, is_raw_only = match
        if not has_reccnt_prefix:
            # Файлы с фиксированным числом записей в самой схеме (например eula.dat — всегда
            # ровно 1 запись, chargrp.dat — ровно 15, по одной на класс) не поддерживают
            # добавление новых строк — это сломало бы предполагаемую клиентом структуру.
            cur.close(); conn.close()
            return _bad('fixed_schema_no_append')
        if is_raw_only:
            # Схемы с MTX/MAT-полями (armorgrp/etcitemgrp/recipe) не поддерживают создание
            # через обычную форму "одно поле — один инпут" — она не умеет собирать сложные
            # табличные значения. Для них создание/пакетное добавление недоступно вовсе —
            # только просмотр/редактирование существующих записей через ddf_get_raw/ddf_save_raw.
            cur.close(); conn.close()
            return _bad('raw_only_schema_no_create')
        quirk_bytes = _ddf_quirk_bytes(server, key)
        s3 = _s3_client()
        bucket = _bucket()
        try:
            loaded = _ddf_load_plain(s3, bucket, schema, cur, server, path, quirk_bytes)
        except l2encdec.L2CryptError as e:
            cur.close(); conn.close()
            return _bad(f'decrypt_error_{e}')
        if not loaded:
            cur.close(); conn.close()
            return _bad('not_found', 404)
        file_key, protocol, plain = loaded

        new_rows = []
        for raw_row in new_rows_input:
            if not isinstance(raw_row, dict):
                cur.close(); conn.close()
                return _bad('bad_request')
            row = ddf_parser.default_row(fields)
            texts = {k: v for k, v in raw_row.items() if k in editable}
            row = ddf_parser.build_row_from_texts(fields, editable, row, texts)
            for f in fields:
                fname = f['name']
                if fname in editable or f['array'] is not None:
                    continue
                if fname in raw_row and raw_row[fname] is not None:
                    try:
                        row[fname] = float(raw_row[fname]) if f['type'] == 'FLOAT' else int(raw_row[fname])
                    except (TypeError, ValueError):
                        cur.close(); conn.close()
                        return _bad(f'bad_value_for_field_{fname}')
            new_rows.append(row)

        try:
            new_plain = ddf_parser.append_records(plain, fields, new_rows)
            new_raw = l2encdec.encode(new_plain, protocol)
            if quirk_bytes:
                new_raw += bytes(quirk_bytes)
        except ddf_parser.DdfError as e:
            cur.close(); conn.close()
            return _bad(f'ddf_parse_error_{e}')
        except l2encdec.L2CryptError as e:
            cur.close(); conn.close()
            return _bad(f'encode_error_{e}')
        s3.put_object(Bucket=bucket, Key=file_key, Body=new_raw)
        cur.execute(
            f"UPDATE {schema}.patch_files SET size = %s, updated_at = now() WHERE server = %s AND path = %s",
            (len(new_raw), server, path)
        )
        cur.close(); conn.close()
        return _ok({'ok': True, 'added': len(new_rows), 'size': len(new_raw)})

    if action == 'ddf_delete':
        # Удаляет ОДНУ запись по индексу (например ошибочно добавленную) — расшифровывает
        # файл, потоково переносит все записи кроме указанной, зашифровывает обратно.
        server = _safe_server(body.get('server'))
        path = body.get('path')
        index = body.get('index')
        if not server or not path or index is None:
            cur.close(); conn.close()
            return _bad('bad_request')
        match = _ddf_match(server, path)
        if not match:
            cur.close(); conn.close()
            return _bad('ddf_not_supported')
        key, fields, editable, has_reccnt_prefix, fixed_record_count, is_raw_only = match
        if not has_reccnt_prefix:
            cur.close(); conn.close()
            return _bad('fixed_schema_no_delete')
        quirk_bytes = _ddf_quirk_bytes(server, key)
        s3 = _s3_client()
        bucket = _bucket()
        try:
            loaded = _ddf_load_plain(s3, bucket, schema, cur, server, path, quirk_bytes)
        except l2encdec.L2CryptError as e:
            cur.close(); conn.close()
            return _bad(f'decrypt_error_{e}')
        if not loaded:
            cur.close(); conn.close()
            return _bad('not_found', 404)
        file_key, protocol, plain = loaded
        idx = int(index)
        try:
            new_plain = ddf_parser.delete_record(plain, fields, idx)
            new_raw = l2encdec.encode(new_plain, protocol)
            if quirk_bytes:
                new_raw += bytes(quirk_bytes)
        except ddf_parser.DdfError as e:
            cur.close(); conn.close()
            status = 404 if 'index_out_of_range' in str(e) else 400
            return _bad(f'ddf_parse_error_{e}', status)
        except l2encdec.L2CryptError as e:
            cur.close(); conn.close()
            return _bad(f'encode_error_{e}')
        s3.put_object(Bucket=bucket, Key=file_key, Body=new_raw)
        cur.execute(
            f"UPDATE {schema}.patch_files SET size = %s, updated_at = now() WHERE server = %s AND path = %s",
            (len(new_raw), server, path)
        )
        cur.close(); conn.close()
        return _ok({'ok': True, 'size': len(new_raw)})

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
        attached = task_id_int not in task_ids
        if attached:
            task_ids.append(task_id_int)
        else:
            task_ids.remove(task_id_int)
        cur.execute(
            f"UPDATE {schema}.patch_files SET task_ids = %s, updated_at = now() WHERE server = %s AND path = %s",
            (json.dumps(task_ids), server, path)
        )
        # Если файл только что прикреплён и задача уже находится в состоянии, готовом к раскатке
        # (колонка «К рестарту» или статус деплоя «Можно заливать на лайв»), у неё появляется бейдж
        # «Требуется залить в лаунчер» — уведомляем пользователей с правом launcher_notify.
        if attached:
            cur.execute(
                f"SELECT column_id, deploy_status, launcher_uploaded, title FROM {schema}.tasks WHERE id = %s",
                (task_id_int,)
            )
            trow = cur.fetchone()
            if trow and _needs_launcher_upload(trow[0], trow[1], bool(trow[2]), True):
                _notify_launcher_required(cur, schema, task_id_int, trow[3], me['id'])
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

    if action == 'zip_all':
        # Архив всего дерева файлов сервера целиком (не привязано к конкретной задаче).
        server = _safe_server(qs.get('server') or body.get('server'))
        if not server:
            cur.close(); conn.close()
            return _bad('no_server')
        cur.execute(
            f"SELECT path, file_key FROM {schema}.patch_files WHERE server = %s ORDER BY path",
            (server,)
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
        archive_key = f"patches/_archives/{server}-{uuid.uuid4().hex}.zip"
        s3.put_object(
            Bucket=bucket, Key=archive_key, Body=buf.getvalue(), ContentType='application/zip',
            ContentDisposition=_content_disposition(f'{server}-patch.zip'),
        )
        return _ok({'url': _public_url(archive_key)})

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