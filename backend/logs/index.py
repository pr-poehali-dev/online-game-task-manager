import csv
import io
import json
import os
import re
from datetime import datetime, timedelta

import paramiko
import psycopg2

import game_lookup
from action_ids_data import ACTION_IDS


# Три фиксированных вида логов (папки на SFTP-хосте) — см. RESEARCH_NOTES.md за полным контекстом
# формата. Каждый файл лога имеет ровно 27 CSV-полей (проверено на реальных образцах), разделитель
# запятая, кодировка cp1251 (НЕ utf-8) — критично: имена игроков/предметов на кириллице будут
# нечитаемым мусором без явной перекодировки.
LOG_TYPES = ('cached', 'server', 'npc')
LOG_ENCODING = 'cp1251'
PAGE_SIZE_DEFAULT = 50
PAGE_SIZE_MAX = 200
# 60 МБ — предел на СУММАРНЫЙ размер файлов, читаемых за один запрос get_log (может быть
# несколько файлов сразу, если период timeFrom/timeTo пересекает границу нарезки, или период не
# указан вовсе — тогда читаются ВСЕ доступные файлы). Реальные файлы ~5 МБ/получаса, обычно на
# VPS хранится 2-3 файла на тип лога (см. check_coverage) — 60 МБ с большим запасом.
MAX_FILE_READ = 60 * 1024 * 1024
# Нарезка файлов на практике ~30 минут — берём небольшой запас, чтобы не промахнуться при отборе
# файлов, покрывающих запрошенный период (см. action=get_log).
_FILE_DURATION_GUESS = timedelta(minutes=35)

# Имя файла лога: {ГГГГ-ММ-ДД}-{HHMM}-{NN}-{тип}-in{0|1}.log — см. RESEARCH_NOTES.md. Сами файлы
# называются "...-cached-...", НО папка на диске сервера называется "cashed" (опечатка в реальной
# структуре VPS, подтверждено скриншотом пользователя) — см. LOG_TYPE_DIR ниже.
LOG_FILENAME_RE = re.compile(r'^(\d{4}-\d{2}-\d{2})-(\d+)-(\d+)-(cached|server|npc)-in(\d+)\.log$')

# log_type (используется в API и в имени файла) -> реальное имя подпапки на SFTP-сервере.
LOG_TYPE_DIR = {'cached': 'cashed', 'server': 'server', 'npc': 'npc'}


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
    return {'statusCode': 200, 'headers': _cors_headers(), 'body': json.dumps(payload)}


def _current_user(cur, schema, token):
    '''Право logs_view — ОТДЕЛЬНОЕ от patch_edit (см. db_migrations V0075, backend/admin/index.py
    ALL_PERMISSIONS/PRIVILEGED_PERMISSIONS) — по умолчанию False даже для role == 'admin', пока не
    выдано явно владельцем проекта. Логика эффективного значения — тот же паттерн, что patch_edit
    в backend/patches/index.py _effective_perms, но здесь нужно только одно право, поэтому не
    выносим полноценный ALL_PERMISSIONS/_effective_perms как в других функциях.'''
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
    can_view = perms.get('logs_view')
    can_view = False if can_view is None else bool(can_view)
    return {'id': uid, 'role': role, 'can_view': can_view}


def _safe_server(server):
    if not server or not re.match(r'^[a-zA-Z0-9_-]+$', server):
        return None
    return server


def _service_key(cur, schema, key):
    cur.execute(f"SELECT value FROM {schema}.service_keys WHERE key = %s", (key,))
    row = cur.fetchone()
    return row[0] if row and row[0] else None


def _logs_dir_for_server(cur, schema, server):
    cur.execute(f"SELECT logs_dir FROM {schema}.servers WHERE id = %s", (server,))
    row = cur.fetchone()
    return row[0] if row and row[0] else None


def _logs_sftp_client(cur, schema):
    '''Единый SFTP-хост обслуживает логи ВСЕХ серверов проекта (креды — в service_keys,
    LOGS_SFTP_*), путь до конкретного сервера — в servers.logs_dir (см. db_migrations V0075).
    Тот же паттерн подключения, что _launcher_ssh_client в backend/patches/index.py. Возвращает
    None, если ключи ещё не заполнены — вызывающий код должен вернуть понятную ошибку.'''
    host = _service_key(cur, schema, 'LOGS_SFTP_HOST')
    user = _service_key(cur, schema, 'LOGS_SFTP_USER')
    password = _service_key(cur, schema, 'LOGS_SFTP_PASSWORD')
    if not host or not user or not password:
        return None
    port_raw = _service_key(cur, schema, 'LOGS_SFTP_PORT') or '22'
    try:
        port = int(port_raw)
    except ValueError:
        port = 22
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, port=port, username=user, password=password, timeout=15)
    return client


