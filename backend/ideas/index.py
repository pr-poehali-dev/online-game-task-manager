import json
import os

import psycopg2


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


def _topic_row(r):
    return {
        'id': str(r[0]),
        'title': r[1],
        'body': r[2],
        'status': r[3],
        'authorId': r[4],
        'createdAt': r[5].isoformat() if r[5] else None,
        'updatedAt': r[6].isoformat() if r[6] else None,
    }


def _comment_row(r):
    return {
        'id': str(r[0]),
        'topicId': str(r[1]),
        'authorId': r[2],
        'text': r[3],
        'createdAt': r[4].isoformat() if r[4] else None,
        'parentId': str(r[5]) if len(r) > 5 and r[5] else None,
        'mentions': (r[6] if len(r) > 6 and r[6] is not None else []),
    }


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


TOPIC_COLS = "id, title, body, status, author_id, created_at, updated_at"
COMMENT_COLS = "id, topic_id, author_id, text, created_at, parent_id, mentions"


def _add_notification(cur, schema, user_id, ntype, title, body_text, entity_id, actor_id):
    '''Создаёт внутреннее уведомление (не для самого себя).'''
    if not user_id or user_id == actor_id:
        return
    cur.execute(
        f"INSERT INTO {schema}.notifications (user_id, type, title, body, entity_type, entity_id, actor_id) "
        f"VALUES (%s, %s, %s, %s, 'idea', %s, %s)",
        (user_id, ntype, title, body_text, str(entity_id) if entity_id else None, actor_id)
    )


