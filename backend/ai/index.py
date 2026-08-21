import base64
import io
import json
import os
import re
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

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


def _db():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    return conn


def _bad(err, status=400):
    return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps({'error': err})}


def _ok(payload):
    return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps(payload, default=str)}


def _current_user(cur, schema, token):
    '''Право ai_access — ОТДЕЛЬНОЕ привилегированное право (см. db_migrations V0076,
    backend/admin/index.py ALL_PERMISSIONS/PRIVILEGED_PERMISSIONS), по умолчанию False даже для
    role == 'admin', пока не выдано явно владельцем проекта — тот же паттерн, что logs_view в
    backend/logs/index.py. team_manage/role проверяются отдельно там, где это нужно (action=balance
    — общий остаток аккаунта AI Tunnel виден только тем, кто управляет командой).'''
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
    can_access = perms.get('ai_access')
    can_access = False if can_access is None else bool(can_access)
    can_manage_team = role == 'admin' or bool(perms.get('team_manage'))
    return {'id': uid, 'role': role, 'can_access': can_access, 'can_manage_team': can_manage_team}


def _service_key(cur, schema, key):
    cur.execute(f"SELECT value FROM {schema}.service_keys WHERE key = %s", (key,))
    row = cur.fetchone()
    return row[0] if row and row[0] else None


# --- S3 (вложения в чат, сгенерированные картинки/видео) — тот же паттерн, что _upload_image в
# backend/knowledge/index.py, но со своим префиксом ключа ai/... -------------------------------
# Одиночный HTTP-запрос к облачной функции физически ограничен ~3.5 МБ на уровне прокси платформы
# (проверено практически — тело запроса больше этого лимита отклоняется с 413 ДО того, как код
# функции вообще начинает выполняться, это нельзя изменить настройками). Поэтому файлы вплоть до
# MAX_UPLOAD_SIZE грузятся кусочками — тот же паттерн file_init/file_chunk/file_complete/file_abort,
# что уже используется в backend/patches/index.py для загрузки файлов дерева патча.
MAX_UPLOAD_SIZE = 200 * 1024 * 1024  # 200 МБ на файл, загружаемый пользователем в чат


def _s3_client():
    return boto3.client(
        's3',
        endpoint_url=os.environ.get('S3_ENDPOINT', 'https://bucket.poehali.dev'),
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        config=Config(),
    )


def _public_url(key: str) -> str:
    base_url = (os.environ.get('S3_PUBLIC_URL') or os.environ.get('CDN_BASE_URL', '')).rstrip('/')
    if base_url:
        return f"{base_url}/{key}"
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def _decode_data(data_b64):
    if ',' in data_b64 and data_b64.strip().startswith('data:'):
        data_b64 = data_b64.split(',', 1)[1]
    return base64.b64decode(data_b64)


def _upload_bytes(raw: bytes, ext: str, content_type: str, prefix: str) -> str:
    key = f"ai/{prefix}/{uuid.uuid4().hex}.{ext}"
    bucket = os.environ.get('S3_BUCKET', 'files')
    _s3_client().put_object(Bucket=bucket, Key=key, Body=raw, ContentType=content_type)
    return _public_url(key)


AITUNNEL_BASE = 'https://api.aitunnel.ru/v1'
AITUNNEL_PUBLIC_BASE = 'https://api.aitunnel.ru/public/aitunnel'

# Сколько последних сообщений диалога отправляем модели как контекст — защита от неограниченного
# роста запроса (и его стоимости) в очень длинных чатах. AI Tunnel считает стоимость по фактически
# отправленным токенам, поэтому урезаем историю на нашей стороне.
MAX_HISTORY_MESSAGES = 30

# Публичный каталог моделей (см. docs/ai-tunnel-api-reference.md, раздел "Список моделей") не
# требует ключа и общий для всех пользователей — кешируем в памяти процесса на 10 минут, чтобы не
# дёргать AI Tunnel на каждое открытие раздела "AI". Кеш переживает только "тёплые" вызовы одного
# инстанса функции — это нормально, это просто снижение частоты внешних запросов, а не источник
# истины.
_MODELS_CACHE: dict = {}
_MODELS_CACHE_TTL = 600


def _fetch_models(group):
    now = time.time()
    cached = _MODELS_CACHE.get(group)
    if cached and now - cached[0] < _MODELS_CACHE_TTL:
        return cached[1]
    req = urllib.request.Request(f'{AITUNNEL_PUBLIC_BASE}/models/{group}', method='GET')
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    _MODELS_CACHE[group] = (now, data)
    return data


def _aitunnel_request(path, api_key, payload, timeout=45):
    '''POST-запрос к AI Tunnel (chat/completions и т.д.) с ключом проекта. Возвращает (data, None)
    при успехе либо (None, (statusCode, error_payload)) при ошибке — единый формат для отдачи
    клиенту без изменений (AI Tunnel уже отдаёт понятный {"error": {"code","message"}}).'''
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        f'{AITUNNEL_BASE}{path}', data=body, method='POST',
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8')), None
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'ignore')
        try:
            parsed = json.loads(raw)
            message = (parsed.get('error') or {}).get('message') or raw
        except Exception:
            message = raw or str(e)
        return None, (e.code if 400 <= e.code < 600 else 502, {'error': 'aitunnel_error', 'message': message})
    except urllib.error.URLError as e:
        return None, (502, {'error': 'aitunnel_unreachable', 'message': str(e.reason)})