def _list_log_files(entries):
    '''entries — результат sftp.listdir_attr(). Возвращает список файлов лога (только те, что
    матчат LOG_FILENAME_RE), каждый — dict с именем/размером/mtime, отсортированный по имени
    (свежие первыми). Общая логика для check_coverage и get_log (вместо дублирования кода).'''
    files = []
    for entry in entries:
        m = LOG_FILENAME_RE.match(entry.filename)
        if not m:
            continue
        date_str, hhmm, seq, ftype, instance = m.groups()
        files.append({
            'name': entry.filename,
            'date': date_str,
            'size': entry.st_size,
            'modifiedAt': entry.st_mtime,
            'instance': instance,
        })
    files.sort(key=lambda f: f['name'], reverse=True)
    return files


# --- Справочник action_id → имя (см. RESEARCH_NOTES.md) ---------------------------------------
# action_id есть ТОЛЬКО в этом статичном снимке (не игровой ресурс, в дереве патчей его нет).
# ВАЖНО: словарь встроен прямо в код (action_ids_data.py), а НЕ читается из отдельного .tsv-файла
# в подпапке reference/ — платформа деплоя cloud-функций упаковывает ТОЛЬКО .py файлы папки
# функции, произвольные подкаталоги с данными физически не попадают в облако (проверено на
# практике: reference/ существовала в проекте и в git, но в облачном рантайме отсутствовала —
# см. RESEARCH_NOTES.md). item/npc/skill резолвятся отдельно из дерева патчей, см. game_lookup.py.
def _load_reference(name):
    if name == 'action_ids':
        return ACTION_IDS
    return {}


def _resolve_name(ref, raw_id):
    if raw_id is None:
        return None
    raw_id = raw_id.strip()
    if not raw_id:
        return None
    return ref.get(raw_id)


# --- Разбор строки лога ------------------------------------------------------------------------
# Смысл конкретного номера поля зависит от action_id (см. RESEARCH_NOTES.md "Расшифровка позиций
# полей") — полная карта на ВСЕ ~150+ action_id ещё не построена, это осознанно отложено (план в
# заметках: показывать именованные колонки для известных action_id, для остальных — сырые поля).
# Индексы ниже — 0-based (в заметках они 1-based, т.к. считались по логам вручную).
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

# --- Str1/Str2/Str3 (поля [9]/[10]/[11]) — РАСШИФРОВАНО частично в этой сессии ------------------
# В подавляющем большинстве строк ВСЕХ трёх логов (cached/server/npc) эти поля пусты — они
# используются только у горстки action_id, где несут РАЗНЫЙ смысл по контексту конкретного
# действия (не единая раскладка, как у item/skill/npc-полей выше). Расшифровано сверкой на
# реальных данных сервера c4x1 (сотни просмотренных строк server-лога):
#   803 EnterWorld        -> [9] = IP-адрес игрока при входе (уже использовалось раньше отдельно,
#                            см. ниже в _parse_log_line, здесь просто для полноты списка).
#   233 SetDoorOpenClose  -> [9] = имя/id игровой двери (например "hubris_8F_001", "Eva_010").
#   839 SetPrivateStoreItems character -> [9] = список item_id через пробел, выставленных в личном
#                            магазине персонажа (например "11033 5352") — резолвится в имена через
#                            game_lookup построчным разбором каждого id.
#   930 SetPrivateMsg     -> [9] = текст объявления личного магазина продажи (например "TMH SET",
#                            "Дешевле уже не будет").
#   941 SetBuyPrivateMsg  -> [9] = текст объявления личного магазина СКУПКИ (аналог 930 для buy).
#   969 OpenFish item     -> [9] = какой-то id (не до конца расшифровано, оставляем как сырое
#                            значение "заметки" без специальной подписи).
#   940 RelatedItem       -> ИСКЛЮЧЕНИЕ: [9]/[10] здесь НЕ текстовая заметка, а имя/логин ДРУГОГО
#                            персонажа (стандартные позиции [22]/[23] для этого action почему-то
#                            пусты) — не подключаем в общую карту STR1_LABEL ниже, требует отдельной
#                            обработки, если понадобится (не сделано — узкий кейс, редкий action).
# Для action_id НЕ из списка ниже Str1/Str2/Str3 просто не резолвятся в отдельное поле "note" (но
# по-прежнему доступны через debugRaw=1, если нужно проверить конкретную строку вручную).
STR1_LABEL = {
    '233': 'Дверь',
    '839': 'Товары в магазине',
    '930': 'Сообщение магазина',
    '941': 'Сообщение скупки',
}
# action_id, для которых Str1 — список item_id через пробел (резолвится в имена).
STR1_ITEM_LIST_ACTIONS = ('839',)

