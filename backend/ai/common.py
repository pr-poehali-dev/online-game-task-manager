'''Общая инфраструктура раздела "AI": ответы/CORS, подключение к БД, права доступа, S3,
клиент AI Tunnel, разбор вложений, лимиты трат. Вынесено из index.py без изменений логики —
handler в index.py остался только маршрутизатором, сами действия лежат в chats.py, files.py и
generate.py. Подробное описание раздела: docs/ai-section-overview.md.'''

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


def _extract_key(url):
    '''Восстанавливает ключ файла в S3 из его публичной CDN-ссылки — обратная операция к
    _public_url, нужна при удалении диалога, чтобы почистить реально загруженные файлы вложений
    (картинки/PDF/видео/документы, сгенерированные изображения и видео), а не только запись в БД
    (тот же паттерн, что _extract_key в backend/admin/index.py).'''
    if not url:
        return None
    public_url = os.environ.get('S3_PUBLIC_URL', '').rstrip('/')
    if public_url and url.startswith(public_url + '/'):
        return url[len(public_url) + 1:]
    marker = '/bucket/'
    if marker in url:
        return url.split(marker, 1)[1]
    return None


def _delete_chat_attachments(cur, schema, chat_id):
    '''Удаляет из S3 все файлы, прикреплённые к сообщениям диалога (загруженные пользователем
    вложения и сгенерированные ассистентом изображения/видео), перед удалением самих сообщений из
    БД. Ошибки удаления отдельных файлов не прерывают процесс — лучше оставить "осиротевший" файл
    в хранилище, чем не дать пользователю удалить диалог.'''
    cur.execute(f"SELECT attachments FROM {schema}.ai_messages WHERE chat_id = %s AND attachments IS NOT NULL", (chat_id,))
    bucket = os.environ.get('S3_BUCKET', 'files')
    s3 = None
    for (attachments,) in cur.fetchall():
        for a in (attachments or []):
            key = _extract_key(a.get('url')) if isinstance(a, dict) else None
            if not key:
                continue
            if s3 is None:
                s3 = _s3_client()
            try:
                s3.delete_object(Bucket=bucket, Key=key)
            except Exception:
                pass


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


# Сколько раз повторяем запрос к AI Tunnel при ошибке 429 (rate limit — модель перегружена
# чужими запросами) и сколько ждём между попытками. Это самая частая САМОУСТРАНЯЮЩАЯСЯ ошибка:
# через секунду-другую тот же самый запрос обычно проходит, а сотрудник иначе видит ошибку и
# отправляет всё заново вручную. Пауза намеренно короткая — суммарно не больше ~3 секунд сверху,
# чтобы не упереться в таймаут самой функции (см. docs/ai-section-overview.md, "Таймаут функции").
RATE_LIMIT_RETRIES = 2
RATE_LIMIT_PAUSE_SEC = 1.5


def _aitunnel_request(path, api_key, payload, timeout=45):
    '''POST-запрос к AI Tunnel (chat/completions и т.д.) с ключом проекта. Возвращает (data, None)
    при успехе либо (None, (statusCode, error_payload)) при ошибке — единый формат для отдачи
    клиенту без изменений (AI Tunnel уже отдаёт понятный {"error": {"code","message"}}).
    При 429 (модель перегружена) запрос автоматически повторяется до RATE_LIMIT_RETRIES раз с
    паузой RATE_LIMIT_PAUSE_SEC — деньги за отклонённый по rate limit запрос не списываются, так
    что повтор безопасен и не приводит к двойной оплате.'''
    body = json.dumps(payload).encode('utf-8')
    last_err = None
    for attempt in range(RATE_LIMIT_RETRIES + 1):
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
            last_err = (e.code if 400 <= e.code < 600 else 502, {'error': 'aitunnel_error', 'message': message})
            if e.code == 429 and attempt < RATE_LIMIT_RETRIES:
                time.sleep(RATE_LIMIT_PAUSE_SEC)
                continue
            return None, last_err
        except urllib.error.URLError as e:
            return None, (502, {'error': 'aitunnel_unreachable', 'message': str(e.reason)})
    return None, last_err


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
    # Простой текст и разметка
    'txt', 'md', 'markdown', 'rst', 'adoc', 'tex',
    # Данные/конфиги
    'csv', 'tsv', 'json', 'jsonc', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env',
    'properties', 'log', 'sql',
    # Веб
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'svg',
    # Языки программирования и скрипты
    'py', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'php', 'phtml', 'java', 'kt', 'kts', 'c', 'h',
    'cpp', 'cc', 'hpp', 'cs', 'go', 'rs', 'rb', 'swift', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
    'pl', 'lua', 'r', 'dart', 'scala', 'groovy', 'vue', 'svelte',
    # Разное текстовое
    'srt', 'vtt', 'diff', 'patch', 'gitignore',
}
# Файлы без расширения, где "расширением" по сути является само имя (Dockerfile, Makefile) —
# проверяются отдельно по полному имени в нижнем регистре (см. _looks_like_text_attachment).
TEXT_FILENAMES_WITHOUT_EXT = {'dockerfile', 'makefile', 'jenkinsfile', 'procfile'}
# ~60 000 символов (примерно 15-20 тыс. токенов с запасом) — чтобы один вложенный файл не съедал
# весь контекст диалога и не раздувал стоимость запроса; при превышении текст обрезается с пометкой.
MAX_TEXT_ATTACHMENT_CHARS = 60000


