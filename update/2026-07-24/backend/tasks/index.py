import base64
import json
import os
import re
import urllib.request
import urllib.error
import urllib.parse
import uuid

import boto3
from botocore.config import Config
import psycopg2


SNIPPET_LEN = 100


def _snippet(text, length=SNIPPET_LEN):
    '''Первые N символов текста для превью в уведомлении: убирает HTML-теги (описание задач — rich text)
    и схлопывает пробелы/переносы строк, добавляет многоточие, если текст обрезан.'''
    if not text:
        return ''
    plain = re.sub(r'<[^>]+>', ' ', text)
    plain = re.sub(r'\s+', ' ', plain).strip()
    if len(plain) <= length:
        return plain
    return plain[:length].rstrip() + '…'


def _tg_send(chat_id, text, button_url=None):
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {'chat_id': chat_id, 'text': text}
    if button_url:
        payload['reply_markup'] = {
            'inline_keyboard': [[{'text': '🔗 Открыть задачу', 'url': button_url}]]
        }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        print(f"[tasks] tg send HTTP {e.code}: {e.read().decode('utf-8', 'ignore')}")
    except Exception as e:
        print(f"[tasks] tg send error: {e}")


DEPLOY_STATUS_LABELS = {
    'none': 'Без статуса',
    'unfeasible': 'Нереализуемо',
    'tested_rework': 'На доработку (есть замечания)',
    'in_progress': 'Взято в работу',
    'local': 'Готово локально у скриптера',
    'test': 'На тестировании (залито на тестовый)',
    'tested_ok': 'Протестировано — всё ок',
    'ready_live': 'Можно заливать на лайв',
}


def _telegram_targets(cur, schema, user_ids):
    '''Возвращает telegram_id пользователей из списка, которые вошли через бота, активны и не отключили уведомления в Telegram.'''
    if not user_ids:
        return []
    cur.execute(
        f"SELECT telegram_id FROM {schema}.users "
        f"WHERE id = ANY(%s) AND telegram_id > 0 AND is_active = true AND tg_notify_muted = false",
        (user_ids,)
    )
    return [r[0] for r in cur.fetchall()]


def _task_url(task_id=None):
    '''Прямая постоянная ссылка на задачу (если известен её id) или просто на приложение.'''
    app_url = (os.environ.get('APP_URL') or '').rstrip('/')
    if not app_url:
        return None
    return f"{app_url}/task/{task_id}" if task_id else app_url


def _notify_assignees(cur, schema, user_ids, title, actor_id, task_id=None, description=None):
    '''Уведомляет назначенных исполнителей (кроме назначившего) о новой задаче: запись в БД + сообщение в Telegram.'''
    targets = [uid for uid in user_ids if uid and uid != actor_id]
    if not targets:
        return
    snippet = _snippet(description)
    notif_body = f'«{title}»' + (f'\n{snippet}' if snippet else '')
    # Внутреннее уведомление в приложении — для всех назначенных
    for uid in targets:
        cur.execute(
            f"INSERT INTO {schema}.notifications (user_id, type, title, body, entity_type, entity_id, actor_id) "
            f"VALUES (%s, 'task_assigned', %s, %s, 'task', %s, %s)",
            (uid, 'Вам назначена задача', notif_body, str(task_id) if task_id else None, actor_id)
        )
    # Telegram — только тем, кто вошёл через бота
    button_url = _task_url(task_id)
    text = f"📌 Вам назначена задача:\n\n«{title}»" + (f'\n{snippet}' if snippet else '') + "\n\nОткройте таск-менеджер, чтобы посмотреть детали."
    for tg_id in _telegram_targets(cur, schema, targets):
        _tg_send(tg_id, text, button_url)


def _add_notif(cur, schema, user_id, ntype, title, body_text, entity_type, entity_id, actor_id):
    '''Создаёт внутреннее уведомление (не самому себе).'''
    if not user_id or user_id == actor_id:
        return
    cur.execute(
        f"INSERT INTO {schema}.notifications (user_id, type, title, body, entity_type, entity_id, actor_id) "
        f"VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (user_id, ntype, title, body_text, entity_type, str(entity_id) if entity_id else None, actor_id)
    )


def _notify_deploy_status(cur, schema, task_id, task_title, new_status, actor_id, creator_id, assignee_ids):
    '''Уведомляет автора и исполнителей задачи об изменении статуса деплоя (кроме того, кто его изменил).
    Одному пользователю — только одно уведомление, даже если он и автор, и исполнитель.'''
    targets = set()
    if creator_id:
        targets.add(creator_id)
    for uid in (assignee_ids or []):
        if uid:
            targets.add(uid)
    targets.discard(actor_id)
    if not targets:
        return
    status_label = DEPLOY_STATUS_LABELS.get(new_status, new_status)
    for uid in targets:
        _add_notif(cur, schema, uid, 'task_deploy_status', f'Статус деплоя изменён: {status_label}', task_title, 'task', task_id, actor_id)
    button_url = _task_url(task_id)
    text = f"🚀 Статус деплоя задачи изменён:\n\n«{task_title}»\n→ {status_label}"
    for tg_id in _telegram_targets(cur, schema, list(targets)):
        _tg_send(tg_id, text, button_url)


def _notify_reply_or_mention(cur, schema, user_id, task_id, task_title, kind, comment_text=None):
    '''Уведомляет одного пользователя об ответе на его комментарий или упоминании — сообщение в Telegram (если вошёл через бота).'''
    if not user_id:
        return
    label = 'Вам ответили в комментарии к задаче' if kind == 'reply' else 'Вас упомянули в комментарии к задаче'
    icon = '↩️' if kind == 'reply' else '📣'
    snippet = _snippet(comment_text)
    text = f"{icon} {label}:\n\n«{task_title}»" + (f'\n{snippet}' if snippet else '')
    button_url = _task_url(task_id)
    for tg_id in _telegram_targets(cur, schema, [user_id]):
        _tg_send(tg_id, text, button_url)


