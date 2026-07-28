'''Парсер DDF (dat definition file) — формат L2disasm/l2asm для описания структуры .dat файлов
Lineage 2, и движок для превращения бинарного содержимого .dat файла в плоскую таблицу
(список строк-словарей) и обратно.

Формат DDF описан в data/l2asm-disasm/MANUAL оригинального инструментария (Lineage2 community
tools, автор M.Soltys aka DStuff). Поддерживаются типы полей:

  UINT/HEX (uint32), INT (int32), UWORD (uint16), WORD (int16), UCHAR/CHEX (uint8), CHAR (int8),
  FLOAT (float32), UNICODE (int32 длина в символах + UTF-16LE строка), ASCF (спецформат:
  1-2 байта packed counter + текст ascii/utf-16LE + null-терминатор), CNTR (тот же packed counter
  отдельным полем), FILLER (заполнитель фиксированного размера), а также статические и
  динамические массивы полей ("table[N]" / "table[other_field]").

Формат packed counter (используется в ASCF и CNTR), восстановлен экспериментально и подтверждён
на десятках тысяч реальных записей:
  - старший бит (0x80) первого байта = флаг "строка в UTF-16LE" (hint 'u'), иначе ascii/8-bit
    (hint 'a')
  - следующий бит (0x40) первого байта = флаг "значение занимает 2 байта"
  - если 0x40 не установлен: value = byte0 & 0x3F (0..63)
  - если 0x40 установлен: value = (byte0 & 0x3F) | (byte1 << 6) (64..16383)
  - value — это количество "единиц" текста (байт для ascii, символов для utf-16), ВКЛЮЧАЯ
    завершающий null-терминатор.

MTX и MAT (используются в файлах вроде armorgrp.dat/etcitemgrp.dat/recipe-c.dat) ПОДДЕРЖИВАЮТСЯ
(см. ниже) — бинарный формат восстановлен экспериментально на реальных данных и подтверждён
сверкой с официальным TXT-экспортом l2disasm (побайтовое совпадение). MTX2/MTX3/MAT2 остаются
НЕ поддержаны — ни одна из известных схем C4/HF их не использует, встретить не удалось.

Формат MTX (подтверждено на etcitemgrp.dat/armorgrp.dat, сверено с l2disasm TXT-экспортом):
  ДВЕ последовательные подтаблицы UNICODE-строк:
  UINT count1, count1 x UNICODE (условно "mesh"), UINT count2, count2 x UNICODE (условно "tex").
  В TXT-экспорте эти 4 части выводятся как отдельные колонки: `{name}_cntm`, `{name}_m[i]`,
  `{name}_cntt`, `{name}_t[i]`.

Формат MAT (подтверждено на recipe-c.dat "materials" — список ингредиентов рецепта):
  UINT count, count x (UINT id, UINT amount) — пары "id предмета + количество".

Оба типа не используют схемное поле `array` (в DDF всегда пишутся без `[...]`, например
"MTX m_HumnFigh;") — счётчики целиком внутри самого значения поля, а не отдельным соседним
полем схемы, поэтому обрабатываются отдельной веткой в _read_field/_write_field.
'''
import struct
import re


class AscfStr(str):
    '''Строка ASCF-поля с сохранённым исходным флагом кодировки (True = UTF-16LE / hint 'u',
    False = 8-bit ascii/latin-1 / hint 'a'). Ведёт себя как обычная str везде (сравнение,
    JSON-сериализация через str() и т.п.), но encode_ascf() при наличии этого флага не будет
    пытаться угадывать кодировку заново — это нужно, чтобы строки, которые пользователь НЕ
    редактировал, кодировались обратно байт-в-байт идентично оригиналу (некоторые ascii-совместимые
    тексты в реальных файлах всё равно исторически сохранены как UTF-16LE).

    has_null_terminator: в подавляющем большинстве .dat файлов ASCF-блок оканчивается байтом
    '\\x00' (или '\\x00\\x00' для unicode) — это стандарт. НО в некоторых реальных файлах
    (например radiodata-ru.dat, где строки URL "обрезаны" по месту без null) встречаются ASCF
    без завершающего null. Флаг сохраняется при чтении и используется при кодировании, чтобы
    не добавлять "лишний" null там, где его не было в оригинале.'''

    def __new__(cls, value, is_unicode=False, has_null_terminator=True):
        obj = super().__new__(cls, value)
        obj.is_unicode = is_unicode
        obj.has_null_terminator = has_null_terminator
        return obj


