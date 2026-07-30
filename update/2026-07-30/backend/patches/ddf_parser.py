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
сверкой с официальным TXT-экспортом l2disasm (побайтовое совпадение). MTX3 и MAT2 (используются
в HF-версии armorgrp.dat/weapongrp.dat и recipe-c.dat соответственно — расширенные варианты MTX/
MAT с дополнительными полями) ТОЖЕ поддержаны (см. ниже) — раскрыты и подтверждены аналогично
(побайтовая сверка расшифрованного .dat с официальным TXT-экспортом l2disasm HF-клиента). MTX2
остаётся НЕ поддержан — ни одна из известных схем C4/HF его не использует, встретить не удалось.

Формат MTX (подтверждено на etcitemgrp.dat/armorgrp.dat, сверено с l2disasm TXT-экспортом):
  ДВЕ последовательные подтаблицы UNICODE-строк:
  UINT count1, count1 x UNICODE (условно "mesh"), UINT count2, count2 x UNICODE (условно "tex").
  В TXT-экспорте эти 4 части выводятся как отдельные колонки: `{name}_cntm`, `{name}_m[i]`,
  `{name}_cntt`, `{name}_t[i]`.

Формат MAT (подтверждено на recipe-c.dat "materials" — список ингредиентов рецепта):
  UINT count, count x (UINT id, UINT amount) — пары "id предмета + количество".

Формат MTX3 (подтверждено на HF armorgrp.dat, 3751 записей — 0 расхождений с официальным TXT-
экспортом l2disasm при полном постраничном разборе): расширенная версия MTX — mesh-подтаблица
хранит ТРОЙКИ значений вместо простых строк (UNICODE-строка + 2 однобайтовых числа), а tex-
подтаблица заканчивается ОДНИМ дополнительным UNICODE-полем:
  UINT count1, count1 x (UNICODE, UCHAR, UCHAR) ("mesh", каждый элемент — mU[i]/mB[i][1]/mB[i][2]
  в TXT-экспорте), UINT count2, count2 x UNICODE ("tex", как в обычном MTX), UNICODE (одно
  дополнительное поле в самом конце, "tE" в TXT-экспорте).

Формат MAT2 (подтверждено на HF recipe-c.dat, 1001 запись — 0 расхождений с официальным TXT-
экспортом l2disasm): расширенная версия MAT — та же структура пар (id, amount), но с
дополнительным UINT-полем СРАЗУ после счётчика (перед списком пар, "materials_extra" в TXT-
экспорте, во всех проверенных записях наблюдалось значение 0 — назначение поля неизвестно, но
формат хранения и байтовый размер подтверждены):
  UINT count, UINT extra, count x (UINT id, UINT amount).

