# Исследование формата .dat файлов Lineage 2 — заметки для восстановления контекста

## Цель задачи
Реализовать в разделе "Патчи" (backend/patches) возможность:
1. Скачать/расшифровать .dat файл сервера (например `itemname-e.dat`, `skillname-e.dat`)
2. Разобрать бинарную структуру по DDF-описанию в читаемый текст (аналог `l2disasm`)
3. Дать пользователю отредактировать текст на фронтенде
4. Собрать обратно в бинарник (аналог `l2asm`) и зашифровать — сохранить в S3 / вернуть на сервер

## Источники эталонных данных
Пользователь присылала архив **"L2_File_Editor_HF (1).7z"** с готовой утилитой L2 File Editor,
внутри которой лежат:
- `temp/l2encdec` — консольная утилита шифрования/дешифрования (l2encdec)
- `temp/*.ddf` — DDF-описания форматов файлов (armorgrp, itemname-e, skillname-e, npcname-e, ...)
- `temp/*.dat` — зашифрованные оригиналы
- `temp/dec-*.dat` — уже РАСШИФРОВАННЫЕ бинарники (эталон для проверки decode)
- `temp/*.txt` — уже РАЗОБРАННЫЕ через DDF в текст (TSV, эталон для проверки DDF-парсера)
- `data/l2asm-disasm/MANUAL` — текстовый мануал формата DDF (полное описание синтаксиса)
- `data/l2asm-disasm/DAT_defs/H5pt/*.ddf` — актуальные DDF для протокола H5 (эти же файлы что и в temp)

**ВАЖНО**: архив во временной песочнице (`/tmp`) не переживает рестарт пода! Если контекст сброшен —
нужно заново попросить пользователя прислать файл (он говорил, что 7z уже загружен на CDN, можно
поискать URL в истории диалога) и распаковать через:
```bash
# Alpine musl — apk/py7zr(BCJ2) не работают, нужен статический 7zzs:
curl -sL "https://github.com/ip7z/7zip/releases/download/25.01/7z2501-linux-x64.tar.xz" -o /tmp/7z.tar.xz
python3 -c "import lzma; open('/tmp/7z.tar','wb').write(lzma.open('/tmp/7z.tar.xz').read())"
mkdir -p /tmp/7zbin && tar xf /tmp/7z.tar -C /tmp/7zbin
chmod +x /tmp/7zbin/7zzs
/tmp/7zbin/7zzs x <файл.7z> -o/tmp/l2edit_extracted -y
```
Ключевые файлы после распаковки: `/tmp/l2edit_extracted/temp/*.{ddf,dat,txt}`

Живые боевые файлы пользователь заливает в раздел "Патчи" сервера **hfx3old** (таблица `patch_files`,
поле `server='hfx3old'`). Скачать можно напрямую по CDN:
```
https://cdn.poehali.dev/projects/822d91fc-c5e9-4b3f-b5b0-7848ab17f22c/bucket/{file_key}
```
(file_key из БД, например `patches/hfx3old/System/itemname-e.dat`)

Уже проверены на реальных боевых файлах hfx3old: `itemname-e.dat`, `skillname-e.dat`,
`npcname-e.dat`, `npcstring-e.dat` — все успешно расшифровываются модулем `l2encdec.py`.

## ЭТАП 1 (ГОТОВО): Шифрование/дешифрование — `backend/patches/l2encdec.py`
Полностью реализовано и провалидировано (roundtrip decode→encode→decode) на 13+ реальных файлах
(и архивных эталонных, и живых боевых с hfx3old). Протокол RSA 411-414 (у нас везде встречается 413).

Формат файла:
- `header` (28 байт) = `"Lineage2Ver" + номер_протокола`, закодировано UTF-16LE
- `body` = RSA-зашифрованные 128-байтные блоки. Внутри — zlib-сжатые данные с 4-байтным
  префиксом (little-endian) исходного (разжатого) размера
- `tail` (20 байт) = CRC32 всего файла (header+body) в little-endian, записан по смещению 12
  внутри tail, остальное — нули

RSA паддинг: каждый 128-байтный блок = данные (max 124 байта), прижатые к КОНЦУ блока с
выравниванием на 4 байта, при этом байт по смещению 3 хранит фактический размер полезных данных
в этом блоке (0-124).

Модуль использует "modern" RSA-ключ (публичный/приватный экспоненты + модуль — see
`MODERN_RSA_*` константы в файле) — единый для encode и decode, взят из открытого проекта
[open-l2encdec](https://github.com/ritsuwastaken/open-l2encdec) (основан на l2encdec автора
DStuff и L2crypt автора acmi).

Функции: `decode(raw, protocol)`, `encode(plain, protocol)`, `detect_protocol(raw)`.

## ЭТАП 2 (В ПРОЦЕССЕ): DDF-парсер (disasm/asm) бинарной структуры

### DDF — что это
Текстовый DSL-формат, описывающий структуру записей в .dat файле (см. полный мануал в архиве
`data/l2asm-disasm/MANUAL`, я его прочитал целиком). Ключевые типы полей:
`UINT/HEX/INT/UWORD/WORD/UCHAR/CHEX/CHAR` (целые разной разрядности), `FLOAT`, `UNICODE`
(int32 длина в байтах + UTF-16LE строка), `ASCF` (см. ниже — переменной длины строка со
спец-счётчиком), `MTX/MTX2/MTX3/MAT/MAT2` (сложные вложенные табличные структуры), `FILLER`
(заполнитель фиксированного размера), `CNTR` (голый packed-counter, та же схема что у ASCF).

Поля могут быть таблицами (`type ident[count]`), где count — либо число, либо имя другого
числового поля (динамический размер).

### Структура файла в целом
Первые 4 байта расшифрованного бинарника (первого — сразу после zlib-распаковки) — implicit
UINT32 = RECCNT (число записей), ЕСЛИ в DDF `RECCNT = OFF` (значение по умолчанию для всех
проверенных файлов) — то есть счётчик записей ВСЕГДА хранится в файле как первые 4 байта, даже
если в DDF написано `RECCNT = OFF` (OFF означает "не описывать явно в DDF/тексте", но в бинарнике
он всё равно есть).

Дальше идут записи одна за другой, каждая — это последовательность полей согласно DDF-схеме,
без какого-либо разделителя.

### ПОДТВЕРЖДЕНО: формат ASCF-строки (ASCII-вариант, hint 'a' в TXT-экспорте)
```
[packed_counter: 1 или 2 байта][текст: ровно `counter` байт, включая завершающий \x00]
```
**НЕТ отдельного hint-байта в бинарнике!** Разметка `a,`/`u,` в TXT-файле — это чисто
информационная приписка l2disasm при экспорте в текст, в самом .dat её нет.

Формула packed_counter (проверено на 70803+ образцах из skillname-e.txt / dec-skillname-e.dat,
0 расхождений):
```python
def decode_counter(data, offset):
    b0 = data[offset]
    if b0 & 0x40 == 0:
        return b0, offset + 1          # value, new_offset
    b1 = data[offset + 1]
    value = (b0 & 0x3F) | (b1 << 6)
    return value, offset + 2

def encode_counter(value):
    if value < 64:
        return bytes([value])
    else:
        return bytes([0x40 | (value & 0x3F), value >> 6])
```
Диапазон: 1 байт → 0..63, 2 байта → 64..16383. Максимальная встреченная длина строки в тестовых
файлах — 3207 байт (skillname-e), так что 2 байт хватает с большим запасом. 3-байтовый случай
НЕ встречен и формула для него не выведена (гипотетически была бы `b0&0x40==0x40 && b1&0x40==0x40`
третий байт, но нет данных для проверки — если понадобится, добавить defensive проверку/raise).

Ранее ошибочно решил, что есть отдельный "hint-байт" (0/1) перед текстом — ошибка из-за того, что
не знал формулу 2-байтного counter и принял второй байт counter'а (b1) за отдельный hint. После
вывода формулы на большой выборке это опровергнуто — hint-байта нет.

### ПОДТВЕРЖДЕНО (100%, 0 расхождений на 76336 записях / 305344 полях): единая формула ASCF

Итоговая, полностью проверенная схема (весь файл skillname-e.txt/dec-skillname-e.dat пройден
от первой до последней записи с ИДЕАЛЬНЫМ совпадением всех offset'ов, единственная разница в
конце файла — 13 байт хвостового маркера `"\x0cSafePackage\x00"`, упомянутого в MANUAL):

```python
def decode_counter(data, offset):
    """Возвращает (value, is_unicode, new_offset)."""
    b0 = data[offset]
    is_unicode = bool(b0 & 0x80)
    b0 &= 0x7F
    if b0 & 0x40 == 0:
        return b0, is_unicode, offset + 1
    b1 = data[offset + 1]
    value = (b0 & 0x3F) | (b1 << 6)
    return value, is_unicode, offset + 2

def encode_counter(value, is_unicode):
    base = 0x80 if is_unicode else 0
    if value < 64:
        return bytes([base | value])
    return bytes([base | 0x40 | (value & 0x3F), value >> 6])
```

Ключевое открытие: бит `0x80` в ПЕРВОМ байте counter'а — это флаг "строка в UTF-16", а биты
`0x40`+ниже — та же схема, что и раньше (0x40 = флаг "нужен второй байт").

**Как читать содержимое ASCF-строки:**
- Если `is_unicode == False` (обычный "half-ascii" вариант, в TXT экспортируется с hint `a,`):
  `value` = точное число БАЙТ содержимого (включая завершающий `\x00`). Байты читаются "как
  есть" — это 8-битная кодировка (ISO-8859-1/CP1252 судя по всему — там встречаются символы типа
  NBSP `0xA0`). Чтобы получить `value` из строки Python при СБОРКЕ обратно (encode/asm):
  `content_bytes = original_unicode_str.encode('latin-1')`, `value = len(content_bytes)`.
- Если `is_unicode == True` (hint `u,` в TXT): `value` = число UTF-16 code units (символов,
  включая завершающий null-символ). Содержимое — `value * 2` байт, UTF-16LE.
  `content_bytes = original_unicode_str.encode('utf-16-le')`, `value = len(original_unicode_str)`.

**КРИТИЧЕСКИ ВАЖНО про TXT-файлы (l2disasm export)**: сам `.txt` (например `skillname-e.txt`)
физически сохранён в кодировке UTF-8. Экранирование символов `\\`, `\t`, `\r`, `\n`, `\0`
происходит на уровне СИМВОЛОВ (не байт) — то есть сначала нужно `raw_bytes.decode('utf-8')`,
и только потом разворачивать backslash-последовательности посимвольно в этой unicode-строке.
Если делать unescape на сырых байтах ДО utf-8-декодирования — сломается на многобайтовых UTF-8
последовательностях (например NBSP `\xc2\xa0` в UTF-8 при decode даёт один символ `\xa0`, а если
выполнять байтовый replace до декодирования, будет виден как 2 самостоятельных байта и даст
неверную длину). Ошибка именно на этом была найдена и исправлена в процессе валидации (see
row 61126 в skillname-e, поле содержало NBSP).

Итоговый (проверенный) алгоритм сопоставления TXT ⟷ BIN для одного ASCF-поля:
```python
def txt_field_to_python_str(raw_bytes_after_hint_prefix):
    s = raw_bytes_after_hint_prefix.decode('utf-8')  # ВАЖНО: сначала decode utf-8
    # затем посимвольный unescape: \\ -> \, \t -> TAB, \r -> CR, \n -> LF, \0 -> NUL
    ...
    return unescaped_str

# для сборки (asm) обратно в бинарник:
if hint == 'a':
    content_bytes = s.encode('latin-1')
else:  # hint == 'u'
    content_bytes = s.encode('utf-16-le')
value = len(content_bytes) if hint=='a' else len(s)
counter_bytes = encode_counter(value, is_unicode=(hint=='u'))
block = counter_bytes + content_bytes  # НЕТ отдельного null-терминатора вне length —
                                          # он уже включён в content_bytes/value, т.к.
                                          # исходная python-строка должна оканчиваться на '\x00'
```

Обратный процесс (disasm, bin→txt) для одного ASCF-поля:
```python
value, is_unicode, offset = decode_counter(data, offset)
if is_unicode:
    raw = data[offset:offset+value*2]
    s = raw.decode('utf-16-le')  # включает завершающий '\x00' как последний символ
    offset += value*2
else:
    raw = data[offset:offset+value]
    s = raw.decode('latin-1')  # включает завершающий '\x00' как последний символ
    offset += value
# затем escape обратно в TXT: '\x00'->'\0', '\\'->'\\\\', TAB->'\t', CR->'\r', LF->'\n'
# и добавить префикс 'a,' или 'u,' для TXT-представления
```

Максимальная длина строки, встреченная в тестах — 3207 байт (skillname-e), укладывается в
двухбайтовую схему (максимум 16383). 3-байтовый вариант NIKогда не встречен и не подтверждён —
если понадобится, придётся исследовать отдельно на файле с супер-длинными строками, либо просто
поставить assert/raise на value >= 16384 как явно неподдерживаемый случай (маловероятен на
практике для этих 4 целевых файлов).

### Проверенная методология сопоставления (важно для продолжения / повторения на других файлах)
1. Взять `dec-<file>.dat` (расшифрованный бинарник) и `<file>.txt` (уже разобранный TSV)
2. Построчно идти по обоим: из .dat читать поля СТРОГО по DDF-схеме (структурные числовые поля
   типа id/level читаются напрямую как int32 LE — они служат "якорем" для проверки, что offset не
   уехал)
3. Из .txt брать соответствующее значение, "unescape" его (файл использует `\\`, `\t`, `\0`,
   `\r`, `\n` как экранированные последовательности — их нужно развернуть в реальные байты)
4. Экспериментально подбирать длину/формулу counter, сверяя байт-в-байт содержимое после counter
   с ожидаемым текстом (используется `match1 = data[off+1:off+1+len]==expected`,
   `match2 = data[off+2:off+2+len]==expected` чтобы отличить 1-байтный/2-байтный counter)