class DdfError(Exception):
    pass


# ---------------------------------------------------------------------------
# 1) DDF grammar parsing
# ---------------------------------------------------------------------------

SIMPLE_TYPES = {
    'UINT': ('<I', 4), 'HEX': ('<I', 4),
    'INT': ('<i', 4),
    'UWORD': ('<H', 2),
    'WORD': ('<h', 2),
    'UCHAR': ('<B', 1), 'CHEX': ('<B', 1),
    'CHAR': ('<b', 1),
    'FLOAT': ('<f', 4),
}

# Согласно MANUAL: имя поля (ident) может содержать ЛЮБЫЕ символы кроме пробельных и
# [](){}=,/*\#:; — то есть не только [A-Za-z0-9_], но и, например, "?" (встречается в реальных
# DDF, например questname-e.ddf: "UINT tag_?;"). Единственное строгое требование — ident не
# может НАЧИНАТЬСЯ с цифры.
_IDENT_CHARS = r'[^\s\[\]{}()=,/*\\#:;]'
FIELD_RE = re.compile(
    r'^\s*([A-Z0-9]+)\s+([^\d\s\[\]{}()=,/*\\#:;]' + _IDENT_CHARS + r'*)\s*'
    r'(?:\[\s*(' + _IDENT_CHARS + r'+)\s*\])?\s*(\{\s*([A-Za-z0-9_]+)\s*\})?\s*;'
)


def _strip_comments(text: str) -> str:
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    text = re.sub(r'//[^\n]*', '', text)
    text = re.sub(r'#[^\n]*', '', text)
    return text


def parse_ddf(ddf_text: str) -> list:
    '''Разбирает DDF-файл и возвращает список полей (плоский, без учёта вложенности
    MTX/MAT — не поддерживаются). Каждый элемент — dict с ключами:
      type, name, array (имя поля-счётчика или число, либо None), filler_size
    '''
    text = _strip_comments(ddf_text)
    body_match = re.search(r'\{(.*)\}', text, flags=re.DOTALL)
    if not body_match:
        raise DdfError('no_main_section_found')
    body = body_match.group(1)

    fields = []
    for raw_line in body.split(';'):
        line = raw_line.strip()
        if not line:
            continue
        # skip property lines like SOFT = 5, ENBBY = [...], SKIPIF = [...]
        if re.match(r'^[A-Z_]+\s*=', line):
            continue
        m = re.match(
            r'^([A-Z0-9]+)\s+([^\d\s\[\]{}()=,/*\\#:;]' + _IDENT_CHARS + r'*)\s*'
            r'(?:\[\s*(' + _IDENT_CHARS + r'+)\s*\])?\s*(\{\s*([A-Za-z0-9_]+)\s*\})?$',
            line
        )
        if not m:
            continue
        ftype, fname, farray, _, ffiller = m.groups()
        if ftype in ('MTX2', 'MTX3', 'MAT2'):
            raise DdfError(f'unsupported_type_{ftype}')
        fields.append({
            'type': ftype,
            'name': fname,
            'array': farray,
            'filler_size': int(ffiller) if ffiller else None,
        })
    return fields


# ---------------------------------------------------------------------------
# 2) Packed counter (ASCF / CNTR)
# ---------------------------------------------------------------------------