# Раскладка полей для СОБЫТИЙ С ПРЕДМЕТОМ (item_id/count/dbid) — сверена дважды на реальных HTML-
# экспортах desktop-парсера пользователя (персонажи Воробушек и Saffeida, см. RESEARCH_NOTES.md) и
# оказалась ОДИНАКОВОЙ для всех перечисленных ниже action_id, а не специфичной под каждый из них:
#   [19] = item_id / itemtype — общий id ТИПА предмета (резолвится в имя через itemname-e.dat из
#          дерева патчей сервера, см. game_lookup.py) — одинаковый у всех экземпляров этого
#          предмета у любых игроков.
#   [20] = count/level — дельта количества (может быть отрицательной при списании).
#   [26] = dbid — уникальный id КОНКРЕТНОГО ЭКЗЕМПЛЯРА предмета в БД сервера (свой у каждого
#          стака/игрока), НЕ резолвится в имя — это просто идентификатор записи, не игровой
#          справочник (уточнение пользователя: "у предметов есть уникальный dbid... и общий
#          item_id (он же itemtype, берётся из itemname-e)").
ITEM_EVENT_ACTIONS = (
    '111',  # GiveItemToPet
    '113',  # PetUseItem (dbid есть, count/item_id тоже — is item id пета)
    '901',  # BuyItem
    '902',  # SellItem
    '903',  # RemovFromInven (снятие с продажи в личном магазине/со склада)
    '904',  # RetrieveFromInven
    '906',  # GetItem
    '907',  # DeleteItem
    '909',  # TradeGive
    '910',  # TradeGet
    '927',  # AddedToWarehouse
    '929',  # RetrieveFromWarehouse
)
ACTION_ITEM_FIELD = {a: 19 for a in ITEM_EVENT_ACTIONS}
ACTION_ITEM_COUNT_FIELD = {a: 20 for a in ITEM_EVENT_ACTIONS}
ACTION_ITEM_DBID_FIELD = {a: 26 for a in ITEM_EVENT_ACTIONS}
# [21] (Num10) = "Items count" в desktop-парсере — остаток предмета ПОСЛЕ операции (не путать с
# item_count на [20], который является ДЕЛЬТОЙ). Desktop-парсер иногда показывает это значение
# как "622 (742)" — второе число в скобках НЕ отдельное сырое поле, а ВЫЧИСЛЯЕТСЯ им же:
# "было" = "стало" + |дельта| — формула подтверждена на 5 реальных примерах (622+120=742,
# 249+1=250, 0+3=3, 13065+2000=15065, 784+5=789 — все совпали с числом в скобках desktop-
# парсера). Реализуем ту же логику здесь, а не только показываем сырое [21] — см. итоговое поле
# 'itemStockBefore'/'itemStockAfter' в _parse_log_line.
ACTION_ITEM_STOCK_FIELD = {a: 21 for a in ITEM_EVENT_ACTIONS}
# [18] (Num7 в нотации desktop-парсера) — ЧАЩЕ ВСЕГО энчант предмета (подтверждено: Iron Boots
# +3 энчанта -> [18]="3", неэнчантируемые предметы вроде Adena/руды/зелий -> [18]="0"), но по
# прямому уточнению пользователя "не всегда" — то есть для каких-то action_id это поле может
# означать что-то другое (не проверено на всех 13 action из ITEM_EVENT_ACTIONS по отдельности,
# сверка была только на нескольких примерах). Показываем как "предположительно энчант" — если
# окажется 0 у предмета, который умеет быть заточен, не считать это опровержением расшифровки.
ACTION_ITEM_ENCHANT_FIELD = {a: 18 for a in ITEM_EVENT_ACTIONS}

# 928 (FeeForWarehouse) — тоже item-событие (обычно списание Adena за хранение), но БЕЗ dbid
# (поле [26] пусто в реальных данных — комиссия не привязана к конкретному экземпляру предмета).
ACTION_ITEM_FIELD['928'] = 19
ACTION_ITEM_COUNT_FIELD['928'] = 20

