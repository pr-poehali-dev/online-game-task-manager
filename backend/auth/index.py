import json
import os
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone

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
    return psycopg2.connect(os.environ['DATABASE_URL'])


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
    '''Авторизация команды через Telegram Login Widget: проверка подписи, создание/поиск пользователя, выдача сессии. Также проверка текущей сессии (action=me) и выход (action=logout).'''
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
            f"SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.photo_url, u.role, u.member_id, u.tg_username, u.is_active "
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
        user = {
            'id': row[0], 'telegram_id': row[1], 'username': row[2], 'first_name': row[3],
            'last_name': row[4], 'photo_url': row[5], 'role': row[6], 'member_id': row[7],
            'tg_username': row[8],
        }
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'user': user})}

    # Выход
    if action == 'logout':
        if token:
            cur.execute(f"UPDATE {schema}.sessions SET expires_at = NOW() WHERE token = %s", (token,))
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
            f"SELECT id, role FROM {schema}.users WHERE lower(tg_username) = lower(%s) AND telegram_id <= 0 AND is_active = true LIMIT 1",
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
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    cur.execute(
        f"INSERT INTO {schema}.sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (user_id, session_token, expires)
    )

    cur.execute(
        f"SELECT id, telegram_id, username, first_name, last_name, photo_url, role, member_id, tg_username FROM {schema}.users WHERE id = %s",
        (user_id,)
    )
    r = cur.fetchone()
    cur.close(); conn.close()

    user = {
        'id': r[0], 'telegram_id': r[1], 'username': r[2], 'first_name': r[3],
        'last_name': r[4], 'photo_url': r[5], 'role': r[6], 'member_id': r[7], 'tg_username': r[8],
    }
    return {
        'statusCode': 200,
        'headers': _cors_headers(),
        'body': json.dumps({'token': session_token, 'user': user})
    }