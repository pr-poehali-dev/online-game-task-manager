'''RAW-режим редактирования DDF-записи: превращает ОДНУ запись (row-dict, как возвращает
ddf_parser.get_record_by_index) в единую текстовую строку значений через табуляцию — по образцу
официального TSV-экспорта l2disasm (подтверждено побайтовым сравнением на реальном
etcitemgrp.txt пользователя) — и обратно.

Используется для схем без "человеческих" текстовых полей (armorgrp, etcitemgrp, recipe — везде
основная ценность записи в MTX/MAT-таблицах путей к моделям/текстурам/звукам или в списках
материалов рецепта), где обычная форма "один инпут на editable-поле" неудобна или бессмысленна.
Вместо неё пользователь видит/правит запись целиком одной строкой, как в декомпилированном
исходнике — с сохранением порядка полей, табуляции и разворачивания табличных полей поэлементно
(name[0], name[1]... для статических/динамических массивов; MTX -> mesh_count, mesh values...,
tex_count, tex values...; MAT -> count, (id, amount) values...).

Значения экранируются по тем же правилам, что использует l2disasm при TXT-экспорте (см.
RESEARCH_NOTES.md): '\\' -> '\\\\', TAB -> '\\t', CR -> '\\r', LF -> '\\n'. Числа выводятся как
есть, без экранирования.
'''
from ddf_parser import AscfStr, DdfError, _resolve_count


def _escape(text: str) -> str:
    return (
        text.replace('\\', '\\\\')
        .replace('\t', '\\t')
        .replace('\r', '\\r')
        .replace('\n', '\\n')
    )


def _unescape(text: str) -> str:
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == '\\' and i + 1 < n:
            nxt = text[i + 1]
            if nxt == 't':
                out.append('\t'); i += 2; continue
            if nxt == 'r':
                out.append('\r'); i += 2; continue
            if nxt == 'n':
                out.append('\n'); i += 2; continue
            if nxt == '\\':
                out.append('\\'); i += 2; continue
        out.append(ch)
        i += 1
    return ''.join(out)


def _value_to_tokens(ftype: str, value) -> list:
    '''Один скаляр (не MTX/MAT/массив) -> список из ОДНОГО текстового токена.'''
    if ftype == 'FLOAT':
        return [repr(float(value if value is not None else 0.0))]
    if ftype in ('UINT', 'HEX', 'INT', 'UWORD', 'WORD', 'UCHAR', 'CHEX', 'CHAR', 'CNTR'):
        return [str(int(value if value is not None else 0))]
    # ASCF / UNICODE — текстовые типы
    return [_escape(str(value) if value is not None else '')]


def _token_to_value(ftype: str, token: str):
    text = _unescape(token)
    if ftype == 'FLOAT':
        return float(text or 0)
    if ftype in ('UINT', 'HEX', 'INT', 'UWORD', 'WORD', 'UCHAR', 'CHEX', 'CHAR', 'CNTR'):
        return int(text or 0)
    return text


def row_to_raw_line(row: dict, fields: list) -> str:
    '''Сериализует одну запись в единую таб-разделённую строку (без завершающего перевода
    строки), в порядке полей схемы, разворачивая массивы/MTX/MAT поэлементно.'''
    tokens = []
    for field in fields:
        ftype = field['type']
        name = field['name']
        if ftype == 'FILLER':
            continue
        if ftype == 'MTX':
            value = row.get(name) or {}
            mesh = value.get('mesh') or []
            tex = value.get('tex') or []
            tokens.append(str(len(mesh)))
            tokens.extend(_escape(v or '') for v in mesh)
            tokens.append(str(len(tex)))
            tokens.extend(_escape(v or '') for v in tex)
            continue
        if ftype == 'MAT':
            items = row.get(name) or []
            tokens.append(str(len(items)))
            for item in items:
                tokens.append(str(int(item.get('id', 0))))
                tokens.append(str(int(item.get('amount', 0))))
            continue
        count = _resolve_count(row, field['array'])
        if count is not None:
            values = row.get(name) or []
            for v in values:
                tokens.extend(_value_to_tokens(ftype, v))
            continue
        tokens.extend(_value_to_tokens(ftype, row.get(name)))
    return '\t'.join(tokens)


def raw_line_to_row(line: str, fields: list, base_row: dict = None) -> dict:
    '''Разбирает таб-разделённую строку (результат правки row_to_raw_line) обратно в row-dict,
    в том же порядке полей, что и при сериализации. base_row (если передан — обычно исходная,
    ДО правки, запись) используется, чтобы сохранить AscfStr-флаги кодировки (is_unicode/
    has_null_terminator) для ASCF-полей — сама текстовая строка их не содержит.

    Бросает DdfError, если количество токенов не совпадает с ожидаемым по схеме (это означает,
    что пользователь испортил структуру строки — удалил/добавил лишнюю табуляцию).'''
    tokens = line.split('\t')
    pos = 0
    row = {}
    base_row = base_row or {}

    def next_token():
        nonlocal pos
        if pos >= len(tokens):
            raise DdfError('raw_line_too_short')
        tok = tokens[pos]
        pos += 1
        return tok

    for field in fields:
        ftype = field['type']
        name = field['name']
        if ftype == 'FILLER':
            continue
        if ftype == 'MTX':
            c1 = int(next_token() or 0)
            mesh = [_unescape(next_token()) for _ in range(c1)]
            c2 = int(next_token() or 0)
            tex = [_unescape(next_token()) for _ in range(c2)]
            row[name] = {'mesh': mesh, 'tex': tex}
            continue
        if ftype == 'MAT':
            count = int(next_token() or 0)
            items = []
            for _ in range(count):
                item_id = int(next_token() or 0)
                amount = int(next_token() or 0)
                items.append({'id': item_id, 'amount': amount})
            row[name] = items
            continue
        count = _resolve_count(row, field['array'])
        if count is not None:
            values = []
            for _ in range(count):
                values.append(_token_to_value(ftype, next_token()))
            row[name] = values
            continue
        value = _token_to_value(ftype, next_token())
        if ftype == 'ASCF':
            old = base_row.get(name)
            is_unicode = getattr(old, 'is_unicode', False)
            has_null = getattr(old, 'has_null_terminator', True)
            value = AscfStr(value, is_unicode, has_null)
        row[name] = value

    if pos != len(tokens):
        raise DdfError('raw_line_too_long')
    return row
