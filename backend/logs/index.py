import csv
import io
import json
import os
import re

import paramiko
import psycopg2


# Три фиксированных вида логов (папки на SFTP-хосте) — см. RESEARCH_NOTES.md за полным контекстом
# формата. Каждый файл лога имеет ровно 27 CSV-полей (проверено на реальных образцах), разделитель
# запятая, кодировка cp1251 (НЕ utf-8) — критично: имена игроков/предметов на кириллице будут
# нечитаемым мусором без явной перекодировки.
LOG_TYPES = ('cached', 'server', 'npc')
LOG_ENCODING = 'cp1251'
PAGE_SIZE_DEFAULT = 50
PAGE_SIZE_MAX = 200
MAX_FILE_READ = 60 * 1024 * 1024  # 60 МБ — щедрый предел на один файл лога (реальные ~5 МБ/час)

# Имя файла лога: {ГГГГ-ММ-ДД}-{HHMM}-{NN}-{тип}-in{0|1}.log — см. RESEARCH_NOTES.md.
LOG_FILENAME_RE = re.compile(r'^(\d{4}-\d{2}-\d{2})-(\d+)-(\d+)-(cached|server|npc)-in(\d+)\.log$')


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


def _bad(err, status=400):
    return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps({'error': err})}


def _ok(payload):
    return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps(payload)}


def _current_user(cur, schema, token):
    '''Право logs_view — ОТДЕЛЬНОЕ от patch_edit (см. db_migrations V0075, backend/admin/index.py
    ALL_PERMISSIONS/PRIVILEGED_PERMISSIONS) — по умолчанию False даже для role == 'admin', пока не
    выдано явно владельцем проекта. Логика эффективного значения — тот же паттерн, что patch_edit
    в backend/patches/index.py _effective_perms, но здесь нужно только одно право, поэтому не
    выносим полноценный ALL_PERMISSIONS/_effective_perms как в других функциях.'''
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
    uid, role, perms_raw = row
    perms = perms_raw if isinstance(perms_raw, dict) else {}
    can_view = perms.get('logs_view')
    can_view = False if can_view is None else bool(can_view)
    return {'id': uid, 'role': role, 'can_view': can_view}


def _safe_server(server):
    if not server or not re.match(r'^[a-zA-Z0-9_-]+$', server):
        return None
    return server


def _service_key(cur, schema, key):
    cur.execute(f"SELECT value FROM {schema}.service_keys WHERE key = %s", (key,))
    row = cur.fetchone()
    return row[0] if row and row[0] else None


def _logs_dir_for_server(cur, schema, server):
    cur.execute(f"SELECT logs_dir FROM {schema}.servers WHERE id = %s", (server,))
    row = cur.fetchone()
    return row[0] if row and row[0] else None


def _logs_sftp_client(cur, schema):
    '''Единый SFTP-хост обслуживает логи ВСЕХ серверов проекта (креды — в service_keys,
    LOGS_SFTP_*), путь до конкретного сервера — в servers.logs_dir (см. db_migrations V0075).
    Тот же паттерн подключения, что _launcher_ssh_client в backend/patches/index.py. Возвращает
    None, если ключи ещё не заполнены — вызывающий код должен вернуть понятную ошибку.'''
    host = _service_key(cur, schema, 'LOGS_SFTP_HOST')
    user = _service_key(cur, schema, 'LOGS_SFTP_USER')
    password = _service_key(cur, schema, 'LOGS_SFTP_PASSWORD')
    if not host or not user or not password:
        return None
    port_raw = _service_key(cur, schema, 'LOGS_SFTP_PORT') or '22'
    try:
        port = int(port_raw)
    except ValueError:
        port = 22
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, port=port, username=user, password=password, timeout=15)
    return client


# --- Справочники id → имя (см. RESEARCH_NOTES.md) --------------------------------------------
# action_id есть ТОЛЬКО в этом статичном снимке (не игровой ресурс, в дереве патчей его нет).
# item/npc/skill — тот же статичный снимок как fallback для MVP (актуальные версии через DDF из
# дерева патчей — отдельная задача, backend-функции изолированы друг от друга, см.
# RESEARCH_NOTES.md "Важная находка этапа 3" — не делаем в этом этапе).
_REFERENCE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'reference')
_reference_cache = {}