def _notify_comment(cur, schema, task_id, task_title, actor_id, commenter_notified, creator_id, assignee_ids, comment_text=None):
    '''Уведомляет автора и исполнителей задачи о новом комментарии (кроме автора комментария
    и тех, кто уже уведомлён как ответ/упоминание — чтобы не дублировать уведомления).'''
    targets = set()
    if creator_id:
        targets.add(creator_id)
    for uid in (assignee_ids or []):
        if uid:
            targets.add(uid)
    targets.discard(actor_id)
    targets -= commenter_notified
    if not targets:
        return
    snippet = _snippet(comment_text)
    notif_body = f'«{task_title}»' + (f'\n{snippet}' if snippet else '')
    for uid in targets:
        _add_notif(cur, schema, uid, 'task_comment', 'Новый комментарий к задаче', notif_body, 'task', task_id, actor_id)
    button_url = _task_url(task_id)
    text = f"💬 Новый комментарий к задаче:\n\n«{task_title}»" + (f'\n{snippet}' if snippet else '')
    for tg_id in _telegram_targets(cur, schema, list(targets)):
        _tg_send(tg_id, text, button_url)


def _log_activity(cur, schema, user_id, action, entity_type=None, entity_id=None, entity_title=None, details=None):
    '''Записывает значимое действие пользователя в журнал активности (хранится 7 дней).'''
    cur.execute(
        f"INSERT INTO {schema}.activity_log (user_id, action, entity_type, entity_id, entity_title, details) "
        f"VALUES (%s, %s, %s, %s, %s, %s)",
        (user_id, action, entity_type, str(entity_id) if entity_id is not None else None, entity_title, details)
    )


def _norm_ids(raw):
    result = []
    for v in (raw or []):
        try:
            iv = int(v)
        except (TypeError, ValueError):
            continue
        if iv not in result:
            result.append(iv)
    return result


def _cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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


ALL_PERMISSIONS = [
    'task_create', 'task_edit_own', 'task_view_others', 'task_restart',
    'idea_create',
    'kb_create', 'kb_edit',
    'sprint_create', 'sprint_edit',
    'launcher_notify',
    'private_notes_view_others',
]


def _effective_perms(role, raw):
    '''Индивидуальные права (если заданы явно) приоритетнее роли. Не заданные — берутся из роли.'''
    result = {}
    for key in ALL_PERMISSIONS:
        if isinstance(raw, dict) and key in raw and raw[key] is not None:
            result[key] = bool(raw[key])
        else:
            result[key] = (role == 'admin')
    return result


def _current_user(cur, schema, token):
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
    perms = _effective_perms(row[1], row[2])
    return {'id': row[0], 'role': row[1], 'perms': perms}


def _record_assignments(cur, schema, task_id, user_ids, assigned_by):
    '''Фиксирует момент назначения пользователей исполнителями задачи — для статистики «получено задач».'''
    for uid in user_ids:
        cur.execute(
            f"INSERT INTO {schema}.task_assignment_events (task_id, user_id, assigned_by) VALUES (%s, %s, %s)",
            (int(task_id), uid, assigned_by)
        )


def _row_to_task(r):
    return {
        'id': str(r[0]),
        'title': r[1],
        'column': r[2],
        'assigneeId': r[3],
        'priority': r[4],
        'version': r[5],
        'server': r[6],
        'category': r[7],
        'sprintId': r[8],
        'deployStatus': r[9],
        'description': r[10],
        'links': r[11] if r[11] is not None else [],
        'archived': bool(r[12]),
        'outcome': r[13],
        'assigneeIds': r[14] if r[14] is not None else [],
        'kbArticleIds': r[15] if r[15] is not None else [],
        'restartDone': bool(r[16]),
        'createdAt': r[17].isoformat() if r[17] else None,
        'creatorId': r[18],
        'attachments': r[19] if r[19] is not None else [],
        'deadline': r[20].isoformat() if r[20] else None,
        'launcherUploaded': bool(r[21]),
    }


TASK_COLUMNS = (
    "id, title, column_id, assignee_id, priority, version, server, category, "
    "sprint_id, deploy_status, description, links, archived, outcome, assignee_ids, kb_article_ids, restart_done, created_at, created_by, attachments, deadline, launcher_uploaded"
)

MAX_FILE_SIZE = 300 * 1024 * 1024  # 300 МБ на файл


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
    # приоритет: S3_PUBLIC_URL, потом CDN_BASE_URL
    base_url = (
        os.environ.get('S3_PUBLIC_URL')
        or os.environ.get('CDN_BASE_URL', '')
    ).rstrip('/')

    if base_url:
        # https://ВАШ-ДОМЕН.РУ/files/<key>
        return f"{base_url}/{key}"

    # если ни одна переменная не задана — как запасной вариант
    bucket = os.environ.get('S3_BUCKET', 'files')
    endpoint = os.environ.get('S3_ENDPOINT', 'http://127.0.0.1:9000').rstrip('/')
    # http://127.0.0.1:9000/files/<key>
    return f"{endpoint}/{bucket}/{key}"


def _decode_data(data_b64):
    if ',' in data_b64 and data_b64.strip().startswith('data:'):
        data_b64 = data_b64.split(',', 1)[1]
    return base64.b64decode(data_b64)


