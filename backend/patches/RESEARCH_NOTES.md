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

## Статус коммитов
- `l2encdec.py` (модуль шифрования) — закоммичен и работает, готово.
- `l2ddf.py` (DDF-парсер + disasm/asm) — реализован и провалидирован в этой сессии, ГОТОВ К
  КОММИТУ (проверить что он реально сохранён в файл проекта, не только в песочнице!).
- Backend actions (decode_text/encode_save) — ещё не реализованы.
- Frontend UI — ещё не реализован.