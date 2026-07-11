import json
import os
import secrets
import string
from datetime import datetime, timedelta, timezone

import psycopg2


def _cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
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
]


def _effective_perms(role, raw):
    result = {}
    for key in ALL_PERMISSIONS:
        if isinstance(raw, dict) and key in raw and raw[key] is not None:
            result[key] = bool(raw[key])
        else:
            result[key] = (role == 'admin')
    return result


def _db():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    return conn


def _gen_code(cur, schema: str) -> str:
    alphabet = string.ascii_uppercase + string.digits
    alphabet = alphabet.replace('O', '').replace('0', '').replace('I', '').replace('1', '')
    for _ in range(10):
        code = ''.join(secrets.choice(alphabet) for _ in range(6))
        cur.execute(f"SELECT 1 FROM {schema}.login_codes WHERE code = %s", (code,))
        if not cur.fetchone():
            return code
    return ''.join(secrets.choice(alphabet) for _ in range(6))


def handler(event: dict, context) -> dict:
    '''Вход через бота: создаёт код входа (action=create) и отдаёт его статус для опроса фронтом (action=status). Подтверждение кода делает webhook бота.'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    params = event.get('queryStringParameters') or {}
    default_action = 'create' if method == 'POST' else 'status'
    action = body.get('action') or params.get('action') or default_action

    schema = _schema()
    conn = _db()
    cur = conn.cursor()

    if action == 'create':
        cur.execute(f"DELETE FROM {schema}.login_codes WHERE expires_at < NOW()")
        code = _gen_code(cur, schema)
        expires = datetime.now(timezone.utc) + timedelta(minutes=10)
        cur.execute(
            f"INSERT INTO {schema}.login_codes (code, status, expires_at) VALUES (%s, 'pending', %s)",
            (code, expires)
        )
        bot_username = os.environ.get('TELEGRAM_BOT_USERNAME', '')
        deep_link = f"https://t.me/{bot_username}?start={code}" if bot_username else None
        cur.close(); conn.close()
        return {
            'statusCode': 200,
            'headers': _cors_headers(),
            'body': json.dumps({'code': code, 'deep_link': deep_link, 'expires_in': 600})
        }

    if action == 'status':
        code = (body.get('code') or params.get('code') or '').strip().upper()
        if not code:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_code'})}

        cur.execute(
            f"SELECT status, session_token, error, expires_at FROM {schema}.login_codes WHERE code = %s",
            (code,)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'status': 'expired'})}

        status, session_token, error, expires_at = row
        if status == 'pending' and expires_at and expires_at < datetime.now(timezone.utc):
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'status': 'expired'})}

        if status == 'confirmed' and session_token:
            cur.execute(
                f"SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.photo_url, u.role, u.member_id, u.tg_username, u.permissions "
                f"FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
                f"WHERE s.token = %s AND s.expires_at > NOW()",
                (session_token,)
            )
            u = cur.fetchone()
            cur.close(); conn.close()
            if not u:
                return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'status': 'expired'})}
            user = {
                'id': u[0], 'telegram_id': u[1], 'username': u[2], 'first_name': u[3],
                'last_name': u[4], 'photo_url': u[5], 'role': u[6], 'member_id': u[7], 'tg_username': u[8],
                'permissions': _effective_perms(u[6], u[9]),
            }
            return {
                'statusCode': 200,
                'headers': _cors_headers(),
                'body': json.dumps({'status': 'confirmed', 'token': session_token, 'user': user})
            }

        cur.close(); conn.close()
        return {
            'statusCode': 200,
            'headers': _cors_headers(),
            'body': json.dumps({'status': status, 'error': error})
        }

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}