def decode_packed_counter(data: bytes, offset: int):
    '''Возвращает (value, is_unicode, new_offset).'''
    b0 = data[offset]
    is_unicode = bool(b0 & 0x80)
    if b0 & 0x40:
        b1 = data[offset + 1]
        value = (b0 & 0x3F) | (b1 << 6)
        return value, is_unicode, offset + 2
    value = b0 & 0x3F
    return value, is_unicode, offset + 1


def encode_packed_counter(value: int, is_unicode: bool) -> bytes:
    if value > 16383:
        raise DdfError('counter_value_too_large')
    base = 0x80 if is_unicode else 0x00
    if value < 64:
        return bytes([base | value])
    return bytes([base | 0x40 | (value & 0x3F), value >> 6])


def decode_ascf(data: bytes, offset: int):
    '''Читает ASCF-строку. Возвращает (text, new_offset).

    ВАЖНО: пустая строка встречается в реальных файлах в ДВУХ разных бинарных представлениях:
      - counter=0 (совсем без данных) -> возвращаем Python None
      - counter=1 + один нулевой байт (null-терминатор без текста) -> возвращаем AscfStr('')
    Различие сохраняется, чтобы encode_ascf мог точно восстановить исходные байты.

    Результат — AscfStr (подкласс str) с флагом is_unicode, сохранённым из исходных данных:
    некоторые ascii-совместимые тексты в реальных файлах всё равно исторически закодированы как
    UTF-16LE, поэтому кодировку нельзя надёжно угадать заново при пересборке — её нужно помнить.'''
    value, is_unicode, offset = decode_packed_counter(data, offset)
    if value == 0:
        return None, offset
    if is_unicode:
        raw = data[offset:offset + value * 2]
        offset += value * 2
        text = raw.decode('utf-16-le', errors='replace')
    else:
        raw = data[offset:offset + value]
        offset += value
        text = raw.decode('latin-1', errors='replace')
    # null-терминатор ОБЫЧНО присутствует (стандартный случай), но не всегда — в некоторых
    # реальных файлах (например radiodata-ru.dat) ASCF-блок физически обрывается без него;
    # это нужно запомнить, чтобы encode_ascf не "дописывал" его туда, где не было.
    has_null = text.endswith('\x00')
    if has_null:
        text = text[:-1]
    return AscfStr(text, is_unicode, has_null), offset


def encode_ascf(text) -> bytes:
    '''Кодирует строку обратно в формат ASCF.

    text=None -> counter=0 (нет данных вообще).
    text='' (или AscfStr) -> counter=1 + один нулевой байт (пустая строка с null-терминатором).

    Если text — AscfStr с сохранённым флагом is_unicode, используется именно он (важно для
    byte-perfect пересборки неизменённых полей). Иначе (обычная str, например после правки
    пользователем) кодировка определяется автоматически: latin-1 если все символы укладываются
    в 0-255, иначе UTF-16LE.

    has_null_terminator (по умолчанию True, если явно не сохранён на AscfStr — см. decode_ascf)
    управляет тем, добавлять ли завершающий '\\x00' — почти всегда он должен присутствовать,
    но в редких реальных файлах (например radiodata-ru.dat) исходный блок обрывается без него,
    и это нужно сохранить byte-perfect при пересборке неизменённого поля.'''
    if text is None:
        return encode_packed_counter(0, False)
    forced_unicode = getattr(text, 'is_unicode', None)
    has_null = getattr(text, 'has_null_terminator', True)
    body = str(text) + ('\x00' if has_null else '')
    if forced_unicode is True:
        raw = body.encode('utf-16-le')
        return encode_packed_counter(len(body), True) + raw
    if forced_unicode is False:
        try:
            raw = body.encode('latin-1')
            return encode_packed_counter(len(raw), False) + raw
        except UnicodeEncodeError:
            pass  # user edited an ascii field with non-latin1 chars -> fall through to auto-detect
    try:
        raw = body.encode('latin-1')
        is_unicode = False
        value = len(raw)
    except UnicodeEncodeError:
        raw = body.encode('utf-16-le')
        is_unicode = True
        value = len(body)
    return encode_packed_counter(value, is_unicode) + raw


