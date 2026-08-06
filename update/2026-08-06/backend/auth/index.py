import base64
import json
import os
import hashlib
import hmac
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

import boto3
from botocore.config import Config
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


ALL_PERMISSIONS = [
    'task_create', 'task_edit_own', 'task_view_others', 'task_restart',
    'idea_create',
    'kb_create', 'kb_edit',
    'sprint_create', 'sprint_edit',
    'patch_edit', 'patch_launcher_upload', 'patch_delete_files',
    'team_manage',
]


def _effective_perms(role, raw):
    '''patch_edit/team_manage по умолчанию False даже для role == 'admin' (см.
    backend/admin/index.py) — patch_edit изначально есть только у OWNER_USER_ID через миграцию,
    team_manage делегируется точечно каждому участнику. patch_launcher_upload/patch_delete_files
    требуют patch_edit=true как предусловие (см. backend/admin/index.py за подробностями).'''
    result = {}
    for key in ALL_PERMISSIONS:
        if key in ('patch_launcher_upload', 'patch_delete_files'):
            continue
        if isinstance(raw, dict) and key in raw and raw[key] is not None:
            result[key] = bool(raw[key])
        elif key in ('patch_edit', 'team_manage'):
            result[key] = False
        else:
            result[key] = (role == 'admin')
    for key in ('patch_launcher_upload', 'patch_delete_files'):
        if not result['patch_edit']:
            result[key] = False
        elif isinstance(raw, dict) and key in raw and raw[key] is not None:
            result[key] = bool(raw[key])
        else:
            result[key] = False
    return result


def _db():
    return psycopg2.connect(os.environ['DATABASE_URL'])


MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5 МБ на аватарку


try:
    _S3_CONFIG = Config(request_checksum_calculation='when_required', response_checksum_validation='when_required')
except TypeError:
    _S3_CONFIG = Config()


def _s3_client():
    return boto3.client(
        's3',
        endpoint_url=os.environ.get('S3_ENDPOINT', 'http://127.0.0.1:9000'),
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        config=_S3_CONFIG,
    )


def _public_url(key: str) -> str:
    base_url = (os.environ.get('S3_PUBLIC_URL') or os.environ.get('CDN_BASE_URL', '')).rstrip('/')
    if base_url:
        return f"{base_url}/{key}"
    return f"http://{os.environ.get('S3_ENDPOINT', '127.0.0.1:9000')}/{os.environ.get('S3_BUCKET', 'files')}/{key}"


def _decode_b64(data_b64):
    if ',' in data_b64 and data_b64.strip().startswith('data:'):
        data_b64 = data_b64.split(',', 1)[1]
    return base64.b64decode(data_b64)


def _log_activity(cur, schema, user_id, action, entity_type=None, entity_id=None, entity_title=None, details=None):
    '''Записывает значимое действие пользователя в журнал активности (хранится 7 дней).'''
    cur.execute(
        f"INSERT INTO {schema}.activity_log (user_id, action, entity_type, entity_id, entity_title, details) "
        f"VALUES (%s, %s, %s, %s, %s, %s)",
        (user_id, action, entity_type, str(entity_id) if entity_id is not None else None, entity_title, details)
    )


def _verify_telegram(data: dict, bot_token: str) -> bool:
    '''Проверка подписи Telegram Login Widget'''
    received_hash = data.get('hash', '')
    check_pairs = []
    for key in sorted(data.keys()):
        if key == 'hash':
            continue
        check_pairs.append(f"{key}={data[key]}")
    check_string = "\n".join(check_pairs)
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    calc_hash = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc_hash, received_hash):
        return False
    auth_date = int(data.get('auth_date', 0))
    if time.time() - auth_date > 86400:
        return False
    return True


