import json
import os
import re
import threading
from datetime import datetime, timedelta, timezone
import urllib.error
import urllib.parse
import urllib.request

import psycopg2

KICK_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
SLUG_RE = re.compile(r'^[A-Za-z0-9_\-]{2,60}$')
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
MSK = timezone(timedelta(hours=3))
SESSION_DURATION = "EXTRACT(EPOCH FROM (COALESCE(ss.ended_at, NOW()) - ss.started_at))"
SESSION_SHARE = "(ss.minutes_matched::numeric / NULLIF(ss.minutes_total, 0))"
SESSION_SORTS = {
    'streamer': 's.display_name',
    'started': 'ss.started_at',
    'duration': SESSION_DURATION,
    'peak': 'ss.peak_viewers',
    'avg': 'ss.avg_viewers',
    'share': SESSION_SHARE,
}


def _cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json',
    }


def _resp(code, data):
    return {'statusCode': code, 'headers': _cors_headers(), 'body': json.dumps(data, ensure_ascii=False, default=str)}


def _schema():
    return os.environ.get('MAIN_DB_SCHEMA', 'public')


def _db():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    return conn


ALL_PERMISSIONS = [
    'task_create', 'task_edit_own', 'task_view_others', 'task_restart', 'task_archive',
    'idea_create',
    'kb_create', 'kb_edit',
    'sprint_create', 'sprint_edit',
    'launcher_notify',
    'private_notes_view_others',
    'patch_edit', 'patch_launcher_upload', 'patch_delete_files',
    'logs_view',
    'ai_access',
    'streamers_view', 'streamers_edit',
    'team_manage',
]


def _effective_perms(role, raw):
    '''Те же правила, что в backend/auth и backend/admin: явно выданное право приоритетнее роли,
    иначе значение по умолчанию для роли (admin = да), кроме привилегированных разделов.'''
    result = {}
    for key in ALL_PERMISSIONS:
        if key in ('patch_launcher_upload', 'patch_delete_files'):
            continue
        if isinstance(raw, dict) and key in raw and raw[key] is not None:
            result[key] = bool(raw[key])
        elif key in ('patch_edit', 'logs_view', 'ai_access', 'team_manage'):
            result[key] = False
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
    return {'id': row[0], 'role': row[1], 'perms': _effective_perms(row[1], row[2])}


def parse_slug(raw):
    '''Достаёт slug канала из ссылки kick.com/<slug> или из самого ника.'''
    s = (raw or '').strip()
    if not s:
        return None
    s = re.sub(r'^https?://', '', s, flags=re.I)
    s = re.sub(r'^(www\.)?kick\.com/', '', s, flags=re.I)
    s = s.split('?')[0].split('#')[0].strip('/').split('/')[0]
    return s.lower() if SLUG_RE.match(s) else None


def _http(url, method, headers, data, box):
    req = urllib.request.Request(url, data=data, method=method, headers={'User-Agent': KICK_UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=2) as r:
            raw = r.read().decode('utf-8', 'ignore')
            status = r.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'ignore')
        status = e.code
    except Exception as e:
        box['res'] = (0, {'network_error': type(e).__name__})
        return
    try:
        box['res'] = (status, json.loads(raw))
    except Exception:
        box['res'] = (status, {})


def _kick_call(url, method='GET', headers=None, data=None, limit=1.6):
    '''Запрос к Kick в отдельном потоке с жёстким лимитом: зависший DNS не должен убить всю функцию.'''
    box = {}
    t = threading.Thread(target=_http, args=(url, method, headers, data, box), daemon=True)
    t.start()
    t.join(limit)
    return box.get('res') or (0, {'hang': True})


