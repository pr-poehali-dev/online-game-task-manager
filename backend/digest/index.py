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


def _current_user(cur, schema, token):
    if not token:
        return None
    cur.execute(
        f"SELECT u.id, u.role FROM {schema}.sessions s JOIN {schema}.users u ON u.id = s.user_id "
        f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = true",
        (token,)
    )
    row = cur.fetchone()
    if not row:
        return None
    return {'id': row[0], 'role': row[1]}


DEFAULT_PREFS = {
    'patchnotesEnabled': True,
    'newTasksEnabled': True,
    'closedTasksEnabled': True,
    'newIdeasEnabled': True,
    'newArticlesEnabled': True,
}


def _get_prefs(cur, schema, user_id):
    cur.execute(
        f"SELECT patchnotes_enabled, new_tasks_enabled, closed_tasks_enabled, new_ideas_enabled, new_articles_enabled "
        f"FROM {schema}.employee_digest_prefs WHERE user_id = %s",
        (user_id,)
    )
    row = cur.fetchone()
    if not row:
        return dict(DEFAULT_PREFS)
    return {
        'patchnotesEnabled': bool(row[0]),
        'newTasksEnabled': bool(row[1]),
        'closedTasksEnabled': bool(row[2]),
        'newIdeasEnabled': bool(row[3]),
        'newArticlesEnabled': bool(row[4]),
    }


def _count_events(cur, schema, user_id, since):
    '''Считает 5 метрик дайджеста с момента since (исключительно, > since) до текущего момента.
    Каждый счётчик считается независимо от того, включён ли он в настройках — фильтрацию по
    настройкам делает фронт при отрисовке (проще один раз посчитать всё, чем городить условный
    SQL под каждую комбинацию галочек, разница в стоимости запроса пренебрежимо мала).'''
    cur.execute(f"SELECT COUNT(*) FROM {schema}.patchnotes WHERE created_at > %s", (since,))
    patchnotes = cur.fetchone()[0]

    # Новые задачи, НАЗНАЧЕННЫЕ этому сотруднику — по событиям назначения (task_assignment_events),
    # а не по tasks.created_at: задачу могли создать раньше, а назначить исполнителя — позже, и
    # именно момент назначения релевантен лично сотруднику (см. formulировку "назначенных ему").
    cur.execute(
        f"SELECT COUNT(DISTINCT task_id) FROM {schema}.task_assignment_events WHERE user_id = %s AND assigned_at > %s",
        (user_id, since)
    )
    new_tasks = cur.fetchone()[0]

    # Закрытые задачи ВСЕЙ командой (включая самого сотрудника, если он их закрывал) — по факту
    # архивации (archived_at), а не по updated_at, т.к. archived_at заполняется именно при закрытии.
    cur.execute(f"SELECT COUNT(*) FROM {schema}.tasks WHERE archived = true AND archived_at > %s", (since,))
    closed_tasks = cur.fetchone()[0]

    cur.execute(f"SELECT COUNT(*) FROM {schema}.idea_topics WHERE created_at > %s", (since,))
    new_ideas = cur.fetchone()[0]

    # Новые статьи базы знаний — с учётом видимости: приватная статья считается только если
    # сотрудник её автор, входит в список допущенных, либо он администратор (та же логика, что
    # _can_view в backend/knowledge/index.py — держать в синхроне при правках видимости КБ).
    cur.execute(
        f"SELECT COUNT(*) FROM {schema}.kb_articles WHERE created_at > %s AND "
        f"(visibility != 'private' OR author_id = %s OR allowed_user_ids @> to_jsonb(%s::int))",
        (since, user_id, user_id)
    )
    new_articles = cur.fetchone()[0]

    return {
        'patchnotes': patchnotes,
        'newTasks': new_tasks,
        'closedTasks': closed_tasks,
        'newIdeas': new_ideas,
        'newArticles': new_articles,
    }