def _looks_like_text_attachment(name, content_type):
    content_type = (content_type or '').lower()
    if content_type.startswith('text/'):
        return True
    if content_type in ('application/json', 'application/xml', 'application/x-yaml', 'application/sql'):
        return True
    base_name = (name or '').lower()
    if base_name in TEXT_FILENAMES_WITHOUT_EXT:
        return True
    ext = base_name.rsplit('.', 1)[-1] if '.' in base_name else ''
    return ext in TEXT_FILE_EXTENSIONS


def _extract_attachment_text(raw: bytes, name: str, content_type: str):
    '''Если вложение похоже на обычный текстовый файл — декодирует его как UTF-8 (с заменой
    "плохих" байтов, чтобы не падать на неожиданной кодировке) и возвращает готовый текст,
    обрезанный до MAX_TEXT_ATTACHMENT_CHARS. Иначе — None (файл не текстовый, не трогаем).
    ВАЖНО: нулевой байт (\\x00) — валидный UTF-8, decode() его пропускает, но PostgreSQL не умеет
    хранить \\u0000 ни в text, ни в jsonb (падает с "unsupported Unicode escape sequence",
    SQLSTATE 22P05) — поэтому вырезаем его отдельно. Встречается в файлах, которые технически не
    полностью текстовые (повреждённые/бинарные файлы с "текстовым" расширением, экзотические
    кодировки) — без этой чистки INSERT сообщения падал и весь чат переставал отвечать.'''
    if not _looks_like_text_attachment(name, content_type):
        return None
    try:
        text = raw[:MAX_TEXT_ATTACHMENT_CHARS * 4].decode('utf-8', errors='replace')
    except Exception:
        return None
    text = text.replace('\x00', '')
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


# Модель для автоназвания диалогов (action=generate_title) — намеренно самая дешёвая и быстрая:
# задача примитивная, качество топовой модели тут не нужно, а платить за каждый новый чат по
# полной цене незачем. 'auto' не подходит — AI Tunnel может подобрать дорогую модель.
TITLE_MODEL = 'gpt-5-nano'
TITLE_SYSTEM_PROMPT = (
    'Придумай короткое название для диалога по его началу: 2-5 слов, на русском языке, без '
    'кавычек, без точки в конце, по сути вопроса. Ответь ТОЛЬКО названием, без пояснений.'
)