def kick_lookup(slug):
    '''Возвращает (канал | None, причина). Причины: ok, not_found, kick_unavailable, no_keys.'''
    client_id = os.environ.get('KICK_CLIENT_ID', '')
    client_secret = os.environ.get('KICK_CLIENT_SECRET', '')
    if not client_id or not client_secret:
        return None, 'no_keys'
    form = urllib.parse.urlencode({
        'grant_type': 'client_credentials', 'client_id': client_id, 'client_secret': client_secret,
    }).encode()
    token = None
    for _ in range(2):
        status, body = _kick_call('https://id.kick.com/oauth/token', 'POST',
                                  {'Content-Type': 'application/x-www-form-urlencoded'}, form)
        token = body.get('access_token') if isinstance(body, dict) else None
        if token:
            break
    if not token:
        return None, 'kick_unavailable'
    q = urllib.parse.urlencode({'slug': slug})
    for _ in range(2):
        status, body = _kick_call(f'https://api.kick.com/public/v1/channels?{q}',
                                  headers={'Authorization': f'Bearer {token}'})
        if status == 200 and isinstance(body, dict):
            for ch in body.get('data') or []:
                if (ch.get('slug') or '').lower() == slug:
                    return ch, 'ok'
            return None, 'not_found'
    return None, 'kick_unavailable'


STREAMER_COLUMNS = (
    "s.id, s.platform, s.channel_slug, s.channel_url, s.display_name, s.avatar_url, s.game_user_id, "
    "s.is_active, s.ownership_verified, s.note, s.created_at"
)


def _row_to_streamer(r):
    return {
        'id': r[0], 'platform': r[1], 'channelSlug': r[2], 'channelUrl': r[3], 'displayName': r[4],
        'avatarUrl': r[5], 'gameUserId': r[6], 'isActive': r[7], 'ownershipVerified': r[8],
        'note': r[9], 'createdAt': r[10].isoformat() if r[10] else None,
    }


def _valid_date(value):
    try:
        datetime.strptime(value, '%Y-%m-%d')
        return True
    except ValueError:
        return False


def _msk_day_start(value):
    '''Начало календарного дня по Москве (UTC+3, без перехода на летнее время).'''
    return datetime.strptime(value, '%Y-%m-%d').replace(tzinfo=MSK)


def _clean_keywords(raw):
    result = []
    for v in raw or []:
        w = str(v).strip().lstrip('#').strip().lower()
        if w and w not in result:
            result.append(w)
    return result[:20]


def _rule_to_json(r):
    return {
        'streamerId': r[0], 'keywords': r[1] or [], 'matchMode': r[2],
        'checkTitle': r[3], 'checkTags': r[4],
        'updatedAt': r[5].isoformat() if r[5] else None,
    }


