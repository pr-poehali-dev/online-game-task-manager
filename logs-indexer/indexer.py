'''Индексатор логов — читает файлы игровых логов (cached/server/npc) ПРЯМО С ДИСКА (не по SFTP,
т.к. скрипт запускается на том же хостинге, где лежат сами файлы) и записывает разобранные строки
в отдельную PostgreSQL-базу "logs_events" (см. schema.sql). После этого веб-кабинет ERA Task
Manager читает уже готовые данные из этой базы мгновенно (без похода на хостинг логов), что
позволяет искать по диапазону в недели, а не только за последние несколько файлов.

Запуск (одноразовый прогон — обрабатывает всё новое, что появилось с прошлого запуска):
    python3 indexer.py

Постоянная работа — через systemd-таймер (см. era-logs-indexer.service/.timer в этой же папке),
по умолчанию раз в минуту. НЕ демон в смысле бесконечного цикла — каждый запуск завершается сам.

Настройка — переменные окружения (см. .env.example в этой же папке):
    LOGS_DB_URL       — подключение к БД логов (та, что создана schema.sql)
    LOGS_ROOT         — корневая папка на диске, где лежат подпапки серверов с логами
    LOGS_SERVERS      — список server_id через запятую, которые нужно индексировать
                        (id должны совпадать с servers.id в ОСНОВНОЙ базе проекта)
    RETENTION_DAYS    — сколько дней хранить в logs_events (старое удаляется), по умолчанию 7

Для резолва item_id/npc_id/skill_id в человекочитаемые имена скрипт умеет ДВА режима (см.
_build_name_lookups):
    1) MAIN_DB_URL + S3-доступ заданы -> резолвит из дерева патчей КАК И backend/logs (см.
       game_lookup.py) — предпочтительный режим, имена будут ИДЕНТИЧНЫ тому, что видно в
       разделе "Патчи" кабинета.
    2) Не заданы -> сохраняет строки БЕЗ резолва имён (item_name/npc_name/skill_name = NULL,
       show только числовые id) — базовый режим, работает всегда, имена можно будет досчитать
       позже, если понадобится (переиндексация НЕ требуется — backend/logs может резолвить
       налету при чтении, см. README.md).

Идемпотентность: скрипт использует UNIQUE INDEX (source_file, source_line) в logs_events — если
запустить его повторно на тех же файлах, дубликатов не будет (ON CONFLICT DO NOTHING). Таблица
logs_indexed_files хранит, докуда каждый файл уже прочитан, чтобы не парсить с нуля растущий файл.
'''
import csv
import io
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras

sys.path.insert(0, str(Path(__file__).resolve().parent))
from action_ids_data import ACTION_IDS  # noqa: E402

try:
    import game_lookup  # noqa: E402
    _HAS_GAME_LOOKUP = True
except ImportError:
    _HAS_GAME_LOOKUP = False


LOG_ENCODING = 'cp1251'
LOG_TYPES = ('cached', 'server', 'npc')
LOG_TYPE_DIR = {'cached': 'cashed', 'server': 'server', 'npc': 'npc'}  # см. backend/logs/index.py — та же опечатка в реальной структуре VPS
LOG_FILENAME_RE = re.compile(r'^(\d{4}-\d{2}-\d{2})-(\d+)-(\d+)-(cached|server|npc)-in(\d+)\.log$')
LOG_TIME_FORMAT = '%m/%d/%Y %H:%M:%S.%f'

RETENTION_DAYS = int(os.environ.get('RETENTION_DAYS', '7'))
BATCH_SIZE = 5000  # строк за один INSERT (execute_values) — баланс память/скорость