def _load_reference(name, has_level=False):
    '''Читает backend/logs/reference/{name}.tsv (id\tName или id\tlevel\tName) один раз за
    "тёплый" процесс функции (кэш в памяти между вызовами одного и того же инстанса).'''
    if name in _reference_cache:
        return _reference_cache[name]
    path = os.path.join(_REFERENCE_DIR, f'{name}.tsv')
    result = {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.rstrip('\n')
                if not line:
                    continue
                parts = line.split('\t')
                if has_level and len(parts) >= 3:
                    result[parts[0]] = parts[2]
                elif not has_level and len(parts) >= 2:
                    result[parts[0]] = parts[1]
    except FileNotFoundError:
        pass
    _reference_cache[name] = result
    return result


def _resolve_name(ref, raw_id):
    if raw_id is None:
        return None
    raw_id = raw_id.strip()
    if not raw_id:
        return None
    return ref.get(raw_id)


# --- Разбор строки лога ------------------------------------------------------------------------
# Смысл конкретного номера поля зависит от action_id (см. RESEARCH_NOTES.md "Расшифровка позиций
# полей") — полная карта на ВСЕ ~150+ action_id ещё не построена, это осознанно отложено (план в
# заметках: показывать именованные колонки для известных action_id, для остальных — сырые поля).
# Индексы ниже — 0-based (в заметках они 1-based, т.к. считались по логам вручную).
FIELD_TIME = 0
FIELD_ACTION = 1
FIELD_ACTOR_NAME = 22
FIELD_ACTOR_LOGIN = 23
FIELD_TARGET_NAME = 24
FIELD_TARGET_LOGIN = 25

# action_id → (индекс поля item_id, индекс поля skill_id) — только для action_id, которые уже
# расшифрованы вручную сверкой со справочниками (см. RESEARCH_NOTES.md). Остальные action_id
# просто не найдут item/skill в этой карте — это ожидаемо, не баг.
ACTION_ITEM_FIELD = {
    '901': 19,  # BuyItem
    '902': 19,  # SellItem
}
ACTION_SKILL_FIELD = {
    '403': 16,   # CastSkill
    '1112': 16,  # PCKilledNPC
}


def _parse_log_line(fields, refs):
    '''fields — список из 27 строк (уже декодированных из cp1251). Возвращает структурированный
    словарь события. Незнакомые action_id всё равно возвращают событие — просто без резолва
    item/skill имени (см. RESEARCH_NOTES.md, план "известные action — колонки, остальные — сырое").'''
    action_id = (fields[FIELD_ACTION] or '').strip()
    action_name = _resolve_name(refs['action'], action_id)

    item_id = None
    item_name = None
    item_field_idx = ACTION_ITEM_FIELD.get(action_id)
    if item_field_idx is not None and item_field_idx < len(fields):
        item_id = (fields[item_field_idx] or '').strip() or None
        item_name = _resolve_name(refs['item'], item_id) if item_id else None

    skill_id = None
    skill_name = None
    skill_field_idx = ACTION_SKILL_FIELD.get(action_id)
    if skill_field_idx is not None and skill_field_idx < len(fields):
        skill_id = (fields[skill_field_idx] or '').strip() or None
        skill_name = _resolve_name(refs['skill'], skill_id) if skill_id else None

    actor = (fields[FIELD_ACTOR_NAME] if FIELD_ACTOR_NAME < len(fields) else '').strip() or None
    actor_login = (fields[FIELD_ACTOR_LOGIN] if FIELD_ACTOR_LOGIN < len(fields) else '').strip() or None
    target = (fields[FIELD_TARGET_NAME] if FIELD_TARGET_NAME < len(fields) else '').strip() or None
    target_login = (fields[FIELD_TARGET_LOGIN] if FIELD_TARGET_LOGIN < len(fields) else '').strip() or None

    return {
        'time': (fields[FIELD_TIME] or '').strip(),
        'actionId': action_id or None,
        'actionName': action_name,
        'actor': actor,
        'actorLogin': actor_login,
        'target': target,
        'targetLogin': target_login,
        'itemId': item_id,
        'itemName': item_name,
        'skillId': skill_id,
        'skillName': skill_name,
        # Сырые поля — на случай, если известной раскладки для этого action_id ещё нет, фронт
        # может показать их как запасной вариант (см. RESEARCH_NOTES.md).
        'raw': fields,
    }


def _matches_filters(event, player, item, action):
    if player:
        p = player.lower()
        hay = f"{event['actor'] or ''} {event['actorLogin'] or ''} {event['target'] or ''} {event['targetLogin'] or ''}".lower()
        if p not in hay:
            return False
    if item:
        i = item.lower()
        hay = f"{event['itemName'] or ''} {event['itemId'] or ''}".lower()
        if i not in hay:
            return False
    if action:
        a = action.lower()
        hay = f"{event['actionName'] or ''} {event['actionId'] or ''}".lower()
        if a not in hay:
            return False
    return True


def handler(event: dict, context) -> dict:
    '''Раздел "Логи" — просмотр игровых логов (cached/server/npc) с внешнего VPS по SFTP.
    Действия: list_files (список файлов лога по серверу+типу), get_log (чтение и парсинг
    конкретного файла с фильтрами и пагинацией). Доступ — только с правом logs_view (отдельное от
    patch_edit, см. db_migrations V0075). См. backend/logs/RESEARCH_NOTES.md за полным контекстом.'''
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
    if not me['can_view']:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or ('list_files' if method == 'GET' else '')

    server = _safe_server(qs.get('server') or body.get('server'))
    log_type = qs.get('type') or body.get('type')

    if action == 'list_files':
        if not server:
            cur.close(); conn.close()
            return _bad('bad_server')
        if log_type not in LOG_TYPES:
            cur.close(); conn.close()
            return _bad('bad_type')
        base_dir = _logs_dir_for_server(cur, schema, server)
        if not base_dir:
            cur.close(); conn.close()
            return _bad('logs_dir_not_configured')
        try:
            ssh = _logs_sftp_client(cur, schema)
        except Exception as e:
            cur.close(); conn.close()
            return _bad(f'ssh_connect_error_{type(e).__name__}')
        if ssh is None:
            cur.close(); conn.close()
            return _bad('sftp_not_configured')
        cur.close(); conn.close()
        remote_dir = base_dir.rstrip('/') + '/' + log_type
        try:
            sftp = ssh.open_sftp()
            try:
                entries = sftp.listdir_attr(remote_dir)
            finally:
                sftp.close()
        except FileNotFoundError:
            return _bad('remote_dir_not_found', 404)
        except Exception as e:
            return _bad(f'sftp_error_{type(e).__name__}')
        finally:
            ssh.close()

        files = []
        for entry in entries:
            m = LOG_FILENAME_RE.match(entry.filename)
            if not m:
                continue
            date_str, hhmm, seq, ftype, instance = m.groups()
            files.append({
                'name': entry.filename,
                'date': date_str,
                'size': entry.st_size,
                'modifiedAt': entry.st_mtime,
                'instance': instance,
            })
        files.sort(key=lambda f: f['name'], reverse=True)
        return _ok({'files': files})

    if action == 'get_log':
        if not server:
            return _bad('bad_server')
        if log_type not in LOG_TYPES:
            return _bad('bad_type')
        filename = qs.get('file') or body.get('file') or ''
        if not LOG_FILENAME_RE.match(filename):
            cur.close(); conn.close()
            return _bad('bad_file')
        base_dir = _logs_dir_for_server(cur, schema, server)
        if not base_dir:
            cur.close(); conn.close()
            return _bad('logs_dir_not_configured')

        try:
            page = int(qs.get('page') or body.get('page') or 1)
        except (TypeError, ValueError):
            page = 1
        page = max(1, page)
        try:
            page_size = int(qs.get('pageSize') or body.get('pageSize') or PAGE_SIZE_DEFAULT)
        except (TypeError, ValueError):
            page_size = PAGE_SIZE_DEFAULT
        page_size = max(1, min(PAGE_SIZE_MAX, page_size))

        player_filter = (qs.get('player') or body.get('player') or '').strip()
        item_filter = (qs.get('item') or body.get('item') or '').strip()
        action_filter = (qs.get('actionQuery') or body.get('actionQuery') or '').strip()

        try:
            ssh = _logs_sftp_client(cur, schema)
        except Exception as e:
            cur.close(); conn.close()
            return _bad(f'ssh_connect_error_{type(e).__name__}')
        if ssh is None:
            cur.close(); conn.close()
            return _bad('sftp_not_configured')
        cur.close(); conn.close()

        remote_path = base_dir.rstrip('/') + '/' + log_type + '/' + filename
        try:
            sftp = ssh.open_sftp()
            try:
                st = sftp.stat(remote_path)
                if st.st_size > MAX_FILE_READ:
                    return _bad('file_too_large')
                with sftp.open(remote_path, 'rb') as f:
                    raw = f.read()
            finally:
                sftp.close()
        except FileNotFoundError:
            return _bad('remote_file_not_found', 404)
        except Exception as e:
            return _bad(f'sftp_error_{type(e).__name__}')
        finally:
            ssh.close()

        text = raw.decode(LOG_ENCODING, errors='replace')
        refs = {
            'action': _load_reference('action_ids'),
            'item': _load_reference('item_ids'),
            'npc': _load_reference('npc_ids'),
            'skill': _load_reference('skill_ids', has_level=True),
        }

        reader = csv.reader(io.StringIO(text))
        matched = []
        total_lines = 0
        for row in reader:
            if not row or len(row) < 2:
                continue
            total_lines += 1
            row = [c.strip() for c in row]
            evt = _parse_log_line(row, refs)
            if _matches_filters(evt, player_filter, item_filter, action_filter):
                matched.append(evt)

        total_matched = len(matched)
        start = (page - 1) * page_size
        page_items = matched[start:start + page_size]
        for it in page_items:
            del it['raw']

        return _ok({
            'events': page_items,
            'page': page,
            'pageSize': page_size,
            'totalMatched': total_matched,
            'totalLines': total_lines,
            'totalPages': max(1, (total_matched + page_size - 1) // page_size),
        })

    cur.close(); conn.close()
    return _bad('unknown_action')