def decode_unicode_field(data: bytes, offset: int):
    '''UNICODE тип: int32 (длина СТРОКИ В БАЙТАХ, без null-терминатора) + UTF-16LE строка
    (без null-терминатора внутри).'''
    byte_len = struct.unpack_from('<i', data, offset)[0]
    offset += 4
    if byte_len <= 0:
        return '', offset
    raw = data[offset:offset + byte_len]
    offset += byte_len
    text = raw.decode('utf-16-le', errors='replace')
    return text, offset


def encode_unicode_field(text: str) -> bytes:
    if text == '':
        return struct.pack('<i', 0)
    raw = text.encode('utf-16-le')
    return struct.pack('<i', len(raw)) + raw


# ---------------------------------------------------------------------------
# 3) Disassemble: binary -> list of row dicts
# ---------------------------------------------------------------------------

def _resolve_count(row: dict, array_ref):
    if array_ref is None:
        return None
    if array_ref.isdigit():
        return int(array_ref)
    if array_ref in row:
        return int(row[array_ref])
    raise DdfError(f'unknown_array_ref_{array_ref}')


def disassemble(binary: bytes, fields: list, has_reccnt_prefix: bool = True, fixed_record_count: int = None):
    '''Разбирает бинарное содержимое .dat файла (уже расшифрованное l2encdec.decode) в список
    строк (list[dict]). has_reccnt_prefix=True означает, что первые 4 байта файла — счётчик
    записей (implicit RECCNT), который есть в большинстве dat файлов. Некоторые файлы (там, где
    в DDF явно указано "RECCNT = N" вместо "RECCNT = OFF" — например eula.dat, chargrp.dat,
    logongrp.dat в клиенте C4) НЕ имеют этого 4-байтного префикса вообще — число записей у них
    жёстко фиксировано схемой; для них нужно передать has_reccnt_prefix=False и
    fixed_record_count=N (взятое из DDF), иначе парсер не будет знать, где остановиться, и
    захватит хвостовой маркер файла как часть последней записи.

    Возвращает (rows, record_count, tail_bytes). tail_bytes — необработанный хвост файла
    после последней записи (обычно служебный маркер "SafePackage", 13 байт: ASCF-строка) —
    он не описан в DDF, но обязателен для точной пересборки байт-в-байт, поэтому сохраняется
    как есть и должен быть передан обратно в assemble().

    ВНИМАНИЕ: держит ВСЕ записи в памяти одновременно (list[dict]) — для больших файлов
    (например skillname-e.dat, ~76 тысяч записей) это может занимать 150+ МБ, что рискованно
    в облачной функции с ограниченной памятью. Для поиска/просмотра/редактирования ОДНОЙ
    записи используйте iter_records()/transform_single_row() ниже — они не накапливают
    список и потребляют памяти на порядки меньше.'''
    offset = 0
    if has_reccnt_prefix:
        record_count = struct.unpack_from('<I', binary, offset)[0]
        offset += 4
    else:
        record_count = fixed_record_count

    rows = []
    total_len = len(binary)
    while offset < total_len:
        if record_count is not None and len(rows) >= record_count:
            break
        row = {}
        try:
            for field in fields:
                offset = _read_field(binary, offset, field, row)
        except (struct.error, IndexError):
            break
        rows.append(row)
    tail_bytes = binary[offset:]
    return rows, record_count, tail_bytes