def _aitunnel_get(path, api_key, timeout=15):
    '''GET-запрос к AI Tunnel (баланс, опрос статуса видео) — тот же формат ошибок, что
    _aitunnel_request.'''
    req = urllib.request.Request(f'{AITUNNEL_BASE}{path}', method='GET', headers={'Authorization': f'Bearer {api_key}'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8')), None
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'ignore')
        try:
            parsed = json.loads(raw)
            message = (parsed.get('error') or {}).get('message') or raw
        except Exception:
            message = raw or str(e)
        return None, (e.code if 400 <= e.code < 600 else 502, {'error': 'aitunnel_error', 'message': message})
    except urllib.error.URLError as e:
        return None, (502, {'error': 'aitunnel_unreachable', 'message': str(e.reason)})


# Обычные текстовые файлы (.txt/.csv/.json/.md и т.п.) не нужно передавать модели особым
# multi-part форматом, как картинки/PDF/видео — модель прекрасно читает их как обычный текст.
# Поэтому при ЗАГРУЗКЕ такого файла (см. upload_attachment/file_complete) мы один раз декодируем
# его содержимое и сохраняем прямо в JSON вложения (поле 'text') — дальше _history_row_to_message
# просто вставляет этот текст в сообщение, без повторного похода в S3 при каждой отправке.
TEXT_FILE_EXTENSIONS = {
    'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml',
    'log', 'ini', 'conf', 'cfg', 'sql', 'srt', 'vtt', 'html', 'htm', 'py', 'js', 'ts',
}
# ~60 000 символов (примерно 15-20 тыс. токенов с запасом) — чтобы один вложенный файл не съедал
# весь контекст диалога и не раздувал стоимость запроса; при превышении текст обрезается с пометкой.
MAX_TEXT_ATTACHMENT_CHARS = 60000


def _looks_like_text_attachment(name, content_type):
    content_type = (content_type or '').lower()
    if content_type.startswith('text/'):
        return True
    if content_type in ('application/json', 'application/xml', 'application/x-yaml', 'application/sql'):
        return True
    ext = (name or '').rsplit('.', 1)[-1].lower() if '.' in (name or '') else ''
    return ext in TEXT_FILE_EXTENSIONS


def _extract_attachment_text(raw: bytes, name: str, content_type: str):
    '''Если вложение похоже на обычный текстовый файл — декодирует его как UTF-8 (с заменой
    "плохих" байтов, чтобы не падать на неожиданной кодировке) и возвращает готовый текст,
    обрезанный до MAX_TEXT_ATTACHMENT_CHARS. Иначе — None (файл не текстовый, не трогаем).'''
    if not _looks_like_text_attachment(name, content_type):
        return None
    try:
        text = raw[:MAX_TEXT_ATTACHMENT_CHARS * 4].decode('utf-8', errors='replace')
    except Exception:
        return None
    if len(text) > MAX_TEXT_ATTACHMENT_CHARS:
        text = text[:MAX_TEXT_ATTACHMENT_CHARS] + '\n…(файл обрезан, слишком длинный)'
    return text


def _history_row_to_message(role, text, attachments):
    '''Преобразует строку истории ai_messages в формат сообщения для AI Tunnel — multi-part
    content по типу вложения (см. docs/ai-tunnel-api-reference.md): image/* → image_url,
    application/pdf → file (AI Tunnel сам разбирает PDF через mistral-ocr/native, если модель не
    умеет файлы нативно — см. раздел "PDF"), video/* → video_url (только модели с "video" в
    modalities.input реально понимают контент, для остальных AI Tunnel вернёт понятную ошибку),
    обычный текстовый файл (заранее извлечённый в поле 'text' при загрузке, см.
    _extract_attachment_text) → вставляется прямо в текст запроса. Аудио НЕ поддерживается здесь:
    AI Tunnel требует для аудио сырой base64 в поле data (не публичный URL), а вложения уже
    загружены в S3 как файлы — это отдельная доработка. Текст ставится первым элементом, затем
    вложения — так рекомендует документация AI Tunnel.'''
    atts = [a for a in (attachments or []) if isinstance(a, dict)]
    if not atts:
        return {'role': role, 'content': text}
    parts = [{'type': 'text', 'text': text}] if text else []
    for a in atts:
        content_type = str(a.get('contentType', ''))
        if content_type.startswith('image/'):
            parts.append({'type': 'image_url', 'image_url': {'url': a['url']}})
        elif content_type == 'application/pdf':
            parts.append({'type': 'file', 'file': {'filename': a.get('name', 'document.pdf'), 'file_data': a['url']}})
        elif content_type.startswith('video/'):
            parts.append({'type': 'video_url', 'video_url': {'url': a['url']}})
        elif a.get('text'):
            parts.append({'type': 'text', 'text': f"Содержимое файла «{a.get('name', 'file.txt')}»:\n```\n{a['text']}\n```"})
        # Остальные типы (архивы, аудио и т.п.) прикреплены к сообщению и видны сотруднику по
        # ссылке в интерфейсе, но не прикладываются в запрос к модели — она не умеет их читать.
    return {'role': role, 'content': parts}


CODE_SYSTEM_PROMPT = (
    'Ты — опытный senior-разработчик, помогаешь команде с код-ревью, рефакторингом и поиском '
    'багов. Отвечай по существу, приводи исправленный код в блоках ```язык, кратко объясняй '
    'причину изменений. Если код корректен — так и скажи, не выдумывай проблемы.'
)


def _current_month():
    return datetime.now(timezone.utc).date().replace(day=1)


def _get_or_create_usage(cur, schema, user_id):
    month = _current_month()
    cur.execute(
        f"INSERT INTO {schema}.ai_usage (user_id, month) VALUES (%s, %s) "
        f"ON CONFLICT (user_id, month) DO NOTHING",
        (user_id, month)
    )
    cur.execute(
        f"SELECT spent_rub, limit_rub FROM {schema}.ai_usage WHERE user_id = %s AND month = %s",
        (user_id, month)
    )
    spent, limit_ = cur.fetchone()
    return float(spent), float(limit_)


def _chat_to_dict(row):
    cid, title, mode, model, pinned, created_at, updated_at = row
    return {
        'id': cid, 'title': title, 'mode': mode, 'model': model, 'pinned': pinned,
        'createdAt': created_at.isoformat() if created_at else None,
        'updatedAt': updated_at.isoformat() if updated_at else None,
    }


def _message_to_dict(row):
    mid, role, content, attachments, model, cost_rub, job_id, job_status, created_at, pinned = row
    return {
        'id': mid, 'role': role, 'content': content, 'attachments': attachments,
        'model': model, 'costRub': float(cost_rub) if cost_rub is not None else None,
        'jobId': job_id, 'jobStatus': job_status, 'createdAt': created_at.isoformat() if created_at else None,
        'pinned': bool(pinned),
    }


def handler(event: dict, context) -> dict:
    '''Раздел "AI" — чат сотрудников с ИИ-моделями через единый ключ AI Tunnel (aitunnel.ru,
    OpenAI-совместимый API, оплата в рублях). Действия:
    list_models (каталог моделей AI Tunnel, публичный, кешируется, group=chat|images|videos),
    list_chats/get_chat/rename_chat/set_pinned/delete_chat (CRUD диалогов пользователя),
    list_templates/create_template/update_template/delete_template (CRUD индивидуальных шаблонов
    промптов пользователя в ai_prompt_templates — полностью приватны, не общие для команды),
    upload_attachment (загрузка МАЛЕНЬКОГО файла/картинки в S3 одним запросом — base64 → CDN-URL,
    для обычных текстовых файлов .txt/.csv/.json/.md и т.п. сразу извлекает содержимое в поле
    'text' — см. _extract_attachment_text), file_init/file_chunk/file_complete/file_abort
    (загрузка БОЛЬШОГО файла кусочками — до MAX_UPLOAD_SIZE=200 МБ; одиночный запрос к функции
    ограничен ~3.5 МБ на уровне платформы, поэтому крупные файлы режутся на части на фронте —
    паттерн 1:1 с backend/patches/index.py), send_message (отправка текстового сообщения —
    принимает опционально attachments [{url,contentType,text?,...}] от upload_attachment/
    file_complete, картинки/PDF/видео/текстовые файлы автоматически прикладываются в формате,
    который понимает модель (см. _history_row_to_message); mode='code' у чата подставляет
    системный промпт для код-ревью; создаёт чат при отсутствии chat_id, проверяет месячный лимит
    сотрудника в ai_usage, шлёт запрос в AI Tunnel НЕ в потоковом режиме — эта облачная платформа
    не даёт проксировать Server-Sent Events через функцию дольше её таймаута, поэтому используется
    обычный request/response; для медленных моделей администратору может понадобиться поднять
    таймаут функции в Ядро → Функции), generate_image (POST /images/generations, синхронный —
    декодирует b64_json из ответа и заливает в S3), generate_video (POST /videos, АСИНХРОННЫЙ —
    создаёт сообщение с job_status='pending' и возвращает jobId, деньги списываются у AI Tunnel
    сразу при старте независимо от результата), check_video_job (опрос статуса задачи видео по
    messageId — при completed скачивает MP4 и заливает в S3, фронт должен поллить этот action раз
    в несколько секунд, пока jobStatus='pending'), set_message_pinned (закрепление/открепление
    ОДНОГО сообщения ассистента внутри диалога — для быстрого поиска полезного ответа в длинной
    переписке, отдельно от ai_chats.pinned, которое закрепляет весь чат в списке слева), usage
    (остаток месячного лимита текущего пользователя), balance (общий остаток аккаунта AI Tunnel —
    только для team_manage/admin). Доступ ко всем действиям — только с правом ai_access (отдельное
    привилегированное право, см. db_migrations V0076).'''
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
    if not me['can_access']:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or ('list_chats' if method == 'GET' else '')

    if action == 'list_models':
        group = (qs.get('group') or body.get('group') or 'chat').strip()
        if group not in ('chat', 'images', 'videos'):
            cur.close(); conn.close()
            return _bad('bad_group')
        cur.close(); conn.close()
        try:
            data = _fetch_models(group)
        except Exception as e:
            return _bad('aitunnel_unreachable', 502) if not isinstance(e, urllib.error.HTTPError) else _bad('aitunnel_error', 502)
        return _ok({'group': group, 'models': data})

    if action == 'usage':
        spent, limit_ = _get_or_create_usage(cur, schema, me['id'])
        cur.close(); conn.close()
        return _ok({'spentRub': spent, 'limitRub': limit_})

    if action == 'balance':
        if not me['can_manage_team']:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
        cur.close(); conn.close()
        if not api_key:
            return _bad('aitunnel_not_configured')
        req = urllib.request.Request(
            f'{AITUNNEL_BASE}/aitunnel/balance', method='GET',
            headers={'Authorization': f'Bearer {api_key}'},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            return _bad('aitunnel_error', e.code if 400 <= e.code < 600 else 502)
        except urllib.error.URLError:
            return _bad('aitunnel_unreachable', 502)
        return _ok(data)

    if action == 'list_chats':
        cur.execute(
            f"SELECT id, title, mode, model, pinned, created_at, updated_at FROM {schema}.ai_chats "
            f"WHERE user_id = %s ORDER BY pinned DESC, updated_at DESC",
            (me['id'],)
        )
        chats = [_chat_to_dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return _ok({'chats': chats})

    if action == 'get_chat':
        chat_id = qs.get('chatId') or body.get('chatId')
        if not chat_id:
            cur.close(); conn.close()
            return _bad('bad_chat_id')
        cur.execute(
            f"SELECT id, title, mode, model, pinned, created_at, updated_at FROM {schema}.ai_chats "
            f"WHERE id = %s AND user_id = %s",
            (chat_id, me['id'])
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return _bad('not_found', 404)
        cur.execute(
            f"SELECT id, role, content, attachments, model, cost_rub, job_id, job_status, created_at, pinned "
            f"FROM {schema}.ai_messages WHERE chat_id = %s ORDER BY id ASC",
            (chat_id,)
        )
        messages = [_message_to_dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return _ok({'chat': _chat_to_dict(row), 'messages': messages})

    if action == 'set_message_pinned':
        # Закрепление ОТВЕТА АССИСТЕНТА внутри диалога — быстрый способ найти полезный ответ в
        # длинной переписке (см. AI_MANAGER_PLAN.md). В отличие от ai_chats.pinned (закрепление
        # целого диалога в списке слева), это закрепление ОДНОГО СООБЩЕНИЯ внутри чата.
        message_id = body.get('messageId')
        pinned = bool(body.get('pinned'))
        if not message_id:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"UPDATE {schema}.ai_messages m SET pinned = %s "
            f"FROM {schema}.ai_chats c WHERE m.chat_id = c.id AND m.id = %s AND c.user_id = %s",
            (pinned, message_id, me['id'])
        )
        found = cur.rowcount > 0
        cur.close(); conn.close()
        return _ok({'ok': True}) if found else _bad('not_found', 404)

    if action == 'rename_chat':
        chat_id = body.get('chatId')
        title = (body.get('title') or '').strip()
        if not chat_id or not title:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"UPDATE {schema}.ai_chats SET title = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
            (title[:200], chat_id, me['id'])
        )
        found = cur.rowcount > 0
        cur.close(); conn.close()
        return _ok({'ok': True}) if found else _bad('not_found', 404)

    if action == 'set_pinned':
        chat_id = body.get('chatId')
        pinned = bool(body.get('pinned'))
        if not chat_id:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"UPDATE {schema}.ai_chats SET pinned = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
            (pinned, chat_id, me['id'])
        )
        found = cur.rowcount > 0
        cur.close(); conn.close()
        return _ok({'ok': True}) if found else _bad('not_found', 404)

    if action == 'delete_chat':
        chat_id = body.get('chatId')
        if not chat_id:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(f"SELECT id FROM {schema}.ai_chats WHERE id = %s AND user_id = %s", (chat_id, me['id']))
        if not cur.fetchone():
            cur.close(); conn.close()
            return _bad('not_found', 404)
        cur.execute(f"DELETE FROM {schema}.ai_messages WHERE chat_id = %s", (chat_id,))
        cur.execute(f"DELETE FROM {schema}.ai_chats WHERE id = %s", (chat_id,))
        cur.close(); conn.close()
        return _ok({'ok': True})

    if action == 'list_templates':
        # Шаблоны промптов — ИНДИВИДУАЛЬНЫ для каждого пользователя (см. AI_MANAGER_PLAN.md):
        # редактируются/добавляются/удаляются прямо из интерфейса, без изменения кода. При первом
        # обращении у нового сотрудника с ai_access список пуст — это нормально, фронт покажет
        # пустое состояние с предложением создать первый шаблон (шаблоны НЕ копируются
        # автоматически от других пользователей — принципиально приватны).
        cur.execute(
            f"SELECT id, icon, category, title, description, prompt, recommended_mode, sort_order "
            f"FROM {schema}.ai_prompt_templates WHERE user_id = %s ORDER BY sort_order ASC, id ASC",
            (me['id'],)
        )
        templates = [{
            'id': r[0], 'icon': r[1], 'category': r[2], 'title': r[3], 'description': r[4],
            'prompt': r[5], 'recommendedMode': r[6],
        } for r in cur.fetchall()]
        cur.close(); conn.close()
        return _ok({'templates': templates})

    if action == 'create_template':
        title = (body.get('title') or '').strip()
        prompt = (body.get('prompt') or '').strip()
        if not title or not prompt:
            cur.close(); conn.close()
            return _bad('bad_request')
        category = (body.get('category') or 'Мои шаблоны').strip()[:100] or 'Мои шаблоны'
        description = (body.get('description') or '').strip()[:300]
        icon = (body.get('icon') or 'FileText').strip()[:50] or 'FileText'
        recommended_mode = body.get('recommendedMode') if body.get('recommendedMode') in ('chat', 'code') else None
        cur.execute(
            f"SELECT COALESCE(MAX(sort_order), -1) + 1 FROM {schema}.ai_prompt_templates WHERE user_id = %s",
            (me['id'],)
        )
        next_order = cur.fetchone()[0]
        cur.execute(
            f"INSERT INTO {schema}.ai_prompt_templates (user_id, icon, category, title, description, prompt, recommended_mode, sort_order) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (me['id'], icon, category, title[:200], description, prompt, recommended_mode, next_order)
        )
        new_id = cur.fetchone()[0]
        cur.close(); conn.close()
        return _ok({'id': new_id})

    if action == 'update_template':
        template_id = body.get('id')
        title = (body.get('title') or '').strip()
        prompt = (body.get('prompt') or '').strip()
        if not template_id or not title or not prompt:
            cur.close(); conn.close()
            return _bad('bad_request')
        category = (body.get('category') or 'Мои шаблоны').strip()[:100] or 'Мои шаблоны'
        description = (body.get('description') or '').strip()[:300]
        icon = (body.get('icon') or 'FileText').strip()[:50] or 'FileText'
        recommended_mode = body.get('recommendedMode') if body.get('recommendedMode') in ('chat', 'code') else None
        cur.execute(
            f"UPDATE {schema}.ai_prompt_templates SET icon = %s, category = %s, title = %s, description = %s, "
            f"prompt = %s, recommended_mode = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
            (icon, category, title[:200], description, prompt, recommended_mode, template_id, me['id'])
        )
        found = cur.rowcount > 0
        cur.close(); conn.close()
        return _ok({'ok': True}) if found else _bad('not_found', 404)

    if action == 'delete_template':
        template_id = body.get('id')
        if not template_id:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"DELETE FROM {schema}.ai_prompt_templates WHERE id = %s AND user_id = %s",
            (template_id, me['id'])
        )
        found = cur.rowcount > 0
        cur.close(); conn.close()
        return _ok({'ok': True}) if found else _bad('not_found', 404)

    if action == 'upload_attachment':
        data_b64 = body.get('data')
        if not data_b64:
            cur.close(); conn.close()
            return _bad('no_data')
        try:
            raw = _decode_data(data_b64)
        except Exception:
            cur.close(); conn.close()
            return _bad('bad_data')
        if len(raw) > MAX_UPLOAD_SIZE:
            cur.close(); conn.close()
            return _bad('file_too_large', 413)
        name = (body.get('name') or 'file').strip() or 'file'
        ext = (body.get('ext') or (name.rsplit('.', 1)[-1] if '.' in name else '')).lstrip('.').lower() or 'bin'
        content_type = body.get('contentType') or 'application/octet-stream'
        url = _upload_bytes(raw, ext, content_type, 'uploads')
        attachment_text = _extract_attachment_text(raw, name, content_type)
        cur.close(); conn.close()
        attachment = {'id': uuid.uuid4().hex, 'name': name, 'url': url, 'size': len(raw), 'contentType': content_type}
        if attachment_text is not None:
            attachment['text'] = attachment_text
        return _ok({'attachment': attachment})

    # --- Загрузка больших файлов по частям (до MAX_UPLOAD_SIZE = 200 МБ) — тот же паттерн, что
    # file_init/file_chunk/file_complete/file_abort в backend/patches/index.py. upload_attachment
    # выше остаётся для маленьких файлов (картинки/короткие документы) одним запросом — фронт сам
    # выбирает путь по размеру файла (см. src/pages/index/aiUploadApi.ts).
    if action == 'file_init':
        name = (body.get('name') or 'file').strip() or 'file'
        content_type = body.get('contentType') or 'application/octet-stream'
        file_id = uuid.uuid4().hex
        meta = {'name': name, 'contentType': content_type}
        _s3_client().put_object(Bucket=os.environ.get('S3_BUCKET', 'files'), Key=f"ai/_chunks/{file_id}/meta.json", Body=json.dumps(meta).encode())
        cur.close(); conn.close()
        return _ok({'fileId': file_id})

    if action == 'file_chunk':
        file_id = body.get('fileId')
        part_number = body.get('partNumber')
        data_b64 = body.get('data')
        if not file_id or not re.match(r'^[a-f0-9]{32}$', file_id) or part_number is None or data_b64 is None:
            cur.close(); conn.close()
            return _bad('bad_request')
        try:
            raw = _decode_data(data_b64)
        except Exception:
            cur.close(); conn.close()
            return _bad('bad_data')
        chunk_key = f"ai/_chunks/{file_id}/{int(part_number):06d}"
        _s3_client().put_object(Bucket=os.environ.get('S3_BUCKET', 'files'), Key=chunk_key, Body=raw)
        cur.close(); conn.close()
        return _ok({'ok': True})

    if action == 'file_complete':
        file_id = body.get('fileId')
        total_parts = body.get('totalParts')
        if not file_id or not re.match(r'^[a-f0-9]{32}$', file_id) or not total_parts:
            cur.close(); conn.close()
            return _bad('bad_request')
        s3 = _s3_client()
        bucket = os.environ.get('S3_BUCKET', 'files')
        prefix = f"ai/_chunks/{file_id}/"
        try:
            meta_obj = s3.get_object(Bucket=bucket, Key=f"{prefix}meta.json")
            meta = json.loads(meta_obj['Body'].read())
        except Exception:
            cur.close(); conn.close()
            return _bad('not_found', 404)

        buf = io.BytesIO()
        chunk_keys = []
        for i in range(int(total_parts)):
            chunk_key = f"{prefix}{i:06d}"
            try:
                obj = s3.get_object(Bucket=bucket, Key=chunk_key)
            except Exception:
                cur.close(); conn.close()
                return _bad('missing_chunk')
            buf.write(obj['Body'].read())
            chunk_keys.append(chunk_key)
            if buf.tell() > MAX_UPLOAD_SIZE:
                cur.close(); conn.close()
                return _bad('file_too_large', 413)
        raw = buf.getvalue()

        name = meta['name']
        content_type = meta['contentType']
        ext = (name.rsplit('.', 1)[-1] if '.' in name else '').lower() or 'bin'
        url = _upload_bytes(raw, ext, content_type, 'uploads')
        attachment_text = _extract_attachment_text(raw, name, content_type)

        for key in chunk_keys:
            try:
                s3.delete_object(Bucket=bucket, Key=key)
            except Exception:
                pass
        try:
            s3.delete_object(Bucket=bucket, Key=f"{prefix}meta.json")
        except Exception:
            pass

        cur.close(); conn.close()
        attachment = {'id': uuid.uuid4().hex, 'name': name, 'url': url, 'size': len(raw), 'contentType': content_type}
        if attachment_text is not None:
            attachment['text'] = attachment_text
        return _ok({'attachment': attachment})

    if action == 'file_abort':
        file_id = body.get('fileId')
        total_parts = body.get('totalParts') or 0
        if file_id and re.match(r'^[a-f0-9]{32}$', file_id):
            s3 = _s3_client()
            bucket = os.environ.get('S3_BUCKET', 'files')
            prefix = f"ai/_chunks/{file_id}/"
            for i in range(int(total_parts) + 1):
                try:
                    s3.delete_object(Bucket=bucket, Key=f"{prefix}{i:06d}")
                except Exception:
                    pass
            try:
                s3.delete_object(Bucket=bucket, Key=f"{prefix}meta.json")
            except Exception:
                pass
        cur.close(); conn.close()
        return _ok({'ok': True})

    if action == 'send_message':
        model = (body.get('model') or '').strip()
        content = (body.get('content') or '').strip()
        chat_id = body.get('chatId')
        mode = body.get('mode') if body.get('mode') in ('chat', 'code') else 'chat'
        attachments = body.get('attachments') or []
        if not model or not content:
            cur.close(); conn.close()
            return _bad('bad_request')

        spent, limit_ = _get_or_create_usage(cur, schema, me['id'])
        if spent >= limit_:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'limit_exceeded', 'spentRub': spent, 'limitRub': limit_})}

        api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
        if not api_key:
            cur.close(); conn.close()
            return _bad('aitunnel_not_configured')

        if chat_id:
            cur.execute(f"SELECT id, mode FROM {schema}.ai_chats WHERE id = %s AND user_id = %s", (chat_id, me['id']))
            row = cur.fetchone()
            if not row:
                cur.close(); conn.close()
                return _bad('not_found', 404)
            mode = row[1] or mode
        else:
            title = content[:60] + ('…' if len(content) > 60 else '')
            cur.execute(
                f"INSERT INTO {schema}.ai_chats (user_id, title, mode, model) VALUES (%s, %s, %s, %s) RETURNING id",
                (me['id'], title, mode, model)
            )
            chat_id = cur.fetchone()[0]

        cur.execute(
            f"INSERT INTO {schema}.ai_messages (chat_id, role, content, attachments) VALUES (%s, 'user', %s, %s) RETURNING id, created_at",
            (chat_id, content, json.dumps(attachments) if attachments else None)
        )
        user_msg_id, user_created_at = cur.fetchone()

        cur.execute(
            f"SELECT role, content, attachments FROM {schema}.ai_messages WHERE chat_id = %s ORDER BY id DESC LIMIT %s",
            (chat_id, MAX_HISTORY_MESSAGES)
        )
        history = list(reversed(cur.fetchall()))
        messages = [_history_row_to_message(role, text, atts) for role, text, atts in history]
        if mode == 'code':
            messages = [{'role': 'system', 'content': CODE_SYSTEM_PROMPT}] + messages

        data, err = _aitunnel_request('/chat/completions', api_key, {
            'model': model, 'messages': messages, 'max_tokens': 4000,
        })
        if err:
            cur.close(); conn.close()
            status, payload = err
            payload['userMessageId'] = user_msg_id
            payload['chatId'] = chat_id
            return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps(payload)}

        choice = (data.get('choices') or [{}])[0]
        answer = ((choice.get('message') or {}).get('content') or '').strip()
        used_model = data.get('model') or model
        usage = data.get('usage') or {}
        cost_rub = usage.get('cost_rub') or 0

        cur.execute(
            f"INSERT INTO {schema}.ai_messages (chat_id, role, content, model, cost_rub) "
            f"VALUES (%s, 'assistant', %s, %s, %s) RETURNING id, created_at",
            (chat_id, answer, used_model, cost_rub)
        )
        assistant_msg_id, assistant_created_at = cur.fetchone()

        cur.execute(
            f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
            (cost_rub, me['id'], _current_month())
        )
        cur.execute(f"UPDATE {schema}.ai_chats SET updated_at = NOW() WHERE id = %s", (chat_id,))

        cur.close(); conn.close()
        return _ok({
            'chatId': chat_id,
            'userMessage': {'id': user_msg_id, 'role': 'user', 'content': content, 'attachments': attachments or None, 'createdAt': user_created_at.isoformat()},
            'assistantMessage': {
                'id': assistant_msg_id, 'role': 'assistant', 'content': answer, 'model': used_model,
                'costRub': float(cost_rub), 'createdAt': assistant_created_at.isoformat(),
            },
            'usage': {'spentRub': spent + float(cost_rub), 'limitRub': limit_},
        })

    if action == 'generate_image':
        model = (body.get('model') or '').strip()
        prompt = (body.get('prompt') or '').strip()
        chat_id = body.get('chatId')
        aspect_ratio = body.get('aspectRatio')
        resolution = body.get('resolution')
        if not model or not prompt:
            cur.close(); conn.close()
            return _bad('bad_request')

        spent, limit_ = _get_or_create_usage(cur, schema, me['id'])
        if spent >= limit_:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'limit_exceeded', 'spentRub': spent, 'limitRub': limit_})}

        api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
        if not api_key:
            cur.close(); conn.close()
            return _bad('aitunnel_not_configured')

        if chat_id:
            cur.execute(f"SELECT id FROM {schema}.ai_chats WHERE id = %s AND user_id = %s", (chat_id, me['id']))
            if not cur.fetchone():
                cur.close(); conn.close()
                return _bad('not_found', 404)
        else:
            title = 'Изображение: ' + (prompt[:45] + ('…' if len(prompt) > 45 else ''))
            cur.execute(
                f"INSERT INTO {schema}.ai_chats (user_id, title, mode, model) VALUES (%s, %s, 'image', %s) RETURNING id",
                (me['id'], title, model)
            )
            chat_id = cur.fetchone()[0]

        cur.execute(
            f"INSERT INTO {schema}.ai_messages (chat_id, role, content) VALUES (%s, 'user', %s) RETURNING id, created_at",
            (chat_id, prompt)
        )
        user_msg_id, user_created_at = cur.fetchone()

        payload = {'model': model, 'prompt': prompt}
        if aspect_ratio:
            payload['aspect_ratio'] = aspect_ratio
        if resolution:
            payload['resolution'] = resolution
        data, err = _aitunnel_request('/images/generations', api_key, payload, timeout=90)
        if err:
            cur.close(); conn.close()
            status, payload_err = err
            payload_err['userMessageId'] = user_msg_id
            payload_err['chatId'] = chat_id
            return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps(payload_err)}

        items = data.get('data') or []
        used_model = data.get('model') or model
        usage = data.get('usage') or {}
        cost_rub = usage.get('cost_rub') or 0
        attachments = []
        for item in items:
            b64 = item.get('b64_json')
            if not b64:
                continue
            media_type = item.get('media_type') or 'image/png'
            ext = media_type.split('/')[-1] or 'png'
            raw = base64.b64decode(b64)
            url = _upload_bytes(raw, ext, media_type, 'images')
            attachments.append({'id': uuid.uuid4().hex, 'name': f'image.{ext}', 'url': url, 'size': len(raw), 'contentType': media_type})

        cur.execute(
            f"INSERT INTO {schema}.ai_messages (chat_id, role, content, attachments, model, cost_rub) "
            f"VALUES (%s, 'assistant', %s, %s, %s, %s) RETURNING id, created_at",
            (chat_id, '', json.dumps(attachments) if attachments else None, used_model, cost_rub)
        )
        assistant_msg_id, assistant_created_at = cur.fetchone()

        cur.execute(
            f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
            (cost_rub, me['id'], _current_month())
        )
        cur.execute(f"UPDATE {schema}.ai_chats SET updated_at = NOW() WHERE id = %s", (chat_id,))

        cur.close(); conn.close()
        return _ok({
            'chatId': chat_id,
            'userMessage': {'id': user_msg_id, 'role': 'user', 'content': prompt, 'createdAt': user_created_at.isoformat()},
            'assistantMessage': {
                'id': assistant_msg_id, 'role': 'assistant', 'content': '', 'attachments': attachments,
                'model': used_model, 'costRub': float(cost_rub), 'createdAt': assistant_created_at.isoformat(),
            },
            'usage': {'spentRub': spent + float(cost_rub), 'limitRub': limit_},
        })

    if action == 'generate_video':
        model = (body.get('model') or '').strip()
        prompt = (body.get('prompt') or '').strip()
        chat_id = body.get('chatId')
        duration = body.get('duration')
        size = body.get('size')
        if not model or not prompt:
            cur.close(); conn.close()
            return _bad('bad_request')

        spent, limit_ = _get_or_create_usage(cur, schema, me['id'])
        if spent >= limit_:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'limit_exceeded', 'spentRub': spent, 'limitRub': limit_})}

        api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
        if not api_key:
            cur.close(); conn.close()
            return _bad('aitunnel_not_configured')

        if chat_id:
            cur.execute(f"SELECT id FROM {schema}.ai_chats WHERE id = %s AND user_id = %s", (chat_id, me['id']))
            if not cur.fetchone():
                cur.close(); conn.close()
                return _bad('not_found', 404)
        else:
            title = 'Видео: ' + (prompt[:45] + ('…' if len(prompt) > 45 else ''))
            cur.execute(
                f"INSERT INTO {schema}.ai_chats (user_id, title, mode, model) VALUES (%s, %s, 'video', %s) RETURNING id",
                (me['id'], title, model)
            )
            chat_id = cur.fetchone()[0]

        cur.execute(
            f"INSERT INTO {schema}.ai_messages (chat_id, role, content) VALUES (%s, 'user', %s) RETURNING id, created_at",
            (chat_id, prompt)
        )
        user_msg_id, user_created_at = cur.fetchone()

        payload = {'model': model, 'prompt': prompt}
        if duration:
            payload['duration'] = duration
        if size:
            payload['size'] = size
        # Задача отправляется через _aitunnel_request (POST), но это НЕ chat/completions — путь
        # передаётся явно. AI Tunnel сразу начисляет резерв стоимости при старте (см.
        # docs/ai-tunnel-api-reference.md, "Отмены задач нет") — job_status='pending' до готовности.
        data, err = _aitunnel_request('/videos', api_key, payload, timeout=30)
        if err:
            cur.close(); conn.close()
            status, payload_err = err
            payload_err['userMessageId'] = user_msg_id
            payload_err['chatId'] = chat_id
            return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps(payload_err)}

        job_id = data.get('id')
        cur.execute(
            f"INSERT INTO {schema}.ai_messages (chat_id, role, content, model, job_id, job_status) "
            f"VALUES (%s, 'assistant', '', %s, %s, 'pending') RETURNING id, created_at",
            (chat_id, model, job_id)
        )
        assistant_msg_id, assistant_created_at = cur.fetchone()
        cur.execute(f"UPDATE {schema}.ai_chats SET updated_at = NOW() WHERE id = %s", (chat_id,))

        cur.close(); conn.close()
        return _ok({
            'chatId': chat_id,
            'userMessage': {'id': user_msg_id, 'role': 'user', 'content': prompt, 'createdAt': user_created_at.isoformat()},
            'assistantMessage': {
                'id': assistant_msg_id, 'role': 'assistant', 'content': '', 'model': model,
                'jobId': job_id, 'jobStatus': 'pending', 'createdAt': assistant_created_at.isoformat(),
            },
        })

    if action == 'check_video_job':
        message_id = qs.get('messageId') or body.get('messageId')
        if not message_id:
            cur.close(); conn.close()
            return _bad('bad_request')
        cur.execute(
            f"SELECT m.id, m.chat_id, m.job_id, m.job_status FROM {schema}.ai_messages m "
            f"JOIN {schema}.ai_chats c ON c.id = m.chat_id WHERE m.id = %s AND c.user_id = %s",
            (message_id, me['id'])
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return _bad('not_found', 404)
        msg_id, chat_id, job_id, job_status = row
        if job_status != 'pending' or not job_id:
            cur.close(); conn.close()
            return _ok({'jobStatus': job_status})

        api_key = _service_key(cur, schema, 'AITUNNEL_API_KEY')
        if not api_key:
            cur.close(); conn.close()
            return _bad('aitunnel_not_configured')

        data, err = _aitunnel_get(f'/videos/{job_id}', api_key)
        if err:
            cur.close(); conn.close()
            status, payload_err = err
            return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps(payload_err)}

        status_val = data.get('status')
        if status_val == 'completed':
            video_req = urllib.request.Request(
                f'{AITUNNEL_BASE}/videos/{job_id}/content?index=0', method='GET',
                headers={'Authorization': f'Bearer {api_key}'},
            )
            try:
                with urllib.request.urlopen(video_req, timeout=60) as resp:
                    raw = resp.read()
            except (urllib.error.HTTPError, urllib.error.URLError):
                cur.close(); conn.close()
                return _bad('aitunnel_unreachable', 502)
            url = _upload_bytes(raw, 'mp4', 'video/mp4', 'videos')
            attachment = {'id': uuid.uuid4().hex, 'name': 'video.mp4', 'url': url, 'size': len(raw), 'contentType': 'video/mp4'}
            usage = data.get('usage') or {}
            cost_rub = usage.get('cost_rub') or 0
            cur.execute(
                f"UPDATE {schema}.ai_messages SET job_status = 'done', attachments = %s, cost_rub = %s WHERE id = %s",
                (json.dumps([attachment]), cost_rub, msg_id)
            )
            if cost_rub:
                cur.execute(
                    f"UPDATE {schema}.ai_usage SET spent_rub = spent_rub + %s WHERE user_id = %s AND month = %s",
                    (cost_rub, me['id'], _current_month())
                )
            cur.close(); conn.close()
            return _ok({'jobStatus': 'done', 'attachments': [attachment], 'costRub': float(cost_rub)})
        elif status_val == 'failed':
            cur.execute(f"UPDATE {schema}.ai_messages SET job_status = 'failed' WHERE id = %s", (msg_id,))
            cur.close(); conn.close()
            return _ok({'jobStatus': 'failed'})
        else:
            cur.close(); conn.close()
            return _ok({'jobStatus': 'pending'})

    cur.close(); conn.close()
    return _bad('unknown_action')