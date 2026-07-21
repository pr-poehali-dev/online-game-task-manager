import json
import os
import secrets
import shutil
from datetime import datetime, timedelta, timezone

import boto3
from botocore.config import Config
import psycopg2


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


def _current_admin(cur, schema, token):
    if not token:
        return None
    cur.execute(
        f"SELECT u.id, u.role FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
        f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
        (token,)
    )
    row = cur.fetchone()
    if not row or row[1] != 'admin':
        return None
    return row[0]


ALL_PERMISSIONS = [
    'task_create', 'task_edit_own', 'task_view_others', 'task_restart',
    'idea_create',
    'kb_create', 'kb_edit',
    'sprint_create', 'sprint_edit',
]


def _effective_perms(role, raw):
    '''Индивидуальные права (если заданы явно) имеют приоритет выше роли. Если право не задано — берётся значение по умолчанию для роли.'''
    result = {}
    for key in ALL_PERMISSIONS:
        if isinstance(raw, dict) and key in raw and raw[key] is not None:
            result[key] = bool(raw[key])
        else:
            result[key] = (role == 'admin')
    return result


def _parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception:
        return None


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


def _extract_key(url):
    '''Восстанавливает ключ файла в S3/MinIO из его публичной ссылки, чтобы можно было удалить объект.'''
    if not url:
        return None
    public_url = os.environ.get('S3_PUBLIC_URL', '').rstrip('/')
    if public_url and url.startswith(public_url + '/'):
        return url[len(public_url) + 1:]
    marker = '/bucket/'
    if marker in url:
        return url.split(marker, 1)[1]
    return None


SECTION_TABLES = {
    'knowledge': 'kb_articles',
    'ideas': 'idea_topics',
    'tasks': 'tasks',
}


def _disk_usage():
    '''Читает реальное занятое/свободное место на диске VPS, где физически работает backend-процесс
    (DISK_USAGE_PATH — точка монтирования для проверки, по умолчанию корень "/"). Актуально только
    при развёртывании на собственном VPS — в облачных функциях эта метрика ничего не значит.'''
    path = os.environ.get('DISK_USAGE_PATH', '/')
    try:
        total, used, free = shutil.disk_usage(path)
        return {'total': total, 'used': used, 'free': free, 'path': path}
    except Exception:
        return None