ACTION_SKILL_FIELD = {
    '401': 16,   # LearnSkill (skill_id=[16], level=[17] — level указывается ОТДЕЛЬНО от
                 # CastSkill/PCKilledNPC ниже, т.к. позиция level разная)
    '403': 16,   # CastSkill
    '1112': 16,  # PCKilledNPC
}
# Уровень скилла — только для 401 LearnSkill подтверждён отдельно (level=[17], сверено на
# скриншоте пользователя: "1238,2" в сырых данных = "Freezing Skin" уровень 2). Для 403/1112 не
# проверялось отдельно — оставляем незаполненным, чтобы не показывать непроверенное значение.
ACTION_SKILL_LEVEL_FIELD = {
    '401': 17,
}

# --- Цель-NPC (не игрок) — расшифровано в этой сессии --------------------------------------
# Поля [24]/[25] (target_name/login) ПУСТЫ, когда целью действия является NPC, а не другой
# персонаж (например оплата хранения складу, снятие/добавление товара продавцу-нпс). Вместо
# этого где-то в Num-полях лежит СОСТАВНОЕ число: npc_template_id + 1_000_000 (например
# 1007083 -> реальный npc_id 7083 = "Pochi", 1036096 -> 36096 = "Improved Baby Kookaburra") —
# подтверждено напрямую через game_lookup.build_lookup(..., 'npc') на реальных данных сервера
# c4x1 (несколько разных id сошлись с ожидаемыми именами из npcname-e.dat). Позиция этого
# составного числа ОТЛИЧАЕТСЯ по action_id:
#   [16] — для складских операций с NPC-хранителем (продавец/кладовщик как цель действия)
#   [17] — для событий, связанных с питомцем (там [16] занят другим числом — вероятно dbid
#          самого питомца, НЕ расшифровано отдельно, не критично для отображения цели)
NPC_TARGET_OFFSET = 1_000_000
ACTION_NPC_TARGET_FIELD = {
    '903': 16,  # RemovFromInven (снятие с продажи NPC-магазину/складу)
    '927': 16,  # AddedToWarehouse
    '928': 16,  # FeeForWarehouse
    '929': 16,  # RetrieveFromWarehouse (по аналогии с 903/927/928, не проверено отдельно —
                # в данных Saffeida цель для этого action_id всегда была пустой, т.к. это
                # получение СВОЕГО предмета со склада без NPC-взаимодействия в кадре лога)
    '105': 17,  # WithDrawPet (питомец — тоже "NPC" с точки зрения игрового движка)
    '111': 17,  # GiveItemToPet
    '113': 17,  # PetUseItem
}


