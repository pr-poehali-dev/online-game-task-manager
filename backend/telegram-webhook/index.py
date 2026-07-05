import json
import os
import secrets as pysecrets
from datetime import datetime, timedelta, timezone

import urllib.request
import psycopg2


def _schema():
    return os.environ.get('MAIN_DB_SCHEMA', 'public')


def _db():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    return conn


def _send_message(chat_id: int, text: str):
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not bot_token:
        return
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    data = json.dumps({'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'}).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[webhook] send_message error: {e}")


def handler(event: dict, context) -> dict:
    '''Webhook Telegram-бота: обрабатывает /start КОД, проверяет username по белому списку и подтверждает вход на сайте.'''
    method = event.get('httpMethod', 'POST')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': ''}

    if method != 'POST':
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    try:
        update = json.loads(event.get('body') or '{}')
    except Exception:
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    message = update.get('message') or {}
    text = (message.get('text') or '').strip()
    chat = message.get('chat') or {}
    from_user = message.get('from') or {}
    chat_id = chat.get('id')

    if not chat_id or not text.startswith('/start'):
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    parts = text.split(maxsplit=1)
    code = parts[1].strip().upper() if len(parts) > 1 else ''

    schema = _schema()
    conn = _db()
    cur = conn.cursor()

    telegram_id = int(from_user.get('id'))
    username = from_user.get('username')
    first_name = from_user.get('first_name', 'Пользователь')
    last_name = from_user.get('last_name')

    print(f"[webhook] /start from telegram_id={telegram_id} username={username!r} code={code!r}")

    if not code:
        cur.close(); conn.close()
        _send_message(chat_id, "Привет! Чтобы войти в таск-менеджер «ЭРА», открой страницу входа на сайте и нажми кнопку «Войти через бота».")
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    # Ищем активный код
    cur.execute(
        f"SELECT id, status, expires_at FROM {schema}.login_codes WHERE code = %s",
        (code,)
    )
    lc = cur.fetchone()
    if not lc:
        cur.close(); conn.close()
        _send_message(chat_id, "Код не найден или устарел. Вернись на сайт и запроси новый код.")
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    lc_id, lc_status, lc_expires = lc
    if lc_expires and lc_expires < datetime.now(timezone.utc):
        cur.close(); conn.close()
        _send_message(chat_id, "Код устарел. Вернись на сайт и запроси новый код.")
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    if lc_status != 'pending':
        cur.close(); conn.close()
        _send_message(chat_id, "Этот код уже использован. Если нужно, запроси новый на сайте.")
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    # Проверяем пользователя: существующий или в белом списке
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
            cur.execute(f"UPDATE {schema}.login_codes SET status = 'denied', error = 'inactive' WHERE id = %s", (lc_id,))
            cur.close(); conn.close()
            _send_message(chat_id, "Твой доступ отключён. Обратись к руководителю.")
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
        # Не в белом списке
        cur.execute(f"UPDATE {schema}.login_codes SET status = 'denied', error = 'not_allowed' WHERE id = %s", (lc_id,))
        cur.close(); conn.close()
        uname = f"@{username}" if username else "(без username)"
        _send_message(chat_id, f"У аккаунта {uname} нет доступа к таск-менеджеру. Попроси руководителя добавить тебя в команду.")
        return {'statusCode': 200, 'body': json.dumps({'ok': True})}

    # Создаём сессию и подтверждаем код
    session_token = pysecrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    cur.execute(
        f"INSERT INTO {schema}.sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (user_id, session_token, expires)
    )
    cur.execute(
        f"UPDATE {schema}.login_codes SET status = 'confirmed', user_id = %s, session_token = %s WHERE id = %s",
        (user_id, session_token, lc_id)
    )
    cur.close(); conn.close()

    _send_message(chat_id, "✅ Готово! Возвращайся на сайт — вход выполнен автоматически.")
    return {'statusCode': 200, 'body': json.dumps({'ok': True})}
