import json
import os
import secrets
import urllib.request
from datetime import datetime, timedelta, timezone

import psycopg2


def _schema():
    return os.environ.get('MAIN_DB_SCHEMA', 'public')


def _db():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    return conn


def _send_message(chat_id, text):
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not token:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'}).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print(f"[tg-webhook] send error: {e}")


def handler(event: dict, context) -> dict:
    '''Webhook Telegram-бота: принимает команду /start КОД, проверяет username в белом списке, создаёт сессию и подтверждает код входа.'''
    method = event.get('httpMethod', 'POST')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': ''}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    message = body.get('message') or {}
    text = (message.get('text') or '').strip()
    chat = message.get('chat') or {}
    from_user = message.get('from') or {}
    chat_id = chat.get('id')

    if not text.startswith('/start'):
        if chat_id:
            _send_message(chat_id, 'Чтобы войти, откройте страницу входа на сайте и нажмите «Войти через бота».')
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    parts = text.split(maxsplit=1)
    code = parts[1].strip().upper() if len(parts) > 1 else ''

    if not code:
        _send_message(chat_id, 'Откройте страницу входа на сайте и нажмите «Войти через бота», чтобы получить код.')
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    schema = _schema()
    telegram_id = int(from_user.get('id'))
    username = from_user.get('username')
    first_name = from_user.get('first_name', 'Пользователь')
    last_name = from_user.get('last_name')

    conn = _db()
    cur = conn.cursor()

    # находим код
    cur.execute(
        f"SELECT id, status, expires_at FROM {schema}.login_codes WHERE code = %s",
        (code,)
    )
    lc = cur.fetchone()
    if not lc:
        cur.close(); conn.close()
        _send_message(chat_id, 'Код не найден. Получите новый код на странице входа.')
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    code_id, code_status, expires_at = lc
    if code_status != 'pending':
        cur.close(); conn.close()
        _send_message(chat_id, 'Этот код уже использован. Получите новый код на странице входа.')
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}
    if expires_at and expires_at < datetime.now(timezone.utc):
        cur.close(); conn.close()
        _send_message(chat_id, 'Срок действия кода истёк. Получите новый код на странице входа.')
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    # ищем пользователя по telegram_id или по белому списку (username)
    cur.execute(f"SELECT id, role, is_active FROM {schema}.users WHERE telegram_id = %s", (telegram_id,))
    existing = cur.fetchone()

    placeholder = None
    if not existing and username:
        cur.execute(
            f"SELECT id, role FROM {schema}.users WHERE lower(tg_username) = lower(%s) AND telegram_id <= 0 AND is_active = true LIMIT 1",
            (username,)
        )
        placeholder = cur.fetchone()

    if existing:
        user_id, role, is_active = existing
        if not is_active:
            cur.execute(f"UPDATE {schema}.login_codes SET status = 'denied', error = 'inactive' WHERE id = %s", (code_id,))
            cur.close(); conn.close()
            _send_message(chat_id, 'Ваш доступ отключён. Обратитесь к руководителю.')
            return {'statusCode': 200, 'body': json.dumps({'ok': True})}
        cur.execute(
            f"UPDATE {schema}.users SET username = %s, first_name = %s, last_name = %s, updated_at = NOW() WHERE id = %s",
            (username, first_name, last_name, user_id)
        )
    elif placeholder:
        user_id, role = placeholder
        cur.execute(
            f"UPDATE {schema}.users SET telegram_id = %s, username = %s, first_name = %s, last_name = %s, updated_at = NOW() WHERE id = %s",
            (telegram_id, username, first_name, last_name, user_id)
        )
    else:
        # не в белом списке
        cur.execute(f"UPDATE {schema}.login_codes SET status = 'denied', error = 'not_allowed' WHERE id = %s", (code_id,))
        cur.close(); conn.close()
        uname = f"@{username}" if username else 'без username'
        _send_message(chat_id, f'У вашего аккаунта ({uname}) нет доступа. Попросите руководителя добавить вас в команду.')
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    # создаём сессию и подтверждаем код
    session_token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    cur.execute(
        f"INSERT INTO {schema}.sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (user_id, session_token, expires)
    )
    cur.execute(
        f"UPDATE {schema}.login_codes SET status = 'confirmed', user_id = %s, session_token = %s WHERE id = %s",
        (user_id, session_token, code_id)
    )
    cur.close(); conn.close()

    _send_message(chat_id, '✅ Вход подтверждён! Вернитесь на сайт — вы уже авторизованы.')
    return {'statusCode': 200, 'body': json.dumps({'ok': True})}