def _parse_log_line(fields, refs):
    '''fields — список из 27 строк (уже декодированных из cp1251). Возвращает структурированный
    словарь события. Незнакомые action_id всё равно возвращают событие — просто без резолва
    item/skill имени (см. RESEARCH_NOTES.md, план "известные action — колонки, остальные — сырое").'''
    action_id = (fields[FIELD_ACTION] or '').strip()
    action_name = _resolve_name(refs['action'], action_id)

    item_id = None
    item_name = None
    item_count = None
    item_dbid = None
    item_enchant = None
    item_stock_after = None
    item_stock_before = None
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
            # "0" означает "без энчанта" (или предмет не энчантируется) — не показываем как
            # отдельное значение, чтобы не засорять UI нулями у обычных предметов (см. заметку
            # выше про то, что поле "не всегда" энчант — 0 не обязательно значит "+0").
            item_enchant = enchant_raw if enchant_raw and enchant_raw != '0' else None
        stock_idx = ACTION_ITEM_STOCK_FIELD.get(action_id)
        if stock_idx is not None and stock_idx < len(fields):
            stock_raw = (fields[stock_idx] or '').strip()
            item_stock_after = stock_raw or None
            # "Было" = "стало" + |дельта| — см. комментарий у ACTION_ITEM_STOCK_FIELD выше.
            # Считаем только если оба числа реально парсятся, иначе оставляем None (не гадаем).
            if item_stock_after is not None and item_count is not None:
                try:
                    item_stock_before = str(int(item_stock_after) + abs(int(item_count)))
                except ValueError:
                    item_stock_before = None

    skill_id = None
    skill_name = None
    skill_level = None
    skill_field_idx = ACTION_SKILL_FIELD.get(action_id)
    if skill_field_idx is not None and skill_field_idx < len(fields):
        skill_id = (fields[skill_field_idx] or '').strip() or None
        skill_name = _resolve_name(refs['skill'], skill_id) if skill_id else None
        level_idx = ACTION_SKILL_LEVEL_FIELD.get(action_id)
        if level_idx is not None and level_idx < len(fields):
            skill_level = (fields[level_idx] or '').strip() or None

    actor = (fields[FIELD_ACTOR_NAME] if FIELD_ACTOR_NAME < len(fields) else '').strip() or None
    actor_login = (fields[FIELD_ACTOR_LOGIN] if FIELD_ACTOR_LOGIN < len(fields) else '').strip() or None
    target = (fields[FIELD_TARGET_NAME] if FIELD_TARGET_NAME < len(fields) else '').strip() or None
    target_login = (fields[FIELD_TARGET_LOGIN] if FIELD_TARGET_LOGIN < len(fields) else '').strip() or None
    actor_id = (fields[FIELD_ACTOR_ID] if FIELD_ACTOR_ID < len(fields) else '').strip() or None
    actor_acc_id = (fields[FIELD_ACTOR_ACC_ID] if FIELD_ACTOR_ACC_ID < len(fields) else '').strip() or None
    target_id = (fields[FIELD_TARGET_ID] if FIELD_TARGET_ID < len(fields) else '').strip() or None
    target_acc_id = (fields[FIELD_TARGET_ACC_ID] if FIELD_TARGET_ACC_ID < len(fields) else '').strip() or None
    loc_x = (fields[FIELD_LOC_X] if FIELD_LOC_X < len(fields) else '').strip() or None
    loc_y = (fields[FIELD_LOC_Y] if FIELD_LOC_Y < len(fields) else '').strip() or None
    loc_z = (fields[FIELD_LOC_Z] if FIELD_LOC_Z < len(fields) else '').strip() or None

    # Цель-NPC: [24]/[25] пусты для действий с NPC (продавец/кладовщик/питомец), реальный
    # target_name в этом случае берём из резолва составного числа npc_id+1000000 (см. выше).
    npc_target_id = None
    npc_target_name = None
    if not target:
        npc_field_idx = ACTION_NPC_TARGET_FIELD.get(action_id)
        if npc_field_idx is not None and npc_field_idx < len(fields):
            raw_val = (fields[npc_field_idx] or '').strip()
            if raw_val.isdigit() and int(raw_val) > NPC_TARGET_OFFSET:
                npc_target_id = str(int(raw_val) - NPC_TARGET_OFFSET)
                npc_target_name = _resolve_name(refs['npc'], npc_target_id)
                target = f'Npc: {npc_target_name}' if npc_target_name else f'Npc #{npc_target_id}'

    # Str1 (см. STR1_LABEL выше) — текстовая "заметка" события, смысл зависит от action_id: имя
    # двери, объявление личного магазина, список товаров и т.п. Показываем ТОЛЬКО для известных
    # action_id из STR1_LABEL (для остальных — не показываем, чтобы не путать пользователя сырыми
    # данными без подписи; сырые Str1/2/3 всё равно доступны через debugRaw=1 при отладке).
    note_label = None
    note_value = None
    str1_raw = (fields[FIELD_STR1] if FIELD_STR1 < len(fields) else '').strip()
    if str1_raw and action_id in STR1_LABEL:
        note_label = STR1_LABEL[action_id]
        if action_id in STR1_ITEM_LIST_ACTIONS:
            names = []
            for raw_item_id in str1_raw.split():
                item_name = _resolve_name(refs['item'], raw_item_id)
                names.append(item_name if item_name else f'#{raw_item_id}')
            note_value = ', '.join(names)
        else:
            note_value = str1_raw

    return {
        'time': (fields[FIELD_TIME] or '').strip(),
        'actionId': action_id or None,
        'actionName': action_name,
        'actor': actor,
        'actorLogin': actor_login,
        'actorId': actor_id,
        'actorAccId': actor_acc_id,
        'target': target,
        'targetLogin': target_login,
        'targetId': target_id,
        'targetAccId': target_acc_id,
        'locX': loc_x,
        'locY': loc_y,
        'locZ': loc_z,
        'itemId': item_id,
        'itemName': item_name,
        'itemCount': item_count,
        'itemDbId': item_dbid,
        'itemEnchant': item_enchant,
        'itemStockAfter': item_stock_after,
        'itemStockBefore': item_stock_before,
        'skillId': skill_id,
        'skillName': skill_name,
        'skillLevel': skill_level,
        'noteLabel': note_label,
        'noteValue': note_value,
        # Полный набор "сырых" числовых/текстовых полей строки в нотации desktop-парсера
        # пользователя (Num1-10 = [12..21], Str1-3 = [9..11]) — ВСЕГДА отдаётся (не только под
        # debugRaw=1, в отличие от 'raw' ниже), т.к. пользователь прямо попросил не терять эти
        # поля даже там, где точный смысл конкретного action_id ещё не расшифрован. Показывается
        # во фронтенде как раскрываемая деталь строки, а не отдельными колонками (иначе таблица
        # станет нечитаемой — 10 Num + 3 Str колонок поверх уже имеющихся).
        'nums': [(fields[12 + i] or '').strip() or None for i in range(10)],
        'strs': [(fields[9 + i] or '').strip() or None for i in range(3)],
        # Сырые поля — на случай, если известной раскладки для этого action_id ещё нет, фронт
        # может показать их как запасной вариант (см. RESEARCH_NOTES.md).
        'raw': fields,
    }


