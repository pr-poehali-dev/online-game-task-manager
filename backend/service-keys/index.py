import json
import os

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
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    return conn


def _current_user_id(cur, schema, token):
    if not token:
        return None
    cur.execute(
        f"SELECT u.id FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
        f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
        (token,)
    )
    row = cur.fetchone()
    return row[0] if row else None


# Единственный пользователь, кому доступен этот раздел — тот же паттерн, что и для patch_edit /
# приватных заметок / хранилища S3 (см. OWNER_USER_ID в backend/patches/index.py,
# backend/storage-config/index.py) — первый зарегистрированный администратор проекта.
OWNER_USER_ID = 1


def _mask(value: str) -> str:
    if not value:
        return ''
    if len(value) <= 4:
        return '•' * len(value)
    return '•' * (len(value) - 4) + value[-4:]


def _row_to_item(key, value, is_secret, updated_at):
    return {
        'key': key,
        'value': _mask(value) if is_secret else (value or ''),
        'isSecret': is_secret,
        'isSet': bool(value),
        'updatedAt': updated_at.isoformat() if updated_at else None,
    }


def handler(event: dict, context) -> dict:
    '''Универсальное хранилище служебных ключей проекта (раздел "Управление проектом → Служебные
    ключи" в кабинете) — key/value пары, которые пользователь вводит и меняет сам через интерфейс.
    Секретные значения (is_secret) маскируются при чтении, пустое значение при сохранении не
    затирает уже сохранённый секрет (фронт присылает маску, если поле не менялось). Первое
    применение — SSH-реквизиты VPS игрового лаунчера (LAUNCHER_SSH_HOST/PORT/USER/PASSWORD) для
    заливки файлов патчей, см. LAUNCHER_UPLOAD.md. Доступно только владельцу проекта.'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    schema = _schema()
    headers = event.get('headers', {})
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token')

    conn = _db()
    cur = conn.cursor()

    user_id = _current_user_id(cur, schema, token)
    if not user_id:
        cur.close(); conn.close()
        return {'statusCode': 401, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unauthorized'})}
    if user_id != OWNER_USER_ID:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or ('list' if method == 'GET' else '')

    if action == 'list' or method == 'GET':
        cur.execute(f"SELECT key, value, is_secret, updated_at FROM {schema}.service_keys ORDER BY key")
        items = [_row_to_item(*r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'items': items})}

    if action == 'save':
        entries = body.get('entries')
        if not isinstance(entries, list):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_entries'})}
        for entry in entries:
            key = (entry.get('key') or '').strip()
            if not key:
                continue
            is_secret = bool(entry.get('isSecret'))
            value = entry.get('value')
            if value is None:
                value = ''
            value = value.strip()
            if is_secret and not value:
                # Пустое значение секретного поля — фронт прислал маску (значение не менялось),
                # не трогаем то, что уже сохранено в БД.
                continue
            cur.execute(
                f"INSERT INTO {schema}.service_keys (key, value, is_secret, updated_by, updated_at) "
                f"VALUES (%s, %s, %s, %s, now()) "
                f"ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_secret = EXCLUDED.is_secret, "
                f"updated_by = EXCLUDED.updated_by, updated_at = now()",
                (key, value, is_secret, user_id)
            )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}