def handler(event: dict, context) -> dict:
    '''Ежедневный дайджест событий для сотрудника: блокирующий попап при входе со сводкой за
    время с последнего "Ознакомлен" (патчноуты, задачи назначенные ему, закрытые задачи всей
    командой, новые идеи, новые статьи базы знаний). Показывается не чаще раза в календарные
    сутки (сравнение даты по МСК) — action=check возвращает shouldShow и счётчики, action=
    acknowledge фиксирует момент нажатия кнопки (следующий показ не раньше следующих суток).
    Набор включённых метрик настраивается самим сотрудником в личном кабинете (action=
    get_prefs/set_prefs). Для сотрудников, у которых ещё нет записи состояния (новые аккаунты,
    а также все существующие на момент введения фичи — см. миграцию V0107), первая проверка
    молча создаёт запись с last_ack_at=NOW() без показа попапа — точка отсчёта событий начинается
    с этого момента, а не с даты регистрации.'''
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

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or ('check' if method == 'GET' else '')

    if action == 'check':
        cur.execute(f"SELECT last_ack_at FROM {schema}.employee_digest_state WHERE user_id = %s", (me['id'],))
        row = cur.fetchone()
        if not row:
            # Бутстрап для сотрудника без записи состояния — первый показ переносится на следующие
            # календарные сутки после этого момента, история аккаунта до сих пор не учитывается.
            cur.execute(
                f"INSERT INTO {schema}.employee_digest_state (user_id, last_ack_at) VALUES (%s, NOW())",
                (me['id'],)
            )
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({
                'shouldShow': False, 'counts': None, 'prefs': DEFAULT_PREFS, 'periodStart': None, 'periodEnd': None,
            })}

        last_ack_at = row[0]
        # Показываем не чаще раза в календарные сутки — сравниваем ДАТУ (по МСК) последнего
        # "Ознакомлен" с сегодняшней; если даты совпадают, сотрудник уже видел дайджест сегодня.
        cur.execute(
            f"SELECT (%s AT TIME ZONE 'Europe/Moscow')::date < (NOW() AT TIME ZONE 'Europe/Moscow')::date",
            (last_ack_at,)
        )
        should_show = bool(cur.fetchone()[0])

        if not should_show:
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({
                'shouldShow': False, 'counts': None, 'prefs': _get_prefs(cur, schema, me['id']),
                'periodStart': last_ack_at.isoformat(), 'periodEnd': None,
            })}

        cur.execute("SELECT NOW()")
        now = cur.fetchone()[0]
        counts = _count_events(cur, schema, me['id'], last_ack_at)
        prefs = _get_prefs(cur, schema, me['id'])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({
            'shouldShow': True, 'counts': counts, 'prefs': prefs,
            'periodStart': last_ack_at.isoformat(), 'periodEnd': now.isoformat(),
        })}

    # Сотрудник нажал «Ознакомлен» — фиксируем момент, следующий показ не раньше следующих
    # календарных суток (по МСК) после этого.
    if action == 'acknowledge':
        cur.execute(
            f"INSERT INTO {schema}.employee_digest_state (user_id, last_ack_at) VALUES (%s, NOW()) "
            f"ON CONFLICT (user_id) DO UPDATE SET last_ack_at = NOW()",
            (me['id'],)
        )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    if action == 'get_prefs':
        prefs = _get_prefs(cur, schema, me['id'])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'prefs': prefs})}

    # Сотрудник сам настраивает, какие из 5 блоков дайджеста ему показывать (личный кабинет).
    if action == 'set_prefs':
        p = body.get('prefs') or {}
        cur.execute(
            f"INSERT INTO {schema}.employee_digest_prefs "
            f"(user_id, patchnotes_enabled, new_tasks_enabled, closed_tasks_enabled, new_ideas_enabled, new_articles_enabled, updated_at) "
            f"VALUES (%s, %s, %s, %s, %s, %s, NOW()) "
            f"ON CONFLICT (user_id) DO UPDATE SET "
            f"patchnotes_enabled = %s, new_tasks_enabled = %s, closed_tasks_enabled = %s, "
            f"new_ideas_enabled = %s, new_articles_enabled = %s, updated_at = NOW()",
            (
                me['id'],
                bool(p.get('patchnotesEnabled', True)), bool(p.get('newTasksEnabled', True)),
                bool(p.get('closedTasksEnabled', True)), bool(p.get('newIdeasEnabled', True)),
                bool(p.get('newArticlesEnabled', True)),
                bool(p.get('patchnotesEnabled', True)), bool(p.get('newTasksEnabled', True)),
                bool(p.get('closedTasksEnabled', True)), bool(p.get('newIdeasEnabled', True)),
                bool(p.get('newArticlesEnabled', True)),
            )
        )
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}