LOG_TIME_FORMAT = '%m/%d/%Y %H:%M:%S.%f'


def _parse_event_time(time_str):
    '''Парсит время события лога ("MM/DD/YYYY HH:MM:SS.mmm") в datetime, либо None, если формат
    не совпал (пустая строка/повреждённая строка — не должно роняться на этом, просто не попадёт
    под time-фильтр).'''
    if not time_str:
        return None
    try:
        return datetime.strptime(time_str, LOG_TIME_FORMAT)
    except ValueError:
        return None


def _matches_filters(event, player, item, action, time_from, time_to):
    if player:
        p = player.lower()
        hay = f"{event['actor'] or ''} {event['actorLogin'] or ''} {event['target'] or ''} {event['targetLogin'] or ''}".lower()
        if p not in hay:
            return False
    if item:
        i = item.lower()
        hay = f"{event['itemName'] or ''} {event['itemId'] or ''}".lower()
        if i not in hay:
            return False
    if action:
        a = action.lower()
        hay = f"{event['actionName'] or ''} {event['actionId'] or ''}".lower()
        if a not in hay:
            return False
    if time_from or time_to:
        evt_time = _parse_event_time(event['time'])
        if evt_time is None:
            # Не смогли разобрать время строки — не показываем её при активном фильтре по
            # времени (безопаснее спрятать неразобранную строку, чем ошибочно её включить).
            return False
        if time_from and evt_time < time_from:
            return False
        if time_to and evt_time > time_to:
            return False
    return True


