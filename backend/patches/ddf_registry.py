'''Реестр известных DDF-схем (структур .dat файлов Lineage 2) и функция сопоставления
конкретного файла патча (по имени) с подходящей схемой.

DDF-тексты взяты из официального открытого набора определений L2disasm/l2asm (H5pt) — те же,
что использовались при восстановлении и проверке формата ASCF/UNICODE (см. ddf_parser.py).
Пока поддерживаются только "текстовые" .dat файлы (имена/описания предметов, скиллов, нпс,
системные строки и т.п.) — именно они нужны для перевода/редактирования текста клиента.
'''
import re

from ddf_parser import parse_ddf


_DDF_TEXTS = {
    'itemname': '''
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
''',
    'npcname': '''
{
	UINT id;
	ASCF name;
	ASCF description;
	CHEX rgb[3];
	CHAR reserved1;
}
''',
    'npcstring': '''
{
	UINT id;
	ASCF string;
}
''',
    'skillname': '''
{
	UINT id;
	UINT level;
	ASCF name;
	ASCF description;
	ASCF desc_add1;
	ASCF desc_add2;
}
''',
    'commandname': '''
{
	UINT nbr;
	INT id;
	ASCF name;
}
''',
}

# Человекочитаемые названия полей (для фронтенда) — какие поля показывать как редактируемый
# текст, а какие как служебные (id/индексы), плюс подпись для UI.
_EDITABLE_TEXT_FIELDS = {
    'itemname': ['name', 'add_name', 'description', 'set_bonus_desc', 'set_extra_desc', 'special_enchant_desc'],
    'npcname': ['name', 'description'],
    'npcstring': ['string'],
    'skillname': ['name', 'description', 'desc_add1', 'desc_add2'],
    'commandname': ['name'],
}

_FIELDS_CACHE = {}


def _base_key(filename: str):
    '''Приводит имя файла к базовому ключу схемы: убирает расширение и языковой суффикс
    (-e, -ru, -fr и т.п.), приводит к нижнему регистру. "ItemName-e.dat" -> "itemname",
    "NpcString-e.dat" -> "npcstring".'''
    name = filename.rsplit('/', 1)[-1]
    name = re.sub(r'\.[a-zA-Z0-9]+$', '', name)  # strip extension
    name = re.sub(r'-[a-zA-Z]{1,3}$', '', name)  # strip language suffix like -e, -ru, -fr
    return name.lower()


def match_ddf(filename: str):
    '''Возвращает (schema_key, fields, editable_field_names) для файла, если он поддерживается,
    иначе None.'''
    key = _base_key(filename)
    if key not in _DDF_TEXTS:
        return None
    if key not in _FIELDS_CACHE:
        _FIELDS_CACHE[key] = parse_ddf(_DDF_TEXTS[key])
    fields = _FIELDS_CACHE[key]
    editable = _EDITABLE_TEXT_FIELDS.get(key, [])
    return key, fields, editable


def is_supported(filename: str) -> bool:
    return _base_key(filename) in _DDF_TEXTS