def iter_records(binary: bytes, fields: list, has_reccnt_prefix: bool = True, fixed_record_count: int = None):
    '''Генератор — читает записи ОДНУ ЗА ДРУГОЙ, не накапливая список в памяти. Отдаёт кортежи
    (index, row). См. disassemble() про has_reccnt_prefix/fixed_record_count для файлов без
    4-байтного префикса-счётчика (RECCNT = N в DDF вместо RECCNT = OFF).'''
    offset = 0
    if has_reccnt_prefix:
        record_count = struct.unpack_from('<I', binary, offset)[0]
        offset += 4
    else:
        record_count = fixed_record_count

    idx = 0
    total_len = len(binary)
    while offset < total_len:
        if record_count is not None and idx >= record_count:
            break
        row = {}
        try:
            for field in fields:
                offset = _read_field(binary, offset, field, row)
        except (struct.error, IndexError):
            break
        yield idx, row
        idx += 1


def get_record_count(binary: bytes, has_reccnt_prefix: bool = True, fixed_record_count: int = None) -> int:
    '''Читает количество записей: из 4-байтного заголовка файла (O(1)), либо — если у схемы нет
    такого префикса (has_reccnt_prefix=False) — возвращает fixed_record_count, взятое из DDF.'''
    if not has_reccnt_prefix:
        if fixed_record_count is None:
            raise DdfError('no_reccnt_prefix')
        return fixed_record_count
    return struct.unpack_from('<I', binary, 0)[0]


def get_record_by_index(binary: bytes, fields: list, index: int, has_reccnt_prefix: bool = True,
                         fixed_record_count: int = None):
    '''Возвращает ОДНУ запись по индексу, читая файл потоково (без накопления списка).
    Экономично по памяти для больших файлов — пригодно для ddf_get.'''
    for idx, row in iter_records(binary, fields, has_reccnt_prefix, fixed_record_count):
        if idx == index:
            return row
    raise DdfError(f'index_out_of_range_{index}')


def get_tail_bytes(binary: bytes, fields: list, has_reccnt_prefix: bool = True,
                    fixed_record_count: int = None) -> bytes:
    '''Возвращает необработанный хвост файла после последней записи (обычно служебный маркер
    "SafePackage"), не накапливая список всех записей в памяти. НУЖНО для точной пересборки
    файлов БЕЗ 4-байтного префикса-счётчика (has_reccnt_prefix=False, например eula.dat,
    chargrp.dat) через transform_single_row/delete_record/append_records — у таких файлов
    реальный хвост часто отличается от стандартного 13-байтного маркера "SafePackage" (у eula,
    например, хвост дополнительно содержит несколько служебных байт текста), и подстановка
    дефолтного tail_bytes даёт неверный (более короткий) результат. Для файлов С префиксом
    (has_reccnt_prefix=True) хвост почти всегда стандартный и эту функцию можно не вызывать —
    но она работает одинаково корректно в обоих случаях.'''
    offset = 4 if has_reccnt_prefix else 0
    record_count = get_record_count(binary, has_reccnt_prefix, fixed_record_count)
    count = 0
    total_len = len(binary)
    while offset < total_len and count < record_count:
        row = {}
        try:
            for field in fields:
                offset = _read_field(binary, offset, field, row)
        except (struct.error, IndexError):
            break
        count += 1
    return binary[offset:]


def search_records(binary: bytes, fields: list, editable_names: list, query_lower: str, limit: int,
                    has_reccnt_prefix: bool = True, fixed_record_count: int = None):
    '''Ищет записи, у которых хотя бы одно из editable_names текстовых полей содержит
    query_lower (или, если query_lower пустой, возвращает первые limit записей). Читает файл
    потоково — не накапливает список всех записей в памяти. Возвращает (matches, total_count),
    где matches — список (index, row) для не более limit совпадений, total_count — реальное
    количество записей в файле (из заголовка, O(1)).'''
    total_count = get_record_count(binary, has_reccnt_prefix, fixed_record_count)
    matches = []
    for idx, row in iter_records(binary, fields, has_reccnt_prefix, fixed_record_count):
        if query_lower:
            found = str(idx) == query_lower or any(
                row.get(name) and query_lower in str(row[name]).lower()
                for name in editable_names
            )
            if not found:
                continue
        matches.append((idx, row))
        if len(matches) >= limit:
            break
    return matches, total_count


