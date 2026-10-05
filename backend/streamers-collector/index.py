import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import psycopg2

KICK_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
BATCH_SIZE = 10
MISSES_TO_CLOSE = 3
STALE_MINUTES = 10
RESTART_TOLERANCE_SECONDS = 120
FETCH_BUDGET_SECONDS = 3.3
TOKEN_REFRESH_BEFORE_DAYS = 1


def _cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret',
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


def parse_start(value):
    '''Время старта эфира от Kick. Для офлайн-канала приходит 0001-01-01 — это «нет даты».'''
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    if dt.year < 2000:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def read_channel(ch):
    '''Приводит ответ Kick по каналу к простому виду.'''
    stream = ch.get('stream') or {}
    tags = ch.get('custom_tags') or stream.get('custom_tags') or []
    return {
        'live': bool(stream.get('is_live')),
        'start': parse_start(stream.get('start_time')),
        'viewers': int(stream.get('viewer_count') or 0),
        'title': (ch.get('stream_title') or '').strip(),
        'category': ((ch.get('category') or {}).get('name') or '').strip() or None,
        'tags': [str(t) for t in tags] if isinstance(tags, list) else [],
    }


def rule_matches(title, tags, rule):
    '''Проверка обязательных слов. Без учёта регистра, решётка в слове и в названии не мешает.'''
    if not rule:
        return False
    keywords = [str(k).strip().lstrip('#').lower() for k in (rule.get('keywords') or []) if str(k).strip()]
    if not keywords:
        return False
    haystacks = []
    if rule.get('check_title'):
        haystacks.append((title or '').lower())
    if rule.get('check_tags'):
        haystacks.append(' '.join(str(t).lstrip('#').lower() for t in (tags or [])))
    if not haystacks:
        return False
    text = ' \n '.join(haystacks)
    found = [k in text for k in keywords]
    return all(found) if rule.get('match_mode') == 'all' else any(found)


def plan_action(session, info):
    '''Что делать с одним стримером за этот опрос.
    unknown — Kick про канал не ответил: ничего не меняем, чтобы сбой API не закрыл эфир.
    open — эфир начался; restart — начался новый эфир, пока старая сессия ещё не закрыта;
    update — эфир продолжается; miss — канал не в эфире, копим пропуски; close — пропусков набралось.'''
    if info is None:
        return 'unknown'
    if info['live']:
        if session is None:
            return 'open'
        start = info['start']
        if start and start > session['started_at'] + timedelta(seconds=RESTART_TOLERANCE_SECONDS):
            return 'restart'
        return 'update'
    if session is None:
        return 'none'
    if session['missed_polls'] + 1 >= MISSES_TO_CLOSE:
        return 'close'
    return 'miss'