def handler(event: dict, context) -> dict:
    '''Управление пользователями команды: список, выдача/снятие прав доступа и роли admin, индивидуальные права, статистика активности, тестовый вход под участником (action=impersonate), видимость в списке команды (action=set_show_in_team), изменение имени/фамилии (action=set_name), скрытие переписки бота в Telegram участнику (action=set_tg_muted), скрытие кнопки "написать в Telegram" в списке команды (action=set_show_tg_contact). Просмотр и закрытие сессий: список сессий участника (action=sessions), закрыть одну сессию (action=revoke_session), закрыть все активные сессии кроме последней (action=revoke_sessions). Управление залитыми файлами: список всех вложений по разделам база знаний/идеи/задачи вместе со статистикой занятого/свободного места на диске VPS, где физически развёрнут backend (action=files_list), и удаление файлов из хранилища S3/MinIO (action=file_delete). Просмотр общего журнала действий команды за последние 7 дней (action=activity_log). Доступно только администраторам.'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    schema = _schema()
    headers = event.get('headers', {})
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token')

    conn = _db()
    cur = conn.cursor()

    admin_id = _current_admin(cur, schema, token)
    if not admin_id:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    if method == 'GET':
        cur.execute(
            f"SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.photo_url, u.role, u.member_id, "
            f"u.tg_username, u.is_active, u.created_at, u.specialization, u.permissions, "
            f"(SELECT MAX(s.expires_at) FROM {schema}.sessions s WHERE s.user_id = u.id) AS last_session, "
            f"(SELECT COUNT(*) FROM {schema}.sessions s WHERE s.user_id = u.id AND s.expires_at > NOW()) AS active_sessions, "
            f"u.show_in_team, u.tg_notify_muted, u.show_tg_contact "
            f"FROM {schema}.users u WHERE u.is_hidden = false ORDER BY u.created_at ASC"
        )
        rows = cur.fetchall()
        users = [{
            'id': r[0], 'telegram_id': r[1], 'username': r[2], 'first_name': r[3], 'last_name': r[4],
            'photo_url': r[5], 'role': r[6], 'member_id': r[7], 'tg_username': r[8],
            'is_active': r[9], 'created_at': r[10].isoformat() if r[10] else None,
            'specialization': r[11],
            'permissions': _effective_perms(r[6], r[12]),
            'online': (r[14] or 0) > 0,
            'active_sessions': r[14] or 0,
            'show_in_team': r[15] if r[15] is not None else True,
            'tg_notify_muted': bool(r[16]),
            'show_tg_contact': r[17] if r[17] is not None else True,
        } for r in rows]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'users': users, 'permissionKeys': ALL_PERMISSIONS})}

    # POST: обновление роли / активности / приглашение по username / права / статистика
    action = body.get('action')

    if action == 'activity_log':
        # Чистим записи старше 7 дней при каждом просмотре — журнал не хранится дольше недели
        cur.execute(f"DELETE FROM {schema}.activity_log WHERE created_at < NOW() - INTERVAL '7 days'")
        date_from = _parse_dt(body.get('from'))
        date_to = _parse_dt(body.get('to'))
        target_user = body.get('user_id')
        conditions = ["a.created_at >= NOW() - INTERVAL '7 days'"]
        params = []
        if date_from:
            conditions.append("a.created_at >= %s")
            params.append(date_from)
        if date_to:
            conditions.append("a.created_at <= %s")
            params.append(date_to)
        if target_user:
            conditions.append("a.user_id = %s")
            params.append(target_user)
        where = " AND ".join(conditions)
        cur.execute(
            f"SELECT a.id, a.user_id, u.first_name, u.last_name, a.action, a.entity_type, a.entity_id, "
            f"a.entity_title, a.details, a.created_at "
            f"FROM {schema}.activity_log a LEFT JOIN {schema}.users u ON u.id = a.user_id "
            f"WHERE {where} ORDER BY a.created_at DESC LIMIT 500",
            tuple(params)
        )
        entries = [{
            'id': r[0],
            'userId': r[1],
            'userName': f"{r[2]}{(' ' + r[3]) if r[3] else ''}" if r[2] else 'Неизвестный',
            'action': r[4],
            'entityType': r[5],
            'entityId': r[6],
            'entityTitle': r[7],
            'details': r[8],
            'createdAt': r[9].isoformat() if r[9] else None,
        } for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'entries': entries})}

    if action == 'files_list':
        # Собираем все прикреплённые файлы по разделам: база знаний, идеи, задачи (отдельно активные и архивные)
        result = {'knowledge': [], 'ideas': [], 'tasksActive': [], 'tasksArchived': []}

        cur.execute(f"SELECT id, title, attachments, updated_at FROM {schema}.kb_articles WHERE attachments IS NOT NULL AND jsonb_array_length(attachments) > 0")
        for r in cur.fetchall():
            for a in (r[2] or []):
                result['knowledge'].append({**a, 'entityId': str(r[0]), 'entityTitle': r[1], 'updatedAt': r[3].isoformat() if r[3] else None})

        cur.execute(f"SELECT id, title, attachments, updated_at FROM {schema}.idea_topics WHERE attachments IS NOT NULL AND jsonb_array_length(attachments) > 0")
        for r in cur.fetchall():
            for a in (r[2] or []):
                result['ideas'].append({**a, 'entityId': str(r[0]), 'entityTitle': r[1], 'updatedAt': r[3].isoformat() if r[3] else None})

        cur.execute(f"SELECT id, title, attachments, archived, updated_at FROM {schema}.tasks WHERE attachments IS NOT NULL AND jsonb_array_length(attachments) > 0")
        for r in cur.fetchall():
            bucket = 'tasksArchived' if r[3] else 'tasksActive'
            for a in (r[2] or []):
                result[bucket].append({**a, 'entityId': str(r[0]), 'entityTitle': r[1], 'updatedAt': r[4].isoformat() if r[4] else None})

        cur.close(); conn.close()
        result['diskUsage'] = _disk_usage()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps(result)}

    if action == 'file_delete':
        section = body.get('section')
        entity_id = body.get('entityId')
        attachment_id = body.get('attachmentId')
        table = SECTION_TABLES.get(section)
        if not table or not entity_id or not attachment_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
        cur.execute(f"SELECT attachments FROM {schema}.{table} WHERE id = %s", (int(entity_id),))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        attachments = row[0] or []
        target = next((a for a in attachments if a.get('id') == attachment_id), None)
        remaining = [a for a in attachments if a.get('id') != attachment_id]
        cur.execute(
            f"UPDATE {schema}.{table} SET attachments = %s WHERE id = %s",
            (json.dumps(remaining), int(entity_id))
        )
        if target:
            key = _extract_key(target.get('url'))
            if key:
                try:
                    _s3_client().delete_object(Bucket=os.environ.get('S3_BUCKET', 'files'), Key=key)
                except Exception:
                    pass
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    if action == 'invite':
        username = (body.get('tg_username') or '').lstrip('@').strip()
        role = body.get('role', 'member')
        specialization = (body.get('specialization') or '').strip() or None
        first_name = body.get('first_name') or username or 'Участник'
        if not username:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_username'})}
        if role not in ('member', 'admin'):
            role = 'member'
        # уже есть такой username в белом списке?
        cur.execute(f"SELECT id FROM {schema}.users WHERE lower(tg_username) = lower(%s) AND is_hidden = false", (username,))
        if cur.fetchone():
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'already_exists'})}
        # плейсхолдер с уникальным отрицательным telegram_id
        cur.execute(f"SELECT COALESCE(MIN(telegram_id), 0) FROM {schema}.users WHERE telegram_id < 0")
        min_tg = cur.fetchone()[0]
        placeholder_tg = min(min_tg, 0) - 1
        cur.execute(
            f"INSERT INTO {schema}.users (telegram_id, username, first_name, role, tg_username, specialization, is_active) "
            f"VALUES (%s, %s, %s, %s, %s, %s, true) RETURNING id",
            (placeholder_tg, username, first_name, role, username, specialization)
        )
        new_id = cur.fetchone()[0]
        _log_activity(cur, schema, admin_id, 'user_invite', 'user', new_id, first_name, f'@{username}')
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True, 'id': new_id})}

    if action == 'sessions':
        target = body.get('user_id')
        if not target:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_user_id'})}
        cur.execute(
            f"SELECT id, created_at, expires_at, (expires_at > NOW()) AS active "
            f"FROM {schema}.sessions WHERE user_id = %s ORDER BY created_at DESC LIMIT 200",
            (target,)
        )
        sessions = [{
            'id': r[0],
            'created_at': r[1].isoformat() if r[1] else None,
            'expires_at': r[2].isoformat() if r[2] else None,
            'active': r[3],
        } for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'sessions': sessions})}

    if action == 'revoke_session':
        session_id = body.get('session_id')
        if not session_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_session_id'})}
        cur.execute(f"UPDATE {schema}.sessions SET expires_at = NOW() WHERE id = %s", (int(session_id),))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    if action == 'revoke_sessions':
        target = body.get('user_id')
        if not target:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_user_id'})}
        # Закрывает все активные сессии участника, кроме самой последней (текущее устройство) —
        # чтобы не разлогинить только что вошедшего человека при массовой чистке.
        cur.execute(
            f"UPDATE {schema}.sessions SET expires_at = NOW() "
            f"WHERE user_id = %s AND expires_at > NOW() AND id != ("
            f"  SELECT id FROM {schema}.sessions WHERE user_id = %s AND expires_at > NOW() "
            f"  ORDER BY created_at DESC LIMIT 1"
            f")",
            (target, target)
        )
        closed = cur.rowcount
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True, 'closed': closed})}

    if action == 'stats':
        # Статистика по одному участнику за период: создано / закрыто / получено задач + время в приложении
        target = body.get('user_id')
        if not target:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_user_id'})}
        date_from = _parse_dt(body.get('from')) or datetime(1970, 1, 1, tzinfo=timezone.utc)
        date_to = _parse_dt(body.get('to')) or datetime.now(timezone.utc)

        cur.execute(
            f"SELECT COUNT(*) FROM {schema}.tasks WHERE created_by = %s AND created_at >= %s AND created_at <= %s",
            (target, date_from, date_to)
        )
        created_count = cur.fetchone()[0]

        cur.execute(
            f"SELECT COUNT(*) FROM {schema}.tasks WHERE closed_by = %s AND archived_at >= %s AND archived_at <= %s",
            (target, date_from, date_to)
        )
        closed_count = cur.fetchone()[0]

        cur.execute(
            f"SELECT COUNT(DISTINCT task_id) FROM {schema}.task_assignment_events "
            f"WHERE user_id = %s AND assigned_at >= %s AND assigned_at <= %s",
            (target, date_from, date_to)
        )
        received_count = cur.fetchone()[0]

        # Время в приложении: суммируем длительности сессий активности, пересекающихся с периодом,
        # с ограничением каждого интервала окном [date_from, date_to] и потолком 30 минут на heartbeat-разрыв.
        cur.execute(
            f"SELECT started_at, last_heartbeat_at FROM {schema}.user_activity_sessions "
            f"WHERE user_id = %s AND last_heartbeat_at >= %s AND started_at <= %s",
            (target, date_from, date_to)
        )
        total_seconds = 0
        for started_at, last_hb in cur.fetchall():
            s = max(started_at, date_from)
            e = min(last_hb, date_to)
            if e > s:
                total_seconds += (e - s).total_seconds()

        cur.close(); conn.close()
        return {
            'statusCode': 200,
            'headers': _cors_headers(),
            'body': json.dumps({
                'createdCount': created_count,
                'closedCount': closed_count,
                'receivedCount': received_count,
                'timeSpentSeconds': int(total_seconds),
            })
        }

    if action == 'impersonate':
        target = body.get('user_id')
        if not target:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_user_id'})}
        cur.execute(
            f"SELECT id, telegram_id, username, first_name, last_name, photo_url, role, member_id, tg_username, is_active, permissions, theme "
            f"FROM {schema}.users WHERE id = %s AND is_hidden = false",
            (target,)
        )
        r = cur.fetchone()
        if not r or not r[9]:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'user_inactive'})}
        session_token = secrets.token_urlsafe(48)
        expires = datetime.now(timezone.utc) + timedelta(hours=24)
        cur.execute(
            f"INSERT INTO {schema}.sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
            (r[0], session_token, expires)
        )
        user = {
            'id': r[0], 'telegram_id': r[1], 'username': r[2], 'first_name': r[3],
            'last_name': r[4], 'photo_url': r[5], 'role': r[6], 'member_id': r[7], 'tg_username': r[8],
            'permissions': _effective_perms(r[6], r[10]), 'theme': r[11],
        }
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'token': session_token, 'user': user})}

    if action == 'set_permissions':
        target = body.get('user_id')
        if not target:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_user_id'})}
        raw = body.get('permissions') or {}
        clean = {}
        for key in ALL_PERMISSIONS:
            if key in raw and raw[key] is not None:
                clean[key] = bool(raw[key])
        cur.execute(
            f"UPDATE {schema}.users SET permissions = %s, updated_at = NOW() WHERE id = %s",
            (json.dumps(clean), target)
        )
        cur.execute(f"SELECT first_name, last_name FROM {schema}.users WHERE id = %s", (target,))
        urow = cur.fetchone()
        target_name = f"{urow[0]}{(' ' + urow[1]) if urow and urow[1] else ''}" if urow else None
        _log_activity(cur, schema, admin_id, 'user_permissions', 'user', target, target_name)
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    user_id = body.get('user_id')
    if not user_id:
        cur.close(); conn.close()
        return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_user_id'})}

    cur.execute(f"SELECT first_name, last_name FROM {schema}.users WHERE id = %s", (user_id,))
    _urow = cur.fetchone()
    _target_name = f"{_urow[0]}{(' ' + _urow[1]) if _urow[1] else ''}" if _urow else None

    if action == 'set_role':
        role = body.get('role')
        if role not in ('member', 'admin'):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_role'})}
        cur.execute(f"UPDATE {schema}.users SET role = %s, updated_at = NOW() WHERE id = %s", (role, user_id))
        _log_activity(cur, schema, admin_id, 'user_set_role', 'user', user_id, _target_name, role)
    elif action == 'set_active':
        is_active = bool(body.get('is_active'))
        if int(user_id) == admin_id and not is_active:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'cant_disable_self'})}
        cur.execute(f"UPDATE {schema}.users SET is_active = %s, updated_at = NOW() WHERE id = %s", (is_active, user_id))
        _log_activity(cur, schema, admin_id, 'user_set_active', 'user', user_id, _target_name, 'включён' if is_active else 'отключён')
    elif action == 'set_member':
        member_id = body.get('member_id')
        cur.execute(f"UPDATE {schema}.users SET member_id = %s, updated_at = NOW() WHERE id = %s", (member_id, user_id))
    elif action == 'set_specialization':
        specialization = (body.get('specialization') or '').strip() or None
        cur.execute(f"UPDATE {schema}.users SET specialization = %s, updated_at = NOW() WHERE id = %s", (specialization, user_id))
    elif action == 'set_show_in_team':
        show_in_team = bool(body.get('show_in_team'))
        cur.execute(f"UPDATE {schema}.users SET show_in_team = %s, updated_at = NOW() WHERE id = %s", (show_in_team, user_id))
    elif action == 'set_tg_muted':
        tg_notify_muted = bool(body.get('tg_notify_muted'))
        cur.execute(f"UPDATE {schema}.users SET tg_notify_muted = %s, updated_at = NOW() WHERE id = %s", (tg_notify_muted, user_id))
        _log_activity(cur, schema, admin_id, 'user_set_tg_muted', 'user', user_id, _target_name, 'скрыта переписка в Telegram' if tg_notify_muted else 'переписка в Telegram включена')
    elif action == 'set_show_tg_contact':
        show_tg_contact = bool(body.get('show_tg_contact'))
        cur.execute(f"UPDATE {schema}.users SET show_tg_contact = %s, updated_at = NOW() WHERE id = %s", (show_tg_contact, user_id))
        _log_activity(cur, schema, admin_id, 'user_set_show_tg_contact', 'user', user_id, _target_name, 'скрыта кнопка Telegram в списке команды' if not show_tg_contact else 'кнопка Telegram в списке команды включена')
    elif action == 'set_name':
        first_name = (body.get('first_name') or '').strip()
        last_name = (body.get('last_name') or '').strip() or None
        if not first_name:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_first_name'})}
        cur.execute(f"UPDATE {schema}.users SET first_name = %s, last_name = %s, updated_at = NOW() WHERE id = %s", (first_name, last_name, user_id))
        _log_activity(cur, schema, admin_id, 'user_set_name', 'user', user_id, f"{first_name}{(' ' + last_name) if last_name else ''}")
    elif action == 'set_hidden':
        is_hidden = bool(body.get('is_hidden'))
        if int(user_id) == admin_id and is_hidden:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'cant_hide_self'})}
        # При скрытии деактивируем и убираем из белого списка, чтобы аккаунт не мог войти
        if is_hidden:
            cur.execute(
                f"UPDATE {schema}.users SET is_hidden = true, is_active = false, tg_username = NULL, updated_at = NOW() WHERE id = %s",
                (user_id,)
            )
            cur.execute(f"UPDATE {schema}.sessions SET expires_at = NOW() WHERE user_id = %s", (user_id,))
            _log_activity(cur, schema, admin_id, 'user_remove', 'user', user_id, _target_name)
        else:
            cur.execute(f"UPDATE {schema}.users SET is_hidden = false, updated_at = NOW() WHERE id = %s", (user_id,))
    else:
        cur.close(); conn.close()
        return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}

    cur.close(); conn.close()
    return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}