def handler(event: dict, context) -> dict:
    '''API раздела «Стримеры»: список со статусом «в эфире», добавление по ссылке Kick, пауза и заметка, удаление, правила проверки слов (по умолчанию и для стримера), состояние сборщика. Просмотр требует права streamers_view, изменения — streamers_edit.'''
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    schema = _schema()
    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token')

    conn = _db()
    cur = conn.cursor()
    try:
        me = _current_user(cur, schema, token)
        if not me:
            return _resp(401, {'error': 'unauthorized'})

        body = {}
        if event.get('body'):
            try:
                body = json.loads(event['body'])
            except Exception:
                body = {}
        qs = event.get('queryStringParameters') or {}
        action = body.get('action') or qs.get('action') or ('list' if method == 'GET' else '')

        can_view = me['perms'].get('streamers_view') or me['perms'].get('streamers_edit')
        can_edit = me['perms'].get('streamers_edit')
        read_actions = {'list', 'rules_get', 'health', 'sessions'}
        if action in read_actions and not can_view:
            return _resp(403, {'error': 'forbidden'})
        if action not in read_actions and not can_edit:
            return _resp(403, {'error': 'forbidden'})

        if action == 'list':
            cur.execute(
                f"SELECT {STREAMER_COLUMNS}, ss.id, ss.started_at, ss.last_title, ss.peak_viewers, ss.category, "
                f"(SELECT sn.viewers FROM {schema}.stream_snapshots sn WHERE sn.session_id = ss.id "
                f"ORDER BY sn.captured_at DESC LIMIT 1), "
                f"(SELECT sn.rule_matched FROM {schema}.stream_snapshots sn WHERE sn.session_id = ss.id "
                f"ORDER BY sn.captured_at DESC LIMIT 1) "
                f"FROM {schema}.streamers s "
                f"LEFT JOIN {schema}.stream_sessions ss ON ss.streamer_id = s.id AND ss.ended_at IS NULL "
                f"ORDER BY (ss.id IS NULL), s.display_name"
            )
            items = []
            for r in cur.fetchall():
                item = _row_to_streamer(r[:11])
                item['live'] = None
                if r[11] is not None:
                    item['live'] = {
                        'sessionId': r[11], 'startedAt': r[12].isoformat(), 'title': r[13],
                        'peakViewers': r[14], 'category': r[15], 'viewers': r[16] or 0,
                        'ruleMatched': bool(r[17]),
                    }
                items.append(item)
            return _resp(200, {'streamers': items})

        if action == 'add':
            slug = parse_slug(body.get('url') or body.get('slug'))
            if not slug:
                return _resp(400, {'error': 'bad_link', 'message': 'Не удалось разобрать ссылку. Нужен адрес вида https://kick.com/ник'})
            cur.execute(f"SELECT id, is_active FROM {schema}.streamers WHERE platform = 'kick' AND channel_slug = %s", (slug,))
            existing = cur.fetchone()
            if existing:
                return _resp(409, {'error': 'exists', 'message': 'Этот стример уже добавлен', 'id': existing[0]})
            channel, reason = kick_lookup(slug)
            if reason == 'no_keys':
                return _resp(500, {'error': 'no_keys', 'message': 'Не заданы ключи Kick (KICK_CLIENT_ID, KICK_CLIENT_SECRET)'})
            if reason == 'not_found':
                return _resp(404, {'error': 'not_found', 'message': 'Канал на Kick не найден. Проверьте ссылку'})
            if reason != 'ok':
                return _resp(503, {'error': 'kick_unavailable', 'message': 'Kick сейчас не ответил. Попробуйте добавить ещё раз через минуту'})
            display = (body.get('displayName') or '').strip() or slug
            cur.execute(
                f"INSERT INTO {schema}.streamers (platform, channel_slug, channel_url, display_name, broadcaster_user_id, note, added_by) "
                f"VALUES ('kick', %s, %s, %s, %s, %s, %s) RETURNING id",
                (slug, f'https://kick.com/{slug}', display, channel.get('broadcaster_user_id'),
                 (body.get('note') or '').strip() or None, me['id'])
            )
            new_id = cur.fetchone()[0]
            cur.execute(f"SELECT {STREAMER_COLUMNS} FROM {schema}.streamers s WHERE s.id = %s", (new_id,))
            return _resp(200, {'streamer': _row_to_streamer(cur.fetchone())})

        if action == 'update':
            sid = body.get('id')
            if not sid:
                return _resp(400, {'error': 'id_required'})
            sets, params = [], []
            if 'isActive' in body:
                sets.append('is_active = %s'); params.append(bool(body['isActive']))
            if 'note' in body:
                sets.append('note = %s'); params.append((body['note'] or '').strip() or None)
            if 'gameUserId' in body:
                sets.append('game_user_id = %s'); params.append((str(body['gameUserId'] or '')).strip() or None)
            if 'displayName' in body:
                name = (body['displayName'] or '').strip()
                if not name:
                    return _resp(400, {'error': 'name_empty'})
                sets.append('display_name = %s'); params.append(name)
            if not sets:
                return _resp(400, {'error': 'nothing_to_update'})
            params.append(sid)
            cur.execute(f"UPDATE {schema}.streamers SET {', '.join(sets)} WHERE id = %s RETURNING id", params)
            if not cur.fetchone():
                return _resp(404, {'error': 'not_found'})
            cur.execute(f"SELECT {STREAMER_COLUMNS} FROM {schema}.streamers s WHERE s.id = %s", (sid,))
            return _resp(200, {'streamer': _row_to_streamer(cur.fetchone())})

        if action == 'delete':
            sid = body.get('id')
            if not sid:
                return _resp(400, {'error': 'id_required'})
            cur.execute(f"SELECT 1 FROM {schema}.stream_sessions WHERE streamer_id = %s LIMIT 1", (sid,))
            if cur.fetchone():
                return _resp(409, {'error': 'has_history', 'message': 'У стримера есть история трансляций, её удалять нельзя. Поставьте мониторинг на паузу'})
            cur.execute(f"DELETE FROM {schema}.stream_events WHERE streamer_id = %s", (sid,))
            cur.execute(f"DELETE FROM {schema}.streamer_rules WHERE streamer_id = %s", (sid,))
            cur.execute(f"DELETE FROM {schema}.streamers WHERE id = %s RETURNING id", (sid,))
            if not cur.fetchone():
                return _resp(404, {'error': 'not_found'})
            return _resp(200, {'ok': True})

        if action == 'rules_get':
            cur.execute(
                f"SELECT streamer_id, keywords, match_mode, check_title, check_tags, updated_at "
                f"FROM {schema}.streamer_rules ORDER BY streamer_id NULLS FIRST"
            )
            rules = [_rule_to_json(r) for r in cur.fetchall()]
            default = next((r for r in rules if r['streamerId'] is None), None)
            return _resp(200, {'default': default, 'perStreamer': [r for r in rules if r['streamerId'] is not None]})

        if action == 'rules_set':
            sid = body.get('streamerId')
            keywords = _clean_keywords(body.get('keywords'))
            mode = body.get('matchMode') or 'any'
            if mode not in ('any', 'all'):
                return _resp(400, {'error': 'bad_mode'})
            check_title = bool(body.get('checkTitle', True))
            check_tags = bool(body.get('checkTags', False))
            if not keywords:
                return _resp(400, {'error': 'keywords_empty', 'message': 'Укажите хотя бы одно слово'})
            if not check_title and not check_tags:
                return _resp(400, {'error': 'nothing_checked', 'message': 'Выберите, где искать: в названии или в тегах'})
            keywords_json = json.dumps(keywords, ensure_ascii=False)
            if sid is None:
                cur.execute(
                    f"UPDATE {schema}.streamer_rules SET keywords = %s::jsonb, match_mode = %s, check_title = %s, "
                    f"check_tags = %s, updated_by = %s, updated_at = NOW() WHERE streamer_id IS NULL RETURNING id",
                    (keywords_json, mode, check_title, check_tags, me['id'])
                )
                if not cur.fetchone():
                    cur.execute(
                        f"INSERT INTO {schema}.streamer_rules (streamer_id, keywords, match_mode, check_title, check_tags, updated_by) "
                        f"VALUES (NULL, %s::jsonb, %s, %s, %s, %s)",
                        (keywords_json, mode, check_title, check_tags, me['id'])
                    )
            else:
                cur.execute(f"SELECT 1 FROM {schema}.streamers WHERE id = %s", (sid,))
                if not cur.fetchone():
                    return _resp(404, {'error': 'not_found'})
                cur.execute(
                    f"UPDATE {schema}.streamer_rules SET keywords = %s::jsonb, match_mode = %s, check_title = %s, "
                    f"check_tags = %s, updated_by = %s, updated_at = NOW() WHERE streamer_id = %s RETURNING id",
                    (keywords_json, mode, check_title, check_tags, me['id'], sid)
                )
                if not cur.fetchone():
                    cur.execute(
                        f"INSERT INTO {schema}.streamer_rules (streamer_id, keywords, match_mode, check_title, check_tags, updated_by) "
                        f"VALUES (%s, %s::jsonb, %s, %s, %s, %s)",
                        (sid, keywords_json, mode, check_title, check_tags, me['id'])
                    )
            return _resp(200, {'ok': True, 'keywords': keywords})

        if action == 'rules_reset':
            sid = body.get('streamerId')
            if sid is None:
                return _resp(400, {'error': 'id_required', 'message': 'Правило по умолчанию сбросить нельзя, его можно только изменить'})
            cur.execute(f"DELETE FROM {schema}.streamer_rules WHERE streamer_id = %s", (sid,))
            return _resp(200, {'ok': True})

        if action == 'sessions':
            where, params = [], []
            sid = body.get('streamerId')
            if sid:
                try:
                    where.append('ss.streamer_id = %s'); params.append(int(sid))
                except (TypeError, ValueError):
                    return _resp(400, {'error': 'bad_params'})
            date_from, date_to = body.get('dateFrom'), body.get('dateTo')
            if date_from:
                if not DATE_RE.match(str(date_from)) or not _valid_date(date_from):
                    return _resp(400, {'error': 'bad_date'})
                where.append('ss.started_at >= %s'); params.append(_msk_day_start(date_from))
            if date_to:
                if not DATE_RE.match(str(date_to)) or not _valid_date(date_to):
                    return _resp(400, {'error': 'bad_date'})
                where.append('ss.started_at < %s'); params.append(_msk_day_start(date_to) + timedelta(days=1))
            where_sql = ('WHERE ' + ' AND '.join(where)) if where else ''
            sort_sql = SESSION_SORTS.get(body.get('sort') or 'started', SESSION_SORTS['started'])
            direction = 'ASC' if body.get('dir') == 'asc' else 'DESC'
            try:
                page = max(1, int(body.get('page') or 1))
            except (TypeError, ValueError):
                return _resp(400, {'error': 'bad_params'})
            page_size = 25
            cur.execute(
                f"SELECT COUNT(*) FROM {schema}.stream_sessions ss {where_sql}", params
            )
            total = cur.fetchone()[0]
            cur.execute(
                f"SELECT ss.id, ss.streamer_id, s.display_name, s.channel_slug, ss.started_at, ss.ended_at, "
                f"{SESSION_DURATION}::int, ss.peak_viewers, ss.avg_viewers, ss.minutes_total, ss.minutes_matched, "
                f"ss.last_title, ss.review_status "
                f"FROM {schema}.stream_sessions ss JOIN {schema}.streamers s ON s.id = ss.streamer_id "
                f"{where_sql} ORDER BY {sort_sql} {direction} NULLS LAST, ss.id DESC LIMIT %s OFFSET %s",
                params + [page_size, (page - 1) * page_size]
            )
            items = []
            for r in cur.fetchall():
                items.append({
                    'id': r[0], 'streamerId': r[1], 'displayName': r[2], 'channelSlug': r[3],
                    'startedAt': r[4].isoformat(), 'endedAt': r[5].isoformat() if r[5] else None,
                    'durationSeconds': r[6], 'peakViewers': r[7], 'avgViewers': float(r[8] or 0),
                    'minutesTotal': r[9], 'minutesMatched': r[10],
                    'matchShare': (r[10] / r[9]) if r[9] else None,
                    'title': r[11], 'reviewStatus': r[12],
                })
            return _resp(200, {'sessions': items, 'total': total, 'page': page, 'pageSize': page_size})

        if action == 'health':
            cur.execute(
                f"SELECT last_success_at, last_error_at, last_error_text, "
                f"EXTRACT(EPOCH FROM (NOW() - last_success_at))::int FROM {schema}.streamer_collector_state WHERE id = 1"
            )
            r = cur.fetchone()
            seconds = r[3] if r else None
            return _resp(200, {
                'lastSuccessAt': r[0].isoformat() if r and r[0] else None,
                'lastErrorAt': r[1].isoformat() if r and r[1] else None,
                'lastErrorText': r[2] if r else None,
                'secondsSinceSuccess': seconds,
                'healthy': seconds is not None and seconds <= 300,
            })

        return _resp(400, {'error': 'unknown_action'})
    finally:
        cur.close()
        conn.close()