5. Собрать МНОГО (сотни-тысячи) образцов `(value, c1, c2)` и найти формулу, которая сходится на
   ВСЕХ образцах без единого расхождения — только тогда считать формулу подтверждённой

Файлы для проверки/экспериментов есть под рукой в `/tmp/l2edit_extracted/temp/` (после
распаковки — см. выше): `itemname-e`, `skillname-e`, `npcname-e`, `npcstring-e`, `armorgrp`,
`npcgrp`, `commandname-e`, `questname-e`, `skillgrp`, `dbitemdata`, `dbnpcdata`, `dbdropdata`,
`dbspoildata` (и русские версии некоторых).

### DDF файлы для 4-х живых файлов (актуальный протокол H5, лежат в архиве):
- `data/l2asm-disasm/DAT_defs/H5pt/itemname-e.ddf`
- `data/l2asm-disasm/DAT_defs/H5pt/skillname-e.ddf`
- `data/l2asm-disasm/DAT_defs/H5pt/npcname-e.ddf`
- `data/l2asm-disasm/DAT_defs/H5pt/npcstring-e.ddf`
(в `temp/` тоже есть копии + `*-new.ddf` — сгенерированные автоматически с заполненными
SOFT-свойствами, они предпочтительнее для l2asm-совместимой сборки обратно)

## ЭТАП 2 — ЗАВЕРШЁН: `backend/patches/l2ddf.py`

Полноценный DDF-парсер + disasm/asm реализован и полностью провалидирован на ВСЕХ 4 целевых
файлах (itemname-e, skillname-e, npcname-e, npcstring-e) — эталонные `dec-*.dat` бинарники,
byte-perfect roundtrip `bin → disasm → TSV → tsv_to_records → asm → bin`.