def _content_disposition(name):
    '''Формирует заголовок Content-Disposition с оригинальным именем файла (в т.ч. кириллица/спецсимволы),
    чтобы при скачивании из S3/MinIO браузер сохранял файл под его настоящим именем, а не под ключом-хэшем.'''
    ascii_fallback = name.encode('ascii', 'ignore').decode('ascii') or 'file'
    encoded = urllib.parse.quote(name)
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"


def _upload_image(body):
    data_b64 = body.get('data')
    if not data_b64:
        return None
    raw = _decode_data(data_b64)
    ext = (body.get('ext') or 'png').lstrip('.').lower()
    content_type = body.get('contentType') or f'image/{ext}'
    key = f"tasks/{uuid.uuid4().hex}.{ext}"
    bucket = os.environ.get('S3_BUCKET', 'files')
    _s3_client().put_object(Bucket=bucket, Key=key, Body=raw, ContentType=content_type)
    return _public_url(key)


def _upload_file(body):
    '''Загружает произвольный файл (документ, архив и т.д.) в S3/MinIO и возвращает метаданные вложения.'''
    data_b64 = body.get('data')
    if not data_b64:
        return None, 'no_data'
    try:
        raw = _decode_data(data_b64)
    except Exception:
        # Битые/оборванные данные (например, запрос был обрезан прокси на большом файле)
        return None, 'bad_data'
    if len(raw) > MAX_FILE_SIZE:
        return None, 'file_too_large'
    name = (body.get('name') or 'file').strip() or 'file'
    name_ext = name.rsplit('.', 1)[-1] if '.' in name else ''
    ext = (body.get('ext') or name_ext).lstrip('.').lower()
    content_type = body.get('contentType') or 'application/octet-stream'
    key = f"tasks/files/{uuid.uuid4().hex}.{ext}" if ext else f"tasks/files/{uuid.uuid4().hex}"
    bucket = os.environ.get('S3_BUCKET', 'files')
    _s3_client().put_object(
        Bucket=bucket, Key=key, Body=raw, ContentType=content_type,
        ContentDisposition=_content_disposition(name),
    )
    attachment = {
        'id': uuid.uuid4().hex,
        'name': name,
        'url': _public_url(key),
        'size': len(raw),
        'contentType': content_type,
    }
    return attachment, None


def _norm_kb(body):
    raw = body.get('kbArticleIds') or []
    result = []
    for v in raw:
        try:
            iv = int(v)
        except (TypeError, ValueError):
            continue
        if iv not in result:
            result.append(iv)
    return result


def _task_assignee_ids(d):
    ids = d.get('assigneeIds') or []
    if ids:
        return ids
    return [d['assigneeId']] if d.get('assigneeId') is not None else []


def _forbidden():
    return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}


def _needs_launcher_upload(column, deploy_status, launcher_uploaded, has_files):
    '''Та же логика, что и needsLauncherUpload на фронтенде (src/pages/index/shared.tsx) —
    задача требует заливки в лаунчер, если есть прикреплённые файлы патча, задача в состоянии,
    готовом к раскатке (колонка «К рестарту» или статус «Можно заливать на лайв»), и ещё не отмечена загруженной.'''
    if not has_files or launcher_uploaded:
        return False
    return column == 'restart' or deploy_status == 'ready_live'


def _task_has_patch_files(cur, schema, task_id):
    cur.execute(
        f"SELECT EXISTS(SELECT 1 FROM {schema}.patch_files WHERE task_ids @> %s)",
        (json.dumps([int(task_id)]),)
    )
    return bool(cur.fetchone()[0])


def _notify_launcher_required(cur, schema, task_id, task_title, actor_id, creator_id, assignee_ids):
    '''Уведомляет всех пользователей с правом launcher_notify (кроме того, чьё действие вызвало появление
    бейджа) о том, что у задачи появился бейдж «Требуется залить в лаунчер» — запись в БД + Telegram.'''
    cur.execute(
        f"SELECT id, role, permissions, telegram_id, is_active, tg_notify_muted FROM {schema}.users WHERE is_active = true"
    )
    targets = []
    for uid, role, perms_raw, tg_id, is_active, tg_muted in cur.fetchall():
        if uid == actor_id:
            continue
        perms = perms_raw if isinstance(perms_raw, dict) else {}
        allowed = perms.get('launcher_notify')
        allowed = (role == 'admin') if allowed is None else bool(allowed)
        if allowed:
            targets.append((uid, tg_id, tg_muted))
    if not targets:
        return
    for uid, _, _ in targets:
        _add_notif(cur, schema, uid, 'launcher_required', 'Требуется залить в лаунчер', f'«{task_title}»', 'task', task_id, actor_id)
    button_url = _task_url(task_id)
    text = f"📦 Требуется залить в лаунчер:\n\n«{task_title}»"
    tg_ids = [tg_id for uid, tg_id, tg_muted in targets if tg_id and tg_id > 0 and not tg_muted]
    for tg_id in tg_ids:
        _tg_send(tg_id, text, button_url)


def _check_launcher_badge_appeared(cur, schema, task_id, task_title, actor_id, creator_id, assignee_ids,
                                    was_column, was_deploy, was_uploaded, new_column, new_deploy, new_uploaded):
    '''Сравнивает состояние бейджа «Требуется залить в лаунчер» до и после изменения задачи —
    если бейдж появился (не было → стало), рассылает уведомление тем, у кого есть право launcher_notify.'''
    has_files = _task_has_patch_files(cur, schema, task_id)
    was = _needs_launcher_upload(was_column, was_deploy, was_uploaded, has_files)
    now = _needs_launcher_upload(new_column, new_deploy, new_uploaded, has_files)
    if now and not was:
        _notify_launcher_required(cur, schema, task_id, task_title, actor_id, creator_id, assignee_ids)