Все четыре типа (MTX/MAT/MTX3/MAT2) не используют схемное поле `array` (в DDF всегда пишутся без
`[...]`, например "MTX m_HumnFigh;") — счётчики целиком внутри самого значения поля, а не
отдельным соседним полем схемы, поэтому обрабатываются отдельной веткой в _read_field/_write_field.
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
    не добавлять "лишний" null там, где его не было в оригинале.

    was_mojibake: True, если ИСХОДНОЕ значение (сохранённое в самом .dat файле) было "битой"
    кириллицей (cp1251, прочитанной как latin-1, см. looks_like_cp1251_mojibake). str-значение
    этого объекта — уже ИСПРАВЛЕННЫЙ, читаемый текст (см. decode_ascf) — флаг используется ТОЛЬКО
    при последующем encode_ascf, чтобы знать, нужно ли перекодировать текст обратно в те же
    "испорченные" байты перед записью в файл (см. unfix_cp1251_mojibake).'''

    def __new__(cls, value, is_unicode=False, has_null_terminator=True, was_mojibake=False):
        obj = super().__new__(cls, value)
        obj.is_unicode = is_unicode
        obj.has_null_terminator = has_null_terminator
        obj.was_mojibake = was_mojibake
        return obj


class DdfError(Exception):
    pass


# ---------------------------------------------------------------------------
# Cyrillic mojibake detection/fix для ASCF-полей (is_unicode=False, 8-битная кодировка)
# ---------------------------------------------------------------------------
#
# ПРОБЛЕМА (найдена пользователем на реальных данных C4x1, файл actionname-e.dat): часть ASCF-
# строк на русскоязычном клиенте C4 физически хранит текст в кодировке Windows-1251 (обычная
# кириллица), а не в "родной" для ASCF 8-битной кодировке (latin-1/ISO-8859-1), которую decode_ascf
# читает по умолчанию. В результате при чтении "как есть" получается классический mojibake —
# каждый кириллический байт (0x80-0xFF) трактуется как отдельный latin-1 символ, и вместо
# "Сесть/Встать" на экране получается "Ñåñòü/Âñòàòü".
#
# Подтверждено экспериментально на живых серверах (см. RESEARCH_NOTES.md): просканировано 2043+
# непустых ASCF-превью на 16 схемах C4-клиента (actionname, npcname, sysstring, questname,
# skillname, castlename и др.) — ВСЕ строки с байтами 0x80-0xFF либо УЖЕ содержат корректную
# кириллицу (значит на самом деле физически хранятся как UTF-16LE, is_unicode=True — их decode_ascf
# и так читает верно), либо превращаются в mojibake, которое ПОЛНОСТЬЮ и однозначно
# восстанавливается в валидную кириллицу через `raw_latin1_bytes.decode('cp1251')` — 0 ошибок
# декодирования, 0 ложных срабатываний на легитимном не-кириллическом latin-1 тексте (например
# английские тексты H5-клиента с "é", "©", NBSP — там эвристика ниже корректно возвращает False,
# т.к. после cp1251-декода получается НЕ кириллица).
#
# РЕШЕНИЕ: детектируем и чиним mojibake на ЛЕТУ — только в местах, где строка показывается
# пользователю (JSON-ответ ddf_get/ddf_search, raw-режим) и когда пользователь СОХРАНЯЕТ новый
# текст (перекодируем обратно в те же "неправильные" latin-1 байты, которые ожидает игровой
# клиент) — а НЕ меняем то, что фактически лежит в самом .dat файле при обычной пересборке
# неизменённых записей (round-trip disassemble+assemble остаётся byte-perfect как и раньше).

_CYRILLIC_RANGE = range(0x0400, 0x0500)


def looks_like_cp1251_mojibake(text: str) -> bool:
    '''True, если text похож на кириллицу, "испорченную" двойной интерпретацией кодировки
    (физически cp1251, прочитана как latin-1) — то есть: минимум 2 буквенных символа, минимум
    половина из них лежит в диапазоне 0x80-0xFF (типичном для mojibake из cp1251), и после
    перекодировки latin-1-байтов обратно через cp1251 минимум 80% буквенных символов оказываются
    кириллицей. Порог 80%, а не 100% — чтобы не спотыкаться на редких примесях типа "-"/цифр/
    заимствованных латинских слов внутри в основном русской строки.'''
    alpha_chars = [c for c in text if c.isalpha()]
    if len(alpha_chars) < 2:
        return False
    high_byte_alpha = [c for c in alpha_chars if ord(c) >= 0x80]
    if len(high_byte_alpha) / len(alpha_chars) < 0.5:
        return False
    try:
        raw = text.encode('latin-1')
        decoded = raw.decode('cp1251')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return False
    decoded_alpha = [c for c in decoded if c.isalpha()]
    if not decoded_alpha:
        return False
    cyr_count = sum(1 for c in decoded_alpha if ord(c) in _CYRILLIC_RANGE)
    return (cyr_count / len(decoded_alpha)) >= 0.8


def fix_cp1251_mojibake(text: str) -> str:
    '''Если text похож на "битую" кириллицу (см. looks_like_cp1251_mojibake) — возвращает
    исправленную версию (декодированную через cp1251). Иначе возвращает text без изменений.
    Безопасно вызывать на ЛЮБОЙ строке (числа, пустые строки, обычный ascii-текст, уже корректная
    кириллица/UTF-16 текст) — эвристика внутри отфильтровывает всё, что не похоже на mojibake.'''
    if not looks_like_cp1251_mojibake(text):
        return text
    return text.encode('latin-1').decode('cp1251')


def unfix_cp1251_mojibake(text: str) -> str:
    '''Обратная операция к fix_cp1251_mojibake — если text содержит кириллицу, перекодирует её
    в те же "испорченные" latin-1 байты, которые физически ожидает .dat файл на этом сервере
    (то есть готовит строку для encode_ascf с is_unicode=False). Используется при сохранении
    правок пользователя для ASCF-полей, где исходное значение было mojibake (см. is_mojibake_field
    флаг, проставляемый при чтении). Не кириллица — возвращается как есть.'''
    if not any(ord(c) in _CYRILLIC_RANGE for c in text):
        return text
    try:
        return text.encode('cp1251').decode('latin-1')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


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


_ENBBY_RE = re.compile(
    r'^ENBBY\s*=\s*\[\s*\(\s*(' + _IDENT_CHARS + r'+)\s*,\s*(-?\d+)\s*\)\s*\]$'
)
# Расширенный синтаксис ENBBY с "порогом" через двоеточие (подтверждено на mantleexception.dat,
# HF-клиент, см. docstring parse_ddf ниже): "ENBBY = [(cond_field:threshold,N)];", часто НЕСКОЛЬКО
# таких строк подряд для ОДНОГО поля с разными N. threshold игнорируется (назначение не раскрыто
# — вероятно артефакт генератора DDF, никак не влияет на подтверждённое byte-perfect поведение).
_ENBBY_THRESHOLD_RE = re.compile(
    r'^ENBBY\s*=\s*\[\s*\(\s*(' + _IDENT_CHARS + r'+)\s*:\s*-?\d+\s*,\s*(\d+)\s*\)\s*\]$'
)


def parse_ddf(ddf_text: str) -> list:
    '''Разбирает DDF-файл и возвращает список полей (плоский, без учёта вложенности
    MTX/MAT/MTX3/MAT2 — поддерживаются отдельной веткой в disassemble/assemble, см. docstring
    выше). Каждый элемент — dict с ключами:
      type, name, array (имя поля-счётчика или число, либо None), filler_size,
      enbby_field (имя поля-условия, либо None), enbby_value (число, с которым сравнивается
      enbby_field), enbby_gte (bool — режим сравнения: False означает "точное равенство"
      enbby_field == enbby_value, True означает "порог" enbby_field >= enbby_value — см. ниже)

    Формат ENBBY, простой вариант (подтверждено экспериментально byte-perfect на реальных данных
    weapongrp.dat, сверено с официальным TXT-экспортом l2disasm — 0 расхождений на 1134 записях):
    свойство "ENBBY = [(cond_field, N)];" идёт СРАЗУ после объявления поля в DDF и означает, что
    ЭТО поле физически присутствует в бинарнике только если ранее прочитанное поле cond_field (в
    текущей записи) РАВНО N — иначе поле просто отсутствует (не занимает места в файле), и на
    фронтенде/при сборке ему подставляется дефолтное значение. В известных схемах (weapongrp)
    встречается только как "последнее поле каждой A/B-пары" — сама пара A всегда присутствует
    безусловно, B-вариант условен (при wpn_mesh_cnt==2 — двуручное/парное оружие).

    Формат ENBBY, расширенный вариант с "порогом" (подтверждено экспериментально byte-perfect на
    реальных данных HF mantleexception.dat — полный разбор всех 92 записей файла ЗАВЕРШИЛСЯ ровно
    на границе служебного хвостового маркера "SafePackage", что возможно только при абсолютно
    точном разборе каждого байта до этой точки): "ENBBY = [(cond_field:threshold,N)];" — часто
    НЕСКОЛЬКО таких строк подряд для ОДНОГО поля с разными N (напр. rcid_5 имеет три строки с
    N=5,6,8). Экспериментально установлено (см. RESEARCH_NOTES.md): поле активно, если
    cond_field >= MIN(N) среди всех перечисленных для него условий — то есть каждая пара полей
    "rcid_K"/"rctex_K" включается начиная с той записи, где счётчик достиг K (кумулятивно, не
    как отдельный битовый флаг). Часть threshold (после двоеточия) экспериментально не влияет на
    итоговое поведение (см. проверку: threshold почти всегда РАВЕН -N, но не для всех строк одного
    поля — только для последней/наибольшей N в списке; тем не менее MIN(N)-правило подтверждено
    независимо от threshold и даёт 100% byte-perfect результат) — сохраняется в enbby_value как
    MIN(N), threshold отбрасывается.'''
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
        enbby_match = _ENBBY_RE.match(line)
        if enbby_match:
            if not fields:
                continue
            fields[-1]['enbby_field'] = enbby_match.group(1)
            fields[-1]['enbby_value'] = int(enbby_match.group(2))
            fields[-1]['enbby_gte'] = False
            continue
        enbby_threshold_match = _ENBBY_THRESHOLD_RE.match(line)
        if enbby_threshold_match:
            if not fields:
                continue
            cond_field = enbby_threshold_match.group(1)
            n = int(enbby_threshold_match.group(2))
            # Несколько ENBBY-строк для одного поля -> берём МИНИМАЛЬНОЕ N (см. docstring выше) —
            # первая встреченная строка просто устанавливает значение, последующие уменьшают его,
            # если встретится меньшее N.
            prev_value = fields[-1].get('enbby_value')
            if fields[-1].get('enbby_gte') and prev_value is not None:
                fields[-1]['enbby_value'] = min(prev_value, n)
            else:
                fields[-1]['enbby_value'] = n
            fields[-1]['enbby_field'] = cond_field
            fields[-1]['enbby_gte'] = True
            continue
        # skip other property lines like SOFT = 5, SKIPIF = [...]
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
        if ftype == 'MTX2':
            raise DdfError(f'unsupported_type_{ftype}')
        fields.append({
            'type': ftype,
            'name': fname,
            'array': farray,
            'filler_size': int(ffiller) if ffiller else None,
            'enbby_field': None,
            'enbby_value': None,
            'enbby_gte': False,
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
    UTF-16LE, поэтому кодировку нельзя надёжно угадать заново при пересборке — её нужно помнить.

    Для 8-битного (не-unicode) варианта дополнительно применяется эвристика
    looks_like_cp1251_mojibake/fix_cp1251_mojibake — если строка похожа на кириллицу, "битую"
    из-за прочтения cp1251-байт как latin-1, возвращается уже ИСПРАВЛЕННЫЙ читаемый текст с
    выставленным флагом was_mojibake=True (см. AscfStr) — encode_ascf ниже использует этот флаг,
    чтобы корректно перекодировать текст ОБРАТНО в те же "испорченные" байты при пересборке файла
    (см. подробности и обоснование эвристики в комментарии над looks_like_cp1251_mojibake выше).'''
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
    was_mojibake = False
    if not is_unicode:
        fixed = fix_cp1251_mojibake(text)
        if fixed != text:
            text = fixed
            was_mojibake = True
    return AscfStr(text, is_unicode, has_null, was_mojibake), offset


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
    и это нужно сохранить byte-perfect при пересборке неизменённого поля.

    was_mojibake=True (см. AscfStr/decode_ascf) — текст перед latin-1-кодированием сначала
    перекодируется ОБРАТНО в "испорченные" cp1251-как-latin1 байты через unfix_cp1251_mojibake
    (т.е. в файл пишется та же кириллица в той же исторической кодировке, что и была изначально —
    именно её ожидает игровой клиент на этом сервере). Работает и для НОВОГО кириллического
    текста, введённого пользователем взамен старого — если поле было mojibake, оно им и остаётся.'''
    if text is None:
        return encode_packed_counter(0, False)
    forced_unicode = getattr(text, 'is_unicode', None)
    has_null = getattr(text, 'has_null_terminator', True)
    was_mojibake = getattr(text, 'was_mojibake', False)
    body_text = unfix_cp1251_mojibake(str(text)) if was_mojibake else str(text)
    body = body_text + ('\x00' if has_null else '')
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
                    has_reccnt_prefix: bool = True, fixed_record_count: int = None, offset: int = 0,
                    id_field_names: list = None):
    '''Ищет записи, у которых хотя бы одно из editable_names текстовых полей ИЛИ одно из
    id_field_names (см. _ID_FIELDS в ddf_registry*.py — "настоящий" числовой идентификатор
    записи, например id/quest_id/skill_id) содержит query_lower (или, если query_lower пустой,
    возвращает записи подряд). Читает файл потоково — не накапливает список всех записей в
    памяти. offset — сколько НАЙДЕННЫХ совпадений пропустить с начала перед тем, как начать
    собирать (используется для подгрузки "ещё" при прокрутке списка результатов на фронтенде —
    см. action ddf_search в index.py). Записи variable-length (ASCF-строки переменной длины),
    поэтому смещение по байтам заранее вычислить нельзя — offset всегда требует последовательного
    сканирования с начала файла, как и обычный поиск по подстроке; это тот же порядок сложности,
    что был и раньше.

    ВАЖНО про id_field_names: раньше поиск числа находил запись ТОЛЬКО если это число совпадало
    с порядковым ИНДЕКСОМ записи В ФАЙЛЕ (str(idx) == query_lower) — для схем без текстовых
    editable-полей (raw_only, например armorgrp/etcitemgrp) это означало, что найти запись по её
    РЕАЛЬНОМУ игровому id было невозможно вообще, если эта запись физически лежит не на позиции
    с тем же номером (см. RESEARCH_NOTES.md, диагностика "исторического беспорядка" в некоторых
    файлах) — ввод "1" в поиск armorgrp не находил запись с id=1, если она лежит на индексе 1351.
    Теперь дополнительно проверяется совпадение по ЗНАЧЕНИЮ id-поля(ей) самой записи (то же
    правило подстроки, что и у текстовых полей) — независимо от того, на каком физическом месте
    в файле эта запись находится.

    Возвращает (matches, total_count), где matches — список (index, row) для не более limit
    совпадений НАЧИНАЯ С offset-го, total_count — реальное количество записей в файле (из
    заголовка, O(1)).'''
    total_count = get_record_count(binary, has_reccnt_prefix, fixed_record_count)
    matches = []
    skipped = 0
    for idx, row in iter_records(binary, fields, has_reccnt_prefix, fixed_record_count):
        if query_lower:
            found = str(idx) == query_lower or any(
                row.get(name) and query_lower in str(row[name]).lower()
                for name in editable_names
            )
            if not found and id_field_names:
                found = any(
                    row.get(name) is not None and query_lower in str(row[name]).lower()
                    for name in id_field_names
                )
            if not found:
                continue
        if skipped < offset:
            skipped += 1
            continue
        matches.append((idx, row))
        if len(matches) >= limit:
            break
    return matches, total_count


def find_by_exact_id(binary: bytes, fields: list, id_field_names: list, id_value: int,
                      has_reccnt_prefix: bool = True, fixed_record_count: int = None):
    '''Точный поиск ОДНОЙ записи по числовому значению её id-поля (первое имя из id_field_names —
    для составных ключей типа dbdropdata (npc_id, item_id) ищем совпадение только по первому
    полю, этого достаточно для однозначного поиска предмета/скилла/нпс по игровому id). В отличие
    от search_records (поиск подстроки — "1" находит id=1,21,31,112...) здесь сравнивается ТОЧНОЕ
    числовое значение, поэтому запрос "id=1" находит РОВНО одну запись с id==1, а не все записи,
    чей id содержит цифру "1". Возвращает (index, row) первой найденной записи, либо None.'''
    if not id_field_names:
        return None
    name = id_field_names[0]
    for idx, row in iter_records(binary, fields, has_reccnt_prefix, fixed_record_count):
        val = row.get(name)
        if val is not None and str(val).strip() == str(id_value):
            return idx, row
    return None


def find_by_id_range(binary: bytes, fields: list, id_field_names: list, lo: int, hi: int, limit: int,
                      has_reccnt_prefix: bool = True, fixed_record_count: int = None):
    '''Возвращает (rows, truncated) — список (index, row) всех записей, чьё id-поле (первое имя
    из id_field_names) попадает в диапазон [lo, hi] включительно, отсортированный по возрастанию
    id (записи в файле физически могут идти не по порядку — см. find_by_exact_id/search_records
    про "исторический беспорядок"). truncated=True означает, что найденных записей больше, чем
    limit, и список обрезан (защита от случайно введённого гигантского диапазона на файле с
    десятками тысяч записей).'''
    if not id_field_names:
        return [], False
    name = id_field_names[0]
    found = []
    for idx, row in iter_records(binary, fields, has_reccnt_prefix, fixed_record_count):
        val = row.get(name)
        if val is None:
            continue
        try:
            num = int(val)
        except (TypeError, ValueError):
            continue
        if lo <= num <= hi:
            found.append((num, idx, row))
    found.sort(key=lambda t: t[0])
    truncated = len(found) > limit
    if truncated:
        found = found[:limit]
    return [(idx, row) for _num, idx, row in found], truncated


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


def update_record_sorted(binary: bytes, fields: list, index: int, mutate_fn, key_fn,
                          has_reccnt_prefix: bool = True, fixed_record_count: int = None,
                          tail_bytes: bytes = None):
    '''Как transform_single_row(), но ДОПОЛНИТЕЛЬНО поддерживает сортировку: если после
    mutate_fn(row) ключ записи (key_fn) изменился настолько, что запись оказалась НЕ на своём
    месте относительно соседей (см. insert_records_sorted про то, что "своё место" — первая
    позиция, где ключ следующей существующей записи >= собственного) — запись физически
    ПЕРЕМЕЩАЕТСЯ в файле на новую позицию (а не просто редактируется на месте), чтобы весь файл
    остался отсортирован. Используется в ddf_save_raw — единственном месте, где пользователь
    может поменять сами id-поля записи через текстовое редактирование (обычная форма ddf_save
    id-поля никогда не затрагивает — они не входят в editable, см. _EDITABLE_TEXT_FIELDS).

    ВАЖНО про направление перемещения: новая позиция записи может оказаться и РАНЬШЕ, и ПОЗЖЕ её
    исходного индекса (например пользователь уменьшил id — запись должна переместиться назад,
    к более ранним записям, которые физически уже "позади" неё в файле). Однопроходный алгоритм
    (как в insert_records_sorted, где все new_rows заведомо идут ПОСЛЕ всех существующих в потоке)
    здесь не подходит: пока мы дойдём до исходной позиции записи (чтобы вызвать mutate_fn/key_fn),
    все более ранние записи уже выведены в out — вставить туда что-то задним числом нельзя.
    Поэтому используются ДВА прохода: 1) находим и обновляем запись `index` заранее (через
    get_record_by_index + mutate_fn), вычисляем её новый ключ; 2) основной проход по ВСЕМ
    записям — исходная позиция `index` пропускается (не пишется), а обновлённая запись
    вставляется в правильное место относительно ОСТАЛЬНЫХ записей (перед первой, чей ключ >=
    новому) — независимо от того, раньше это место или позже исходной позиции.

    Возвращает (bytes, new_index) — new_index это позиция записи в ИТОГОВОМ файле (может
    отличаться от исходного index, если запись физически переместилась) — вызывающий код
    (ddf_save_raw в index.py) должен обновить индекс на фронтенде, иначе последующие действия
    (удаление, повторное сохранение) попадут не в ту запись.

    Бросает DdfError, если индекс не найден.'''
    old_row = get_record_by_index(binary, fields, index, has_reccnt_prefix, fixed_record_count)
    updated_row = mutate_fn(old_row)
    updated_key = key_fn(updated_row)

    out = bytearray()
    if has_reccnt_prefix:
        record_count = get_record_count(binary, has_reccnt_prefix)
        out += struct.pack('<I', record_count)

    inserted = False
    new_index = 0
    out_idx = 0
    for idx, row in iter_records(binary, fields, has_reccnt_prefix, fixed_record_count):
        if idx == index:
            continue
        existing_key = key_fn(row)
        if not inserted and updated_key <= existing_key:
            for field in fields:
                _write_field(out, field, updated_row)
            new_index = out_idx
            out_idx += 1
            inserted = True
        for field in fields:
            _write_field(out, field, row)
        out_idx += 1

    if not inserted:
        # Новый ключ больше, чем у ЛЮБОЙ другой записи (включая случай, когда файл состоит
        # ровно из одной записи) — уходит в конец.
        new_index = out_idx
        for field in fields:
            _write_field(out, field, updated_row)

    if tail_bytes is None:
        tail_bytes = encode_ascf('SafePackage')
    out += tail_bytes
    return bytes(out), new_index


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


def insert_records_sorted(binary: bytes, fields: list, new_rows: list, key_fn, has_reccnt_prefix: bool = True,
                           fixed_record_count: int = None, tail_bytes: bytes = None) -> bytes:
    '''Как append_records(), но КАЖДАЯ новая запись из new_rows вставляется в позицию,
    определяемую key_fn (обычно значения id-полей записи, см. _ddf_key_of/_ID_FIELDS в
    index.py/ddf_registry*.py) — так, чтобы ВЕСЬ файл (существующие + новые записи) оставался
    отсортирован по этому ключу по возрастанию. НЕ переупорядочивает уже существующие записи
    между собой (даже если они физически расположены не по порядку — по решению пользователя,
    старый "беспорядок" в файле не трогаем) — новая запись просто вставляется на первую позицию,
    где её ключ <= ключа следующей существующей записи (то есть сразу ПЕРЕД первой существующей
    записью с ключом >= нового). Если такой записи нет (новый ключ больше всех существующих) —
    запись уходит в конец файла, как и раньше в append_records.

    new_rows должны быть уже отсортированы между собой по key_fn (вызывающий код в index.py
    сортирует list перед вызовом) — это упрощает слияние: оба потока (существующие записи и
    new_rows) читаются как отсортированные последовательности и сливаются один раз, без обратных
    перемоток.

    Потоково — как append_records, не накапливает список всех существующих записей в памяти.'''
    out = bytearray()
    if has_reccnt_prefix:
        record_count = get_record_count(binary, has_reccnt_prefix)
        out += struct.pack('<I', record_count + len(new_rows))

    pending = list(new_rows)  # копия — будем вынимать по мере вставки (pop(0))
    for _idx, row in iter_records(binary, fields, has_reccnt_prefix, fixed_record_count):
        existing_key = key_fn(row)
        while pending and key_fn(pending[0]) <= existing_key:
            new_row = pending.pop(0)
            for field in fields:
                _write_field(out, field, new_row)
        for field in fields:
            _write_field(out, field, row)

    # Всё, что осталось в pending (ключ больше, чем у ЛЮБОЙ существующей записи) — в конец файла.
    for new_row in pending:
        for field in fields:
            _write_field(out, field, new_row)

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
        if ftype == 'MTX3':
            row[name] = {'mesh': [], 'tex': [], 'tail': ''}
            continue
        if ftype == 'MAT2':
            row[name] = {'extra': 0, 'items': []}
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
            row[name] = AscfStr(
                str(text), old_value.is_unicode, old_value.has_null_terminator,
                getattr(old_value, 'was_mojibake', False)
            )
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


def _read_mtx3(data: bytes, offset: int):
    '''MTX3 = расширенный MTX (см. docstring модуля) — mesh-подтаблица хранит тройки
    (UNICODE, UCHAR, UCHAR) вместо простых строк, tex-подтаблица как в обычном MTX плюс ОДНО
    дополнительное UNICODE-поле в самом конце. Возвращает ({'mesh': [{'u','b1','b2'}, ...],
    'tex': [...], 'tail': str}, new_offset).'''
    c1 = struct.unpack_from('<I', data, offset)[0]
    offset += 4
    mesh = []
    for _ in range(c1):
        u, offset = decode_unicode_field(data, offset)
        b1 = data[offset]; offset += 1
        b2 = data[offset]; offset += 1
        mesh.append({'u': u, 'b1': b1, 'b2': b2})
    c2 = struct.unpack_from('<I', data, offset)[0]
    offset += 4
    tex = []
    for _ in range(c2):
        v, offset = decode_unicode_field(data, offset)
        tex.append(v)
    tail, offset = decode_unicode_field(data, offset)
    return {'mesh': mesh, 'tex': tex, 'tail': tail}, offset


def _write_mtx3(out: bytearray, value):
    value = value or {}
    mesh = value.get('mesh') or []
    tex = value.get('tex') or []
    tail = value.get('tail') or ''
    out += struct.pack('<I', len(mesh))
    for item in mesh:
        out += encode_unicode_field((item or {}).get('u') or '')
        out.append(int((item or {}).get('b1', 0)) & 0xFF)
        out.append(int((item or {}).get('b2', 0)) & 0xFF)
    out += struct.pack('<I', len(tex))
    for v in tex:
        out += encode_unicode_field(v or '')
    out += encode_unicode_field(tail)


def _read_mat2(data: bytes, offset: int):
    '''MAT2 = расширенный MAT (см. docstring модуля) — тот же список пар (id, amount), но с
    дополнительным UINT-полем "extra" сразу после счётчика (перед списком пар). Возвращает
    ({'extra': int, 'items': [{'id','amount'}, ...]}, new_offset).'''
    count = struct.unpack_from('<I', data, offset)[0]
    offset += 4
    extra = struct.unpack_from('<I', data, offset)[0]
    offset += 4
    items = []
    for _ in range(count):
        item_id, amount = struct.unpack_from('<II', data, offset)
        offset += 8
        items.append({'id': item_id, 'amount': amount})
    return {'extra': extra, 'items': items}, offset


def _write_mat2(out: bytearray, value):
    value = value or {}
    items = value.get('items') or []
    extra = int(value.get('extra', 0))
    out += struct.pack('<I', len(items))
    out += struct.pack('<I', extra)
    for item in items:
        out += struct.pack('<II', int(item.get('id', 0)), int(item.get('amount', 0)))


def _enbby_active(field: dict, row: dict) -> bool:
    '''Возвращает True, если поле не имеет ENBBY-условия, либо условие выполняется — то есть поле
    физически присутствует в бинарнике и должно читаться/записываться. См. docstring parse_ddf():
    enbby_gte=False (простой синтаксис) — точное равенство (enbby_field == enbby_value);
    enbby_gte=True (расширенный синтаксис с двоеточием, mantleexception.dat) — порог
    (enbby_field >= enbby_value).'''
    cond_field = field.get('enbby_field')
    if cond_field is None:
        return True
    if field.get('enbby_gte'):
        return (row.get(cond_field) or 0) >= field.get('enbby_value')
    return row.get(cond_field) == field.get('enbby_value')


def _read_field(data: bytes, offset: int, field: dict, row: dict) -> int:
    ftype = field['type']
    name = field['name']

    if not _enbby_active(field, row):
        # Поле отсутствует в бинарнике (ENBBY-условие не выполнено) — не читаем ничего, но
        # подставляем дефолтное значение ПРАВИЛЬНОЙ формы, чтобы row всегда содержал ВСЕ поля
        # схемы: для статических массивов (junk1B[5]) — список из N дефолтных значений (не
        # пустой список!) — подтверждено на реальном TXT-экспорте l2disasm: колонки
        # "junk1B[0]".."junk1B[4]" присутствуют (пустыми) даже когда ENBBY-условие не выполнено.
        if field['array'] is not None:
            count = _resolve_count(row, field['array']) or 0
            row[name] = [_default_scalar(ftype) for _ in range(count)]
        elif ftype == 'MTX':
            row[name] = {'mesh': [], 'tex': []}
        elif ftype == 'MAT':
            row[name] = []
        elif ftype == 'MTX3':
            row[name] = {'mesh': [], 'tex': [], 'tail': ''}
        elif ftype == 'MAT2':
            row[name] = {'extra': 0, 'items': []}
        else:
            row[name] = _default_scalar(ftype)
        return offset

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

    if ftype == 'MTX3':
        row[name], offset = _read_mtx3(data, offset)
        return offset

    if ftype == 'MAT2':
        row[name], offset = _read_mat2(data, offset)
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

    if not _enbby_active(field, row):
        # ENBBY-условие не выполнено — поле физически отсутствует в бинарнике, ничего не
        # пишем (даже для скалярных строковых/числовых полей — иначе получим "лишние" байты,
        # которых не было в оригинале, и файл разъедется по смещениям для всех записей после).
        return

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

    if ftype == 'MTX3':
        _write_mtx3(out, row.get(name))
        return

    if ftype == 'MAT2':
        _write_mat2(out, row.get(name))
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