# =================================================================================================
# Раскладка полей строки лога — 1-в-1 СКОПИРОВАНО из backend/logs/index.py (_parse_log_line и
# соседние константы). При изменении расшифровки полей в backend/logs/index.py — синхронизировать
# и здесь, иначе кабинет и индексатор начнут расходиться в интерпретации одних и тех же данных.
# См. backend/logs/RESEARCH_NOTES.md за полным контекстом раскладки.
# =================================================================================================
FIELD_TIME = 0
FIELD_ACTION = 1
FIELD_ACTOR_ID = 2
FIELD_ACTOR_ACC_ID = 3
FIELD_TARGET_ID = 4
FIELD_TARGET_ACC_ID = 5
FIELD_LOC_X = 6
FIELD_LOC_Y = 7
FIELD_LOC_Z = 8
FIELD_STR1 = 9
FIELD_STR2 = 10
FIELD_STR3 = 11
FIELD_ACTOR_NAME = 22
FIELD_ACTOR_LOGIN = 23
FIELD_TARGET_NAME = 24
FIELD_TARGET_LOGIN = 25

STR1_LABEL = {
    '233': 'Дверь',
    '839': 'Товары в магазине',
    '930': 'Сообщение магазина',
    '941': 'Сообщение скупки',
}
STR1_ITEM_LIST_ACTIONS = ('839',)

ITEM_EVENT_ACTIONS = (
    '111', '113', '901', '902', '903', '904', '906', '907', '909', '910', '927', '929',
)
ACTION_ITEM_FIELD = {a: 19 for a in ITEM_EVENT_ACTIONS}
ACTION_ITEM_COUNT_FIELD = {a: 20 for a in ITEM_EVENT_ACTIONS}
ACTION_ITEM_DBID_FIELD = {a: 26 for a in ITEM_EVENT_ACTIONS}
ACTION_ITEM_STOCK_FIELD = {a: 21 for a in ITEM_EVENT_ACTIONS}
ACTION_ITEM_ENCHANT_FIELD = {a: 18 for a in ITEM_EVENT_ACTIONS}
ACTION_ITEM_FIELD['928'] = 19
ACTION_ITEM_COUNT_FIELD['928'] = 20

ACTION_SKILL_FIELD = {'401': 16, '403': 16, '1112': 16}
ACTION_SKILL_LEVEL_FIELD = {'401': 17}

NPC_TARGET_OFFSET = 1_000_000
ACTION_NPC_TARGET_FIELD = {
    '903': 16, '927': 16, '928': 16, '929': 16,
    '105': 17, '111': 17, '113': 17,
}


def _resolve_name(ref, raw_id):
    if raw_id is None:
        return None
    raw_id = raw_id.strip()
    if not raw_id:
        return None
    return ref.get(raw_id)


def _parse_event_time(time_str):
    if not time_str:
        return None
    try:
        return datetime.strptime(time_str, LOG_TIME_FORMAT)
    except ValueError:
        return None


