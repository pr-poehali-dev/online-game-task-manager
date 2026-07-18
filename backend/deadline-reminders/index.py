import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone

import psycopg2


def _schema():
    return os.environ.get('MAIN_DB_SCHEMA', 'public')


def _db():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    return conn


def _cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json',
    }


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
        print(f"[deadline-reminders] tg send HTTP {e.code}: {e.read().decode('utf-8', 'ignore')}")
    except Exception as e:
        print(f"[deadline-reminders] tg send error: {e}")


def _telegram_targets(cur, schema, user_ids):
    '''Возвращает telegram_id пользователей из списка, которые вошли через бота и активны.'''
    if not user_ids:
        return []
    cur.execute(
        f"SELECT telegram_id FROM {schema}.users "
        f"WHERE id = ANY(%s) AND telegram_id > 0 AND is_active = true",
        (user_ids,)
    )
    return [r[0] for r in cur.fetchall()]


def _task_url(task_id=None):
    app_url = (os.environ.get('APP_URL') or '').rstrip('/')
    if not app_url:
        return None
    return f"{app_url}/?task={task_id}" if task_id else app_url


def _add_notif(cur, schema, user_id, ntype, title, body_text, entity_type, entity_id):
    cur.execute(
        f"INSERT INTO {schema}.notifications (user_id, type, title, body, entity_type, entity_id, actor_id) "
        f"VALUES (%s, %s, %s, %s, %s, %s, NULL)",
        (user_id, ntype, title, body_text, entity_type, str(entity_id) if entity_id is not None else None)
    )


def _task_assignee_ids(assignee_id, assignee_ids):
    ids = assignee_ids or []
    if ids:
        return [i for i in ids if i]
    return [assignee_id] if assignee_id is not None else []


# Напоминания в порядке от самого раннего к самому позднему — ключ используется
# как отметка в deadline_reminders_sent, чтобы не отправлять повторно.
REMINDER_STAGES = [
    {'key': '24h', 'seconds': 24 * 60 * 60, 'label': 'через 24 часа'},
    {'key': '6h', 'seconds': 6 * 60 * 60, 'label': 'через 6 часов'},
    {'key': '30m', 'seconds': 30 * 60, 'label': 'через 30 минут'},
]


def handler(event: dict, context) -> dict:
    '''Проверяет дедлайны незавершённых задач и рассылает напоминания исполнителям и автору (за 24 часа, 6 часов и 30 минут до срока) — в приложение и в Telegram. Не отправляет повторные напоминания одного и того же типа. Вызывается по расписанию внешним cron-сервисом (защищено секретом X-Cron-Secret).'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    cron_secret = os.environ.get('CRON_SECRET', '')
    headers = event.get('headers', {})
    provided_secret = headers.get('X-Cron-Secret') or headers.get('x-cron-secret') or (event.get('queryStringParameters') or {}).get('secret')
    if cron_secret and provided_secret != cron_secret:
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    schema = _schema()
    conn = _db()
    cur = conn.cursor()

    now = datetime.now(timezone.utc)

    cur.execute(
        f"SELECT id, title, assignee_id, assignee_ids, created_by, deadline, deadline_reminders_sent "
        f"FROM {schema}.tasks "
        f"WHERE archived = false AND deadline IS NOT NULL AND deadline > NOW()"
    )
    rows = cur.fetchall()

    sent_count = 0
    for row in rows:
        task_id, title, assignee_id, assignee_ids, created_by, deadline, reminders_sent = row
        reminders_sent = reminders_sent or []
        seconds_left = (deadline - now).total_seconds()
        if seconds_left <= 0:
            continue

        # Стадии, окно которых уже наступило (осталось меньше порога) и ещё не отправленные.
        due_stages = [s for s in REMINDER_STAGES if s['key'] not in reminders_sent and seconds_left <= s['seconds']]
        if not due_stages:
            continue
        # Если сразу несколько порогов "просрочены" (например, дедлайн создан уже близко,
        # или cron долго не запускался) — реально отправляем только самый актуальный
        # (ближайший к дедлайну), а более ранние молча помечаем отправленными, чтобы не спамить.
        most_urgent = min(due_stages, key=lambda s: s['seconds'])
        newly_marked = [s['key'] for s in due_stages]

        targets = set()
        if created_by:
            targets.add(created_by)
        for uid in _task_assignee_ids(assignee_id, assignee_ids):
            targets.add(uid)

        if targets:
            for uid in targets:
                _add_notif(cur, schema, uid, 'task_deadline_reminder', 'Приближается срок выполнения задачи', f'«{title}» — {most_urgent["label"]}', 'task', task_id)

            button_url = _task_url(task_id)
            text = f"⏰ Срок выполнения задачи истекает {most_urgent['label']}:\n\n«{title}»"
            for tg_id in _telegram_targets(cur, schema, list(targets)):
                _tg_send(tg_id, text, button_url)
            sent_count += 1

        reminders_sent = reminders_sent + newly_marked

        cur.execute(
            f"UPDATE {schema}.tasks SET deadline_reminders_sent = %s WHERE id = %s",
            (json.dumps(reminders_sent), task_id)
        )

    cur.close()
    conn.close()
    return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'checked': len(rows), 'reminders_sent': sent_count})}