CODE_SYSTEM_PROMPT = (
    'Ты — опытный senior-разработчик, помогаешь команде с код-ревью, рефакторингом и поиском '
    'багов. Отвечай по существу, приводи исправленный код в блоках ```язык, кратко объясняй '
    'причину изменений. Если код корректен — так и скажи, не выдумывай проблемы.\n'
    # Интерфейс умеет показывать правки наглядным сравнением «было/стало» (см. AiCodeDiff.tsx),
    # но для этого исправленный код должен быть ЦЕЛЫМ фрагментом на том же языке, а не набором
    # обрывков с многоточиями — иначе сравнивать нечего и кнопка сравнения не появится.
    'Когда исправляешь присланный код, приводи ИСПРАВЛЕННЫЙ ФРАГМЕНТ ЦЕЛИКОМ в одном блоке '
    '```язык — с теми же неизменёнными строками, что были в оригинале, без пропусков вида '
    '"# ... остальное без изменений". Это нужно, чтобы интерфейс мог показать построчное '
    'сравнение с исходником. Если правка касается только небольшого участка большого файла, '
    'приводи этот участок целиком. Не оборачивай ответ целиком в один блок кода — пояснения '
    'давай обычным текстом.'
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


# --- Реестр файлов сотрудника (ai_files) и лимит на их количество -----------------------------
# Файлы раздела "AI" физически лежат в S3, а раньше их единственным следом в БД было поле
# attachments у сообщения (JSONB). Из-за этого нельзя было ни посчитать файлы сотрудника, ни
# показать ему их общим списком, ни убрать один файл, не трогая переписку. Теперь КАЖДАЯ загрузка
# и каждый сгенерированный файл регистрируются строкой в ai_files (см. db_migrations V0082) —
# это источник истины и для лимита, и для раздела "Мои файлы" в интерфейсе.
#
# В лимит считаются ТОЛЬКО файлы, которые сотрудник загрузил сам (kind in upload/template):
# сгенерированные моделью изображения/видео/документы уже ограничены месячным лимитом трат
# (ai_usage), второй раз ограничивать их количеством смысла нет.
COUNTED_FILE_KINDS = ('upload', 'template')


MB = 1024 * 1024


def _file_limits(cur, schema, user_id):
    '''Два личных лимита сотрудника на файлы раздела "AI" (оба настраиваются администратором в
    разделе "Команда"): количество файлов (users.ai_file_limit) и суммарный объём в мегабайтах
    (users.ai_size_limit_mb, см. db_migrations V0083). Второй нужен потому, что количество плохо
    отражает нагрузку на хранилище: десяток видео весит больше сотен документов. Любой из лимитов,
    равный 0, полностью запрещает загрузку.'''
    cur.execute(f"SELECT ai_file_limit, ai_size_limit_mb FROM {schema}.users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        return 50, 1024
    count_limit = int(row[0]) if row[0] is not None else 50
    size_limit_mb = int(row[1]) if row[1] is not None else 1024
    return count_limit, size_limit_mb


def _file_limit(cur, schema, user_id):
    return _file_limits(cur, schema, user_id)[0]


def _file_usage(cur, schema, user_id):
    '''Сколько файлов и байт сотрудник занимает СЕЙЧАС — считаются только те типы, что расходуют
    лимит (загрузки и бланки, см. COUNTED_FILE_KINDS).'''
    cur.execute(
        f"SELECT COUNT(*), COALESCE(SUM(size), 0) FROM {schema}.ai_files WHERE user_id = %s AND kind IN %s",
        (user_id, COUNTED_FILE_KINDS)
    )
    count, total = cur.fetchone()
    return int(count), int(total or 0)


def _file_count(cur, schema, user_id):
    return _file_usage(cur, schema, user_id)[0]


def _check_file_limit(cur, schema, user_id, incoming_size=0):
    '''Проверяет ОБА лимита перед загрузкой. Возвращает (used, limit, None), если место есть, либо
    готовый ответ 403 с понятным кодом (file_limit_exceeded — исчерпано количество,
    size_limit_exceeded — исчерпан объём); фронт покажет предложение очистить "Мои файлы".
    incoming_size — размер загружаемого файла в байтах, если он уже известен: тогда отказ приходит
    ДО того, как файл окажется в хранилище, а не после.'''
    count_limit, size_limit_mb = _file_limits(cur, schema, user_id)
    used, used_bytes = _file_usage(cur, schema, user_id)
    size_limit_bytes = size_limit_mb * MB
    if used >= count_limit:
        return used, count_limit, {
            'statusCode': 403,
            'headers': _cors_headers(),
            'body': json.dumps({'error': 'file_limit_exceeded', 'usedFiles': used, 'limitFiles': count_limit}),
        }
    if used_bytes + max(0, int(incoming_size or 0)) > size_limit_bytes:
        return used, count_limit, {
            'statusCode': 403,
            'headers': _cors_headers(),
            'body': json.dumps({
                'error': 'size_limit_exceeded',
                'usedMb': round(used_bytes / MB, 1),
                'limitMb': size_limit_mb,
            }),
        }
    return used, count_limit, None


def _register_file(cur, schema, user_id, attachment, kind='upload', chat_id=None, project_id=None):
    '''Записывает файл в персональный реестр сотрудника. Ошибка записи НЕ должна ронять саму
    загрузку — файл уже в S3 и сотруднику важнее получить его в чат, чем строгий учёт.'''
    key = _extract_key(attachment.get('url'))
    if not key:
        return
    try:
        cur.execute(
            f"INSERT INTO {schema}.ai_files (user_id, file_key, name, url, size, content_type, kind, chat_id, project_id) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (user_id, key, attachment.get('name') or 'file', attachment.get('url'),
             int(attachment.get('size') or 0), attachment.get('contentType') or 'application/octet-stream',
             kind, chat_id, project_id)
        )
    except Exception:
        pass


def _chat_to_dict(row):
    cid, title, mode, model, pinned, created_at, updated_at = row
    return {
        'id': cid, 'title': title, 'mode': mode, 'model': model, 'pinned': pinned,
        'createdAt': created_at.isoformat() if created_at else None,
        'updatedAt': updated_at.isoformat() if updated_at else None,
    }


def _message_to_dict(row):
    '''Строка ai_messages → сообщение для фронта. Последним элементом row может идти признак
    наличия doc_spec (собранный офисный документ) — по нему интерфейс показывает у сообщения
    кнопку «Доработать». Сам doc_spec наружу не отдаём: он нужен только серверу при правке, а
    объём у него приличный (вся структура таблицы).'''
    mid, role, content, attachments, model, cost_rub, job_id, job_status, created_at, pinned = row[:10]
    result = {
        'id': mid, 'role': role, 'content': content, 'attachments': attachments,
        'model': model, 'costRub': float(cost_rub) if cost_rub is not None else None,
        'jobId': job_id, 'jobStatus': job_status, 'createdAt': created_at.isoformat() if created_at else None,
        'pinned': bool(pinned),
    }
    if len(row) > 10:
        result['hasDocSpec'] = bool(row[10])
    return result