def handler(event: dict, context) -> dict:
    '''Раздел «Идеи»: треды-обсуждения с комментариями и статусами (открыт, решено не делать, отправлено на реализацию). Закрывать топик может автор или админ. Доступно авторизованным участникам.'''
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
    action = body.get('action') or qs.get('action') or ('list' if method == 'GET' else '')

    # Список топиков (+ количество комментариев)
    if action == 'list' or (method == 'GET' and not qs.get('id')):
        cur.execute(
            f"SELECT t.id, t.title, t.body, t.status, t.author_id, t.created_at, t.updated_at, "
            f"(SELECT COUNT(*) FROM {schema}.idea_comments c WHERE c.topic_id = t.id) AS cnt "
            f"FROM {schema}.idea_topics t ORDER BY t.updated_at DESC"
        )
        items = []
        for r in cur.fetchall():
            d = _topic_row(r[:7])
            d['commentsCount'] = r[7]
            items.append(d)
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'topics': items})}

    # Один топик с комментариями
    if action == 'get' or (method == 'GET' and qs.get('id')):
        tid = body.get('id') or qs.get('id')
        cur.execute(f"SELECT {TOPIC_COLS} FROM {schema}.idea_topics WHERE id = %s", (int(tid),))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        topic = _topic_row(row)
        cur.execute(f"SELECT {COMMENT_COLS} FROM {schema}.idea_comments WHERE topic_id = %s ORDER BY created_at ASC", (int(tid),))
        comments = [_comment_row(c) for c in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'topic': topic, 'comments': comments})}

    # Создать топик
    if action == 'create':
        title = (body.get('title') or '').strip()
        if not title:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_title'})}
        cur.execute(
            f"INSERT INTO {schema}.idea_topics (title, body, author_id) VALUES (%s, %s, %s) RETURNING {TOPIC_COLS}",
            (title, body.get('body') or '', me['id'])
        )
        topic = _topic_row(cur.fetchone())
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'topic': topic})}

    # Добавить комментарий (+ ответ + упоминания)
    if action == 'comment':
        tid = body.get('topicId')
        text = (body.get('text') or '').strip()
        if not tid or not text:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
        parent_id = body.get('parentId')
        parent_id = int(parent_id) if parent_id else None
        mentions = _norm_ids(body.get('mentions'))
        cur.execute(
            f"INSERT INTO {schema}.idea_comments (topic_id, author_id, text, parent_id, mentions) "
            f"VALUES (%s, %s, %s, %s, %s) RETURNING {COMMENT_COLS}",
            (int(tid), me['id'], text, parent_id, json.dumps(mentions))
        )
        comment = _comment_row(cur.fetchone())
        cur.execute(f"UPDATE {schema}.idea_topics SET updated_at = NOW() WHERE id = %s", (int(tid),))
        cur.execute(f"SELECT author_id, title FROM {schema}.idea_topics WHERE id = %s", (int(tid),))
        trow = cur.fetchone()
        topic_title = trow[1] if trow else 'идея'
        notified = set()
        # Ответ автору родительского комментария
        if parent_id:
            cur.execute(f"SELECT author_id FROM {schema}.idea_comments WHERE id = %s", (parent_id,))
            prow = cur.fetchone()
            if prow and prow[0] and prow[0] != me['id']:
                _add_notification(cur, schema, prow[0], 'idea_reply', 'Ответ на ваш комментарий', topic_title, tid, me['id'])
                notified.add(prow[0])
        # Упоминания
        for uid in mentions:
            if uid not in notified:
                _add_notification(cur, schema, uid, 'idea_mention', 'Вас упомянули в обсуждении', topic_title, tid, me['id'])
                notified.add(uid)
        # Уведомить автора темы (если это не ответ и не упоминание ему)
        if trow and trow[0] and trow[0] != me['id'] and trow[0] not in notified:
            _add_notification(cur, schema, trow[0], 'idea_comment', 'Новый комментарий к вашей идее', topic_title, tid, me['id'])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'comment': comment})}

    # Удалить комментарий идеи (автор или админ)
    if action == 'comment_delete':
        cid = body.get('id')
        if not cid:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT author_id FROM {schema}.idea_comments WHERE id = %s", (int(cid),))
        crow = cur.fetchone()
        if not crow:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        if crow[0] != me['id'] and me['role'] != 'admin':
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        cur.execute(f"UPDATE {schema}.idea_comments SET parent_id = NULL WHERE parent_id = %s", (int(cid),))
        cur.execute(f"DELETE FROM {schema}.idea_comments WHERE id = %s", (int(cid),))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    # Сменить статус топика (закрыть/переоткрыть). Только автор или админ.
    if action == 'set_status':
        tid = body.get('id')
        status = body.get('status')
        if not tid or status not in ('open', 'wont_do', 'sent'):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'bad_request'})}
        cur.execute(f"SELECT author_id, title FROM {schema}.idea_topics WHERE id = %s", (int(tid),))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        if row[0] != me['id'] and me['role'] != 'admin':
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        cur.execute(
            f"UPDATE {schema}.idea_topics SET status = %s, updated_at = NOW() WHERE id = %s RETURNING {TOPIC_COLS}",
            (status, int(tid))
        )
        topic = _topic_row(cur.fetchone())
        status_label = {'sent': 'Отправлено на реализацию', 'wont_do': 'Решено не делать', 'open': 'Переоткрыто'}.get(status, status)
        _add_notification(cur, schema, row[0], 'idea_status', f'Статус идеи: {status_label}', row[1], tid, me['id'])
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'topic': topic})}

    # Удалить топик. Только автор или админ.
    if action == 'delete':
        tid = body.get('id')
        if not tid:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'no_id'})}
        cur.execute(f"SELECT author_id FROM {schema}.idea_topics WHERE id = %s", (int(tid),))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': _cors_headers(), 'body': json.dumps({'error': 'not_found'})}
        if row[0] != me['id'] and me['role'] != 'admin':
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}
        cur.execute(f"DELETE FROM {schema}.idea_comments WHERE topic_id = %s", (int(tid),))
        cur.execute(f"DELETE FROM {schema}.idea_topics WHERE id = %s", (int(tid),))
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps({'ok': True})}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': _cors_headers(), 'body': json.dumps({'error': 'unknown_action'})}