def parse_log_line(fields, refs):
    '''Копия _parse_log_line из backend/logs/index.py — см. комментарий в шапке файла. Возвращает
    dict, готовый для INSERT в logs_events (ключи совпадают с колонками таблицы), либо None, если
    строка повреждена (не хватает полей).'''
    if len(fields) < 27:
        return None

    action_id = (fields[FIELD_ACTION] or '').strip()
    action_name = _resolve_name(refs['action'], action_id)

    event_time = _parse_event_time((fields[FIELD_TIME] or '').strip())
    if event_time is None:
        return None  # без времени строка бесполезна для индекса (сортировка/фильтр по времени)

    item_id = item_name = item_count = item_dbid = item_enchant = None
    item_stock_after = item_stock_before = None
    item_field_idx = ACTION_ITEM_FIELD.get(action_id)
    if item_field_idx is not None and item_field_idx < len(fields):
        item_id = (fields[item_field_idx] or '').strip() or None
        item_name = _resolve_name(refs['item'], item_id) if item_id else None
        count_idx = ACTION_ITEM_COUNT_FIELD.get(action_id)
        if count_idx is not None and count_idx < len(fields):
            item_count = (fields[count_idx] or '').strip() or None
        dbid_idx = ACTION_ITEM_DBID_FIELD.get(action_id)
        if dbid_idx is not None and dbid_idx < len(fields):
            item_dbid = (fields[dbid_idx] or '').strip() or None
        enchant_idx = ACTION_ITEM_ENCHANT_FIELD.get(action_id)
        if enchant_idx is not None and enchant_idx < len(fields):
            enchant_raw = (fields[enchant_idx] or '').strip()
            item_enchant = enchant_raw if enchant_raw and enchant_raw != '0' else None
        stock_idx = ACTION_ITEM_STOCK_FIELD.get(action_id)
        if stock_idx is not None and stock_idx < len(fields):
            stock_raw = (fields[stock_idx] or '').strip()
            item_stock_after = stock_raw or None
            if item_stock_after is not None and item_count is not None:
                try:
                    item_stock_before = str(int(item_stock_after) + abs(int(item_count)))
                except ValueError:
                    item_stock_before = None

    skill_id = skill_name = skill_level = None
    skill_field_idx = ACTION_SKILL_FIELD.get(action_id)
    if skill_field_idx is not None and skill_field_idx < len(fields):
        skill_id = (fields[skill_field_idx] or '').strip() or None
        skill_name = _resolve_name(refs['skill'], skill_id) if skill_id else None
        level_idx = ACTION_SKILL_LEVEL_FIELD.get(action_id)
        if level_idx is not None and level_idx < len(fields):
            skill_level = (fields[level_idx] or '').strip() or None

    actor = (fields[FIELD_ACTOR_NAME] or '').strip() or None
    actor_login = (fields[FIELD_ACTOR_LOGIN] or '').strip() or None
    target = (fields[FIELD_TARGET_NAME] or '').strip() or None
    target_login = (fields[FIELD_TARGET_LOGIN] or '').strip() or None
    actor_id = (fields[FIELD_ACTOR_ID] or '').strip() or None
    actor_acc_id = (fields[FIELD_ACTOR_ACC_ID] or '').strip() or None
    target_id = (fields[FIELD_TARGET_ID] or '').strip() or None
    target_acc_id = (fields[FIELD_TARGET_ACC_ID] or '').strip() or None
    loc_x = (fields[FIELD_LOC_X] or '').strip() or None
    loc_y = (fields[FIELD_LOC_Y] or '').strip() or None
    loc_z = (fields[FIELD_LOC_Z] or '').strip() or None

    if not target:
        npc_field_idx = ACTION_NPC_TARGET_FIELD.get(action_id)
        if npc_field_idx is not None and npc_field_idx < len(fields):
            raw_val = (fields[npc_field_idx] or '').strip()
            if raw_val.isdigit() and int(raw_val) > NPC_TARGET_OFFSET:
                npc_target_id = str(int(raw_val) - NPC_TARGET_OFFSET)
                npc_target_name = _resolve_name(refs['npc'], npc_target_id)
                target = f'Npc: {npc_target_name}' if npc_target_name else f'Npc #{npc_target_id}'

    note_label = note_value = None
    str1_raw = (fields[FIELD_STR1] or '').strip()
    if str1_raw and action_id in STR1_LABEL:
        note_label = STR1_LABEL[action_id]
        if action_id in STR1_ITEM_LIST_ACTIONS:
            names = []
            for raw_item_id in str1_raw.split():
                nm = _resolve_name(refs['item'], raw_item_id)
                names.append(nm if nm else f'#{raw_item_id}')
            note_value = ', '.join(names)
        else:
            note_value = str1_raw

    return {
        'event_time': event_time,
        'action_id': action_id or None,
        'action_name': action_name,
        'actor': actor, 'actor_login': actor_login, 'actor_id': actor_id, 'actor_acc_id': actor_acc_id,
        'target': target, 'target_login': target_login, 'target_id': target_id, 'target_acc_id': target_acc_id,
        'loc_x': loc_x, 'loc_y': loc_y, 'loc_z': loc_z,
        'item_id': item_id, 'item_name': item_name, 'item_count': item_count, 'item_dbid': item_dbid,
        'item_enchant': item_enchant, 'item_stock_after': item_stock_after, 'item_stock_before': item_stock_before,
        'skill_id': skill_id, 'skill_name': skill_name, 'skill_level': skill_level,
        'note_label': note_label, 'note_value': note_value,
        'nums': [(fields[12 + i] or '').strip() or None for i in range(10)],
        'strs': [(fields[9 + i] or '').strip() or None for i in range(3)],
    }


# =================================================================================================
# Резолвинг item/npc/skill имён — опционально (см. докстроку в шапке файла).
# =================================================================================================