def transform_single_row(binary: bytes, fields: list, index: int, mutate_fn,
                          has_reccnt_prefix: bool = True, fixed_record_count: int = None,
                          tail_bytes: bytes = None) -> bytes:
    '''Читает файл запись за записью, для записи с номером `index` вызывает `mutate_fn(row)`
    (должна вернуть изменённый row-dict, обычно тот же объект с обновлёнными полями),
    остальные записи переносит как есть — и сразу же (без накопления списка) сериализует
    каждую запись в выходной буфер. Экономично по памяти: пиковое потребление — это размер
    выходного буфера (~размер исходного файла) плюс одна текущая запись, а НЕ список из
    десятков тысяч записей. Используется в ddf_save для больших файлов (например
    skillname-e.dat, ~76 тысяч записей), где полный disassemble()+assemble() рискует упереться
    в лимит памяти облачной функции.

    Возвращает готовые байты файла (без изменений — только запись `index` подверглась
    mutate_fn). Бросает DdfError, если индекс не найден.'''
    out = bytearray()
    if has_reccnt_prefix:
        record_count = get_record_count(binary, has_reccnt_prefix)
        out += struct.pack('<I', record_count)

    found = False
    for idx, row in iter_records(binary, fields, has_reccnt_prefix, fixed_record_count):
        if idx == index:
            row = mutate_fn(row)
            found = True
        for field in fields:
            _write_field(out, field, row)

    if not found:
        raise DdfError(f'index_out_of_range_{index}')

    if tail_bytes is None:
        tail_bytes = encode_ascf('SafePackage')
    out += tail_bytes
    return bytes(out)


def delete_record(binary: bytes, fields: list, index: int, has_reccnt_prefix: bool = True,
                   fixed_record_count: int = None, tail_bytes: bytes = None) -> bytes:
    '''Потоково копирует все записи КРОМЕ той, что имеет номер `index` — удаляет ровно одну
    запись. Экономично по памяти (как transform_single_row/append_records). Обновлённый
    счётчик записей (record_count - 1) пишется в заголовок (только если has_reccnt_prefix).
    Бросает DdfError, если индекс не найден.'''
    out = bytearray()
    if has_reccnt_prefix:
        record_count = get_record_count(binary, has_reccnt_prefix)
        out += struct.pack('<I', record_count - 1)

    found = False
    for idx, row in iter_records(binary, fields, has_reccnt_prefix, fixed_record_count):
        if idx == index:
            found = True
            continue
        for field in fields:
            _write_field(out, field, row)

    if not found:
        raise DdfError(f'index_out_of_range_{index}')

    if tail_bytes is None:
        tail_bytes = encode_ascf('SafePackage')
    out += tail_bytes
    return bytes(out)


def append_records(binary: bytes, fields: list, new_rows: list, has_reccnt_prefix: bool = True,
                    fixed_record_count: int = None, tail_bytes: bytes = None) -> bytes:
    '''Потоково копирует ВСЕ существующие записи как есть и дописывает в конец файла новые
    записи из new_rows (list[dict], каждый dict должен содержать значения для ВСЕХ полей
    схемы — используйте default_row()/build_row_from_texts() ниже, чтобы собрать такой dict).
    Экономично по памяти — как transform_single_row, не накапливает список всех записей.
    Обновлённый счётчик записей (record_count + len(new_rows)) пишется в заголовок файла
    (только если has_reccnt_prefix).

    Возвращает готовые байты файла. Не проверяет уникальность id — ответственность за это
    (и за корректность значений полей) на вызывающем коде (backend action).'''
    out = bytearray()
    if has_reccnt_prefix:
        record_count = get_record_count(binary, has_reccnt_prefix)
        out += struct.pack('<I', record_count + len(new_rows))

    for _idx, row in iter_records(binary, fields, has_reccnt_prefix, fixed_record_count):
        for field in fields:
            _write_field(out, field, row)

    for row in new_rows:
        for field in fields:
            _write_field(out, field, row)

    if tail_bytes is None:
        tail_bytes = encode_ascf('SafePackage')
    out += tail_bytes
    return bytes(out)