def _norm_assignees(body):
    raw = body.get('assigneeIds')
    if raw is None:
        single = body.get('assigneeId')
        raw = [single] if single else []
    result = []
    for v in raw:
        if v is None or v == '':
            continue
        try:
            iv = int(v)
        except (TypeError, ValueError):
            continue
        if iv not in result:
            result.append(iv)
    return result


def handler(event: dict, context) -> dict:
    '''CRUD задач таск-менеджера с привязкой исполнителя к реальным сотрудникам. Список, создание, обновление и удаление задач, загрузка изображений (upload_image) и файлов-вложений (upload_file) в S3/MinIO. Значимые действия (создание, смена статуса деплоя, архивация, удаление) пишутся в журнал активности (activity_log). Действия private_notes / private_note_add / private_note_delete — приватные заметки, видимые только автору, выбранному адресату и администраторам. При появлении у задачи бейджа «Требуется залить в лаунчер» (смена статуса деплоя/колонки, снятие отметки «Загружено») уведомляются (в приложении и Telegram) все пользователи с правом launcher_notify. Доступно авторизованным участникам команды.'''
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

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    action = body.get('action') or (event.get('queryStringParameters') or {}).get('action') or ('list' if method == 'GET' else '')

    # Загрузка изображения для описания задачи (вставка в RichEditor) — нужно право на создание или редактирование задач
    if action == 'upload_image':
        if not (me['perms']['task_create'] or me['perms']['task_edit_own']):
            cur.close(); conn.close()
            return _forbidden()
        url = _upload_image(body)
        cur.close(); conn.close()
        if not url:
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_data'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'url': url})}

    # Загрузка произвольного файла-вложения к задаче
    if action == 'upload_file':
        if not (me['perms']['task_create'] or me['perms']['task_edit_own']):
            cur.close(); conn.close()
            return _forbidden()
        attachment, err = _upload_file(body)
        cur.close(); conn.close()
        if err:
            status = 413 if err == 'file_too_large' else 400
            return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps({'error': err})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'attachment': attachment})}

    # Загрузка файла-вложения к комментарию — доступно любому, кто может видеть/комментировать задачи
    if action == 'comment_upload_file':
        attachment, err = _upload_file(body)
        cur.close(); conn.close()
        if err:
            status = 413 if err == 'file_too_large' else 400
            return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps({'error': err})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'attachment': attachment})}

    # Список задач
    if action == 'list' or method == 'GET':
        cur.execute(
            f"SELECT {TASK_COLUMNS}, "
            f"(SELECT COUNT(*) FROM {schema}.task_comments c WHERE c.task_id = t.id::text) AS cc "
            f"FROM {schema}.tasks t ORDER BY t.created_at ASC"
        )
        tasks = []
        for r in cur.fetchall():
            d = _row_to_task(r)
            d['commentCount'] = r[21]
            # Без права task_view_others — видит только задачи, где он исполнитель или автор
            if not me['perms']['task_view_others'] and me['id'] not in _task_assignee_ids(d) and d.get('creatorId') != me['id']:
                continue
            tasks.append(d)
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'tasks': tasks})}

    # Создание задачи — по праву task_create
    if action == 'create':
        if not me['perms']['task_create']:
            cur.close(); conn.close()
            return _forbidden()
        title = (body.get('title') or '').strip()
        if not title:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_title'})}
        assignee_ids = _norm_assignees(body)
        assignee_id = assignee_ids[0] if assignee_ids else None
        links = json.dumps(body.get('links') or [])
        kb_ids = json.dumps(_norm_kb(body))
        attachments = json.dumps(body.get('attachments') or [])
        cur.execute(
            f"INSERT INTO {schema}.tasks "
            f"(title, column_id, assignee_id, assignee_ids, priority, version, server, category, sprint_id, deploy_status, description, links, kb_article_ids, created_by, attachments, deadline) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
            f"RETURNING {TASK_COLUMNS}",
            (
                title,
                body.get('column') or 'todo',
                assignee_id,
                json.dumps(assignee_ids),
                body.get('priority') or 'medium',
                body.get('version'),
                body.get('server'),
                body.get('category') or 'other',
                body.get('sprintId'),
                body.get('deployStatus') or 'none',
                body.get('description'),
                links,
                kb_ids,
                me['id'],
                attachments,
                body.get('deadline'),
            )
        )
        task = _row_to_task(cur.fetchone())
        _record_assignments(cur, schema, task['id'], assignee_ids, me['id'])
        _notify_assignees(cur, schema, assignee_ids, title, me['id'], task['id'], body.get('description'))
        _log_activity(cur, schema, me['id'], 'task_create', 'task', task['id'], title)
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': task})}

    # Обновление задачи
    if action == 'update':
        task_id = body.get('id')
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}

        cur.execute(f"SELECT assignee_id, assignee_ids, created_by, title, deploy_status, column_id, launcher_uploaded FROM {schema}.tasks WHERE id = %s", (int(task_id),))
        own_row = cur.fetchone()
        if not own_row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        is_creator = own_row[2] == me['id']
        own_ids = _task_assignee_ids({'assigneeId': own_row[0], 'assigneeIds': own_row[1]})
        is_assignee = me['id'] in own_ids
        can_full_edit = me['role'] == 'admin' or (me['perms']['task_edit_own'] and is_creator)
        # Статус деплоя (и связанную с ним колонку) может менять автор задачи или назначенный исполнитель — даже без полного доступа
        can_edit_deploy = me['role'] == 'admin' or is_creator or is_assignee

        if not can_full_edit:
            requested_column = body.get('column')
            requested_deploy = body.get('deployStatus')
            if can_edit_deploy and requested_deploy is not None:
                if requested_column not in ('todo', 'progress', 'done'):
                    cur.close(); conn.close()
                    return _forbidden()
                deploy_changed = requested_deploy != own_row[4]
                # Смена статуса деплоя означает новую сборку — сбрасываем отметку «Загружено в лаунчер»,
                # чтобы сотрудник заново залил актуальные файлы патча
                cur.execute(
                    f"UPDATE {schema}.tasks SET deploy_status = %s, column_id = %s, "
                    f"launcher_uploaded = CASE WHEN %s THEN false ELSE launcher_uploaded END, updated_at = NOW() "
                    f"WHERE id = %s RETURNING {TASK_COLUMNS}",
                    (requested_deploy, requested_column, deploy_changed, int(task_id))
                )
                row = cur.fetchone()
                if deploy_changed:
                    _notify_deploy_status(cur, schema, task_id, own_row[3], requested_deploy, me['id'], own_row[2], own_ids)
                    _log_activity(cur, schema, me['id'], 'task_deploy_status', 'task', task_id, own_row[3], DEPLOY_STATUS_LABELS.get(requested_deploy, requested_deploy))
                new_launcher_uploaded = False if deploy_changed else bool(own_row[6])
                _check_launcher_badge_appeared(
                    cur, schema, task_id, own_row[3], me['id'], own_row[2], own_ids,
                    own_row[5], own_row[4], bool(own_row[6]), requested_column, requested_deploy, new_launcher_uploaded
                )
                cur.close(); conn.close()
                return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': _row_to_task(row)})}
            # Без права полного редактирования — можно только переносить СВОЮ задачу между колонками To Do / In Progress / Done
            if not is_assignee or requested_column not in ('todo', 'progress', 'done'):
                cur.close(); conn.close()
                return _forbidden()
            cur.execute(
                f"UPDATE {schema}.tasks SET column_id = %s, updated_at = NOW() WHERE id = %s RETURNING {TASK_COLUMNS}",
                (requested_column, int(task_id))
            )
            row = cur.fetchone()
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': _row_to_task(row)})}

        # Подгружаем текущие значения задачи — поля, которых нет в теле запроса (частичное обновление,
        # например быстрая смена статуса деплоя при перетаскивании карточки), не должны затираться на NULL.
        cur.execute(f"SELECT {TASK_COLUMNS} FROM {schema}.tasks WHERE id = %s", (int(task_id),))
        existing_row = cur.fetchone()
        if not existing_row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        existing = _row_to_task(existing_row)

        has_assignees = 'assigneeIds' in body or 'assigneeId' in body
        assignee_ids = _norm_assignees(body) if has_assignees else (existing['assigneeIds'] or [])
        assignee_id = assignee_ids[0] if assignee_ids else None
        links = json.dumps(body.get('links')) if 'links' in body else json.dumps(existing['links'] or [])
        kb_ids = json.dumps(_norm_kb(body)) if 'kbArticleIds' in body else json.dumps(existing['kbArticleIds'] or [])
        attachments = json.dumps(body.get('attachments')) if 'attachments' in body else json.dumps(existing['attachments'] or [])
        prev_ids = existing['assigneeIds'] or []
        new_deploy_status_val = body.get('deployStatus', existing['deployStatus']) or 'none'
        deploy_changed_full = new_deploy_status_val != own_row[4]
        # Смена статуса деплоя означает новую сборку — сбрасываем отметку «Загружено в лаунчер»
        launcher_uploaded = False if deploy_changed_full else bool(existing['launcherUploaded'])
        cur.execute(
            f"UPDATE {schema}.tasks SET "
            f"title = %s, column_id = %s, assignee_id = %s, assignee_ids = %s, priority = %s, version = %s, "
            f"server = %s, category = %s, sprint_id = %s, deploy_status = %s, description = %s, links = %s, kb_article_ids = %s, restart_done = %s, attachments = %s, deadline = %s, launcher_uploaded = %s, updated_at = NOW() "
            f"WHERE id = %s RETURNING {TASK_COLUMNS}",
            (
                (body.get('title') if 'title' in body else existing['title'] or '').strip(),
                body.get('column', existing['column']) or 'todo',
                assignee_id,
                json.dumps(assignee_ids),
                body.get('priority', existing['priority']) or 'medium',
                body.get('version', existing['version']),
                body.get('server', existing['server']),
                body.get('category', existing['category']) or 'other',
                body.get('sprintId', existing['sprintId']),
                new_deploy_status_val,
                body.get('description', existing['description']),
                links,
                kb_ids,
                bool(body.get('restartDone', existing['restartDone'])),
                attachments,
                body.get('deadline', existing['deadline']),
                launcher_uploaded,
                int(task_id),
            )
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        new_ids = [uid for uid in assignee_ids if uid not in prev_ids]
        _record_assignments(cur, schema, task_id, new_ids, me['id'])
        task_title_full = (body.get('title') if 'title' in body else existing['title'] or '').strip()
        _notify_assignees(cur, schema, new_ids, task_title_full, me['id'], task_id, body.get('description', existing['description']))
        task_title = task_title_full
        if deploy_changed_full:
            _notify_deploy_status(cur, schema, task_id, task_title, new_deploy_status_val, me['id'], own_row[2], assignee_ids)
            _log_activity(cur, schema, me['id'], 'task_deploy_status', 'task', task_id, task_title, DEPLOY_STATUS_LABELS.get(new_deploy_status_val, new_deploy_status_val))
        new_column_val = body.get('column', existing['column']) or 'todo'
        _check_launcher_badge_appeared(
            cur, schema, task_id, task_title, me['id'], own_row[2], assignee_ids,
            own_row[5], own_row[4], bool(own_row[6]), new_column_val, new_deploy_status_val, launcher_uploaded
        )
        _log_activity(cur, schema, me['id'], 'task_update', 'task', task_id, task_title)
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': _row_to_task(row)})}

    # Быстрое перемещение по колонкам (drag&drop)
    if action == 'move':
        task_id = body.get('id')
        column = body.get('column')
        if not task_id or not column:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
        cur.execute(f"SELECT assignee_id, assignee_ids, created_by, title, deploy_status, column_id, launcher_uploaded FROM {schema}.tasks WHERE id = %s", (int(task_id),))
        own_row = cur.fetchone()
        if not own_row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        own_ids = _task_assignee_ids({'assigneeId': own_row[0], 'assigneeIds': own_row[1]})
        if me['role'] != 'admin':
            if me['id'] not in own_ids or column not in ('todo', 'progress', 'done'):
                cur.close(); conn.close()
                return _forbidden()
        cur.execute(
            f"UPDATE {schema}.tasks SET column_id = %s, updated_at = NOW() WHERE id = %s",
            (column, int(task_id))
        )
        _check_launcher_badge_appeared(
            cur, schema, task_id, own_row[3], me['id'], own_row[2], own_ids,
            own_row[5], own_row[4], bool(own_row[6]), column, own_row[4], bool(own_row[6])
        )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Перенос задачи в раздел «К рестарту» — по праву task_restart (только свои задачи для не-админа)
    if action == 'to_restart':
        task_id = body.get('id')
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        if not me['perms']['task_restart']:
            cur.close(); conn.close()
            return _forbidden()
        cur.execute(f"SELECT assignee_id, assignee_ids, created_by, title, deploy_status, column_id, launcher_uploaded FROM {schema}.tasks WHERE id = %s", (int(task_id),))
        own_row = cur.fetchone()
        if not own_row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        own_ids = _task_assignee_ids({'assigneeId': own_row[0], 'assigneeIds': own_row[1]})
        if me['role'] != 'admin':
            if me['id'] not in own_ids and own_row[2] != me['id']:
                cur.close(); conn.close()
                return _forbidden()
        cur.execute(
            f"UPDATE {schema}.tasks SET column_id = 'restart', restart_done = false, updated_at = NOW() "
            f"WHERE id = %s RETURNING {TASK_COLUMNS}",
            (int(task_id),)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        _check_launcher_badge_appeared(
            cur, schema, task_id, own_row[3], me['id'], own_row[2], own_ids,
            own_row[5], own_row[4], bool(own_row[6]), 'restart', own_row[4], bool(own_row[6])
        )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': _row_to_task(row)})}

    # Возврат задачи из раздела «К рестарту» обратно в Done — по праву task_restart (только свои задачи для не-админа)
    if action == 'from_restart':
        task_id = body.get('id')
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        if not me['perms']['task_restart']:
            cur.close(); conn.close()
            return _forbidden()
        if me['role'] != 'admin':
            cur.execute(f"SELECT assignee_id, assignee_ids, created_by FROM {schema}.tasks WHERE id = %s", (int(task_id),))
            own_row = cur.fetchone()
            if not own_row:
                cur.close(); conn.close()
                return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
            own_ids = _task_assignee_ids({'assigneeId': own_row[0], 'assigneeIds': own_row[1]})
            if me['id'] not in own_ids and own_row[2] != me['id']:
                cur.close(); conn.close()
                return _forbidden()
        cur.execute(
            f"UPDATE {schema}.tasks SET column_id = 'done', updated_at = NOW() "
            f"WHERE id = %s RETURNING {TASK_COLUMNS}",
            (int(task_id),)
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': _row_to_task(row)})}

    # Отметка задачи «К рестарту» выполненной / снятие отметки — только администратор
    if action == 'set_restart_done':
        if me['role'] != 'admin':
            cur.close(); conn.close()
            return _forbidden()
        task_id = body.get('id')
        done = bool(body.get('done', True))
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(
            f"UPDATE {schema}.tasks SET restart_done = %s, updated_at = NOW() "
            f"WHERE id = %s RETURNING {TASK_COLUMNS}",
            (done, int(task_id))
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': _row_to_task(row)})}

    # Отметка «Загружено в лаунчер» / снятие отметки — доступно администратору, автору и исполнителям
    # задачи (тем же, кто может менять статус деплоя)
    if action == 'set_launcher_uploaded':
        task_id = body.get('id')
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT assignee_id, assignee_ids, created_by, title, deploy_status, column_id, launcher_uploaded FROM {schema}.tasks WHERE id = %s", (int(task_id),))
        own_row = cur.fetchone()
        if not own_row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        own_ids = _task_assignee_ids({'assigneeId': own_row[0], 'assigneeIds': own_row[1]})
        is_creator = own_row[2] == me['id']
        is_assignee = me['id'] in own_ids
        can_edit_deploy = me['role'] == 'admin' or is_creator or is_assignee
        if not can_edit_deploy:
            cur.close(); conn.close()
            return _forbidden()
        uploaded = bool(body.get('uploaded', True))
        cur.execute(
            f"UPDATE {schema}.tasks SET launcher_uploaded = %s, updated_at = NOW() "
            f"WHERE id = %s RETURNING {TASK_COLUMNS}",
            (uploaded, int(task_id))
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        # Снятие отметки «Загружено» при уже подходящем статусе/колонке вновь делает задачу требующей заливки
        _check_launcher_badge_appeared(
            cur, schema, task_id, own_row[3], me['id'], own_row[2], own_ids,
            own_row[5], own_row[4], bool(own_row[6]), own_row[5], own_row[4], uploaded
        )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': _row_to_task(row)})}

    # Архивация задачи с исходом — только администратор
    if action == 'archive':
        if me['role'] != 'admin':
            cur.close(); conn.close()
            return _forbidden()
        task_id = body.get('id')
        outcome = body.get('outcome') or 'done'
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(
            f"UPDATE {schema}.tasks SET archived = true, outcome = %s, archived_at = NOW(), closed_by = %s, updated_at = NOW() "
            f"WHERE id = %s RETURNING {TASK_COLUMNS}",
            (outcome, me['id'], int(task_id))
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        task = _row_to_task(row)
        _log_activity(cur, schema, me['id'], 'task_archive', 'task', task_id, task['title'], outcome)
        # Автозапись в журнал патчноутов сервера — только для задач, выполненных из раздела «К рестарту»
        if task['column'] == 'restart' and outcome == 'done' and task.get('server'):
            cur.execute(
                f"INSERT INTO {schema}.patchnotes (server, task_id, task_title) VALUES (%s, %s, %s)",
                (task['server'], int(task_id), task['title'])
            )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': task})}

    # Возврат задачи из архива — только администратор
    if action == 'unarchive':
        if me['role'] != 'admin':
            cur.close(); conn.close()
            return _forbidden()
        task_id = body.get('id')
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(
            f"UPDATE {schema}.tasks SET archived = false, outcome = NULL, archived_at = NULL, closed_by = NULL, updated_at = NOW() "
            f"WHERE id = %s RETURNING {TASK_COLUMNS}",
            (int(task_id),)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        task = _row_to_task(row)
        _log_activity(cur, schema, me['id'], 'task_unarchive', 'task', task_id, task['title'])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'task': task})}

    # Удаление задачи — только администратор
    if action == 'delete':
        if me['role'] != 'admin':
            cur.close(); conn.close()
            return _forbidden()
        task_id = body.get('id')
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT title FROM {schema}.tasks WHERE id = %s", (int(task_id),))
        trow = cur.fetchone()
        task_title = trow[0] if trow else None
        cur.execute(f"DELETE FROM {schema}.task_comments WHERE task_id = %s", (str(task_id),))
        cur.execute(f"DELETE FROM {schema}.task_assignment_events WHERE task_id = %s", (int(task_id),))
        cur.execute(f"DELETE FROM {schema}.tasks WHERE id = %s", (int(task_id),))
        deleted = cur.rowcount
        _log_activity(cur, schema, me['id'], 'task_delete', 'task', task_id, task_title)
        cur.close(); conn.close()
        if not deleted:
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Список комментариев задачи
    if action == 'comments':
        task_id = body.get('taskId') or (event.get('queryStringParameters') or {}).get('taskId')
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_task_id'})}
        if me['role'] != 'admin' and not me['perms']['task_view_others']:
            cur.execute(f"SELECT assignee_id, assignee_ids, created_by FROM {schema}.tasks WHERE id = %s", (int(task_id),))
            own_row = cur.fetchone()
            own_ids = _task_assignee_ids({'assigneeId': own_row[0], 'assigneeIds': own_row[1]}) if own_row else []
            if me['id'] not in own_ids and (not own_row or own_row[2] != me['id']):
                cur.close(); conn.close()
                return _forbidden()
        cur.execute(
            f"SELECT id, task_id, user_id, text, created_at, parent_id, mentions, attachments "
            f"FROM {schema}.task_comments WHERE task_id = %s ORDER BY created_at ASC",
            (str(task_id),)
        )
        comments = [{
            'id': str(r[0]), 'taskId': str(r[1]), 'authorId': r[2], 'text': r[3],
            'createdAt': r[4].isoformat() if r[4] else None,
            'parentId': str(r[5]) if r[5] else None,
            'mentions': r[6] if r[6] is not None else [],
            'attachments': r[7] if r[7] is not None else [],
        } for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'comments': comments})}

    # Добавить комментарий к задаче (+ ответ + упоминания + вложения)
    if action == 'comment':
        task_id = body.get('taskId')
        text = (body.get('text') or '').strip()
        attachments = body.get('attachments') or []
        if not task_id or (not text and not attachments):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
        if me['role'] != 'admin' and not me['perms']['task_view_others']:
            cur.execute(f"SELECT assignee_id, assignee_ids, created_by FROM {schema}.tasks WHERE id = %s", (int(task_id),))
            own_row = cur.fetchone()
            own_ids = _task_assignee_ids({'assigneeId': own_row[0], 'assigneeIds': own_row[1]}) if own_row else []
            if me['id'] not in own_ids and (not own_row or own_row[2] != me['id']):
                cur.close(); conn.close()
                return _forbidden()
        parent_id = body.get('parentId')
        parent_id = int(parent_id) if parent_id else None
        mentions = _norm_ids(body.get('mentions'))
        cur.execute(
            f"INSERT INTO {schema}.task_comments (task_id, user_id, text, parent_id, mentions, attachments) "
            f"VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, created_at",
            (str(task_id), me['id'], text, parent_id, json.dumps(mentions), json.dumps(attachments))
        )
        new = cur.fetchone()
        # Заголовок и участники задачи (автор, исполнители) для уведомлений
        cur.execute(f"SELECT title, created_by, assignee_id, assignee_ids FROM {schema}.tasks WHERE id = %s", (int(task_id),))
        trow = cur.fetchone()
        task_title = trow[0] if trow else 'задача'
        task_creator_id = trow[1] if trow else None
        task_assignee_ids = _task_assignee_ids({'assigneeId': trow[2], 'assigneeIds': trow[3]}) if trow else []
        notified = set()
        # Ответ автору родительского комментария
        if parent_id:
            cur.execute(f"SELECT user_id FROM {schema}.task_comments WHERE id = %s", (parent_id,))
            prow = cur.fetchone()
            if prow and prow[0] and prow[0] != me['id']:
                _add_notif(cur, schema, prow[0], 'task_reply', 'Ответ на ваш комментарий', f'«{task_title}»' + (f'\n{_snippet(text)}' if _snippet(text) else ''), 'task', task_id, me['id'])
                _notify_reply_or_mention(cur, schema, prow[0], task_id, task_title, 'reply', text)
                notified.add(prow[0])
        # Упоминания
        for uid in mentions:
            if uid not in notified:
                _add_notif(cur, schema, uid, 'task_mention', 'Вас упомянули в задаче', f'«{task_title}»' + (f'\n{_snippet(text)}' if _snippet(text) else ''), 'task', task_id, me['id'])
                _notify_reply_or_mention(cur, schema, uid, task_id, task_title, 'mention', text)
                notified.add(uid)
        # Новый комментарий — уведомляем автора и исполнителей задачи, кто ещё не получил reply/mention уведомление
        _notify_comment(cur, schema, task_id, task_title, me['id'], notified, task_creator_id, task_assignee_ids, text)
        comment = {
            'id': str(new[0]), 'taskId': str(task_id), 'authorId': me['id'], 'text': text,
            'createdAt': new[1].isoformat() if new[1] else None,
            'parentId': str(parent_id) if parent_id else None, 'mentions': mentions,
            'attachments': attachments,
        }
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'comment': comment})}

    # Удалить комментарий задачи (автор комментария или админ)
    if action == 'comment_delete':
        cid = body.get('id')
        if not cid:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT user_id FROM {schema}.task_comments WHERE id = %s", (int(cid),))
        crow = cur.fetchone()
        if not crow:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        if crow[0] != me['id'] and me['role'] != 'admin':
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        # переносим ответы на верхний уровень, затем удаляем
        cur.execute(f"UPDATE {schema}.task_comments SET parent_id = NULL WHERE parent_id = %s", (int(cid),))
        cur.execute(f"DELETE FROM {schema}.task_comments WHERE id = %s", (int(cid),))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Приватные заметки: текст виден только автору, выбранному адресату и тем, кому явно выдано
    # право private_notes_view_others. Прикрепляются либо к задаче целиком (commentId = null),
    # либо к конкретному комментарию.
    if action == 'private_notes':
        task_id = body.get('taskId') or (event.get('queryStringParameters') or {}).get('taskId')
        if not task_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_task_id'})}
        # Текст приватной заметки доступен только автору и адресату. Видеть чужие приватные заметки
        # может только тот, кому явно выдано право private_notes_view_others (в т.ч. администратор,
        # если это право у него не отозвано отдельно).
        if me['perms']['private_notes_view_others']:
            cur.execute(
                f"SELECT id, task_id, comment_id, author_id, target_user_id, text, created_at "
                f"FROM {schema}.private_notes WHERE task_id = %s ORDER BY created_at ASC",
                (int(task_id),)
            )
        else:
            cur.execute(
                f"SELECT id, task_id, comment_id, author_id, target_user_id, text, created_at "
                f"FROM {schema}.private_notes WHERE task_id = %s AND (author_id = %s OR target_user_id = %s) "
                f"ORDER BY created_at ASC",
                (int(task_id), me['id'], me['id'])
            )
        notes = [{
            'id': str(r[0]), 'taskId': str(r[1]), 'commentId': str(r[2]) if r[2] else None,
            'authorId': r[3], 'targetUserId': r[4], 'text': r[5],
            'createdAt': r[6].isoformat() if r[6] else None,
        } for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'notes': notes})}

    if action == 'private_note_add':
        task_id = body.get('taskId')
        target_user_id = body.get('targetUserId')
        text = (body.get('text') or '').strip()
        comment_id = body.get('commentId')
        if not task_id or not target_user_id or not text:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
        try:
            target_user_id = int(target_user_id)
        except (TypeError, ValueError):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_target'})}
        if target_user_id == me['id']:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'cannot_target_self'})}
        cur.execute(
            f"INSERT INTO {schema}.private_notes (task_id, comment_id, author_id, target_user_id, text) "
            f"VALUES (%s, %s, %s, %s, %s) RETURNING id, created_at",
            (int(task_id), int(comment_id) if comment_id else None, me['id'], target_user_id, text)
        )
        new = cur.fetchone()
        _add_notif(cur, schema, target_user_id, 'private_note', 'Вам оставили приватную заметку в задаче', _snippet(text), 'task', task_id, me['id'])
        note = {
            'id': str(new[0]), 'taskId': str(task_id), 'commentId': str(comment_id) if comment_id else None,
            'authorId': me['id'], 'targetUserId': target_user_id, 'text': text,
            'createdAt': new[1].isoformat() if new[1] else None,
        }
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'note': note})}

    if action == 'private_note_delete':
        nid = body.get('id')
        if not nid:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT author_id FROM {schema}.private_notes WHERE id = %s", (int(nid),))
        nrow = cur.fetchone()
        if not nrow:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        if nrow[0] != me['id'] and me['role'] != 'admin':
            cur.close(); conn.close()
            return _forbidden()
        cur.execute(f"DELETE FROM {schema}.private_notes WHERE id = %s", (int(nid),))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}