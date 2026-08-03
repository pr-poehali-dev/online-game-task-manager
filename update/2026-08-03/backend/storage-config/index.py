import json
import os
import tempfile

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


# id владельца проекта — тот же паттерн, что уже используется в backend/admin/index.py
# (OWNER_USER_ID, PRIVILEGED_PERMISSIONS) для наиболее чувствительных операций. Этот раздел
# позволяет переписать ключи доступа к S3/MinIO прямо на боевом сервере и перезапустить backend —
# по требованию пользователя доступен только владельцу, а не любому администратору.
OWNER_USER_ID = 1

# Путь к .env self-hosted-инсталляции — см. deploy/era-backend.service (EnvironmentFile) и
# deploy/UPDATE.md. Можно переопределить переменной окружения ENV_FILE_PATH, если проект развёрнут
# в другую папку. На облаке poehali.dev этого файла не существует — в этом случае раздел в
# кабинете сообщает, что настройка недоступна в текущем окружении (секреты там управляются через
# отдельный интерфейс платформы, а не файл .env).
ENV_FILE_PATH = os.environ.get('ENV_FILE_PATH', '/var/www/era/deploy/.env')

# Только эти ключи можно читать/менять через этот раздел — сознательно не весь .env (см. решение
# пользователя ограничиться разделом "Хранилище (MinIO)").
MANAGED_KEYS = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_ENDPOINT', 'S3_PUBLIC_URL', 'CDN_BASE_URL', 'S3_BUCKET']
SECRET_KEYS = {'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'}


def _mask(value: str) -> str:
    if not value:
        return ''
    if len(value) <= 4:
        return '•' * len(value)
    return '•' * (len(value) - 4) + value[-4:]


def _parse_env_file(path: str) -> dict:
    values = {}
    if not os.path.exists(path):
        return values
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith('#') or '=' not in stripped:
                continue
            key, _, val = stripped.partition('=')
            values[key.strip()] = val.strip()
    return values


def _write_env_file(path: str, updates: dict):
    '''Обновляет только переданные ключи, сохраняя остальные строки/комментарии/порядок файла как
    есть. Пишет во временный файл рядом и атомарно переименовывает — чтобы backend-процесс никогда
    не увидел частично записанный .env, даже если запись прервётся.'''
    lines = []
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

    seen = set()
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith('#') and '=' in stripped:
            key = stripped.split('=', 1)[0].strip()
            if key in updates:
                new_lines.append(f"{key}={updates[key]}\n")
                seen.add(key)
                continue
        new_lines.append(line)

    missing = [k for k in updates if k not in seen]
    if missing:
        if new_lines and not new_lines[-1].endswith('\n'):
            new_lines.append('\n')
        new_lines.append('\n# ==== Хранилище S3/MinIO (обновлено из кабинета) ====\n')
        for k in missing:
            new_lines.append(f"{k}={updates[k]}\n")

    fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path) or '.', prefix='.env.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def handler(event: dict, context) -> dict:
    '''Настройка подключения к S3/MinIO хранилищу на self-hosted сервере (чтение/запись .env +
    перезапуск backend). Доступно только владельцу проекта. На облаке poehali.dev файла .env не
    существует — раздел сообщает, что настройка недоступна в этом окружении.'''
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
    cur.close(); conn.close()

    available = os.path.exists(ENV_FILE_PATH)

    if method == 'GET':
        if not available:
            return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'available': False})}
        current = _parse_env_file(ENV_FILE_PATH)
        values = {}
        for key in MANAGED_KEYS:
            raw = current.get(key, '')
            values[key] = {'value': _mask(raw) if key in SECRET_KEYS else raw, 'isSet': bool(raw)}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'available': True, 'values': values})}

    if method == 'POST':
        if not available:
            return {'statusCode': 409, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_available'})}
        body = {}
        if event.get('body'):
            try:
                body = json.loads(event['body'])
            except Exception:
                body = {}

        current = _parse_env_file(ENV_FILE_PATH)
        updates = {}
        for key in MANAGED_KEYS:
            if key not in body:
                continue
            new_val = (body.get(key) or '').strip()
            # Пустое значение секретного поля — фронт прислал маску (пользователь не менял
            # значение), оставляем как было, чтобы случайно не затереть рабочий ключ.
            if key in SECRET_KEYS and not new_val:
                continue
            updates[key] = new_val

        if not updates:
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_changes'})}

        _write_env_file(ENV_FILE_PATH, updates)
        # Эта функция сознательно НЕ пытается сама перезапустить backend-процесс сервера — облачным
        # функциям этого проекта запрещено выполнять произвольные внешние команды из соображений
        # безопасности песочницы. Вместо этого на сервере настроен отдельный сторож на уровне ОС
        # (см. deploy/era-backend-env.path и deploy/UPDATE.md), который сам замечает изменение
        # файла .env и перезапускает основной сервис — поэтому здесь достаточно просто записать
        # файл, применение новых значений происходит на стороне сервера в течение пары секунд.
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    return {'statusCode': 405, 'headers': _cors_headers(), 'body': json.dumps({'error': 'method_not_allowed'})}