def _build_name_lookups(server):
    '''Возвращает {'item': {...}, 'npc': {...}, 'skill': {...}} — либо реальные словари из дерева
    патчей (если настроено MAIN_DB_URL + S3), либо все три пустые (резолва не будет, строки лога
    сохранятся с числовыми id, имена = NULL).'''
    empty = {'item': {}, 'npc': {}, 'skill': {}}
    if not _HAS_GAME_LOOKUP:
        return empty
    main_db_url = os.environ.get('MAIN_DB_URL')
    if not main_db_url:
        return empty
    schema = os.environ.get('MAIN_DB_SCHEMA', 'public')
    try:
        conn = psycopg2.connect(main_db_url)
        try:
            cur = conn.cursor()
            return {
                'item': game_lookup.build_lookup(cur, schema, server, 'item'),
                'npc': game_lookup.build_lookup(cur, schema, server, 'npc'),
                'skill': game_lookup.build_lookup(cur, schema, server, 'skill'),
            }
        finally:
            conn.close()
    except Exception as e:
        print(f'[indexer] WARN: не удалось резолвить имена для {server} ({type(e).__name__}: {e}) — сохраняю с числовыми id')
        return empty


# =================================================================================================
# Работа с файлами на диске
# =================================================================================================

def _list_log_files(dir_path: Path):
    '''Возвращает список файлов лога в директории (только те, что матчат LOG_FILENAME_RE),
    отсортированные по имени (старые первыми — важно для порядка индексации).'''
    if not dir_path.is_dir():
        return []
    files = []
    for entry in dir_path.iterdir():
        if not entry.is_file():
            continue
        if LOG_FILENAME_RE.match(entry.name):
            files.append(entry)
    files.sort(key=lambda p: p.name)
    return files


def _get_indexed_state(cur, source_file):
    cur.execute(
        'SELECT lines_indexed, file_size_bytes FROM logs_indexed_files WHERE source_file = %s',
        (source_file,)
    )
    row = cur.fetchone()
    return (row[0], row[1]) if row else (0, None)


def _save_indexed_state(cur, source_file, server, log_type, lines_indexed, file_size):
    cur.execute(
        '''INSERT INTO logs_indexed_files (source_file, server, log_type, lines_indexed, file_size_bytes, last_indexed_at)
           VALUES (%s, %s, %s, %s, %s, now())
           ON CONFLICT (source_file) DO UPDATE SET
               lines_indexed = EXCLUDED.lines_indexed,
               file_size_bytes = EXCLUDED.file_size_bytes,
               last_indexed_at = now()''',
        (source_file, server, log_type, lines_indexed, file_size)
    )


def index_file(logs_conn, file_path: Path, server, log_type, refs):
    '''Читает файл целиком, разбирает СТРОКИ ПОСЛЕ уже проиндексированного места (lines_indexed),
    пишет новые в logs_events батчами. Возвращает количество новых строк.'''
    cur = logs_conn.cursor()
    source_file = f'{server}/{log_type}/{file_path.name}'
    lines_indexed, prev_size = _get_indexed_state(cur, source_file)

    file_size = file_path.stat().st_size
    if prev_size is not None and file_size == prev_size and lines_indexed > 0:
        cur.close()
        return 0  # файл не менялся с прошлого прогона — нечего делать

    with file_path.open('rb') as f:
        raw = f.read()
    text = raw.decode(LOG_ENCODING, errors='replace')

    reader = csv.reader(io.StringIO(text))
    rows = [row for row in reader if row and len(row) >= 2]

    if len(rows) <= lines_indexed:
        # Файл не вырос (или даже "сжался" — например перезаписан заново с той же нарезки).
        # Не откатываем lines_indexed назад молча — просто ничего не индексируем в этот раз.
        cur.close()
        return 0

    new_rows = rows[lines_indexed:]
    batch = []
    added = 0
    for offset, row in enumerate(new_rows):
        line_no = lines_indexed + offset
        row = [c.strip() for c in row]
        evt = parse_log_line(row, refs)
        if evt is None:
            continue
        batch.append((
            server, log_type, evt['event_time'],
            evt['action_id'], evt['action_name'],
            evt['actor'], evt['actor_login'], evt['actor_id'], evt['actor_acc_id'],
            evt['target'], evt['target_login'], evt['target_id'], evt['target_acc_id'],
            evt['loc_x'], evt['loc_y'], evt['loc_z'],
            evt['item_id'], evt['item_name'], evt['item_count'], evt['item_dbid'], evt['item_enchant'],
            evt['item_stock_after'], evt['item_stock_before'],
            evt['skill_id'], evt['skill_name'], evt['skill_level'],
            evt['note_label'], evt['note_value'],
            evt['nums'], evt['strs'],
            source_file, line_no,
        ))
        if len(batch) >= BATCH_SIZE:
            _flush_batch(cur, batch)
            added += len(batch)
            batch = []
    if batch:
        _flush_batch(cur, batch)
        added += len(batch)

    _save_indexed_state(cur, source_file, server, log_type, len(rows), file_size)
    logs_conn.commit()
    cur.close()
    return added