def default_row(fields: list) -> dict:
    '''Строит "пустую" запись со значениями по умолчанию для всех полей схемы (0 для чисел,
    пустая ASCF/UNICODE строка для текстов, [] заполненные нулями/пустыми строками для
    статических массивов, [] для динамических — соответствующее числовое поле-счётчик тоже
    будет 0). Используется как основа для формы "создать новую запись с нуля" на фронтенде
    (через ddf_get с index=null) и как стартовая точка перед применением build_row_from_texts.'''
    row = {}
    for field in fields:
        ftype = field['type']
        name = field['name']
        array_ref = field['array']
        if ftype == 'FILLER':
            continue
        if ftype == 'MTX':
            row[name] = {'mesh': [], 'tex': []}
            continue
        if ftype == 'MAT':
            row[name] = []
            continue
        if array_ref is not None:
            count = _resolve_count(row, array_ref) if not array_ref.isdigit() else int(array_ref)
            count = count or 0
            row[name] = [_default_scalar(ftype) for _ in range(count)]
        else:
            row[name] = _default_scalar(ftype)
    return row


def _default_scalar(ftype: str):
    if ftype == 'ASCF':
        return AscfStr('', False, True)
    if ftype == 'UNICODE':
        return ''
    if ftype == 'FLOAT':
        return 0.0
    return 0


def build_row_from_texts(fields: list, editable_names: list, base_row: dict, texts: dict) -> dict:
    '''Берёт base_row (обычно default_row(fields) или копию существующей записи-шаблона),
    подставляет в неё текстовые значения из texts (dict {field_name: str}) для editable-полей,
    сохраняя оригинальный флаг кодировки/null-терминатора у AscfStr-полей, если он был в
    base_row. Не editable-поля (id, числовые счётчики и т.п.) остаются как в base_row —
    вызывающий код (backend action) должен сам подставить id/другие обязательные значения
    ДО или ПОСЛЕ вызова этой функции через прямое присваивание row[name] = value.'''
    row = dict(base_row)
    for name, text in texts.items():
        if name not in editable_names:
            continue
        old_value = row.get(name)
        if isinstance(old_value, AscfStr):
            row[name] = AscfStr(str(text), old_value.is_unicode, old_value.has_null_terminator)
        else:
            row[name] = str(text)
    return row


def _read_mtx(data: bytes, offset: int):
    '''MTX = 2 последовательные подтаблицы UNICODE-строк: (count1, count1 x UNICODE),
    (count2, count2 x UNICODE). Возвращает ({'mesh': [...], 'tex': [...]}, new_offset).'''
    c1 = struct.unpack_from('<I', data, offset)[0]
    offset += 4
    mesh = []
    for _ in range(c1):
        v, offset = decode_unicode_field(data, offset)
        mesh.append(v)
    c2 = struct.unpack_from('<I', data, offset)[0]
    offset += 4
    tex = []
    for _ in range(c2):
        v, offset = decode_unicode_field(data, offset)
        tex.append(v)
    return {'mesh': mesh, 'tex': tex}, offset


def _write_mtx(out: bytearray, value):
    value = value or {}
    mesh = value.get('mesh') or []
    tex = value.get('tex') or []
    out += struct.pack('<I', len(mesh))
    for v in mesh:
        out += encode_unicode_field(v or '')
    out += struct.pack('<I', len(tex))
    for v in tex:
        out += encode_unicode_field(v or '')


def _read_mat(data: bytes, offset: int):
    '''MAT = список пар (id, amount): UINT count, count x (UINT id, UINT amount).
    Возвращает (list[{'id': int, 'amount': int}], new_offset).'''
    count = struct.unpack_from('<I', data, offset)[0]
    offset += 4
    items = []
    for _ in range(count):
        item_id, amount = struct.unpack_from('<II', data, offset)
        offset += 8
        items.append({'id': item_id, 'amount': amount})
    return items, offset