Ключевые открытые нюансы, уже исправленные в коде:
- ASCF-поле хранит флаг `is_unicode` (бит 0x80 в counter'е), который НЕЛЬЗЯ пересчитывать
  заново по содержимому строки при кодировании — оригинал может хранить чисто ASCII-текст как
  unicode (наблюдалось в itemname-e). Поэтому значение ASCF-поля в records — это кортеж
  `(is_unicode: bool, text: str)`, а не голая строка. `format_value_for_text`/
  `parse_value_from_text` сохраняют/восстанавливают этот флаг через префикс `a,`/`u,` в TSV
  (ровно как это делает оригинальный l2disasm).
- Для динамических табличных полей (`UNICODE set_ids[cnt0]` и т.п.) TSV содержит
  фиксированное число колонок = МАКСИМУМ размера таблицы среди ВСЕХ записей файла (SOFT-ширина
  в терминах DDF), а не размер конкретной записи — короткие записи дополняются пустыми
  ячейками. Это реализовано в `_dynamic_field_widths` + используется и в `records_to_tsv`, и в
  `tsv_to_records` (там ширина колонок вычисляется из строки заголовка TSV).
- Хвостовой маркер файла — `b'\x0cSafePackage\x00'` (13 байт), должен отрезаться перед disasm
  и добавляться обратно после asm (`strip_safe_package_tail`/`append_safe_package_tail`).
- CHEX/HEX форматируются в TSV БЕЗ ведущих нулей (`format(value, 'X')`, не `%02X`) — то есть
  0 выводится как `"0"`, а не `"00"`.
- Один-единственный edge case на 19443 записи itemname-e: реальный `id` может быть отрицательным
  (l2disasm вывел `-400`), хотя в DDF тип поля — `UINT` (беззнаковый). Это НЕ баг парсера, а
  особенность оригинального дампа/экспорта, встречающаяся один раз на весь файл — решено не
  усложнять код ради этого редчайшего случая, `UINT` читается/пишется как беззнаковое `<I`
  всегда (round-trip бинарника это не ломает, ломает только TSV-текстовое представление именно
  этого одного id, что не критично для практики редактирования).

Полный сквозной тест (зашифрованный `.dat` → `l2encdec.decode` → `l2ddf.disasm` → TSV →
РЕДАКТИРОВАНИЕ текста (замена названия предмета) → `l2ddf.tsv_to_records` → `l2ddf.asm` →
`l2encdec.encode` → `l2encdec.decode` → повторный `l2ddf.disasm` → проверка нового значения)
— **пройден успешно**, отредактированное значение сохраняется через весь цикл byte-perfect.

### Публичный API `l2ddf.py`
```python
fields = l2ddf.parse_ddf(ddf_text)                      # .ddf текст -> список FieldDef

plain_notail = l2ddf.strip_safe_package_tail(plain)      # убрать хвост перед disasm
records, offset = l2ddf.disasm(plain_notail, fields)     # bin -> list[dict]
tsv_text = l2ddf.records_to_tsv(records, fields)          # list[dict] -> TSV (для фронтенда)

records2 = l2ddf.tsv_to_records(edited_tsv_text, fields)  # TSV (после правки) -> list[dict]
bin2 = l2ddf.asm(records2, fields)                        # list[dict] -> bin (без хвоста)
full_bin = l2ddf.append_safe_package_tail(bin2)           # добавить хвост обратно
```
Значения полей типа ASCF в записях — кортеж `(is_unicode: bool, text: str)`, где `text`
включает завершающий `'\x00'` как последний символ строки. UNICODE-поля — обычная python str
(тоже с завершающим `'\x00'`). Остальные типы — int/float как есть.

## Оставшиеся этапы (TODO)
1. Обернуть весь пайплайн (l2encdec + l2ddf) в backend actions (например `action=decode_text` /
   `action=encode_save`) с картой `file_name -> ddf_path` (пока только 4 живых файла:
   itemname-e, skillname-e, npcname-e, npcstring-e — DDF-тексты для них нужно ЗАШИТЬ в код
   backend'а как константы, т.к. архив с эталонами доступен только в песочнице Bash, а не в
   проекте — см. содержимое DDF ниже для копипаста при реализации).
2. Frontend: кнопка "редактировать" у файла в разделе Патчи, текстовый редактор (TSV или
   удобная построчная форма), сохранение → backend кодирует обратно и заливает в S3 поверх
   файла (или отдаёт готовый .dat на скачивание — уточнить у пользователя предпочтение).
3. Финальная сквозная проверка decode→edit→encode на живом сервере (по возможности сверить,
   что игра/лаунчер не ломается — здесь мы полагаемся на побайтовую валидность roundtrip,
   already подтверждённую в песочнице).

### DDF-тексты для 4 целевых файлов (скопировать в backend при реализации action'ов)

**itemname-e.ddf:**
```
{
	UINT id;
	UNICODE name;
	UNICODE add_name;
	ASCF description;
	INT popup;
	UINT supercnt0;
	UINT cnt0;
	UNICODE set_ids[cnt0];
	ASCF set_bonus_desc;
	UINT supercnt1;
	UINT cnt1;
	UNICODE set_extra_ids[cnt1];
	ASCF set_extra_desc;
	CHEX unk1[9];
	UINT special_enchant_amount;
	ASCF special_enchant_desc;
	UINT unk2;
}
```

**skillname-e.ddf:**
```
{
	UINT id;
	UINT level;
	ASCF name;
	ASCF description;
	ASCF desc_add1;
	ASCF desc_add2;
}
```

**npcname-e.ddf:**
```
{
	UINT id;
	ASCF name;
	ASCF description;
	CHEX rgb[3];
	CHAR reserved1;
}
```

**npcstring-e.ddf:**
```
{
	UINT id;
	ASCF string;
}
```

## ВАЖНО: смена основного DDF-парсера (l2ddf.py -> ddf_parser.py+ddf_registry.py)

В какой-то момент сессии (после сброса контекста) обнаружилось, что в проекте уже существует
ПАРАЛЛЕЛЬНАЯ реализация той же задачи: `backend/patches/ddf_parser.py` + `ddf_registry.py`,
уже импортированная в `backend/patches/index.py` (строки `import ddf_parser`, `import
ddf_registry`). Она устроена немного иначе, чем мой `l2ddf.py`:
- ASCF-строка возвращается как `AscfStr` — подкласс `str` с атрибутом `.is_unicode` (вместо
  кортежа `(is_unicode, text)` как было в l2ddf.py). Ведёт себя как обычная строка везде.
- Пустая ASCF-строка различает ДВА бинарных случая: `None` (counter=0, данных нет вообще) и
  `AscfStr('')` (counter=1, один null-байт) — это важно для byte-perfect пересборки.
- `disassemble(binary, fields, has_reccnt_prefix=True)` возвращает `(rows, record_count,
  tail_bytes)` — сам определяет и хвост (SafePackage), и его отдаёт для передачи в assemble.
- `assemble(rows, fields, record_count=None, has_reccnt_prefix=True, tail_bytes=None)` — не
  нужно отдельно вызывать strip/append tail, всё внутри.
- Есть частичная поддержка `CNTR` (голый packed counter как отдельное поле) и `FILLER`.
- `ddf_registry.py` уже содержит match_ddf(filename) -> (key, fields, editable_fields) для 5
  схем (itemname, npcname, npcstring, skillname, commandname) — DDF-тексты зашиты в код.

Я УДАЛИЛ свой `l2ddf.py` (дублирующий, менее интегрированный) и дальше работаю ИСКЛЮЧИТЕЛЬНО
с `ddf_parser.py`/`ddf_registry.py` — не путать, если контекст снова собьётся! Публичный API
для справки:
```python
from ddf_parser import parse_ddf, disassemble, assemble, DdfError, AscfStr
from ddf_registry import match_ddf, is_supported

fields = parse_ddf(ddf_text)
rows, record_count, tail_bytes = disassemble(plain_bytes, fields)   # bytes -> list[dict]
new_plain = assemble(rows, fields, record_count=record_count, tail_bytes=tail_bytes)  # обратно
```

### Массовая валидация ddf_parser.py на 31 эталонном файле — статус на момент записи

Прогнан roundtrip-тест (bin -> disassemble -> assemble -> bin, побайтовое сравнение) на ВСЕХ
доступных парах `dec-*.dat`+`*.ddf` из архива (эталоны лежат в `/tmp/l2edit_extracted/temp/*.ddf`
— там ЕСТЬ ru-версии DDF в отличие от `data/l2asm-disasm/DAT_defs/H5pt/`, где только `-e`).
Файлы с "неканоничным" регистром имени (`CommandNamePatch-e.ddf`, `NpcString-e.ddf`,
`MacroPreset-e.ddf`, `ZoneName-e.ddf`) — искать case-insensitive.

**Результаты (после первого фикса regex для field name, см. ниже):**
- OK (byte-perfect): additionalitemgrp, castlename-ru, commandname-e, commandname-ru,
  commandnamepatch-e, dbdropdata, dbitemdata, dbnpcdata, dbspoildata, huntingzone-ru,
  instantzonedata-ru, itemname-e, itemname-ru, macropreset-e, mobskillanimgrp, npcname-e,
  npcname-ru, npcstring-e (проверить регистр файла), npcstring-ru, questname-e (после фикса),
  questname-ru (после фикса, needs re-verify), skillname-e, skillname-ru, systemmsg-e,
  systemmsg-ru, zonename-e/zonename-ru (после фикса regex, needs re-verify)
- **НЕ ПОДДЕРЖИВАЕТСЯ** (содержат MTX-тип, парсер намеренно кидает `DdfError`): armorgrp,
  etcitemgrp, vehiclepartsgrp, recipe-c
- **НЕ РАБОТАЕТ, требует доп. фикса** (найдено, но ещё НЕ исправлено на момент этой записи):
  - `npcgrp`, `weapongrp` — используют `ENBBY` (условное поле, читается только если другое
    поле удовлетворяет условию) — парсер ЭТО НЕ учитывает при disassemble/assemble (просто
    пропускает свойство ENBBY как текст, но само поле всё равно безусловно читает/пишет) —
    из-за этого весь разбор записи сдвигается. Также в `npcgrp.ddf` есть ДУБЛИРУЮЩЕЕся имя
    поля `tex1` (два разных поля названы одинаково — опечатка автора DDF, `UNICODE
    tex1[cnt_tex1]` и потом снова `UNICODE tex1[cnt_tex2]`) — при записи в dict-row второе
    значение перезатирает первое, это тоже нужно чем-то решать (например, переименовывать
    задваивающиеся имена в *_2 при парсинге DDF).
  - `radiodata-ru` — НЕ баг структуры, а баг `encode_ascf`: некоторые реальные ASCF-строки в
    этом файле физически НЕ оканчиваются на `\x00` внутри блока (обрываются просто по длине
    counter, а не по null-терминатору — например URL "NOVOE RADIO" станции обрывается на 'p'
    без null, дальше сразу идёт следующая запись). `decode_ascf` их читает правильно (canonical
    AscfStr без хвостового `\x00`, т.к. `text.endswith('\x00')` не сработал — null просто нет),
    НО `encode_ascf` ВСЕГДА безусловно добавляет `'\x00'` при кодировании
    (`body = str(text) + '\x00'`), из-за чего counter получается на 1 больше и всё "уезжает".
    **Нужно разобраться**: почему в оригинале иногда нет null-терминатора — возможно, это
    зависит от того, была ли строка обрезана из-за упора в лимит counter (16383) или это
    просто мусор/недосмотр в конкретно этом файле у создателей контента. Возможное решение:
    сохранять в `AscfStr` ещё один флаг `has_null_terminator` (аналогично `is_unicode`),
    считанный при disassemble, и использовать его в encode_ascf вместо безусловного
    добавления `+ '\x00'`.
  - `questname-e`/`zonename-e`/`questname-ru`/`zonename-ru` (`counter_value_too_large`) — ИСПРАВЛЕНО
    фиксом regex ниже, но нужно перепроверить после фикса (я это сделал только для
    questname-e explicitly, остальные 3 предположительно тоже чинятся тем же фиксом, но не
    перепроверены на момент этой записи — ПЕРЕПРОВЕРИТЬ).

### Найденный и исправленный баг №2: has_null_terminator для ASCF (radiodata-ru) — ИСПРАВЛЕНО

`AscfStr` теперь хранит третий флаг `has_null_terminator` (по умолчанию True), сохранённый при
`decode_ascf` (проверяется реальным `text.endswith('\x00')` после декодирования raw-байт).
`encode_ascf` использует `getattr(text, 'has_null_terminator', True)` вместо безусловного
`+ '\x00'`. Подтверждено: `radiodata-ru` теперь тоже даёт byte-perfect match.

### ИТОГОВЫЙ статус массовой проверки после обоих фиксов: 28/32 файлов OK byte-perfect

```
additionalitemgrp OK, castlename-ru OK, commandname-e OK, commandname-ru OK,
commandnamepatch-e OK, dbdropdata OK, dbitemdata OK, dbnpcdata OK, dbspoildata OK,
huntingzone-ru OK, instantzonedata-ru OK, itemname-e OK, itemname-ru OK, macropreset-e OK,
mobskillanimgrp OK, npcname-e OK, npcname-ru OK, npcstring-e OK, npcstring-ru OK,
questname-e OK, questname-ru OK, radiodata-ru OK, skillname-e OK, skillname-ru OK,
systemmsg-e OK, systemmsg-ru OK, zonename-e OK, zonename-ru OK

НЕ поддерживаются (осознанное ограничение, требуют MTX/ENBBY — следующий этап):
armorgrp (MTX), etcitemgrp (MTX), npcgrp (ENBBY + дублирующееся имя поля tex1),
weapongrp (вероятно тоже ENBBY/MTX-подобное — не разбирался подробно)
```

### Найденный и исправленный баг №1: regex имени поля в `ddf_parser.py`

`FIELD_RE` и внутренний regex в `parse_ddf()` использовали `[A-Za-z_][A-Za-z0-9_]*` для имени
поля (ident). Но согласно MANUAL, ident может содержать ЛЮБЫЕ символы кроме пробельных и
`[](){}=,/*\#:;` — например, реальный DDF `questname-e.ddf` содержит поле `UINT tag_?;` (с
символом `?` в имени). Из-за слишком строгого regex это поле целиком пропускалось (не считалось
полем), что сдвигало offset чтения ВСЕХ последующих полей на 4 байта и портило весь разбор файла.

Фикс (уже применён в `ddf_parser.py`): заменил символьный класс имени на `[^\s\[\]{}()=,/*\\#:;]`
(разрешить всё, кроме запрещённого набора), с отдельным более строгим первым символом (не цифра
и не из запрещённого набора). См. переменную `_IDENT_CHARS` в начале `ddf_parser.py`.

### Ещё не проверенные/не реализованные части (TODO дальше)

1. **Доделать ENBBY** (условные поля) в `ddf_parser.py` — нужно для `npcgrp`/`weapongrp`, но
   ЭТИ ФАЙЛЫ НЕ являются приоритетными текстовыми файлами (armorgrp/weapongrp/npcgrp — это
   характеристики предметов/мобов, не тексты). Пользователь просил поддержать "все файлы,
   которые предусматривает эдитор из архива" — значит теоретически нужно разобраться, но
   можно отложить как менее приоритетное после текстовых файлов.
2. **Доделать has_null_terminator флаг** для ASCF (баг radiodata-ru) — см. выше, важно для
   ЛЮБОГО файла, где встречаются ASCF-строки без null (не только radiodata).
3. **Обработать дублирующиеся имена полей** в DDF (как `tex1` в npcgrp) — нужна стратегия
   переименования при парсинге (например, `tex1`, `tex1_2`, ...) и соответствующая обратная
   связь при assemble (писать по оригинальному порядку полей, не полагаясь только на имя).
4. **MTX/MTX2/MTX3/MAT/MAT2** — сложные вложенные табличные типы, используются в armorgrp,
   etcitemgrp, vehiclepartsgrp, recipe-c, weapongrp (частично) и, возможно, других файлах,
   которые ещё не проверялись (полный список DDF в архиве — 89 файлов в
   `data/l2asm-disasm/DAT_defs/H5pt/`, я проверил только ~31 из них). Это самый большой кусок
   оставшейся работы, если пользователь действительно хочет "все файлы из эдитора".
5. Собрать ПОЛНЫЙ реестр DDF-схем в `ddf_registry.py` — на данный момент там всего 5 схем
   (itemname, npcname, npcstring, skillname, commandname), а в архиве 89 DDF-файлов
   (H5pt) + вариации по языкам. Нужно решить: копировать DDF-тексты вручную по мере
   необходимости, или найти способ хранить/грузить их иначе (embedded в код backend — сейчас
   единственный практичный вариант, т.к. песочница Bash с архивом не персистентна).
6. Backend actions (`ddf_read`/`ddf_save` или подобные имена) в `index.py` — ЕЩЁ НЕ
   РЕАЛИЗОВАНЫ. Нужно решить формат ответа фронтенду (пользователь выбрал: "поиск + просмотр/
   редактирование одной записи", НЕ таблица целиком и НЕ TSV-файл) — то есть action должен
   уметь ИСКАТЬ запись (по id или по подстроке в текстовых полях) и возвращать только её, а
   не весь файл целиком (skillname-e — 76336 записей, весь массив гонять на фронт нельзя).
7. Frontend UI — ещё не реализован вообще.

### Ключевое пользовательское решение по UX (зафиксировано в этой сессии)
Пользователь выбрал вариант «Поиск + редактирование одной записи»: пользователь ищет
предмет/скилл/нпс по названию или ID, открывается карточка с текстовыми полями (только
`editable text fields` из ddf_registry), правит и сохраняет ТОЛЬКО эту запись — не таблицу и не
целый файл через скачивание/загрузку TSV.
Также пользователь уточнил: поддержать нужно "все файлы, которые предусматривает эдитор из
архива" (а не только 4 изначальных) — то есть **все 89 DDF из H5pt**, по мере возможности (с
учётом сложности MTX/ENBBY-типов, см. TODO выше). Разумная стратегия: сначала добить и
закоммитить надёжную поддержку ВСЕХ "простых" (без MTX/MAT) DDF, MTX/MAT/ENBBY — отдельным
следующим этапом, явно предупредив пользователя об ограничении на данном этапе.

## ЭТАП 3 — ЗАВЕРШЁН: полный реестр 74 DDF-схем в `ddf_registry.py`

`ddf_registry.py` ПЕРЕЗАПИСАН (был на 5 схем, стал на 74). Все DDF-тексты взяты из полного
набора `data/l2asm-disasm/DAT_defs/H5pt/*.ddf` (89 файлов), из них исключены 7 файлов с
неподдерживаемыми конструкциями (см. список ниже) — остальные 74 схемы включены целиком, как
есть (оригинальный текст DDF, включая комментарии/wild-guess названия полей от авторов).

**Исключены (требуют MTX/MAT/ENBBY — следующий этап, если понадобится):**
`armorgrp`, `etcitemgrp`, `recipe-c`, `vehiclepartsgrp` (все — MTX/MTX2/MTX3/MAT/MAT2),
`npcgrp`, `weapongrp`, `mantleexception` (ENBBY условные поля).

**Regression-тест на РЕАЛЬНЫХ данных через сам реестр** (`ddf_registry.match_ddf(filename)` ->
disassemble -> assemble -> побайтовое сравнение) — **28/28 доступных эталонных файлов OK**
(все, для которых в архиве есть `dec-*.dat`): additionalitemgrp, castlename, commandname (x2 —
e/ru), commandnamepatch, dbdropdata, dbitemdata, dbnpcdata, dbspoildata, huntingzone,
instantzonedata, itemname (x2), macropreset, mobskillanimgrp, npcname (x2), npcstring (x2),
questname (x2), radiodata, skillname (x2), systemmsg (x2), zonename (x2).

Остальные ~46 схем реестра (без dec-*.dat эталона под рукой) — только СИНТАКСИЧЕСКИ проверены
(парсятся без ошибок через `parse_ddf`), но НЕ проверялись побайтово на реальных данных (нет
образцов). Если при реальном использовании конкретного файла возникнет mismatch — разбираться
по той же методологии (см. раздел "Проверенная методология сопоставления" выше).

`match_ddf(filename)` определяет схему по basename файла с обрезкой расширения и языкового
суффикса (`-e`/`-ru`/`-c`/др. до 3 букв), например `ItemName-e.dat` -> ключ `itemname`. Также
добавлена функция `list_supported_keys()` — список всех 74 поддерживаемых ключей.

**ВАЖНО про регенерацию файла**: `ddf_registry.py` был сгенерирован программным скриптом (не
писался руками) — если понадобится дополнить/поправить схему для одного из файлов (например,
добавить недостающий 8-й файл или поддержать ещё один после доработки ENBBY/MTX), проще всего
редактировать `_DDF_TEXTS[key]` точечно через Edit-инструмент (найти нужный `'key': '''...''',`
блок и заменить), а не перегенерировать весь файл заново.

## ЭТАП 4 — ЗАВЕРШЁН: backend actions ddf_search/ddf_get/ddf_save в index.py

Добавлены 3 HTTP-действия (POST, тот же endpoint `patches`, отличаются полем `action` в body):

- **`ddf_search`** `{server, path, query, limit?}` -> `{schema, totalRows, matched, results:
  [{index, label, preview}]}`. Ищет подстроку (регистронезависимо) среди editable-полей;
  `query=""` вернёт первые `limit` записей без фильтра. Доступно всем авторизованным.
- **`ddf_get`** `{server, path, index}` -> `{schema, index, totalRows, fields: [{name, type,
  array, editable}], row: {...}}`. Возвращает ОДНУ запись целиком со всеми полями (не только
  editable) — фронтенду решать, что показывать read-only, а что — как текстовый инпут.
  Доступно всем авторизованным.
- **`ddf_save`** `{server, path, index, edits: {fieldName: newText, ...}}` -> `{ok, index,
  size}`. Правит ТОЛЬКО editable-поля (остальные ключи в `edits` молча игнорируются), пересобирает
  и перезаписывает файл в S3 + обновляет size/updated_at в БД. Требует `can_manage`.

Все три action используют новую **потоковую** реализацию в `ddf_parser.py` (см. ниже) —
не грузят все записи файла в память сразу.

### КРИТИЧЕСКИЙ баг найден и исправлен: OOM (killed by signal 9) на больших файлах в облаке

Изначальная реализация `ddf_save` использовала `disassemble()` (весь файл -> `list[dict]` в
памяти) + `assemble()` (список -> bytes). На `skillname-e.dat` (76336 записей, ~15 МБ
расшифрованных данных) это давало пиковое потребление ~206-218 МБ Python-heap (проверено
локально через `tracemalloc`) — при лимите функции 256 МБ с учётом накладных расходов
рантайма (интерпретатор, boto3, psycopg2, буферы) реальный вызов в облаке падал:
`runtime pid N: killed by signal 9` / `{"errorMessage":"user code crashed","errorType":
"JobExecutionDiscarded"}`. `ddf_search`/`ddf_get` (без итогового assemble) работали нормально
даже на большом файле — проблема проявлялась именно на `ddf_save`.

**Важно**: настройки функции в UI (Ядро → Функции → patches → Настройки) содержат ТОЛЬКО
таймаут выполнения (5с/30с/1м/2м/5м/10м) — регулировки памяти там нет, лимит памяти платформой
не настраивается пользователем. Значит решать нужно было исключительно оптимизацией кода.

**Решение**: добавлены в `ddf_parser.py` потоковые функции, НЕ накапливающие список всех
записей:
```python
iter_records(binary, fields, has_reccnt_prefix=True)          # генератор (index, row)
get_record_count(binary, has_reccnt_prefix=True)               # O(1), только заголовок
get_record_by_index(binary, fields, index, has_reccnt_prefix=True)   # для ddf_get
search_records(binary, fields, editable_names, query_lower, limit, has_reccnt_prefix=True)
    # -> (matches: list[(index,row)], total_count)             # для ddf_search
transform_single_row(binary, fields, index, mutate_fn, has_reccnt_prefix=True, tail_bytes=None)
    # -> bytes (пересобранный файл), для ddf_save — читает записи одну за другой, для записи
    # с номером index вызывает mutate_fn(row), остальные пишет как есть, СРАЗУ в выходной буфер
```
После замены `disassemble+assemble` на `transform_single_row` в `ddf_save` пик памяти на
skillname-e упал с ~206 МБ до **~29 МБ** (проверено tracemalloc) — экономия ~7x. Byte-perfect
подтверждён (noop mutate даёт `new_plain == plain` точно). Старые `disassemble()`/`assemble()`
ОСТАВЛЕНЫ в коде как есть (используются, например, для будущих задач или отладки), но
помечены предупреждением в docstring — для новых интеграций использовать потоковые функции.

**Подтверждено на живом сервере hfx3old** (после деплоя через sync_backend): `ddf_save` на
`System/skillname-e.dat` (index=0, поле name) отрабатывает за ~3-5.7 сек без ошибок (время
объясняется в основном RSA re-encode — см. ниже про gmpy2), значение корректно сохраняется
и читается обратно через `ddf_get`.

### gmpy2 подтверждён работающим в реальной облачной функции

Лог деплоя показал: `Successfully installed ... gmpy2-2.3.1 ...` — пакет успешно
скомпилировался и установился в реальном облачном окружении (опасение о рискованности
нативной сборки не подтвердилось). RSA encode на живом сервере отрабатывает быстро (~3-6 сек
даже на самом большом файле) благодаря CRT+gmpy2 ускорению в `l2encdec.py`.

### Реальные end-to-end тесты на живом сервере hfx3old — ВСЕ ПРОЙДЕНЫ
1. `ddf_search` на itemname-e.dat, query="arrow" -> 40 совпадений из 19425 записей, ~быстро
2. `ddf_get` на itemname-e.dat index=0 -> полная запись "Wooden Arrow" со всеми полями
3. `ddf_save` на itemname-e.dat index=0 (правка name) -> сохранено, подтверждено через ddf_get,
   возвращено обратно к оригиналу
4. `ddf_search`/`ddf_save` на САМОМ БОЛЬШОМ файле skillname-e.dat (76336 записей) — после фикса
   памяти работает надёжно, значение отредактировано и возвращено обратно к оригиналу

## ЭТАП 5 — ЗАВЕРШЁН: поддержка клиента C4 (Chronicle 4) — отдельный реестр схем

Пользователь сообщил, что DDF-редактор (реализованный и проверенный на клиенте HF/High Five)
не подходит для сервера C4x1 — файлы либо не парсятся вовсе (IndexError/struct.error), либо
парсятся неверно. Пользователь прислал официальный набор DDF для C4 (48 .ddf файлов), а затем
залил РЕАЛЬНЫЕ боевые .dat файлы с C4x1 на сервер (через раздел Патчи) для тестирования на
подлинных данных, а не синтетике.

### Ключевые находки
1. **Протокол шифрования файла ОДИНАКОВЫЙ** — заголовок C4-файлов `"Lineage2Ver413"`, тот же
   RSA+zlib формат, что и у HF. `l2encdec.py` НЕ требует изменений для C4 — расшифровка/
   шифрование работают как есть.
2. **Бинарная структура записей РАЗНАЯ** — DDF-схемы C4 проще HF (например `itemname` в C4 не
   содержит полей про сеты брони/зачарование, добавленные в более поздних хрониках). Сравнение
   всех 48 C4-схем с уже зарегистрированными HF-схемами показало: 24 идентичны, 18 отличаются
   по составу полей, 6 не зарегистрированы вовсе — итого нужен отдельный реестр.
3. **Ловушка при первичной проверке**: при скачивании эталонных файлов от пользователя вручную
   один файл (questname-e.dat) был по ошибке принят за itemname-e.dat из-за путаницы в URL —
   это привело к ложному выводу "схема не работает". После скачивания настоящих файлов из уже
   залитого на сервер дерева (через `/tree` API) все схемы подтвердились byte-perfect. Урок:
   для проверки схем всегда брать файлы напрямую из залитого дерева, а не из ручных вложений,
   если есть малейшее подозрение на путаницу в именах.
4. **Некоторые файлы C4 не имеют 4-байтного префикса-счётчика записей** — там, где в DDF
   указано `RECCNT = N` (число) вместо `RECCNT = OFF`: `eula.dat` (RECCNT=1), `chargrp.dat`
   (RECCNT=15), `logongrp.dat` (RECCNT=26). У HF таких файлов среди уже поддержанных схем не
   встречалось, поэтому парсер изначально не умел работать без префикса-счётчика.

### Изменения в ddf_parser.py: параметр fixed_record_count
Все функции чтения/записи (`disassemble`, `iter_records`, `get_record_count`,
`get_record_by_index`, `search_records`, `transform_single_row`, `delete_record`,
`append_records`) получили новый опциональный параметр `fixed_record_count: int = None` —
используется вместо чтения 4-байтного заголовка, когда `has_reccnt_prefix=False`. Также
добавлена новая функция:
```python
get_tail_bytes(binary, fields, has_reccnt_prefix=True, fixed_record_count=None) -> bytes
```
КРИТИЧНО для файлов без reccnt-префикса: их реальный хвост файла (после всех записей) НЕ
всегда совпадает со стандартным 13-байтным маркером `"SafePackage"` (у eula.dat хвост
дополнительно содержит несколько байт текста после последней ASCF-записи) — подстановка
дефолтного tail_bytes в `transform_single_row`/`delete_record`/`append_records` даёт неверный
(укороченный) результат. `get_tail_bytes()` вычисляет точный хвост, дочитывая ровно
`fixed_record_count` записей и возвращая остаток файла.

### Новый файл ddf_registry_c4.py
Отдельный реестр (аналог `ddf_registry.py`, но для C4) с 25 схемами (все текстовые/интересные
для редактора DDF-файлы C4, кроме armorgrp/etcitemgrp/recipe-c — используют MTX/MAT — и
npcgrp/weapongrp/hairgrp/logongrp — не содержат редактируемого текста). `match_ddf()`
возвращает **5-кортеж** `(key, fields, editable, has_reccnt_prefix, fixed_record_count)` — в
отличие от основного `ddf_registry.py`, который возвращает 3-кортеж (все его файлы имеют
стандартный reccnt-префикс). `FIXED_RECORD_COUNTS = {'chargrp': 15, 'eula': 1}`.

### Изменения в index.py: выбор реестра по серверу
```python
DDF_C4_SERVERS = {'c4x1'}

def _ddf_registry_for(server):
    return ddf_registry_c4 if server in DDF_C4_SERVERS else ddf_registry

def _ddf_match(server, path):
    # унифицирует 3-кортеж/5-кортеж между реестрами, возвращает всегда 5 элементов
    ...
```
Все 6 DDF-действий (`ddf_search`, `ddf_get`, `ddf_save`, `ddf_new`, `ddf_create`, `ddf_delete`)
переведены на `_ddf_match(server, path)` вместо прямого `ddf_registry.match_ddf(path)`, и
пробрасывают `has_reccnt_prefix`/`fixed_record_count` во все вызовы `ddf_parser`. `ddf_save`
дополнительно вычисляет `tail_bytes` через `get_tail_bytes()` для файлов без reccnt-префикса.
`ddf_create`/`ddf_delete` возвращают ошибку `fixed_schema_no_append`/`fixed_schema_no_delete`,
если у схемы `has_reccnt_prefix=False` — добавление/удаление записей сломало бы
предполагаемую клиентом жёсткую структуру (например eula.dat клиент ожидает ровно 1 запись).
`_row_to_file()` и `ddf_new` тоже принимают `server`, чтобы корректно определять
`ddfSupported`/схему для C4-файлов.

### КРИТИЧЕСКИЙ инцидент в процессе работы: откат правок ddf_parser.py/index.py
После первого раунда правок (добавление fixed_record_count) и успешного локального
тестирования, деплой и повторная проверка на живом сервере показала СТАРОЕ поведение (баг
`index_out_of_range` на index=0, затем при повторной попытке — расхождение размера файла на
3840 байт при простом сохранении без реальных изменений). При сверке содержимого файлов на
диске оказалось, что правки к `ddf_parser.py` и `index.py` полностью отсутствовали (0
вхождений `fixed_record_count` в файле, где по логам Edit должно было быть 21) — то есть Edit
операции по какой-то причине не сохранились/были перезаписаны более ранней версией файла между
турнами. Все правки (сигнатуры функций с `fixed_record_count`, `_ddf_match`/`_ddf_registry_for`
хелперы в index.py, обработка `tail_bytes` для eula) были переприменены заново и повторно
подтверждены как локально (42/42 файлов byte-perfect, включая noop transform_single_row), так
и на живом сервере. **Урок**: после py-файла с критичными правками, если следующий шаг —
что-то неожиданное (например функция «внезапно» не принимает переданный kwarg), первым делом
проверять `grep`/`wc -l` актуальное состояние файла на диске, а не сразу искать логическую
ошибку в коде — возможно правки просто не сохранились.

### Реальные end-to-end тесты на живом сервере C4x1 — ВСЕ ПРОЙДЕНЫ (после фикса отката)
1. `ddf_search`/`ddf_get` на itemname-e.dat (9594 записей, схема с UNICODE-полями name/add_name)
   — корректно, включая первую и последнюю запись
2. `ddf_save` на itemname-e.dat index=0 — сохранено, стабильный размер файла при повторных
   сохранениях (283568 байт — компактнее оригинальных 287408 из-за более плотного RSA-паддинга,
   но расшифрованное СОДЕРЖИМОЕ побайтово идентично оригиналу, подтверждено сравнением plain==plain)
3. `ddf_get`/`ddf_save` на eula-e.dat (fixed-схема, RECCNT=1, БЕЗ reccnt-префикса) — сохранение
   поля `fin` с новым текстом и восстановление обратно отработало корректно, файл остался
   валиден (get_tail_bytes корректно вычислил истинный хвост файла)
4. `ddf_create`+`ddf_delete` на itemname-e.dat — добавлены 2 тестовые записи (id=900001/900002),
   найдены через ddf_search, затем удалены, totalRows корректно вернулось к исходным 9594
5. `ddf_search`/`ddf_get` на САМОМ БОЛЬШОМ файле C4 — skillname-e.dat (36251 записей) — быстро
   (~0.37 сек на поиск), корректно
6. Защита `fixed_schema_no_append`/`fixed_schema_no_delete` на eula-e.dat — подтверждена,
   ddf_create/ddf_delete корректно отклоняются для fixed-схем
7. Регрессия HF (hfx3old) — ddf_search/ddf_get продолжают работать без изменений после всех
   правок, реестр по-прежнему выбирается верно (ddf_registry.py для не-C4 серверов)

## ЭТАП 6 — ЗАВЕРШЁН: поддержка MTX/MAT-полей (armorgrp/etcitemgrp/recipe-c) через RAW-режим

Пользователь попросил поддержать редактирование armorgrp/etcitemgrp/recipe-c (файлы со сложным
"табличным" форматом MTX/MAT, ранее осознанно исключённые из реестра) в специальном виде: поиск
по ID как у всех остальных файлов, а при открытии записи — редактирование ЦЕЛИКОМ одной текстовой
строкой (как в декомпилированном l2disasm-экспорте), а не по отдельным полям.

### Раскрытие бинарного формата MTX/MAT
Экспериментально на реальных данных пользователя (etcitemgrp.dat, armorgrp.dat, recipe-c.dat)
установлено и ПОДТВЕРЖДЕНО побайтовым сравнением с официальным TXT-экспортом l2disasm
(пользователь прислал реальный etcitemgrp.txt):

- **MTX** = две последовательные подтаблицы UNICODE-строк: `UINT count1, count1×UNICODE` (mesh) +
  `UINT count2, count2×UNICODE` (tex). В armorgrp.dat используется 31 раз подряд (по одному MTX-
  полю на пару раса/пол + доп.варианты + служебные Unknown_MT/NPC_MT/ACC_MT). Count реально может
  быть до 4 (не только 0/1, как показалось на первых тестах etcitemgrp, где максимум был 1) — l2disasm
  в TXT-экспорте показывает только ПЕРВЫЙ элемент каждой подтаблицы (директива `MTXCNT_OUT=1` —
  ограничение самого инструмента), но собственная RAW-реализация проекта показывает ВСЕ элементы
  без потери данных (см. вопрос пользователю и его выбор ниже).
- **MAT** = список пар: `UINT count, count×(UINT id, UINT amount)` — использован в recipe-c.dat
  для списка ингредиентов рецепта (id предмета-материала + нужное количество).

Реализовано в `ddf_parser.py`: `_read_mtx`/`_write_mtx`/`_read_mat`/`_write_mat`, интегрированы в
`_read_field`/`_write_field`/`default_row`. `parse_ddf()` больше не кидает `unsupported_type_MTX`
для MTX/MAT (только для MTX2/MTX3/MAT2, которые не встретились ни в одной известной схеме).
Массово проверено — byte-perfect disassemble+assemble+encode/decode на etcitemgrp.dat (7134
записей), recipe-c.dat (786 записей) и armorgrp.dat (1351 записей, после снятия квирка — см.
ниже), включая полный цикл через шифрование.

### Специфический баг файла armorgrp.dat: "защита от воровства" пользователя
Файл `armorgrp.dat` не расшифровывался (`rsa_block_size_mismatch`) — тело файла было на 2 байта
длиннее кратного 128 (размер RSA-блока). Расследование показало и ПОДТВЕРДИЛОСЬ пользователем:
он намеренно вручную (через HEX-редактор) дописывает 2 нулевых байта в САМЫЙ конец файла (ПОСЛЕ
штатного 20-байтного l2encdec-tail) как защиту от использования файла в чужом инструментарии —
CRC32 в теле tail совпадает с посчитанным по (header+encrypted body) БЕЗ этих 2 байт, что и
подтвердило их полную "постороннесть" по отношению к формату. Решение: `_ddf_quirk_bytes(server,
schema_key)` в `index.py` возвращает нужное число байт для `armorgrp` на C4-серверах (см.
`ddf_registry_c4.ARMORGRP_TRAILING_QUIRK_BYTES = 2`); `_ddf_load_plain()` отрезает эти байты перед
`detect_protocol`/`decode`, все write-пути (`ddf_save`/`ddf_save_raw`/`ddf_create`/`ddf_delete`)
дописывают их обратно после `l2encdec.encode()`. Подтверждено на живом сервере: расшифровка,
редактирование через RAW и повторное сохранение работают, размер зашифрованного файла стабилен
при повторных сохранениях (естественная разница с оригиналом объясняется более плотным RSA-
паддингом при повторном шифровании — расшифрованное СОДЕРЖИМОЕ идентично, см. предыдущий этап).

### RAW-режим редактирования (новый модуль `ddf_raw.py`)
`row_to_raw_line(row, fields)` — сериализует одну запись в единую таб-разделённую строку строго
в порядке полей схемы (числа как есть, тексты экранированы `\\`/`\t`/`\r`/`\n` как в l2disasm),
разворачивая массивы/MTX/MAT поэлементно. `raw_line_to_row(line, fields, base_row)` — обратная
операция, с сохранением AscfStr-флагов кодировки из `base_row`; бросает `DdfError`, если число
токенов не совпадает со схемой (пользователь испортил структуру строки).

**Важное решение пользователя**: несмотря на то что оригинальный l2disasm в TXT-экспорте
показывает только первый элемент каждой MTX-подтаблицы (остальные при экспорте теряются — баг/
ограничение самого инструмента), в СВОЁМ RAW-редакторе решено показывать/сохранять ВСЕ элементы —
это чуть длиннее визуально, но полностью исключает потерю данных (актуально для брони с 2-4
вариантами модели/текстуры в одном MTX-поле).

### Новые backend actions: `ddf_get_raw` / `ddf_save_raw`
Аналоги `ddf_get`/`ddf_save`, но для схем из `ddf_registry_c4.RAW_ONLY_SCHEMAS = {'etcitemgrp',
'armorgrp', 'recipe'}` (нет осмысленных "человеческих" текстовых полей — редактирование по
отдельным полям неудобно/бессмысленно). `match_ddf()` в `ddf_registry_c4.py` теперь возвращает
6-кортеж (добавлен `is_raw_only`); `_ddf_match()` в `index.py` унифицирует 3/5/6-элементные
кортежи между реестрами (HF всегда `is_raw_only=False`). `ddf_search`/`ddf_get`/`ddf_new` тоже
возвращают `isRawOnly` в ответе — фронтенд использует это, чтобы переключиться в RAW-режим и
скрыть кнопки "Создать"/"Списком" (форма с отдельными полями не умеет собирать MTX/MAT-значения).
`ddf_create` дополнительно ЗАБЛОКИРОВАН на backend для `is_raw_only` схем (`raw_only_schema_no_create`)
как защита от прямого API-вызова в обход UI. `ddf_delete` для raw-only схем НЕ блокируется
(удаление целой записи безопасно и для MTX/MAT-полей).

### Frontend: новый компонент `PatchesDdfRawPanel.tsx`
Одно большое `<textarea>` (mono-шрифт, `whitespace-pre`) вместо формы с отдельными полями.
`PatchesDdfEditor.tsx`: добавлен режим `'raw'` в тип `Mode`, state `isRawMode`/`rawLine`;
`openRow()` после `ddf_get` проверяет `data.isRawOnly` и либо идёт в обычный `'view'`-режим, либо
дополнительно запрашивает `ddf_get_raw` и переключается в `'raw'`; `handleSave()` ветвится на
`ddf_save`/`ddf_save_raw` по `isRawMode`. `PatchesDdfSearchPanel.tsx`: новый проп `isRawOnly`
(из `ddf_search`-ответа) скрывает кнопки "Создать"/"Списком" для таких файлов.

### Реальные end-to-end тесты на живом сервере C4x1 — ВСЕ ПРОЙДЕНЫ
1. `ddf_search`+`ddf_get_raw` на armorgrp.dat (1351 записей, 31 MTX-поле) — расшифровка с квирком,
   корректная сериализация в raw-строку
2. `ddf_save_raw` на armorgrp.dat index=0 — изменение pdef (36→99999→обратно 36), сосед (index=1)
   не затронут, размер файла стабилен при повторных сохранениях
3. `ddf_get_raw`/`ddf_save_raw` на etcitemgrp.dat (7134 записей) и recipe-c.dat (786 записей,
   MAT-поле с материалами) — изменение и восстановление значений корректно
4. Защита `raw_only_schema_no_create` подтверждена на armorgrp/etcitemgrp/recipe-c
5. `isRawOnly` корректно возвращается в `ddf_search` для всех трёх raw-only схем и `false` для
   обычных (itemname и т.п.) — регрессия не нарушена
6. После тестирования ВСЕ временно изменённые тестовые значения на живом сервере (itemname-e
   index=0 name, eula-e index=0 fin, armorgrp index=0 pdef, recipe-c index=0 материал) проверены
   и подтверждены восстановленными к исходному состоянию — в частности найден и исправлен один
   забытый артефакт прошлой сессии ("Shorts Sword" вместо "Short Sword" на itemname-e index=0).

## Статус коммитов
- `l2encdec.py` (модуль шифрования, с CRT+gmpy2 оптимизацией RSA encode) — закоммичен и
  работает, готово. Один и тот же модуль обслуживает и HF, и C4 (протокол 413 идентичен).
- `ddf_parser.py` (DDF-парсер + disassemble/assemble + потоковые iter_records/get_record_count/
  get_record_by_index/search_records (с offset для пагинации)/transform_single_row/
  delete_record/append_records/insert_records_sorted/update_record_sorted (поддержание сортировки
  по id при добавлении/редактировании)/get_tail_bytes + MTX/MAT + ENBBY + cp1251-mojibake
  автофикс ASCF-полей) — готово. Массово проверен на HF (28/28) и на C4 (42/42 простых файла +
  armorgrp/etcitemgrp/recipe-c с MTX/MAT + weapongrp с ENBBY + npcgrp, оба метода:
  disassemble+assemble и потоковый transform_single_row).
- `ddf_registry.py` (реестр DDF-схем для HF/High Five) — 74 схемы + `_ID_FIELDS` (66 схем с
  метаданными уникального идентификатора, включая составные ключи там, где нужно). Готово.
- `ddf_registry_c4.py` (реестр DDF-схем для C4/Chronicle 4) — 33 схемы (25 обычных + armorgrp/
  etcitemgrp/recipe с MTX/MAT + hairgrp/helmetgrp/logongrp + weapongrp с ENBBY + npcgrp),
  включая 5 с fixed_record_count (eula, chargrp, hairgrp, helmetgrp, logongrp), 8
  RAW_ONLY_SCHEMAS и `_ID_FIELDS` (26 схем). Готово, проверено на реальных данных C4x1.
- `ddf_raw.py` (сериализация/десериализация записи в raw таб-строку + табличное представление
  с подписями колонок row_to_raw_columns) — готово, побайтовое совпадение с реальным l2disasm
  TXT-экспортом пользователя подтверждено.
- Backend actions `ddf_search` (с offset/hasMore для пагинации списка результатов)/`ddf_get`/
  `ddf_save`/`ddf_new`/`ddf_create` (обычные rows + rawLines для RAW_ONLY, с проверкой дубликатов
  id по `_ID_FIELDS` и вставкой на правильную отсортированную позицию через
  `insert_records_sorted`)/`ddf_delete`/`ddf_get_raw`/`ddf_save_raw` (тоже с проверкой дубликатов
  id и физическим перемещением записи на правильную позицию через `update_record_sorted`, если
  id-поля были изменены) в `index.py` — РЕАЛИЗОВАНЫ для ОБОИХ клиентов (реестр выбирается по
  серверу через `_ddf_match()`), задеплоены, протестированы на живых серверах hfx3old И c4x1.
  Готово.
- Frontend UI (`PatchesDdfEditor.tsx` + `PatchesDdfViewPanel.tsx`/`PatchesDdfRawPanel.tsx`
  (кнопка "Дублировать") + `PatchesDdfCreatePanel.tsx`/`PatchesDdfBulkPanel.tsx` (создание
  записей для ЛЮБОЙ схемы включая RAW_ONLY, подсветка id-полей жёлтым) + обновлённый
  `PatchesDdfSearchPanel.tsx` (постраничная подгрузка "Показать ещё", единый скролл модалки без
  вложенного)) — работает для обоих клиентов и обоих режимов (обычные текстовые поля / RAW).
  Готово.

## ЭТАП 7 — ЗАВЕРШЁН: hairgrp/helmetgrp/logongrp через RAW-режим + подписи колонок в UI

Пользователь попросил (1) подписать названия колонок над значениями в RAW-режиме (как в
l2disasm TSV — видно `tag`, `id`, `icon[0]` и т.п. прямо над значением) и (2) добавить
поддержку ещё 6 файлов: `hairaccessarygrp`, `hairgrp`, `helmetgrp`, `logongrp`, `npcgrp`,
`weapongrp`. По согласованию с пользователем: `npcgrp`/`weapongrp` отложены на отдельный этап
(ENBBY условные поля + дублирующееся имя поля), `hairaccessarygrp.dat` пропущен ОКОНЧАТЕЛЬНО
(пользователь подтвердил — это кастомный, самостоятельно добавленный на сервер файл без
официальной DDF-схемы в архиве инструментария; похожий по названию `hairaccessorylocgrp.ddf` НЕ
подходит структурно — при попытке использовать его disassemble даёт огромный "хвост" вместо
маркера SafePackage, то есть схема не совпадает).

### Подписи колонок в RAW-режиме
`ddf_raw.py`: добавлена `_row_to_pairs()` (общая внутренняя функция, возвращает список
`(label, value)` в порядке полей схемы) и `row_to_raw_columns()` (публичная обёртка, отдаёт
`[{"label":..., "value":...}]` для фронтенда) — обе используют ТУ ЖЕ логику разбора схемы, что
и `row_to_raw_line()` (которая теперь построена поверх `_row_to_pairs()`), гарантируя идентичный
порядок и состав токенов между текстовым и табличным представлением. Имена колонок для MTX
(`name_cntm`/`name_m[i]`/`name_cntt`/`name_t[i]`) подтверждены побайтовым совпадением с реальным
TSV-заголовком l2disasm (см. этап 6). Backend action `ddf_get_raw` теперь возвращает
дополнительно `columns` в ответе. Frontend `PatchesDdfRawPanel.tsx` полностью переделан: вместо
одного `<textarea>` — HTML-таблица (`overflow-x-auto`, ширина каждой ячейки по содержимому)
с двумя строками: подписи колонок сверху (серый фон), `<input>`-поля со значениями снизу;
изменение любого поля через `setTokenAt()` пересобирает единую `line`-строку (join по табу) —
сохранение по-прежнему идёт через `ddf_save_raw` с этой строкой, никаких изменений в контракте
API не потребовалось.

### hairgrp.dat / helmetgrp.dat — 120 CHAR-полей, RECCNT=15
Официальный `hairgrp.ddf` (RECCNT=15, без reccnt-префикса) описывает 120 полей типа CHAR (индексы
моделей/цветов волос на 6 "слотов" m0..m5, по 10 пар a/b на слот) — подтверждено byte-perfect на
реальных данных (disassemble+assemble+encode/decode, roundtrip через RAW тоже). Отдельного DDF
для `helmetgrp` в архиве НЕ было — экспериментально подтверждено, что `helmetgrp.dat` использует
ТУ ЖЕ схему, что и `hairgrp` (тот же byte-perfect результат на реальных данных helmetgrp.dat).
У обоих файлов нет ни одного "человеческого" текстового поля — только числовые индексы, поэтому
`_EDITABLE_TEXT_FIELDS` для них пустой список и обе схемы в `RAW_ONLY_SCHEMAS`.

### logongrp.dat — найдена и исправлена опечатка типа в оригинальном DDF
Официальный `logongrp.ddf` (RECCNT=26, без reccnt-префикса) описывает 4 поля `x/y/z/yaw` как
INT. Экспериментально подтверждено, что реальные данные — это биты FLOAT-координат: как INT
значения выглядят как бессмысленные огромные числа (`-964568064`), реинтерпретированные как
FLOAT — как разумные координаты (`-16622.0`). Опечатка исправлена на FLOAT в схеме проекта
(`ddf_registry_c4.py`, НЕ в оригинальном DDF-тексте пользователя) — подтверждено, что это не
нарушает byte-perfect совместимость (тот же размер поля, 4 байта, little-endian) ни на
disassemble+assemble, ни на полном цикле шифрования.

### Проблема с "label" в результатах поиска для чисто-числовых RAW-схем
`_ddf_row_label()` строит подпись записи только из UINT/INT/HEX-полей (обычно id) — у
hairgrp/helmetgrp (только CHAR) и logongrp (только FLOAT) таких полей нет вообще, из-за чего
`ddf_search` возвращал пустой `label` для каждой записи (неотличимые друг от друга результаты
поиска). Исправлено: `action == 'ddf_search'` в `index.py` подставляет `f'#{idx}'` (порядковый
номер записи), если `_ddf_row_label()` вернул пустую строку. Frontend `PatchesDdfSearchPanel.tsx`
дополнительно поправлен — если `preview` пустой (как всегда для RAW_ONLY-схем без editable
текстовых полей), в качестве основного текста строки результата показывается `label` (то есть
`#0`, `#1`...) вместо неинформативного "(пусто)".

### Реальные end-to-end тесty на живом сервере C4x1 — ВСЕ ПРОЙДЕНЫ
1. `match_ddf` находит все 3 новые схемы (hairgrp/helmetgrp/logongrp), `is_raw_only=True` для
   всех, `fixed_record_count` верный (15/15/26)
2. `ddf_search` на всех трёх — totalRows верный (15/15/26), label теперь `#0`/`#1`/...
3. `ddf_get_raw` — 120 колонок с верными именами (`m0_a0`...`m5_b9`) для hairgrp/helmetgrp,
   4 колонки (`x`/`y`/`z`/`yaw`) с осмысленными FLOAT-значениями для logongrp
4. `ddf_save_raw` — изменение одного значения (первый CHAR-токен hairgrp index=0: 0→9→обратно 0;
   x-координата logongrp index=0: -16622.0→-99999.0→обратно -16622.0) и восстановление
   подтверждены, размер файла стабилен (304/304/432 байта соответственно)
5. `ddf_create` корректно блокируется (`fixed_schema_no_append`, т.к. `has_reccnt_prefix=False`)
   на всех трёх новых схемах

### Статус
`hairaccessarygrp` — НЕ будет поддержан (кастомный файл без официальной схемы, подтверждено
пользователем). `npcgrp`/`weapongrp` — следующий этап (ENBBY условные поля + дублирующееся имя
поля tex1, см. ЭТАП 2 заметки выше про исходное исследование этих двух файлов).

## ЭТАП 8 — ЗАВЕРШЁН: ENBBY (условные поля) раскрыт, npcgrp + weapongrp поддержаны

Пользователь прислал реальные декодированные TXT-экспорты (`weapongrp.txt` — 1134 записи,
`npcgrp.txt` — 6445 записей) l2disasm для обоих файлов — это позволило раскрыть формат ENBBY
экспериментально и с гарантией (побайтовая сверка), а не перебором гипотез по сырым байтам.

### Формат ENBBY — раскрыт и подтверждён
Синтаксис в DDF: `ENBBY = [(cond_field, N)];` идёт СРАЗУ после объявления поля. Означает: ЭТО
поле физически присутствует в бинарнике ТОЛЬКО ЕСЛИ ранее прочитанное в этой же записи поле
`cond_field` равно `N` — иначе поле полностью отсутствует (не занимает ни байта в файле).
В `weapongrp.ddf` встречается 4 раза, все с условием `(wpn_mesh_cnt,2)`, каждый раз как
"B-вариант" пары A/B (effA/effB, junk1A/junk1B, rangeA/rangeB, junk2A/junk2B) — A-поле всегда
присутствует безусловно, B-поле — только для оружия с `wpn_mesh_cnt==2` (двуручное/парное).
Подтверждено побайтовым сравнением с `weapongrp.txt`: 0 расхождений на ключевых полях (id,
wpn_mesh_cnt, drop_mesh1, effA, effB, rangeA, rangeB) по всем 1134 записям, и полным
disassemble+assemble+encode/decode round-trip (byte-perfect).

Реализовано в `ddf_parser.py`:
- `parse_ddf()`: новый `_ENBBY_RE`, распознаёт строку `ENBBY = [(field,N)];` и приписывает
  `enbby_field`/`enbby_value` к ПРЕДЫДУЩЕМУ полю в уже накопленном списке `fields` (а не создаёт
  отдельную запись) — то есть ENBBY это не поле, а модификатор для поля перед ним.
- `_enbby_active(field, row)`: True, если у поля нет ENBBY-условия, либо `row[enbby_field] ==
  enbby_value`.
- `_read_field()`: если `_enbby_active()` == False — НЕ читает из бинарника ни байта, подставляет
  дефолтное значение ПРАВИЛЬНОЙ ФОРМЫ (важный нюанс — для статических массивов типа `junk1B[5]`
  это список из 5 дефолтных значений, НЕ пустой список: подтверждено на TXT-экспорте — колонки
  `junk1B[0]`..`junk1B[4]` присутствуют, просто пустые, когда ENBBY не выполнено).
- `_write_field()`: если `_enbby_active()` == False — НЕ пишет вообще ничего (ни одного байта),
  включая скалярные строковые поля (иначе получили бы "лишние" 4 байта пустой UNICODE-строки,
  которых не было в оригинале — все смещения всех записей ПОСЛЕ этой разъехались бы).

### weapongrp.dat — 56 полей, включая 4 пары A/B с ENBBY
Схема добавлена в `ddf_registry_c4.py` дословно как в официальном DDF (включая закомментированную
`//MTX mt_pair;` — корректно игнорируется как комментарий, и поле `projectile_?` — спецсимвол `?`
в имени поддерживается грамматикой парсера). Проверено byte-perfect на 1134 реальных записях +
полный цикл шифрования + raw round-trip (row -> raw line -> row, 0 расхождений).

### npcgrp.dat — исправлена опечатка дублирующегося имени поля
Оригинальный DDF называет ВТОРОЕ текстурное поле `tex1` (та же ошибка копипаста, что и первое) —
подтверждено на `npcgrp.txt`: заголовок содержит `tex1[0]..tex1[4]` (для `cnt_tex1`), а СРАЗУ
ЗА НИМ СНОВА `tex1[0]..tex1[1]` (для `cnt_tex2`, должно быть `tex2`). В самом бинарнике имени
поля не существует (оно нужно только как ключ Python-словаря записи при disassemble/assemble) —
но дублирующийся ключ означал, что второе значение затирало первое при чтении, и файл собирался
обратно НЕ byte-perfect. Исправлено на `tex2` в схеме проекта (аналогично исправлению INT→FLOAT
в logongrp на предыдущем этапе). У npcgrp НЕТ ENBBY-полей вообще — только эта опечатка имени,
закомментированные `//UINT unk0_cnt;`/`//UNICODE unk0_tab[unk0_cnt];` в оригинале корректно
игнорируются парсером и не влияют на бинарную структуру. Подтверждено byte-perfect на 6445
реальных записях + полный цикл шифрования + raw round-trip.

### Важное наблюдение: l2disasm использует фиксированную (не переменную) ширину столбцов
Обнаружено на `weapongrp.txt` при первой попытке побайтовой сверки raw-строк — l2disasm выводит
для полей переменной длины (`wpn_mesh[]`, `wpn_tex[]`, `item_sound[]`, `unk1_tab[]` и т.п.)
ФИКСИРОВАННОЕ число колонок в TXT = МАКСИМУМ count среди ВСЕХ записей файла (с пустыми ячейками-
заполнителями для записей с меньшим count), а не переменное число колонок на запись. Подтверждено
подсчётом: `wpn_mesh` max count=2 (TXT показывает `wpn_mesh[0]`/`wpn_mesh[1]` — 2 колонки),
`wpn_tex` max=3 (3 колонки), `item_sound` max=4 (4 колонки), `unk1_tab` в npcgrp max=45 (45
колонок), `dtab1` max=11 (11 колонок) — всё совпало один-в-один с шириной заголовка TXT.
Осознанное решение проекта (сохраняется с этапа с armorgrp MTX-полями): RAW-режим показывает
ПЕРЕМЕННУЮ ширину — ровно столько колонок, сколько элементов реально в ЭТОЙ записи (не нужно
сканировать весь файл ради максимума перед показом одной записи, и не нужно решать что делать
при СОЗДАНИИ новой записи с ещё неизвестным максимумом) — это не нарушает самосогласованность
(row -> raw line -> row round-trip подтверждён 0 расхождений на всех записях обоих файлов).

### Реальные end-to-end тесты на живом сервере C4x1 — ВСЕ ПРОЙДЕНЫ
1. `ddf_search` на weapongrp/npcgrp — totalRows верный (1134/6445), `isRawOnly=true`
2. `ddf_get_raw` — 81 колонка для weapongrp (включая корректные ENBBY B-поля), 34 колонки для
   npcgrp (включая оба tex1/tex2 списка раздельно, без потери данных от дублирования имени)
3. `ddf_save_raw` — изменение одного значения (`durability` weapongrp index=0: 95→99999→обратно
   95; `npc_speed` npcgrp index=0: 1.0→5.5→обратно 1.0) и восстановление подтверждены, соседние
   записи (index=1) не затронуты
4. `ddf_create` корректно блокируется (`raw_only_schema_no_create`) на обеих новых схемах

### Статус
Все запрошенные пользователем файлы (`hairaccessarygrp`(пропущен — кастомный), `hairgrp`,
`helmetgrp`, `logongrp`, `npcgrp`, `weapongrp`) обработаны. `ddf_registry_c4.py` теперь содержит
33 схемы, из них 8 в `RAW_ONLY_SCHEMAS`.

## ЭТАП 9 — ЗАВЕРШЁН: раскраска systemmsg/npcname исправлена (BGR вместо RGB), raw-режим открыт для ВСЕХ схем

### Баг с инвертированным цветом (RGB <-> BGR) — найден и исправлен
Пользователь прислал 2 скриншота: редактор показывал `#d81818` (красный) для записи systemmsg
id=31 ("Вы не можете двигаться, пока сидите."), а в реальном игровом чате этот же текст
отображается СИНИМ. Замер пикселей текста на скриншоте игры дал RGB(23,23,209) — что совпадает
не с прямой интерпретацией байт файла [216,24,24] как R,G,B (это и давал баг), а с интерпретацией
ТЕХ ЖЕ байт в ОБРАТНОМ порядке B,G,R (216,24,24 -> B=216,G=24,R=24 -> #1818d8, что визуально
совпадает с замером). Вывод подтверждён и совпадает с независимым источником (l2exp.blogspot.com
про L2 File Editor: цвет в SystemMsg-e.dat хранится "in reverse order").

Важно: это касается ОБОИХ форматов хранения цвета в схемах (array=True — rgb[3]/rgba[4], и
array=False — отдельные скалярные поля ColorR/ColorG/ColorB) — имена полей в оригинальном DDF
были присвоены "по порядковой позиции байта в файле", а не по факту хранимого канала, то есть
поле с названием `ColorR` физически хранит СИНИЙ канал, а не красный. Исправлено в
`_ddf_color_hex()`/раскладке `colorHex` обратно в `index.py` — теперь `fields[0]` (или первый
элемент массива) трактуется как B, `fields[1]`/второй элемент — как G, `fields[2]`/третий — как
R. Подтверждено на живых серверах (C4x1 systemmsg id=31, H5 npcname id=0): изменение цвета,
проверка нового значения, восстановление оригинальных байт файла — всё сошлось.

### Raw-режим ("текстом") теперь доступен для ВСЕХ файлов, не только "особых"
Пользователь попросил дать возможность открыть ЛЮБОЙ файл в текстовом виде (как уже было
сделано для armorgrp с MTX/MAT-полями) — чтобы иметь доступ к полям, для которых нет отдельной
формы (счётчики массивов wpn_mesh_cnt и т.п., служебные UNK_*, компоненты цвета по отдельности).

Ключевое наблюдение: backend-экшены `ddf_get_raw`/`ddf_save_raw` УЖЕ умели работать с ЛЮБОЙ
схемой с самого начала (не только с `RAW_ONLY_SCHEMAS`) — они просто раньше не вызывались с
фронтенда для обычных файлов. Подтверждено тестом на `npcname` (обычная схема, НЕ raw-only):
`ddf_get_raw` вернул все 7 полей построчно (включая ранее скрытые `rgb[0..2]`/`reserved1`),
`ddf_save_raw` успешно изменил `description`, не затронув `rgb`, полный round-trip восстановлен.

Изменения — только на фронтенде (`PatchesDdfEditor.tsx`):
- Новая функция `toggleRawView()` — переключает текущую открытую запись между обычной формой
  (`ddf_get`) и текстовым представлением (`ddf_get_raw`), не покидая режим просмотра записи;
  несохранённые правки текущего режима при переключении отбрасываются (данные перезапрашиваются
  заново с сервера — так проще и безопаснее, чем пытаться на лету конвертировать частичные правки
  формы в raw-строку и обратно).
- Кнопка-переключатель "Текстом" / "Форма" в шапке модалки — видна только когда открыта запись
  (`mode === 'view' || mode === 'raw'`) И схема НЕ `isRawOnlySchema` (у raw-only схем и так нет
  обычной формы, переключать нечего — кнопка скрыта).
- `PatchesDdfSearchPanel`/create/bulk-режимы не изменились — создание записей списком по-прежнему
  требует обычной формы (raw-режим только для просмотра/правки уже существующей записи).

Backend НЕ менялся для этой части (уже был готов).

## ЭТАП 10 — ЗАВЕРШЁН: mojibake-баг кириллицы в ASCF-полях (C4) найден и исправлен

### Проблема
Пользователь прислал скриншот результатов поиска с текстами вида "Ñâîäü/Âîäàòü", "Èäîè/Âîâåàòü"
— визуально бессмысленный набор латинских букв с диакритикой, хотя по факту это должен быть
русский текст. Диагностика подтвердила классический mojibake: часть ASCF-полей (8-битный,
не-unicode вариант, `is_unicode=False`) на C4-клиенте физически хранит текст в кодировке
Windows-1251 (обычная кириллица для русскоязычных серверов), а `decode_ascf` читал этот же
8-битный блок как `latin-1` (см. предыдущие этапы — эта кодировка была правильно определена
для ASCII-совместимых/западноевропейских текстов, но НЕ для cp1251).

### Подтверждение на реальных данных
Найден конкретный файл со скриншота — `actionname-e.dat` на сервере `c4x1`. Проверка вручную:
байты `Ñåñòü/Âñòàòü`, перекодированные `text.encode('latin-1').decode('cp1251')`, дают
`Сесть/Встать` — осмысленный русский перевод стандартного действия "Sit/Stand". Дальше —
массовое сканирование: **2043 непустых ASCF-превью на 16 схемах C4-клиента** (actionname,
castlename, classinfo, commandname, creditgrp, hennagrp, itemname, npcname, obscene, questname,
servername, skillname, symbolname, sysstring, systemmsg, zonename). Результат:
- 380 записей УЖЕ содержали корректную кириллицу (физически хранятся как UTF-16LE,
  `is_unicode=True` — decode_ascf их и так читал верно, баг не касается)
- 231 запись была mojibake, и ВСЕ 231 без единого исключения полностью и однозначно
  восстанавливаются в валидную кириллицу через `raw.encode('latin-1').decode('cp1251')` — 0
  ошибок декодирования
- 0 ложных срабатываний: проверены ВСЕ ASCF-тексты с байтами 0x80-0xFF на предмет "а вдруг это
  НЕ битая кириллица, а легитимный latin-1 текст" — таких не нашлось ни одного на C4

Отдельно проверен H5-клиент (англоязычный, 2961+77 текстов на 24 схемах) — там таких
mojibake-текстов НЕТ вообще: единственные найденные non-ASCII символы — "é" (café), "©"
(copyright), NBSP, "curly quotes" (умные кавычки) — все они уже физически либо в правильной
latin-1 кодировке, либо читаются через UTF-16-путь, и никак не связаны с багом.

### Эвристика детектирования (looks_like_cp1251_mojibake, ddf_parser.py)
Строка считается mojibake, если: минимум 2 буквенных символа; минимум половина из них в
диапазоне 0x80-0xFF (типичный "почерк" mojibake из cp1251); И после перекодировки этих же
latin-1-байт через cp1251 минимум 80% буквенных символов оказываются кириллицей (диапазон
U+0400-U+04FF). Порог 80% (не 100%) — чтобы не спотыкаться на редких примесях типа "-"/цифр/
случайных латинских слов внутри в основном русской строки. Протестировано на всех реальных
231 mojibake-записях (100% срабатывание) и на реальных легитимных latin-1 текстах H5 (0
ложных срабатываний) — см. выше.

### Реализация (ddf_parser.py)
- `looks_like_cp1251_mojibake(text)` / `fix_cp1251_mojibake(text)` / `unfix_cp1251_mojibake(text)`
  — детект, прямое и обратное преобразование (round-trip проверен на смешанных строках вида
  "Атака 2.0!" — цифры/пунктуация не искажаются).
- `AscfStr` получил новый флаг `was_mojibake` (по умолчанию `False`) — помечает, что ИСХОДНОЕ
  значение поля в файле было mojibake; сама строка объекта — уже ИСПРАВЛЕННЫЙ читаемый текст.
- `decode_ascf()`: для 8-битного (не-unicode) варианта — после стандартного latin-1-декода
  дополнительно прогоняет через `fix_cp1251_mojibake`; если текст изменился — выставляет
  `was_mojibake=True` на возвращаемом `AscfStr`.
- `encode_ascf()`: если `was_mojibake=True` — ПЕРЕД кодированием в latin-1-байты сначала
  прогоняет текст через `unfix_cp1251_mojibake` (переводит кириллицу обратно в те же
  "испорченные" байты, которые физически ожидает игровой клиент на этом сервере) — работает
  одинаково и для неизменённого текста (round-trip), и для НОВОГО кириллического текста,
  введённого пользователем взамен старого.
- Флаг `was_mojibake` прокинут через ВСЕ места, где создаётся `AscfStr` из старого значения поля
  (сохраняя флаги кодировки): `build_row_from_texts()` (ddf_parser.py, для ddf_create),
  `_apply_edits()` (index.py, для ddf_save), `raw_line_to_row()` (ddf_raw.py, для ddf_save_raw).

### Реальные end-to-end тесты на живом сервере C4x1 — ВСЕ ПРОЙДЕНЫ
1. `ddf_search`/`ddf_get` на `actionname-e.dat` — ВСЕ 40 проверенных записей (и ранее-корректные,
   и ранее-mojibake) теперь единообразно показывают читаемую кириллицу
2. `ddf_save` — изменение поля `cmd` записи index=0 на новый кириллический текст ("Тест
   Кириллицы 123"), проверка что читается обратно верно, `ddf_get_raw` подтверждает, что raw-
   представление тоже показывает читаемый текст (не mojibake)
3. Восстановление оригинального значения ("Сесть/Встать") — при перекодировке обратно в
   "испорченные" latin-1-байты (`text.encode('cp1251').decode('latin-1')`) получаются БАЙТ-В-БАЙТ
   идентичные исходные mojibake-байты ("Ñåñòü/Âñòàòü") — подтверждено программно
4. Аналогичный тест на `sysstring-e.dat` (поле, которое УЖЕ было корректной кириллицей до фикса,
   т.е. `is_unicode=True` путь) — изменение и восстановление работает без регрессий, эта правка
   его не затрагивает вообще (проверка только на 8-битном пути)
5. H5-клиент (`hfx3old`) — `gametip`/`systemmsg`/`npcname` с легитимными non-ASCII символами
   (é, ©, curly quotes) остались без изменений — эвристика корректно их НЕ трогает

### Статус
Баг воспроизводится и исправлен только для C4-клиента (единственного с обнаруженными
mojibake-данными на практике) — но код применим универсально к любому серверу/схеме с ASCF-
полями, т.к. эвристика срабатывает только на реальном mojibake-паттерне, без привязки к
конкретному файлу/серверу.

## ЭТАП 11 — ЗАВЕРШЁН: создание записей (одна + списком) для RAW_ONLY схем (armorgrp/etcitemgrp и т.п.)

### Задача
Ранее для схем с MTX/MAT-полями (armorgrp, etcitemgrp, recipe, weapongrp, npcgrp и т.п. — всего
8 схем в `RAW_ONLY_SCHEMAS`) создание новых записей было ЗАБЛОКИРОВАНО полностью (backend
возвращал `raw_only_schema_no_create`, кнопки "Создать"/"Списком" скрывались на фронтенде) —
обычная форма "один инпут на editable-поле" не умеет собирать сложные табличные значения
(MTX-пути к моделям/текстурам, ENBBY-условные поля и т.п.), а другого способа не было. Пользователь
попросил дать возможность добавлять такие записи — и одну, и списком (аналогично тому, как это уже
работает для обычных схем), тем же raw-текстовым способом, что уже используется для просмотра/
правки существующих записей таких файлов (см. предыдущие этапы про ddf_get_raw/ddf_save_raw).

### Backend (index.py)
- `ddf_new`: для схем с `is_raw_only=True` дополнительно возвращает `rawLine`/`rawColumns` —
  тот же ПУСТОЙ шаблон записи (`ddf_parser.default_row`), что и раньше, но уже сериализованный в
  raw-строку через `ddf_raw.row_to_raw_line`/`row_to_raw_columns` (та же функция, что использует
  `ddf_get_raw` для существующих записей) — то есть фронтенд получает готовую "рыбу" в привычном
  табличном виде, без необходимости самому знать структуру схемы.
- `ddf_create`: принимает ДВЕ взаимоисключающие формы входных данных, выбор между ними жёстко
  привязан к `is_raw_only` схемы (несовпадение формы со схемой — `bad_request`):
  - `body['rows']` (как раньше) — list[dict] по именам editable-полей, для ОБЫЧНЫХ схем;
  - `body['rawLines']` (новое) — list[str], КАЖДАЯ строка это ОДНА запись целиком в raw-формате
    (тот же формат, что принимает `ddf_save_raw`) — ОБЯЗАТЕЛЬНО для raw_only схем. Каждая строка
    разбирается через `ddf_raw.raw_line_to_row(line, fields, base_row=template_row)` (тот же
    пустой шаблон, что вернул `ddf_new`, используется как `base_row` для сохранения AscfStr-
    флагов кодировки ASCF-полей, если такие есть в схеме) и добавляется в общий список
    `new_rows`, который дальше уходит в уже существующий `ddf_parser.append_records` — то есть
    сам механизм дозаписи в конец файла НЕ менялся, изменился только способ СБОРКИ строки записи.
  - Проверка `has_reccnt_prefix` (блокировка для файлов с фиксированным числом записей типа
    eula/chargrp) применяется одинаково к обеим формам — не изменилась.

### Frontend
- `PatchesDdfSearchPanel.tsx`: убрано условие `!isRawOnly` — кнопки "Создать"/"Списком" теперь
  видны для ЛЮБОЙ схемы (раньше скрывались для raw-only); подсказка (title) кнопки для raw-only
  схем дополнительно поясняет "текстом, у файла сложная структура".
- `PatchesDdfEditor.tsx`: `openCreate()`/`openBulk()` при `data.isRawOnly` сохраняют
  `rawLine`/`rawColumns` из ответа `ddf_new` в новый стейт (`createRawLine`/`createRawColumns` и
  `bulkTemplateLine`/`bulkRawColumns`); `handleCreateSubmit()`/`handleBulkSubmit()` при
  `isRawOnlySchema` отправляют `rawLines` вместо `rows`.
- `PatchesDdfCreatePanel.tsx`: для `isRawOnly=true` показывает ту же табличную форму "подпись
  колонки сверху / инпут снизу", что и `PatchesDdfRawPanel` (просмотр существующей записи) — но
  СТАРТУЕТ с пустого шаблона вместо реальных данных записи.
- `PatchesDdfBulkPanel.tsx`: для `isRawOnly=true` показывает textarea (по одной raw-строке на
  строку текста, без разбора на отдельные поля — каждая строка отправляется как есть) + кнопка
  "Добавить строку-шаблон", подставляющая пустой шаблон записи (`bulkTemplateLine`) в конец
  текста — самый быстрый способ получить N однотипных заготовок для копирования и точечной правки
  (например разных id и путей к текстурам одного набора брони).

### Реальные end-to-end тесты на живом сервере C4x1 — ВСЕ ПРОЙДЕНЫ (с откатом после проверки)
1. `armorgrp.dat` (1351 записей): создание ОДНОЙ новой записи через `rawLines` с реалистичным
   шаблоном (скопирована и изменена по id существующая запись #0) — `totalRows` увеличился на 1,
   новая запись читается верно (`id=999999`), старая запись #0 не затронута; списком — 3 записи
   одновременно (id 888001-888003) — все добавлены, после удаления (`ddf_delete` с конца, чтобы
   не сбивать индексы) `totalRows` точно вернулся к исходным 1351, размер файла подтверждён
2. `etcitemgrp.dat` (7134 записей): тот же сценарий (одна запись + список из двух) через
   `ddf_new` -> правка `rawLine` -> `ddf_create` с `rawLines` — полностью повторяет реальный поток
   фронтенда (получение пустого шаблона, правка нужных полей, отправка) — после отката `totalRows`
   точно восстановлен до исходных 7134

### Статус
Все 8 RAW_ONLY схем (`etcitemgrp`, `armorgrp`, `recipe`, `hairgrp`, `helmetgrp`, `logongrp`,
`weapongrp`, `npcgrp`) теперь поддерживают создание записей (одной и списком) наравне с
остальными — единственное отличие для пользователя: вместо формы "поле = значение" используется
такая же таб-таблица, что и при просмотре/правке существующих записей этих файлов.

## ЭТАП 12 — ЗАВЕРШЁН: кнопка "Дублировать" + защита от дублирующихся ID

### Задача
Пользователь попросил (1) кнопку "Дублировать" для быстрого создания новой записи на основе уже
существующей (везде, где это применимо), и (2) защиту от случайного создания двух записей с
одинаковым id — КРОМЕ схем, где повтор id заложен самой механикой игры (skillname: один и тот же
skill id повторяется у каждого уровня умения; questname: один quest_id — у каждого этапа квеста
и т.п.), там уникальным должен быть не сам id, а КОМБИНАЦИЯ из 2 полей.

### Метаданные `_ID_FIELDS` (ddf_registry.py / ddf_registry_c4.py)
Новый словарь по образцу `_COLOR_FIELD_GROUPS`/`_EDITABLE_TEXT_FIELDS`: `{schema_key: [field1,
field2, ...]}` — список полей, ОБРАЗУЮЩИХ уникальный идентификатор записи. Список из 1 поля —
простой id; из 2+ — составной ключ (уникальна должна быть КОМБИНАЦИЯ значений, не каждое поле по
отдельности). Схема отсутствует в словаре / пустой список — понятия "id" у неё нет вообще (только
служебные/координатные поля без единого идентификатора, например hairgrp/helmetgrp/logongrp) —
проверка на дубликаты не выполняется.

Заполнено вручную на основе анализа реальных DDF-схем обоих реестров (66 схем H5 + 26 схем C4).
Правило отбора: "tag"/"nbr" — почти всегда служебное поле (часто константа, например tag=1 у всех
записей actionname, или последовательный индекс nbr в castlename/zonename, СОВПАДАЮЩИЙ с
порядковым номером записи в файле) — НЕ идентификатор, в ключ не включается. Составные ключи
(там, где по механике игры id первого поля физически повторяется): `skillname`/`skillname_classic`
(id+level), `skillgrp`/`skillsoundgrp`/`skilltypedata` (skill_id+skill_level), `questname`
(quest_id+quest_prog), `mobskillanimgrp` (npc_id+skill_id), `dbdropdata`/`dbspoildata`
(npc_id+item_id), `transformdata` (id+gender), `ridedata` (Type+NpcId). Новая функция
`id_fields(filename)` в обоих реестрах, доступ из index.py через `_ddf_id_fields(server, path)`.

### Backend: проверка уникальности (index.py)
Новые хелперы: `_ddf_key_of(row, id_field_names)` — извлекает кортеж значений id-полей из row;
`_ddf_check_duplicate_key(...)` — потоково сканирует ВСЕ записи файла (через уже существующий
`ddf_parser.iter_records`, без накопления в памяти — тот же паттерн, что и `search_records`) и
ищет совпадение с любым ключом из `new_keys`; заодно проверяет дубликаты ВНУТРИ самого
`new_keys` (на случай, если пользователь вставил список с повторами). `skip_index` — индекс,
который нужно ИСКЛЮЧИТЬ из сравнения (сама редактируемая запись при `ddf_save_raw` — иначе
"конфликт сама с собой", если id-поля физически не менялись).

Встроено в:
- `ddf_create` — после сборки `new_rows` (что для обычной формы, что для `rawLines`), ДО
  `append_records`. Ошибка `duplicate_id_exists_{key}` (конфликт с уже существующей записью)
  или `duplicate_id_in_input_{key}` (конфликт внутри самого списка, который добавляют).
- `ddf_save_raw` — единственное место кроме `ddf_create`, где id-поле можно ИЗМЕНИТЬ (в обычном
  `ddf_save` id-поля НИКОГДА не пересекаются с editable — проверено программно на всех 92 схемах
  обоих реестров, значит там физически невозможно поменять id через обычную форму, проверка не
  нужна). Строка сначала полностью разбирается в row (`ddf_raw.raw_line_to_row`, используя
  ТЕКУЩУЮ версию записи как `base_row` — для сохранения AscfStr-флагов кодировки), затем
  проверяется на конфликт (с `skip_index=idx`, чтобы не спотыкаться о саму себя), и только потом
  запись пересобирается в файл.

Заодно `idFields` добавлен в ответы `ddf_get`/`ddf_get_raw`/`ddf_new` — фронтенду нужно знать,
какие поля показывать как id (для подсветки и логики дублирования).

### Frontend: кнопка "Дублировать"
`PatchesDdfViewPanel.tsx`/`PatchesDdfRawPanel.tsx` — новая кнопка (иконка Copy) рядом с "Удалить",
проп `onDuplicate`. `PatchesDdfEditor.tsx`: `openDuplicate()` — копирует значения ТЕКУЩЕЙ открытой
записи (обычной или raw) в форму "создать новую запись", но id-поля НАМЕРЕННО ОЧИЩАЕТ (не
копирует) — иначе форма стартовала бы с гарантированным конфликтом, который backend всё равно
заблокирует при сохранении; пользователю проще сразу увидеть пустое поле id, чем сначала получить
ошибку и только потом сообразить, что нужно поменять именно его. Решение "какую форму открыть
(обычную/raw)" опирается на `isRawOnlySchema` схемы (та же логика, что и `handleCreateSubmit`), а
НЕ на текущий `isRawMode` — пользователь мог вручную переключить ОБЫЧНУЮ запись в текстовый вид
через `toggleRawView`, но `row`/`fields` при этом остаются последними загруженными данными обычной
формы (не очищаются при переходе в raw) — этого достаточно, чтобы дублирование сработало верно
независимо от того, в каком виде запись была открыта на момент нажатия кнопки.

`PatchesDdfCreatePanel.tsx` — id-поля подсвечиваются жёлтым (label + рамка инпута) в обоих режимах
(обычная форма и raw-таблица), с подсказкой в тексте над формой — чтобы пользователь сразу видел,
какое поле нужно обязательно поменять на уникальное значение.

### Реальные end-to-end тесты на живом сервере C4x1 — ВСЕ ПРОЙДЕНЫ (с откатом после проверки)
1. `npcname-e.dat`: создание с id=1 (уже существует, "Gremlin") — заблокировано
   (`duplicate_id_exists_id=1`); создание с уникальным id=999888 — успешно, откат подтверждён
2. `skillname-e.dat`: существующая запись id=1,level=2 ("Triple Slash") — создание id=1,level=99999
   (тот же id, ДРУГОЙ level) успешно (механика игры), создание id=1,level=2 (точное совпадение
   составного ключа) заблокировано — подтверждает, что составные ключи работают именно как
   задумано, а не как одиночный id
3. `armorgrp.dat` (raw-only): `ddf_save_raw` — попытка присвоить записи #1 тот же id, что у записи
   #0 (id=21) заблокирована, запись #1 не изменена (`id=22` сохранился); сохранение записи БЕЗ
   изменения id (self-save) — успешно, что подтверждает корректность `skip_index`
4. Полный сценарий "Дублировать" эмулирован через API (открыть запись -> собрать payload без
   id-полей -> создать с новым id -> проверить -> удалить): успешно на `npcname-e.dat`; отдельно
   проверено, что если id ОСТАВИТЬ прежним (пользователь забыл поменять) — backend корректно
   блокирует с понятной ошибкой

### Статус
Кнопка "Дублировать" доступна везде, где есть кнопка "Удалить" (обычный и raw режим просмотра
записи). Защита от дублирующихся id работает на ВСЕХ схемах с непустым `_ID_FIELDS` — 66 схем H5
+ 26 схем C4, включая все 8 RAW_ONLY схем.

## ЭТАП 13 — ЗАВЕРШЁН: пагинация списка результатов поиска (offset/hasMore)

### Проблема
Пользователь сообщил про "некорректный скроллинг" — в списке результатов поиска (например
`armorgrp.dat`, 1352 записи) видны только записи с id от 21 до 118, дальше список "обрывается" при
прокрutke. Первая гипотеза (двойной вложенный CSS-скролл — `overflow-auto` на списке ВНУТРИ уже
скроллящейся модалки `ModalOverlay`) оказалась лишь частью проблемы и была исправлена (убран
`max-h-[55vh] overflow-auto` у списка в `PatchesDdfSearchPanel.tsx` — теперь скролл только один,
общий на уровне модалки, как во всех остальных модалках проекта).

НО настоящая причина глубже: `ddf_search` с самого начала (см. ЭТАП про поиск) был спроектирован
возвращать только ПЕРВЫЕ `limit` (по умолчанию 50) совпадений — без какого-либо способа получить
следующую порцию. При пустом запросе (открытие файла) это означает, что из 1352 записей
armorgrp пользователь физически видел только первые 50 — прокрутка "упиралась в стену", потому что
дальше данных просто не было загружено, а не потому что CSS был неправильным.

### Backend (ddf_parser.py / index.py)
`search_records()` получил новый параметр `offset` — сколько НАЙДЕННЫХ совпадений пропустить с
начала, прежде чем начать собирать `matches`. Поскольку записи переменной длины (ASCF-строки),
byte-offset заранее вычислить нельзя — реализация по-прежнему последовательно сканирует файл с
начала через `iter_records`, просто считает пропущенные (`skipped`) отдельно от накопленных
(`matches`) — та же сложность O(offset+limit), что была и раньше у O(limit).

Action `ddf_search` в index.py: принимает `body['offset']` (по умолчанию 0), передаёт в
`search_records`. Ответ дополнен полем `hasMore` — `True`, если найдено РОВНО `limit` совпадений
(значит вероятно есть ещё) — используется фронтендом для показа кнопки подгрузки. Важно: `hasMore`
НЕ равно `offset + matched < totalRows`, т.к. `totalRows` — общее число ЗАПИСЕЙ в файле, а не
число НАЙДЕННЫХ совпадений при непустом query (эти два числа обычно разные).

### Frontend (PatchesDdfEditor.tsx / PatchesDdfSearchPanel.tsx)
Новый стейт `hasMore`/`loadingMore`. `runSearch()` (первый поиск / смена запроса) всегда шлёт
`offset: 0` и полностью ЗАМЕНЯЕТ список результатов. Новая функция `loadMore()` — шлёт
`offset: results.length` (сколько уже показано) и ДОБАВЛЯЕТ новые результаты к уже отображённым
(не заменяет). `PatchesDdfSearchPanel.tsx` — кнопка "Показать ещё" в конце списка (видна только
при `hasMore=true`), выбрана вместо автоматической подгрузки по скроллу — модалка сама скроллится
снаружи (см. выше), отслеживать scroll-события ВНУТРИ неё для триггера подгрузки менее надёжно и
сложнее в реализации, чем явная кнопка.

### Реальные end-to-end тесты на живом сервере C4x1 — ВСЕ ПРОЙДЕНЫ
1. Постраничный обход ВСЕГО `armorgrp.dat` (1352 записи) через `offset`/`hasMore` до конца (28
   страниц по 50) — собранные индексы результатов ТОЧНО совпали с множеством `{0, 1, ..., 1351}`
   (0 пропусков, 0 дублей между страницами)
2. То же самое с непустым текстовым запросом (`skillname-e.dat`, query="slash") — пересечение
   индексов между страницами 1 и 2 пустое (никаких повторов при подгрузке фильтрованного списка)

### Статус
Пагинация работает для ЛЮБОЙ схемы (не привязана к конкретному файлу) — раньше был виден потолок
в 50/200 записей на весь файл, теперь можно долистать до любой записи через "Показать ещё".

## ЭТАП 14 — ЗАВЕРШЁН: поддержание сортировки записей по id при добавлении/редактировании

### Задача
Пользователь попросил: все записи во ВСЕХ файлах при добавлении новой строки ИЛИ редактировании
существующей должны оставаться отсортированы по id (и по второму полю ключа, если он есть —
например level у skillname: Triple Slash id=1 level=171 должен встать СРАЗУ ПОСЛЕ level=170, а
не в конец файла). Уточнено у пользователя: (1) существующий "исторический беспорядок" в части
файлов (обнаружен экспериментально на живых данных — armorgrp/castlename/questname реально НЕ
отсортированы, видимо из-за более ранних правок другими средствами) — НЕ трогаем, оставляем как
есть; (2) правило сортировки — всегда по возрастанию id (+второго поля составного ключа).

### Диагностика сортировки на реальных файлах (перед реализацией)
Полный постраничный обход нескольких живых файлов на C4x1 (через уже готовую offset-пагинацию из
ЭТАПА 13) с проверкой строгого возрастания ключа: `armorgrp.dat` — 4 нарушения из 1352 записей,
`skillname-e.dat` (4000 проверено) — 0 нарушений, `npcname-e.dat` (3000) — 0, `castlename-e.dat` —
4 нарушения из 57, `questname-e.dat` — 26 нарушений из 1818. Подтвердило, что часть файлов уже
физически не по порядку — что и определило решение "не трогать существующее, поддерживать порядок
только для новых/изменяемых записей".

### Backend: две новые функции в ddf_parser.py
- `insert_records_sorted(binary, fields, new_rows, key_fn, ...)` — как append_records(), но
  КАЖДАЯ запись из new_rows вставляется в позицию, где key_fn(row) — первая существующая запись
  с ключом >= новому (не переупорядочивает СУЩЕСТВУЮЩИЕ записи между собой, даже если они уже не
  по порядку — только определяет, ПЕРЕД какой из них вставить новую). new_rows ожидаются заранее
  отсортированными между собой (вызывающий код в index.py сортирует list перед вызовом) — оба
  потока (файл + new_rows) читаются как отсортированные последовательности и сливаются ОДНИМ
  проходом (as в merge sort), без обратных перемоток. Если новый ключ больше всех существующих —
  уходит в конец, как раньше в append_records.
- `update_record_sorted(binary, fields, index, mutate_fn, key_fn, ...)` — как
  transform_single_row(), но если после mutate_fn ключ записи изменился настолько, что она
  оказалась не на своём месте — запись физически ПЕРЕМЕЩАЕТСЯ в файле (не редактируется на
  месте). КРИТИЧНЫЙ нюанс, найденный и исправленный в процессе (см. ниже "Найденный и исправленный
  баг"): перемещение может быть и ВПЕРЁД, и НАЗАД относительно исходной позиции — однопроходный
  алгоритм (как в insert_records_sorted) для этого не подходит, т.к. к моменту, когда поток
  дойдёт до исходной позиции записи (чтобы вычислить новый ключ), более ранние записи уже
  выведены в out и "вставить туда что-то задним числом" невозможно. Финальная реализация — ДВА
  прохода: 1) `get_record_by_index` + `mutate_fn` ЗАРАНЕЕ вычисляют новый ключ; 2) один основной
  проход по ВСЕМ записям (кроме исходной позиции, которая пропускается) со вставкой обновлённой
  записи в правильное место — независимо от направления перемещения. Возвращает `(bytes,
  new_index)` — новая позиция записи в итоговом файле нужна вызывающему коду, чтобы обновить
  индекс на фронтенде (иначе последующие действия типа удаления попадут не в ту запись).

### Backend: интеграция в index.py
- `ddf_create`: если у схемы есть `_ID_FIELDS` (см. ЭТАП 12) — `new_rows` сортируются между собой
  (`sorted(new_rows, key=key_fn)`) и вставляются через `insert_records_sorted` вместо
  `append_records`. Для схем без `_ID_FIELDS` (нет понятия "id") поведение не изменилось —
  по-прежнему `append_records` (дописывание в конец).
- `ddf_save_raw`: если у схемы есть `_ID_FIELDS`, используется `update_record_sorted` вместо
  `transform_single_row` — с `key_fn = lambda row: _ddf_key_of(row, id_field_names)` (тот же
  хелпер, что и в проверке дубликатов из ЭТАПА 12). Ответ API дополнен полями `moved`
  (bool — переместилась ли запись физически) и обновлённым `index` (новая позиция) — раньше
  всегда возвращался запрошенный `index` без изменений.
- `ddf_save` (обычная форма) НЕ ТРОГАЛСЯ — как и в ЭТАПЕ 12, id-поля никогда не входят в
  `editable`, значит обычная форма физически не может поменять id, сортировка там не нужна.

### Frontend: обработка перемещения (PatchesDdfEditor.tsx)
`handleSave()` в raw-режиме теперь проверяет `data.moved` из ответа `ddf_save_raw` — если true,
обновляет `selectedIndex` на новую позицию (`data.index`) и заново запрашивает список результатов
поиска (`runSearch(query)`), т.к. закэшированные индексы в `results` устарели (все записи между
старой и новой позицией сдвинулись на 1) — без этого следующее действие (открыть другую запись,
удалить) промахнулось бы мимо цели.

### Найденный и исправленный баг (backward move)
Первая версия `update_record_sorted` была однопроходной (по аналогии с insert_records_sorted) —
физически перемещала запись только ВПЕРЁД корректно. Обнаружено на живом тесте: запись `armorgrp`
index=0 (`id=21`) была изменена на `id=999999` (двигалась вперёд, в конец — сработало верно), но
при ПОПЫТКЕ ВЕРНУТЬ её обратно на `id=21` (запись физически лежала в конце файла, id=21 должен
был переместить её в начало — то есть НАЗАД) результат оказался неверным: вместо перемещения в
начало запись осталась на месте с "потерянной" правильной позицией. Причина — однопроходный
алгоритм уже вывел все более ранние записи в `out` к моменту, когда поток доходил до исходной
(последней) позиции записи и только там вычислял новый ключ — вставить в уже пройденный участок
было нельзя. Исправлено двухпроходной реализацией (см. выше) — переделано, передеплоено,
перепроверено: тот же сценарий (перемещение с последней позиции на первую) после фикса сработал
верно (`moved: true, index: 0`), подтверждено на живом файле `armorgrp.dat`.

### Реальные end-to-end тесты на живом сервере C4x1 — ВСЕ ПРОЙДЕНЫ (с откатом после проверки)
1. Ровно сценарий из запроса пользователя: `skillname-e.dat`, "Triple Slash" id=1 — на момент
   теста существовали уровни до level=114 (плюс отдельные группы до 170), создание НОВОЙ записи
   id=1, level=171 — встала СРАЗУ после реальной `id=1, level=170` и перед `id=2, level=1` (не в
   конец файла, где сейчас 36251-я по счёту запись) — подтверждено через `ddf_get` соседних
   индексов; запись удалена после проверки, `totalRows` восстановлен точно
2. `armorgrp.dat` (raw-only, id-only ключ): изменение id записи index=0 (21 -> 999999, форвард-
   перемещение в конец) — `moved: true, index: 1351`, подтверждено; после НАЙДЕННОГО бага
   (см. выше) — обратное перемещение (999999 -> 21, бэквард с конца в начало) СНАЧАЛА завершилось
   некорректно, баг исправлен и передеплоен, повторный тест — `moved: true, index: 0`, все записи
   на итоговых позициях подтверждены вручную, `totalRows` не изменился (1352 к началу и в конце)
3. Финальный полный обход `armorgrp.dat` после всех тестов (через offset-пагинацию из ЭТАПА 13)
   подтвердил `totalRows=1352` (совпадает с исходным) — обнаруженное расхождение сортировки в
   самом конце файла (запись `id=1` после `id=12844`) — это ПРЕДСУЩЕСТВОВАВШИЙ "исторический
   беспорядок" (см. диагностику выше, до начала работы над этим этапом), не внесённый тестами —
   по решению пользователя специально НЕ исправляется автоматически

### Статус
Все схемы с непустым `_ID_FIELDS` (66 H5 + 26 C4, см. ЭТАП 12) теперь поддерживают порядок при
создании (одной записи и списком, включая RAW_ONLY схемы через `rawLines`) и при редактировании
id-полей через raw-режим. Схемы без понятия "id" (`_ID_FIELDS` пустой/отсутствует) — поведение не
изменилось, записи по-прежнему дописываются в конец. Существующий беспорядок в части файлов
(armorgrp/castlename/questname) НЕ исправляется автоматически — по явному решению пользователя.