def handler(event: dict, context) -> dict:
    '''Авторизация команды через Telegram Login Widget: проверка подписи, создание/поиск пользователя, выдача сессии. Также проверка текущей сессии (action=me), выход (action=logout), heartbeat активности (action=heartbeat, продлевает сессию на 24 часа) и сохранение темы интерфейса (action=set_theme). Вход и выход записываются в журнал действий (activity_log).
    Пользователь может сам задать себе никнейм (action=set_nickname) и загрузить свою аватарку
    (action=upload_avatar, base64 в S3) или сбросить её (action=remove_avatar) прямо в личном
    кабинете — сохраняются в отдельные колонки nickname/avatar_url, которые имеют приоритет над
    first_name/last_name/photo_url при отдаче пользователя (action=me/login/team) и НЕ
    перезаписываются данными из Telegram при последующих входах (в отличие от first_name/photo_url,
    которые Telegram Login Widget обновляет при каждом логине).'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    schema = _schema()
    headers = event.get('headers', {})
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token')

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    default_action = 'login' if method == 'POST' else 'me'
    action = body.get('action') or (event.get('queryStringParameters') or {}).get('action') or default_action

    conn = _db()
    conn.autocommit = True
    cur = conn.cursor()

    # Проверка текущей сессии
    if action == 'me':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_token'})}
        cur.execute(
            f"SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.photo_url, u.role, u.member_id, u.tg_username, u.is_active, u.permissions, u.theme, u.nickname, u.avatar_url "
            f"FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
            f"WHERE s.token = %s AND s.expires_at > NOW()",
            (token,)
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'invalid_session'})}
        if not row[9]:
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'inactive'})}
        # Если пользователь задал свой никнейм/аватарку в кабинете (nickname/avatar_url) — они
        # приоритетнее данных, пришедших из Telegram (first_name/last_name/photo_url), и не
        # перезатираются повторным входом через Telegram (см. action == 'login' ниже). last_name
        # скрываем, когда есть свой никнейм — он задаётся как ПОЛНОЕ отображаемое имя целиком.
        nickname, avatar_url = row[12], row[13]
        user = {
            'id': row[0], 'telegram_id': row[1], 'username': row[2],
            'first_name': nickname or row[3], 'last_name': None if nickname else row[4],
            'photo_url': avatar_url or row[5], 'role': row[6], 'member_id': row[7],
            'tg_username': row[8], 'permissions': _effective_perms(row[6], row[10]), 'theme': row[11],
            'nickname': nickname, 'avatar_url': avatar_url,
            'tg_first_name': row[3], 'tg_last_name': row[4], 'tg_photo_url': row[5],
        }
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'user': user})}

    # Сохранить выбранную тему интерфейса пользователя
    if action == 'set_theme':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_token'})}
        theme = body.get('theme')
        if theme not in ('light', 'dark'):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_theme'})}
        cur.execute(
            f"SELECT u.id FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
            f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
            (token,)
        )
        urow = cur.fetchone()
        if not urow:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'invalid_session'})}
        cur.execute(f"UPDATE {schema}.users SET theme = %s WHERE id = %s", (theme, urow[0]))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Пользователь сам меняет своё отображаемое имя (никнейм) в личном кабинете — сохраняется в
    # отдельную колонку nickname и НЕ трогается при последующих входах через Telegram (в отличие
    # от first_name, который перезаписывается данными из Telegram при каждом логине, см. action ==
    # 'login' выше). Пустая строка — сброс к имени из Telegram.
    if action == 'set_nickname':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_token'})}
        cur.execute(
            f"SELECT u.id FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
            f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
            (token,)
        )
        urow = cur.fetchone()
        if not urow:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'invalid_session'})}
        nickname = (body.get('nickname') or '').strip()
        if len(nickname) > 60:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'nickname_too_long'})}
        cur.execute(
            f"UPDATE {schema}.users SET nickname = %s, updated_at = NOW() WHERE id = %s",
            (nickname or None, urow[0])
        )
        _log_activity(cur, schema, urow[0], 'user_self_set_nickname', 'user', urow[0], nickname or None)
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True, 'nickname': nickname or None})}

    # Пользователь сам загружает свою аватарку — сохраняется в отдельную колонку avatar_url и НЕ
    # трогается при последующих входах через Telegram (в отличие от photo_url).
    if action == 'upload_avatar':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_token'})}
        cur.execute(
            f"SELECT u.id FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
            f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
            (token,)
        )
        urow = cur.fetchone()
        if not urow:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'invalid_session'})}
        data_b64 = body.get('data')
        if not data_b64:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_data'})}
        try:
            raw = _decode_b64(data_b64)
        except Exception:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_data'})}
        if len(raw) > MAX_AVATAR_SIZE:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'file_too_large'})}
        ext = (body.get('ext') or 'jpg').lstrip('.').lower()
        if not re.match(r'^[a-z0-9]{1,5}$', ext):
            ext = 'jpg'
        content_type = body.get('contentType') or f'image/{ext}'
        key = f"avatars/{urow[0]}-{uuid.uuid4().hex}.{ext}"
        bucket = os.environ.get('S3_BUCKET', 'files')
        _s3_client().put_object(Bucket=bucket, Key=key, Body=raw, ContentType=content_type)
        avatar_url = _public_url(key)
        cur.execute(
            f"UPDATE {schema}.users SET avatar_url = %s, updated_at = NOW() WHERE id = %s",
            (avatar_url, urow[0])
        )
        _log_activity(cur, schema, urow[0], 'user_self_upload_avatar', 'user', urow[0])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True, 'avatarUrl': avatar_url})}

    # Сброс кастомной аватарки — возвращаемся к фото из Telegram (если есть)
    if action == 'remove_avatar':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_token'})}
        cur.execute(
            f"SELECT u.id FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
            f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
            (token,)
        )
        urow = cur.fetchone()
        if not urow:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'invalid_session'})}
        cur.execute(f"UPDATE {schema}.users SET avatar_url = NULL, updated_at = NOW() WHERE id = %s", (urow[0],))
        _log_activity(cur, schema, urow[0], 'user_self_remove_avatar', 'user', urow[0])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Список команды для доски (онлайн-статус по активной сессии)
    if action == 'team':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_token'})}
        cur.execute(
            f"SELECT 1 FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
            f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
            (token,)
        )
        if not cur.fetchone():
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'invalid_session'})}
        cur.execute(
            f"SELECT u.id, u.first_name, u.last_name, u.photo_url, u.role, u.tg_username, u.username, "
            f"u.specialization, u.telegram_id, "
            f"(SELECT COUNT(*) FROM {schema}.sessions s WHERE s.user_id = u.id AND s.expires_at > NOW()) AS active_sessions, "
            f"u.show_tg_contact, u.nickname, u.avatar_url "
            f"FROM {schema}.users u WHERE u.is_active = true AND u.is_hidden = false AND u.show_in_team = true "
            f"ORDER BY u.role DESC, u.created_at ASC"
        )
        members = []
        for r in cur.fetchall():
            tg = (r[5] or r[6]) if r[10] else None
            nickname, avatar_url = r[11], r[12]
            members.append({
                'id': r[0], 'first_name': nickname or r[1], 'last_name': None if nickname else r[2],
                'photo_url': avatar_url or r[3],
                'role': r[4], 'tg_username': tg, 'specialization': r[7],
                'pending': (r[8] is not None and r[8] < 0),
                'online': (r[9] or 0) > 0,
            })
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'members': members})}

    # Отметка активности пользователя в приложении — для подсчёта времени, проведённого в системе.
    # Фронтенд вызывает периодически (~раз в минуту), пока вкладка открыта. Если разрыв между heartbeat
    # больше 5 минут — считается новой сессией активности.
    if action == 'heartbeat':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_token'})}
        cur.execute(
            f"SELECT u.id FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
            f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
            (token,)
        )
        urow = cur.fetchone()
        if not urow:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'invalid_session'})}
        uid = urow[0]
        # Продлеваем сессию, пока пользователь активен в приложении — не даём ей истечь во время работы
        cur.execute(
            f"UPDATE {schema}.sessions SET expires_at = NOW() + INTERVAL '24 hours' WHERE token = %s",
            (token,)
        )
        cur.execute(
            f"SELECT id, last_heartbeat_at FROM {schema}.user_activity_sessions "
            f"WHERE user_id = %s ORDER BY last_heartbeat_at DESC LIMIT 1",
            (uid,)
        )
        last = cur.fetchone()
        now = datetime.now(timezone.utc)
        if last and (now - last[1]) <= timedelta(minutes=5):
            cur.execute(
                f"UPDATE {schema}.user_activity_sessions SET last_heartbeat_at = NOW() WHERE id = %s",
                (last[0],)
            )
        else:
            cur.execute(
                f"INSERT INTO {schema}.user_activity_sessions (user_id, started_at, last_heartbeat_at) VALUES (%s, NOW(), NOW())",
                (uid,)
            )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Выход
    if action == 'logout':
        if token:
            cur.execute(
                f"SELECT u.id FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id WHERE s.token = %s",
                (token,)
            )
            urow = cur.fetchone()
            cur.execute(f"UPDATE {schema}.sessions SET expires_at = NOW() WHERE token = %s", (token,))
            if urow:
                _log_activity(cur, schema, urow[0], 'logout')
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Вход через Telegram
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    tg = body.get('telegram') or {}
    if not bot_token or not tg or not _verify_telegram(tg, bot_token):
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_signature'})}

    telegram_id = int(tg['id'])
    username = tg.get('username')
    first_name = tg.get('first_name', 'Пользователь')
    last_name = tg.get('last_name')
    photo_url = tg.get('photo_url')

    print(f"[auth] login attempt telegram_id={telegram_id} username={username!r} first_name={first_name!r}")

    cur.execute(f"SELECT id, role, is_active FROM {schema}.users WHERE telegram_id = %s", (telegram_id,))
    existing = cur.fetchone()

    placeholder = None
    if not existing and username:
        # Заготовка из белого списка (telegram_id <= 0 означает, что реальный вход ещё не был)
        cur.execute(
            f"SELECT id, role FROM {schema}.users WHERE lower(tg_username) = lower(%s) AND telegram_id < 0 AND is_active = true ORDER BY id LIMIT 1",
            (username,)
        )
        placeholder = cur.fetchone()

    if existing:
        user_id, role, is_active = existing
        cur.execute(
            f"UPDATE {schema}.users SET username = %s, first_name = %s, last_name = %s, photo_url = %s, updated_at = NOW() WHERE id = %s",
            (username, first_name, last_name, photo_url, user_id)
        )
    elif placeholder:
        # Привязываем реальный Telegram-аккаунт к заранее созданной записи (сохраняем роль)
        user_id, role = placeholder
        cur.execute(
            f"UPDATE {schema}.users SET telegram_id = %s, username = %s, first_name = %s, last_name = %s, photo_url = %s, updated_at = NOW() WHERE id = %s",
            (telegram_id, username, first_name, last_name, photo_url, user_id)
        )
        is_active = True
    else:
        # НЕ в белом списке — доступ запрещён
        print(f"[auth] access denied: username={username!r} not in whitelist")
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_allowed'})}

    if not is_active:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'inactive'})}

    session_token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(hours=24)
    cur.execute(
        f"INSERT INTO {schema}.sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (user_id, session_token, expires)
    )
    _log_activity(cur, schema, user_id, 'login', details='Telegram Login Widget')

    cur.execute(
        f"SELECT id, telegram_id, username, first_name, last_name, photo_url, role, member_id, tg_username, permissions, theme, nickname, avatar_url FROM {schema}.users WHERE id = %s",
        (user_id,)
    )
    r = cur.fetchone()
    cur.close(); conn.close()

    r_nickname, r_avatar_url = r[11], r[12]
    user = {
        'id': r[0], 'telegram_id': r[1], 'username': r[2],
        'first_name': r_nickname or r[3], 'last_name': None if r_nickname else r[4],
        'photo_url': r_avatar_url or r[5], 'role': r[6], 'member_id': r[7], 'tg_username': r[8],
        'permissions': _effective_perms(r[6], r[9]), 'theme': r[10],
        'nickname': r_nickname, 'avatar_url': r_avatar_url,
        'tg_first_name': r[3], 'tg_last_name': r[4], 'tg_photo_url': r[5],
    }
    return {
        'statusCode': 200,
        'headers': _cors_headers(),
        'body': json.dumps({'token': session_token, 'user': user})
    }