_INSERT_SQL = '''
INSERT INTO logs_events (
    server, log_type, event_time,
    action_id, action_name,
    actor, actor_login, actor_id, actor_acc_id,
    target, target_login, target_id, target_acc_id,
    loc_x, loc_y, loc_z,
    item_id, item_name, item_count, item_dbid, item_enchant,
    item_stock_after, item_stock_before,
    skill_id, skill_name, skill_level,
    note_label, note_value,
    nums, strs,
    source_file, source_line
) VALUES %s
ON CONFLICT (source_file, source_line) DO NOTHING
'''


def _flush_batch(cur, batch):
    psycopg2.extras.execute_values(cur, _INSERT_SQL, batch, page_size=1000)


def cleanup_old_data(logs_conn):
    cur = logs_conn.cursor()
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    cur.execute('DELETE FROM logs_events WHERE event_time < %s', (cutoff,))
    deleted_events = cur.rowcount
    cur.execute('DELETE FROM logs_indexed_files WHERE last_indexed_at < %s', (cutoff,))
    deleted_files = cur.rowcount
    logs_conn.commit()
    cur.close()
    if deleted_events or deleted_files:
        print(f'[indexer] Очистка: удалено {deleted_events} старых событий, {deleted_files} записей о файлах (старше {RETENTION_DAYS} дн.)')


def main():
    logs_db_url = os.environ.get('LOGS_DB_URL')
    logs_root = os.environ.get('LOGS_ROOT')
    servers_raw = os.environ.get('LOGS_SERVERS', '')
    servers = [s.strip() for s in servers_raw.split(',') if s.strip()]

    if not logs_db_url:
        print('[indexer] ОШИБКА: не задана переменная окружения LOGS_DB_URL', file=sys.stderr)
        sys.exit(1)
    if not logs_root:
        print('[indexer] ОШИБКА: не задана переменная окружения LOGS_ROOT', file=sys.stderr)
        sys.exit(1)
    if not servers:
        print('[indexer] ОШИБКА: не задана переменная окружения LOGS_SERVERS (список id серверов через запятую)', file=sys.stderr)
        sys.exit(1)

    logs_root_path = Path(logs_root)
    logs_conn = psycopg2.connect(logs_db_url)

    total_new = 0
    for server in servers:
        # Ищем директорию логов сервера: LOGS_ROOT/<server>/<cached|server|npc>/... — если
        # структура другая, задайте LOGS_ROOT так, чтобы этот путь совпал (см. README.md).
        server_dir = logs_root_path / server
        if not server_dir.is_dir():
            print(f'[indexer] WARN: директория сервера не найдена: {server_dir} — пропускаю')
            continue

        refs = _build_name_lookups(server)

        for log_type in LOG_TYPES:
            type_dir = server_dir / LOG_TYPE_DIR[log_type]
            files = _list_log_files(type_dir)
            for file_path in files:
                added = index_file(logs_conn, file_path, server, log_type, refs)
                if added:
                    print(f'[indexer] {server}/{log_type}/{file_path.name}: +{added} новых строк')
                    total_new += added

    cleanup_old_data(logs_conn)
    logs_conn.close()
    print(f'[indexer] Готово. Всего новых строк за этот прогон: {total_new}')


if __name__ == '__main__':
    main()