def handler(event: dict, context) -> dict:
    '''Раздел "Логи" — просмотр игровых логов (cached/server/npc) с внешнего VPS по SFTP.
    Действия: check_coverage (диапазон дат/времени доступных на VPS логов по серверу+типу),
    get_log (чтение и парсинг логов за период timeFrom/timeTo с фильтрами и пагинацией — файлы
    подбираются автоматически, ручной выбор конкретного файла убран по просьбе пользователя).
    Доступ — только с правом logs_view (отдельное от patch_edit, см. db_migrations V0075). См.
    backend/logs/RESEARCH_NOTES.md за полным контекстом.'''
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
    if not me['can_view']:
        cur.close(); conn.close()
        return {'statusCode': 403, 'headers': _cors_headers(), 'body': json.dumps({'error': 'forbidden'})}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or ('check_coverage' if method == 'GET' else '')

    server = _safe_server(qs.get('server') or body.get('server'))
    log_type = qs.get('type') or body.get('type')

    if action == 'check_coverage':
        # Заменяет собой старый выбор конкретного файла в интерфейсе — вместо этого показываем
        # пользователю, какой диапазон дат/времени логов реально доступен на VPS прямо сейчас
        # (VPS хранит короткую историю, файлы регулярно перезаписываются/удаляются). Раньше
        # пользователь выбирал файл из выпадающего списка вручную — теперь список файлов вообще
        # не нужен пользователю: get_log сам подбирает нужные файлы по указанному периоду.
        if not server:
            cur.close(); conn.close()
            return _bad('bad_server')
        if log_type not in LOG_TYPES:
            cur.close(); conn.close()
            return _bad('bad_type')
        base_dir = _logs_dir_for_server(cur, schema, server)
        if not base_dir:
            cur.close(); conn.close()
            return _bad('logs_dir_not_configured')
        try:
            ssh = _logs_sftp_client(cur, schema)
        except Exception as e:
            cur.close(); conn.close()
            return _bad(f'ssh_connect_error_{type(e).__name__}')
        if ssh is None:
            cur.close(); conn.close()
            return _bad('sftp_not_configured')
        cur.close(); conn.close()
        remote_dir = base_dir.rstrip('/') + '/' + LOG_TYPE_DIR[log_type]
        try:
            sftp = ssh.open_sftp()
            try:
                entries = sftp.listdir_attr(remote_dir)
            finally:
                sftp.close()
        except FileNotFoundError:
            ssh.close()
            return _bad('remote_dir_not_found', 404)
        except Exception as e:
            ssh.close()
            return _bad(f'sftp_error_{type(e).__name__}')
        else:
            ssh.close()

        files = _list_log_files(entries)
        if not files:
            return _ok({'available': False, 'from': None, 'to': None, 'fileCount': 0})

        # modifiedAt (mtime на диске VPS) — момент последней записи в файл, а не время первой
        # строки, но для отображения ПОКРЫТИЯ ("логи есть с ... по ...") этого достаточно: берём
        # самый старый и самый новый файл по mtime, обвязка про реальные окна времени внутри
        # файла (± полчаса на нарезку) не нужна пользователю на этом экране.
        oldest = min(files, key=lambda f: f['modifiedAt'])
        newest = max(files, key=lambda f: f['modifiedAt'])
        return _ok({
            'available': True,
            'from': oldest['modifiedAt'],
            'to': newest['modifiedAt'],
            'fileCount': len(files),
        })

    if action == 'get_log':
        # ВАЖНО: раздел больше НЕ требует ручного выбора конкретного файла (по прямой просьбе
        # пользователя) — вместо этого файлы, покрывающие запрошенный период timeFrom/timeTo,
        # подбираются автоматически (см. _FILE_DURATION_GUESS ниже). Если период не указан —
        # читаются ВСЕ доступные файлы этого типа лога (на практике VPS хранит короткую историю,
        # обычно 2-3 файла на тип, см. check_coverage).
        if not server:
            return _bad('bad_server')
        if log_type not in LOG_TYPES:
            return _bad('bad_type')
        base_dir = _logs_dir_for_server(cur, schema, server)
        if not base_dir:
            cur.close(); conn.close()
            return _bad('logs_dir_not_configured')

        try:
            page = int(qs.get('page') or body.get('page') or 1)
        except (TypeError, ValueError):
            page = 1
        page = max(1, page)
        try:
            page_size = int(qs.get('pageSize') or body.get('pageSize') or PAGE_SIZE_DEFAULT)
        except (TypeError, ValueError):
            page_size = PAGE_SIZE_DEFAULT
        page_size = max(1, min(PAGE_SIZE_MAX, page_size))

        player_filter = (qs.get('player') or body.get('player') or '').strip()
        item_filter = (qs.get('item') or body.get('item') or '').strip()
        action_filter = (qs.get('actionQuery') or body.get('actionQuery') or '').strip()
        # timeFrom/timeTo — datetime-local со фронтенда, формат "YYYY-MM-DDTHH:MM" (иногда с
        # секундами "YYYY-MM-DDTHH:MM:SS") — не путать с форматом времени В САМОМ логе
        # (MM/DD/YYYY HH:MM:SS.mmm, см. LOG_TIME_FORMAT), это разные форматы разбираются отдельно.
        time_from_raw = (qs.get('timeFrom') or body.get('timeFrom') or '').strip()
        time_to_raw = (qs.get('timeTo') or body.get('timeTo') or '').strip()
        time_from = None
        time_to = None
        for raw_val, attr in ((time_from_raw, 'from'), (time_to_raw, 'to')):
            if not raw_val:
                continue
            parsed = None
            for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M'):
                try:
                    parsed = datetime.strptime(raw_val, fmt)
                    break
                except ValueError:
                    continue
            if parsed is None:
                cur.close(); conn.close()
                return _bad(f'bad_time_{attr}')
            if attr == 'from':
                time_from = parsed
            else:
                time_to = parsed

        try:
            ssh = _logs_sftp_client(cur, schema)
        except Exception as e:
            cur.close(); conn.close()
            return _bad(f'ssh_connect_error_{type(e).__name__}')
        if ssh is None:
            cur.close(); conn.close()
            return _bad('sftp_not_configured')

        remote_dir = base_dir.rstrip('/') + '/' + LOG_TYPE_DIR[log_type]
        empty_result = {'events': [], 'page': 1, 'pageSize': page_size, 'totalMatched': 0, 'totalLines': 0, 'totalPages': 1}
        try:
            sftp = ssh.open_sftp()
            try:
                entries = sftp.listdir_attr(remote_dir)
                all_files = _list_log_files(entries)
                if not all_files:
                    cur.close(); conn.close()
                    return _ok(empty_result)

                # Грубый отбор файлов, пересекающихся с запрошенным периодом: modifiedAt —
                # момент ПОСЛЕДНЕЙ записи (конец файла), реальная длительность нарезки ~30
                # минут на практике — берём запас 35 минут, чтобы не промахнуться мимо файла
                # из-за небольшого расхождения. Период не указан — берём все файлы (их немного).
                selected = all_files
                if time_from or time_to:
                    selected = []
                    for f in all_files:
                        file_end = datetime.fromtimestamp(f['modifiedAt'])
                        file_start = file_end - _FILE_DURATION_GUESS
                        if time_from and file_end < time_from:
                            continue
                        if time_to and file_start > time_to:
                            continue
                        selected.append(f)
                    if not selected:
                        cur.close(); conn.close()
                        return _ok(empty_result)

                total_size = sum(f['size'] for f in selected)
                if total_size > MAX_FILE_READ:
                    cur.close(); conn.close()
                    return _bad('file_too_large')

                # Открываем ВСЕ файлы и запускаем prefetch() на каждом СРАЗУ (до чтения любого
                # из них) — так конвейерные запросы на все файлы летят параллельно, а не
                # последовательно (файл1 полностью → файл2 полностью → ...), что при нескольких
                # файлах суммарно легко превышает таймаут функции (5 сек), даже если каждый
                # файл по отдельности укладывается в лимит.
                handles = []
                try:
                    for f in selected:
                        rf = sftp.open(remote_dir + '/' + f['name'], 'rb')
                        rf.prefetch(f['size'])
                        handles.append(rf)
                    texts = [rf.read().decode(LOG_ENCODING, errors='replace') for rf in handles]
                finally:
                    for rf in handles:
                        rf.close()
            finally:
                sftp.close()
        except FileNotFoundError:
            cur.close(); conn.close()
            return _bad('remote_dir_not_found', 404)
        except Exception as e:
            cur.close(); conn.close()
            return _bad(f'sftp_error_{type(e).__name__}')
        finally:
            ssh.close()

        # item/npc/skill — резолвятся ИЗ ДЕРЕВА ПАТЧЕЙ этого сервера (itemname-e/npcname-e/
        # skillname-e.dat, уже загруженных в раздел "Патчи"), НЕ из статичного снимка настроек —
        # см. game_lookup.py. action_id — только из статичного справочника (не игровой ресурс).
        refs = {
            'action': _load_reference('action_ids'),
            'item': game_lookup.build_lookup(cur, schema, server, 'item'),
            'npc': game_lookup.build_lookup(cur, schema, server, 'npc'),
            'skill': game_lookup.build_lookup(cur, schema, server, 'skill'),
        }
        cur.close(); conn.close()

        matched = []
        total_lines = 0
        # Файлы читаются от старых к новым (all_files отсортирован свежими первыми, selected —
        # подмножество в том же порядке) — разворачиваем, чтобы события шли в хронологическом
        # порядке от старых к новым, как ожидает пользователь.
        for text in reversed(texts):
            reader = csv.reader(io.StringIO(text))
            for row in reader:
                if not row or len(row) < 2:
                    continue
                total_lines += 1
                # Дешёвая проверка времени ДО полного разбора строки — пропускаем дорогой
                # резолв item/npc/skill для строк вне запрошенного периода. Строки ВНУТРИ
                # одного файла лога идут СТРОГО по возрастанию времени (подтверждено на
                # реальных данных) — если время строки уже превысило верхнюю границу time_to,
                # все ОСТАЛЬНЫЕ строки этого файла тем более превысят её -> сразу переходим к
                # следующему файлу вместо построчной проверки до конца. КРИТИЧНО при больших
                # файлах (выросли до 40-80 тыс. строк) — раньше весь файл разбирался целиком
                # даже при диапазоне в 1 минуту, упиралось в таймаут функции.
                raw_time = (row[FIELD_TIME] or '').strip()
                if time_from or time_to:
                    evt_time = _parse_event_time(raw_time)
                    if evt_time is None:
                        continue
                    if time_to and evt_time > time_to:
                        break
                    if time_from and evt_time < time_from:
                        continue
                row = [c.strip() for c in row]
                evt = _parse_log_line(row, refs)
                if _matches_filters(evt, player_filter, item_filter, action_filter, time_from, time_to):
                    matched.append(evt)

        total_matched = len(matched)
        start = (page - 1) * page_size
        page_items = matched[start:start + page_size]
        # debugRaw=1 — техническая возможность для будущей отладки новых action_id (см.
        # RESEARCH_NOTES.md), НЕ используется фронтендом в обычной работе.
        debug_raw = (qs.get('debugRaw') or body.get('debugRaw')) == '1'
        if not debug_raw:
            for it in page_items:
                del it['raw']

        return _ok({
            'events': page_items,
            'page': page,
            'pageSize': page_size,
            'totalMatched': total_matched,
            'totalLines': total_lines,
            'totalPages': max(1, (total_matched + page_size - 1) // page_size),
        })

    cur.close(); conn.close()
    return _bad('unknown_action')