def _kick_post_token(box):
    client_id = os.environ.get('KICK_CLIENT_ID', '')
    client_secret = os.environ.get('KICK_CLIENT_SECRET', '')
    form = urllib.parse.urlencode({
        'grant_type': 'client_credentials', 'client_id': client_id, 'client_secret': client_secret,
    }).encode()
    req = urllib.request.Request(
        'https://id.kick.com/oauth/token', data=form, method='POST',
        headers={'User-Agent': KICK_UA, 'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(req, timeout=1.8) as r:
            box['res'] = json.loads(r.read().decode('utf-8', 'ignore'))
    except Exception as e:
        box['err'] = type(e).__name__


def request_new_token(deadline):
    '''Новый токен приложения Kick. До двух попыток в пределах отведённого времени.'''
    for _ in range(2):
        left = deadline - time.monotonic()
        if left < 0.5:
            break
        box = {}
        t = threading.Thread(target=_kick_post_token, args=(box,), daemon=True)
        t.start()
        t.join(min(left, 2.0))
        res = box.get('res')
        if isinstance(res, dict) and res.get('access_token'):
            return res['access_token'], int(res.get('expires_in') or 3600)
    return None, 0


def _fetch_batch(slugs, token, out, idx, deadline):
    q = urllib.parse.urlencode([('slug', s) for s in slugs])
    url = f'https://api.kick.com/public/v1/channels?{q}'
    last = 'timeout'
    for _ in range(2):
        left = deadline - time.monotonic()
        if left < 0.4:
            break
        req = urllib.request.Request(url, headers={'User-Agent': KICK_UA, 'Authorization': f'Bearer {token}'})
        try:
            with urllib.request.urlopen(req, timeout=min(1.6, left)) as r:
                body = json.loads(r.read().decode('utf-8', 'ignore'))
            out[idx] = ('ok', body.get('data') or [])
            return
        except urllib.error.HTTPError as e:
            if e.code == 401:
                out[idx] = ('auth', None)
                return
            last = f'HTTP {e.code}'
        except Exception as e:
            last = type(e).__name__
    out[idx] = ('fail', last)


def fetch_channels(batches, token, deadline):
    '''Опрашивает пачки каналов параллельно. Возвращает {индекс пачки: (статус, данные)}.'''
    out = {}
    threads = []
    for i, slugs in batches.items():
        t = threading.Thread(target=_fetch_batch, args=(slugs, token, out, i, deadline), daemon=True)
        t.start()
        threads.append(t)
    for t in threads:
        t.join(max(0.05, deadline - time.monotonic()))
    for i in batches:
        out.setdefault(i, ('fail', 'timeout'))
    return out


def _load_token(cur, schema):
    cur.execute(f"SELECT kick_token, kick_token_expires_at FROM {schema}.streamer_collector_state WHERE id = 1")
    row = cur.fetchone()
    if row and row[0] and row[1] and row[1] > datetime.now(timezone.utc) + timedelta(days=TOKEN_REFRESH_BEFORE_DAYS):
        return row[0]
    return None


def _save_token(cur, schema, token, expires_in):
    cur.execute(
        f"UPDATE {schema}.streamer_collector_state SET kick_token = %s, "
        f"kick_token_expires_at = NOW() + (%s || ' seconds')::interval WHERE id = 1",
        (token, str(expires_in))
    )


def _forget_token(cur, schema):
    cur.execute(f"UPDATE {schema}.streamer_collector_state SET kick_token = NULL, kick_token_expires_at = NULL WHERE id = 1")


def _event(cur, schema, streamer_id, session_id, etype, payload):
    cur.execute(
        f"INSERT INTO {schema}.stream_events (streamer_id, session_id, type, payload) VALUES (%s, %s, %s, %s::jsonb)",
        (streamer_id, session_id, etype, json.dumps(payload, ensure_ascii=False, default=str))
    )


def _recalc_sql(schema):
    return (
        f"UPDATE {schema}.stream_sessions AS ss SET minutes_total = agg.cnt, minutes_matched = agg.matched, "
        f"avg_viewers = agg.avg_v, peak_viewers = GREATEST(ss.peak_viewers, agg.max_v) "
        f"FROM (SELECT COUNT(*) AS cnt, COUNT(*) FILTER (WHERE rule_matched) AS matched, "
        f"COALESCE(ROUND(AVG(viewers), 1), 0) AS avg_v, COALESCE(MAX(viewers), 0) AS max_v "
        f"FROM {schema}.stream_snapshots WHERE session_id = %s) agg WHERE ss.id = %s"
    )


def close_session(cur, schema, session, reason, now):
    '''Закрывает сессию по времени последнего подтверждённого снимка.'''
    ended = session['last_snapshot_at'] or session['started_at']
    cur.execute(_recalc_sql(schema), (session['id'], session['id']))
    cur.execute(
        f"UPDATE {schema}.stream_sessions SET ended_at = %s, missed_polls = 0 WHERE id = %s AND ended_at IS NULL",
        (ended, session['id'])
    )
    _event(cur, schema, session['streamer_id'], session['id'], 'stream_ended', {'reason': reason, 'ended_at': ended})


def write_snapshot(cur, schema, session_id, minute, info, matched):
    cur.execute(
        f"INSERT INTO {schema}.stream_snapshots (session_id, captured_at, viewers, title, tags, rule_matched) "
        f"VALUES (%s, %s, %s, %s, %s::jsonb, %s) "
        f"ON CONFLICT (session_id, captured_at) DO UPDATE SET viewers = EXCLUDED.viewers, title = EXCLUDED.title, "
        f"tags = EXCLUDED.tags, rule_matched = EXCLUDED.rule_matched",
        (session_id, minute, info['viewers'], info['title'], json.dumps(info['tags'], ensure_ascii=False), matched)
    )
    cur.execute(_recalc_sql(schema), (session_id, session_id))


def open_session(cur, schema, streamer, info, now):
    started = info['start'] or now
    cur.execute(
        f"INSERT INTO {schema}.stream_sessions (streamer_id, started_at, first_title, last_title, category, peak_viewers) "
        f"VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (streamer_id) WHERE ended_at IS NULL DO NOTHING RETURNING id",
        (streamer['id'], started, info['title'], info['title'], info['category'], info['viewers'])
    )
    row = cur.fetchone()
    return row[0] if row else None


def handle_live_update(cur, schema, session, info, matched, minute):
    if info['title'] != session['last_title']:
        _event(cur, schema, session['streamer_id'], session['id'], 'title_changed',
               {'from': session['last_title'], 'to': info['title']})
    if session['last_matched'] is not None and bool(session['last_matched']) != matched:
        _event(cur, schema, session['streamer_id'], session['id'], 'rule_gained' if matched else 'rule_lost',
               {'title': info['title']})
    write_snapshot(cur, schema, session['id'], minute, info, matched)
    cur.execute(
        f"UPDATE {schema}.stream_sessions SET last_title = %s, category = COALESCE(%s, category), missed_polls = 0 "
        f"WHERE id = %s",
        (info['title'], info['category'], session['id'])
    )


def load_state(cur, schema):
    cur.execute(
        f"SELECT id, channel_slug FROM {schema}.streamers WHERE is_active = true AND platform = 'kick' ORDER BY id"
    )
    streamers = [{'id': r[0], 'slug': r[1]} for r in cur.fetchall()]

    cur.execute(f"SELECT streamer_id, keywords, match_mode, check_title, check_tags FROM {schema}.streamer_rules")
    rules = {}
    for r in cur.fetchall():
        rules[r[0]] = {'keywords': r[1] or [], 'match_mode': r[2], 'check_title': r[3], 'check_tags': r[4]}

    cur.execute(
        f"SELECT ss.id, ss.streamer_id, ss.started_at, ss.last_title, ss.missed_polls, "
        f"(SELECT sn.rule_matched FROM {schema}.stream_snapshots sn WHERE sn.session_id = ss.id ORDER BY sn.captured_at DESC LIMIT 1), "
        f"(SELECT sn.captured_at FROM {schema}.stream_snapshots sn WHERE sn.session_id = ss.id ORDER BY sn.captured_at DESC LIMIT 1) "
        f"FROM {schema}.stream_sessions ss WHERE ss.ended_at IS NULL"
    )
    sessions = {}
    for r in cur.fetchall():
        sessions[r[1]] = {
            'id': r[0], 'streamer_id': r[1], 'started_at': r[2], 'last_title': r[3] or '',
            'missed_polls': r[4] or 0, 'last_matched': r[5], 'last_snapshot_at': r[6],
        }
    return streamers, rules, sessions


def _record_failure(cur, schema, text):
    cur.execute(
        f"SELECT 1 FROM {schema}.stream_events WHERE type = 'collector_error' AND created_at > NOW() - INTERVAL '10 minutes' LIMIT 1"
    )
    if not cur.fetchone():
        _event(cur, schema, None, None, 'collector_error', {'error': text})
    cur.execute(
        f"UPDATE {schema}.streamer_collector_state SET last_error_at = NOW(), last_error_text = %s, last_run_at = NOW() WHERE id = 1",
        (text,)
    )


def handler(event: dict, context) -> dict:
    '''Сборщик эфиров Kick. Раз в минуту проверяет каналы активных стримеров, открывает и закрывает сессии эфира, пишет минутные снимки зрителей и проверяет обязательные слова в названии. Сбой Kick эфиры не закрывает: сессия закрывается только после трёх подряд проверок «не в эфире». Вызывается внешним cron-сервисом, защищён секретом X-Cron-Secret.'''
    started = time.monotonic()
    if event.get('httpMethod', 'GET') == 'OPTIONS':
        return {'statusCode': 200, 'headers': _cors_headers(), 'body': ''}

    cron_secret = os.environ.get('CRON_SECRET', '')
    headers = event.get('headers') or {}
    provided = headers.get('X-Cron-Secret') or headers.get('x-cron-secret') or (event.get('queryStringParameters') or {}).get('secret')
    if not cron_secret or provided != cron_secret:
        return _resp(403, {'error': 'forbidden'})

    schema = _schema()
    now = datetime.now(timezone.utc)
    minute = now.replace(second=0, microsecond=0)
    deadline = started + FETCH_BUDGET_SECONDS

    conn = _db()
    cur = conn.cursor()
    try:
        cur.execute(
            f"SELECT 1 FROM {schema}.streamer_collector_state WHERE id = 1 AND last_run_at > NOW() - INTERVAL '40 seconds'"
        )
        if cur.fetchone():
            return _resp(200, {'skipped': 'too_soon'})
        cur.execute(f"UPDATE {schema}.streamer_collector_state SET last_run_at = NOW() WHERE id = 1")

        streamers, rules, sessions = load_state(cur, schema)
        summary = {'streamers': len(streamers), 'opened': 0, 'updated': 0, 'closed': 0, 'missed': 0,
                   'unknown': 0, 'stale_closed': 0, 'failed_batches': 0}

        info_by_slug = {}
        if streamers:
            token = _load_token(cur, schema)
            if not token:
                token, expires_in = request_new_token(deadline)
                if token:
                    _save_token(cur, schema, token, expires_in)
            if not token:
                _record_failure(cur, schema, 'Не удалось получить токен Kick')
                summary['error'] = 'token'
                return _resp(200, summary)

            slugs = [s['slug'] for s in streamers]
            batches = {i: slugs[i * BATCH_SIZE:(i + 1) * BATCH_SIZE] for i in range((len(slugs) + BATCH_SIZE - 1) // BATCH_SIZE)}
            results = fetch_channels(batches, token, deadline)

            auth_failed = {i: batches[i] for i, (st, _) in results.items() if st == 'auth'}
            if auth_failed:
                _forget_token(cur, schema)
                token, expires_in = request_new_token(deadline)
                if token:
                    _save_token(cur, schema, token, expires_in)
                    results.update(fetch_channels(auth_failed, token, deadline))

            failed = [i for i, (st, _) in results.items() if st != 'ok']
            summary['failed_batches'] = len(failed)
            for i, (st, data) in results.items():
                if st == 'ok':
                    for ch in data:
                        slug = (ch.get('slug') or '').lower()
                        if slug:
                            info_by_slug[slug] = read_channel(ch)

            if failed and len(failed) == len(batches):
                _record_failure(cur, schema, 'Kick не ответил ни на один запрос: ' + ', '.join(
                    str(results[i][1]) for i in failed))
                summary['error'] = 'kick_unavailable'
                return _resp(200, summary)

            default_rule = rules.get(None)
            batch_ok = {}
            for i, grp in batches.items():
                for slug in grp:
                    batch_ok[slug] = results[i][0] == 'ok'

            for s in streamers:
                session = sessions.get(s['id'])
                info = info_by_slug.get(s['slug'])
                if not batch_ok.get(s['slug']):
                    info = None
                action = plan_action(session, info)
                rule = rules.get(s['id']) or default_rule
                matched = rule_matches(info['title'], info['tags'], rule) if info and info['live'] else False

                if action == 'unknown':
                    summary['unknown'] += 1
                elif action == 'open' or action == 'restart':
                    if action == 'restart':
                        close_session(cur, schema, session, 'restarted', now)
                        summary['closed'] += 1
                    sid = open_session(cur, schema, s, info, now)
                    if sid:
                        _event(cur, schema, s['id'], sid, 'stream_started',
                               {'title': info['title'], 'started_at': info['start'], 'rule_matched': matched})
                        write_snapshot(cur, schema, sid, minute, info, matched)
                        sessions[s['id']] = {'id': sid, 'streamer_id': s['id'], 'started_at': info['start'] or now,
                                             'last_title': info['title'], 'missed_polls': 0, 'last_matched': matched,
                                             'last_snapshot_at': minute, 'touched': True}
                        summary['opened'] += 1
                elif action == 'update':
                    handle_live_update(cur, schema, session, info, matched, minute)
                    session['touched'] = True
                    summary['updated'] += 1
                elif action == 'miss':
                    cur.execute(f"UPDATE {schema}.stream_sessions SET missed_polls = missed_polls + 1 WHERE id = %s", (session['id'],))
                    session['touched'] = True
                    summary['missed'] += 1
                elif action == 'close':
                    close_session(cur, schema, session, 'offline', now)
                    session['touched'] = True
                    summary['closed'] += 1

        active_ids = {s['id'] for s in streamers}
        stale_before = now - timedelta(minutes=STALE_MINUTES)
        for sid, session in sessions.items():
            if sid in active_ids:
                continue
            last = session['last_snapshot_at'] or session['started_at']
            if last < stale_before:
                close_session(cur, schema, session, 'paused', now)
                summary['stale_closed'] += 1

        cur.execute(
            f"UPDATE {schema}.streamer_collector_state SET last_success_at = NOW(), last_run_at = NOW(), "
            f"last_run_summary = %s::jsonb WHERE id = 1",
            (json.dumps(summary),)
        )
        summary['took_ms'] = int((time.monotonic() - started) * 1000)
        return _resp(200, summary)
    finally:
        cur.close()
        conn.close()
