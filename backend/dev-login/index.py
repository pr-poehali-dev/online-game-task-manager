import json
import os
import secrets
from datetime import datetime, timedelta, timezone

import psycopg2


def _cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json',
    }


def _schema():
    return os.environ.get('MAIN_DB_SCHEMA', 'public')


def _db():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    return conn


def handler(event: dict, context) -> dict:
    '''ВРЕМЕННАЯ функция только для тестового превью в редакторе poehali.dev — выдаёт сессию
    администратору без прохождения Telegram-авторизации. НИКОГДА не должна разворачиваться
    на боевом self-hosted сервере: там нет смысла её вызывать, так как реальный вход идёт
    через Telegram-бота. Не добавлять в update/, не переносить на сервер.'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}
    if method != 'POST':
        return {'statusCode': 405, 'headers': _cors_headers(), 'body': json.dumps({'error': 'method_not_allowed'})}

    schema = _schema()
    conn = _db()
    cur = conn.cursor()

    cur.execute(
        f"SELECT id, telegram_id, username, first_name, last_name, photo_url, role, member_id, tg_username, permissions, theme "
        f"FROM {schema}.users WHERE role = 'admin' AND is_active = true ORDER BY id LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_admin_user'})}

    user_id = row[0]
    session_token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(hours=24)
    cur.execute(
        f"INSERT INTO {schema}.sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (user_id, session_token, expires)
    )

    user = {
        'id': row[0], 'telegram_id': row[1], 'username': row[2], 'first_name': row[3],
        'last_name': row[4], 'photo_url': row[5], 'role': row[6], 'member_id': row[7],
        'tg_username': row[8], 'permissions': row[9] or {}, 'theme': row[10],
    }
    cur.close(); conn.close()
    return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'token': session_token, 'user': user})}