def _write_mat(out: bytearray, value):
    items = value or []
    out += struct.pack('<I', len(items))
    for item in items:
        out += struct.pack('<II', int(item.get('id', 0)), int(item.get('amount', 0)))


def _read_field(data: bytes, offset: int, field: dict, row: dict) -> int:
    ftype = field['type']
    name = field['name']

    if ftype == 'FILLER':
        size = field['filler_size'] or 0
        offset += size
        return offset

    if ftype == 'MTX':
        row[name], offset = _read_mtx(data, offset)
        return offset

    if ftype == 'MAT':
        row[name], offset = _read_mat(data, offset)
        return offset

    count = _resolve_count(row, field['array'])

    if count is not None:
        values = []
        for _ in range(count):
            offset, value = _read_single(data, offset, ftype)
            values.append(value)
        row[name] = values
        return offset

    offset, value = _read_single(data, offset, ftype)
    row[name] = value
    return offset


def _read_single(data: bytes, offset: int, ftype: str):
    if ftype in SIMPLE_TYPES:
        fmt, size = SIMPLE_TYPES[ftype]
        value = struct.unpack_from(fmt, data, offset)[0]
        return offset + size, value
    if ftype == 'ASCF':
        text, offset = decode_ascf(data, offset)
        return offset, text
    if ftype == 'CNTR':
        value, _, offset = decode_packed_counter(data, offset)
        return offset, value
    if ftype == 'UNICODE':
        text, offset = decode_unicode_field(data, offset)
        return offset, text
    raise DdfError(f'unsupported_type_{ftype}')


# ---------------------------------------------------------------------------
# 4) Assemble: list of row dicts -> binary
# ---------------------------------------------------------------------------

def assemble(rows: list, fields: list, record_count: int = None, has_reccnt_prefix: bool = True,
             tail_bytes: bytes = None) -> bytes:
    '''Обратная операция: список строк -> бинарное содержимое .dat файла (готовое для
    l2encdec.encode). tail_bytes — хвост, полученный от disassemble() (обычно служебный
    маркер "SafePackage"); если не передан, используется стандартный маркер по умолчанию.'''
    out = bytearray()
    if has_reccnt_prefix:
        cnt = record_count if record_count is not None else len(rows)
        out += struct.pack('<I', cnt)

    for row in rows:
        for field in fields:
            _write_field(out, field, row)

    if tail_bytes is None:
        tail_bytes = encode_ascf('SafePackage')
    out += tail_bytes
    return bytes(out)


def _write_field(out: bytearray, field: dict, row: dict):
    ftype = field['type']
    name = field['name']
    array_ref = field['array']

    if ftype == 'FILLER':
        size = field['filler_size'] or 0
        out += bytes(size)
        return

    if ftype == 'MTX':
        _write_mtx(out, row.get(name))
        return

    if ftype == 'MAT':
        _write_mat(out, row.get(name))
        return

    if array_ref is not None:
        values = row.get(name) or []
        for value in values:
            _write_single(out, ftype, value)
        return

    value = row.get(name)
    _write_single(out, ftype, value)


def _write_single(out: bytearray, ftype: str, value):
    if ftype in SIMPLE_TYPES:
        fmt, _size = SIMPLE_TYPES[ftype]
        if ftype == 'FLOAT':
            out += struct.pack(fmt, float(value))
        else:
            out += struct.pack(fmt, int(value))
        return
    if ftype == 'ASCF':
        out += encode_ascf(value)
        return
    if ftype == 'CNTR':
        out += encode_packed_counter(int(value), False)
        return
    if ftype == 'UNICODE':
        out += encode_unicode_field(value if value is not None else '')
        return
    raise DdfError(f'unsupported_type_{ftype}')