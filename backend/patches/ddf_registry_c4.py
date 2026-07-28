'''Реестр DDF-схем для клиента Lineage 2 Chronicle 4 (C4) — отдельный от ddf_registry.py
(который используется для клиентов High Five / H5).

ПОЧЕМУ ОТДЕЛЬНЫЙ РЕЕСТР: хотя оба клиента используют один и тот же криптографический протокол
файлов (заголовок "Lineage2Ver413", RSA+zlib — см. l2encdec.py, никаких изменений там не
требуется), бинарная СТРУКТУРА записей внутри .dat файлов у C4 заметно проще и местами
отличается по составу полей от H5 (например itemname-e.dat в C4 не содержит полей про сеты
брони/зачарование, которые появились только в поздних хрониках). Схемы, рассчитанные на H5,
либо сразу падают на реальных файлах C4 (IndexError/struct.error), либо тихо парсят неверно.

DDF-тексты взяты из официального набора определений для C4 (архив от пользователя проекта,
папка C4/*.ddf) и проверены byte-perfect (disassemble+assemble == оригинал) на РЕАЛЬНЫХ .dat
файлах живого сервера C4x1 (не на синтетических данных).

Некоторые файлы C4 (там где в DDF указано "RECCNT = N" вместо "RECCNT = OFF") не имеют
4-байтного префикса-счётчика записей в начале файла — число записей жёстко зафиксировано
схемой. Для них в FIXED_RECORD_COUNTS ниже задано это число, и index.py должен вызывать
парсер с has_reccnt_prefix=False, fixed_record_count=N.

Не поддерживаются (используют сложные типы MTX/MTX2/MAT, парсер их не разбирает, и/или не
содержат текстовых полей, интересных для редактора): armorgrp, etcitemgrp, recipe-c, npcgrp,
weapongrp, hairgrp, logongrp.
'''
import re

from ddf_parser import parse_ddf


_DDF_TEXTS = {
    'actionname': '''
{
	UINT tag;
	UINT id;
	INT  type;
	UINT category;
	CNTR cat2_cnt;
	INT  c[cat2_cnt];
	ASCF cmd;
	ASCF icon;
	ASCF name;
	UNICODE desc;
}
''',
    'castlename': '''
{
	UINT nbr;
	UINT tag;
	UINT id;
	ASCF castle_name;
	ASCF location;
	ASCF desc;
}
''',
    'chargrp': '''
{
	UNICODE face_icon;
	UINT cnt_hm;
	UINT cnt_ht;
	UINT cnt_fm;
	UINT cnt_ft;
	UNICODE hair_mesh[cnt_hm];
	UNICODE hair_tex[cnt_ht];
	UNICODE face_mesh[cnt_fm];
	UNICODE face_tex[cnt_ft];
	UNICODE body_mesh[4];
	UNICODE body_tex[4];
	UNICODE attack_eff;
	UINT walkanimframe;
	UINT cnt_att;
	UINT cnt_def;
	UINT cnt_dmg;
	UNICODE snd_att[cnt_att];
	UNICODE snd_def[cnt_def];
	UNICODE snd_dmg[cnt_dmg];
	UINT cnth;
	UNICODE voice_snd_hand[cnth];
	UINT cnt1h;
	UNICODE voice_snd_1hs[cnt1h];
	UINT cnt2h;
	UNICODE voice_snd_2hs[cnt2h];
	UINT cntd;
	UNICODE voice_snd_dual[cntd];
	UINT cntp;
	UNICODE voice_snd_pole[cntp];
	UINT cntb;
	UNICODE voice_snd_bow[cntb];
	UINT cntu;
	UNICODE voice_snd_unknown[cntu];
	UINT cntf;
	UNICODE voice_snd_fist[cntf];
}
''',
    'classinfo': '''
{
	UINT id;
	ASCF name;
}
''',
    'commandname': '''
{
	UINT nbr;
	UINT id;
	ASCF name;
}
''',
    'creditgrp': '''
{
	UINT id;
	ASCF html;
	ASCF image;
	UINT time;
	UINT align;
}
''',
    'entereventgrp': '''
{
	UINT id;
	CHAR UNK_0;
	ASCF skill_sound;
	FLOAT sound_vol;
	FLOAT sound_rad;
	UINT isrise;
	UINT spawn_type;
	UNICODE effect_name;
	UNICODE anim_name;
}
''',
    'eula': '''
{
	ASCF eula;
	ASCF fin;
}
''',
    'hairaccessorylocgrp': '''
{
	UNICODE name;
	FLOAT floats_1[3];
	INT     ints_1[3];
	FLOAT floats_2[3];
	INT     ints_2[3];
	FLOAT floats_3[3];
	INT     ints_3[3];
	FLOAT floats_4[3];
	INT     ints_4[3];
	FLOAT floats_5[3];
	INT     ints_5[3];
	FLOAT floats_6[3];
	INT     ints_6[3];
	FLOAT floats_7[3];
	INT     ints_7[3];
	FLOAT floats_8[3];
	INT     ints_8[3];
	FLOAT floats_9[3];
	INT     ints_9[3];
	FLOAT floats_A[3];
	INT     ints_A[3];
	FLOAT floats_B[3];
	INT     ints_B[3];
	FLOAT floats_C[3];
	INT     ints_C[3];
	FLOAT floats_D[3];
	INT     ints_D[3];
	FLOAT floats_E[3];
	INT     ints_E[3];
	FLOAT floats_F[3];
	INT     ints_F[3];
}
''',
    'hennagrp': '''
{
	UINT id;
	UINT dye_id;
	ASCF name;
	ASCF icon;
	ASCF symbol_add_name;
	ASCF symbol_add_desc;
}
''',
    'itemname': '''
{
	UINT id;
	UNICODE name;
	UNICODE add_name;
	ASCF description;
	INT popup;
}
''',
    'mobskillanimgrp': '''
{
	UINT npc_id;
	UINT skill_id;
	UNICODE seq_name;
	ASCF skill_name;
	ASCF npc_name;
	ASCF npc_class;
}
''',
    'musicinfo': '''
{
	UINT id;
	UINT cnt;
	UNICODE str[cnt];
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
    'obscene': '''
{
	UINT id;
	ASCF text;
}
''',
    'questname': '''
{
	UINT tag_?;
	UINT quest_id;
	UINT quest_prog;
	ASCF main_name;
	ASCF prog_name;
	ASCF description;
	CNTR cnt1;
	INT tab1[cnt1];
	CNTR cnt2;
	INT tab2[cnt2];
	FLOAT quest_x;
	FLOAT quest_y;
	FLOAT quest_z;
	UINT UNK_npc1_?;
	UINT UNK_npc2_?;
	UINT UNK_npc3_?;
	ASCF entity_name;
	UINT UNK_0;
	UINT UNK_1;
	UINT UNK_2;
	UINT UNK_3;
	FLOAT entity_x_?;
	FLOAT entity_y_?;
	FLOAT entity_z_?;
	ASCF race_restricion;
	ASCF short_description;
}
''',
    'servername': '''
{
	UINT server_id;
	UINT tag_?;
	ASCF server_name;
	ASCF server_desc;
}
''',
    'skillgrp': '''
{
	UINT skill_id;
	UINT skill_level;
	UINT oper_type;
	UINT mp_consume;
	INT cast_range;
	UINT cast_style;
	FLOAT hit_time;
	INT is_magic;
	UNICODE ani_char;
	UNICODE desc;
	UNICODE icon_name;
	UINT extra_eff;
	UINT is_ench;
	UINT ench_skill_id;
	UINT hp_consume;
	INT UNK_0;
	INT UNK_1;
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
    'skillsoundgrp': '''
{
	UINT skill_id;
	UINT skill_level;
	UNICODE spelleffect_sound_1;
	UNICODE spelleffect_sound_2;
	UNICODE spelleffect_sound_3;
	FLOAT spelleffect_sound_vol_1;
	FLOAT spelleffect_sound_rad_1;
	FLOAT spelleffect_sound_vol_2;
	FLOAT spelleffect_sound_rad_2;
	FLOAT spelleffect_sound_vol_3;
	FLOAT spelleffect_sound_rad_3;
	UNICODE shoteffect_sound_1;
	UNICODE shoteffect_sound_2;
	UNICODE shoteffect_sound_3;
	FLOAT shoteffect_sound_vol_1;
	FLOAT shoteffect_sound_rad_1;
	FLOAT shoteffect_sound_vol_2;
	FLOAT shoteffect_sound_rad_2;
	FLOAT shoteffect_sound_vol_3;
	FLOAT shoteffect_sound_rad_3;
	UNICODE expeffect_sound_1;
	UNICODE expeffect_sound_2;
	UNICODE expeffect_sound_3;
	FLOAT expeffect_sound_vol_1;
	FLOAT expeffect_sound_rad_1;
	FLOAT expeffect_sound_vol_2;
	FLOAT expeffect_sound_rad_2;
	FLOAT expeffect_sound_vol_3;
	FLOAT expeffect_sound_rad_3;
	UNICODE mfighter_sub;
	UNICODE ffighter_sub;
	UNICODE mdarkelf_sub;
	UNICODE fdarkelf_sub;
	UNICODE mdwarf_sub;
	UNICODE fdwarf_sub;
	UNICODE melf_sub;
	UNICODE felf_sub;
	UNICODE mmagic_sub;
	UNICODE fmagic_sub;
	UNICODE morc_sub;
	UNICODE forc_sub;
	UNICODE mshaman_sub;
	UNICODE fshaman_sub;
	UNICODE RESERVED_sub_?;
	UNICODE mfighter_throw;
	UNICODE ffighter_throw;
	UNICODE mdarkelf_throw;
	UNICODE fdarkelf_throw;
	UNICODE mdwarf_throw;
	UNICODE fdwarf_throw;
	UNICODE melf_throw;
	UNICODE felf_throw;
	UNICODE mmagic_throw;
	UNICODE fmagic_throw;
	UNICODE morc_throw;
	UNICODE forc_throw;
	UNICODE mshaman_throw;
	UNICODE fshaman_throw;
	UNICODE RESERVED_throw_?;
	FLOAT sound_vol;
	FLOAT sound_rad;
}
''',
    'staticobject': '''
{
	UINT id;
	UNICODE name;
}
''',
    'symbolname': '''
{
	UINT id;
	ASCF filename;
	ASCF alias;
	UINT UNK_0;
}
''',
    'sysstring': '''
{
	UINT id;
	ASCF name;
}
''',
    'systemmsg': '''
{
	UINT id;
	UINT UNK_0;
	ASCF message;
	UINT group;
	CHEX rgb[3];
	CHAR UNK_1;
	ASCF item_sound;
	ASCF sys_msg_ref;
}
''',
    'zonename': '''
{
	UINT nbr;
	UINT zone_color_id;
	UINT x_world_grid;
	UINT y_world_grid;
	FLOAT top_z;
	FLOAT bottom_z;
	ASCF zone_name;
}
''',
}

# Человекочитаемые названия полей (для фронтенда) — какие поля показывать как редактируемый
# текст (все ASCF/UNICODE не-табличные поля из схемы, вручную сверенные с реальными данными).
_EDITABLE_TEXT_FIELDS = {
    'actionname': ['cmd', 'icon', 'name', 'desc'],
    'castlename': ['castle_name', 'location', 'desc'],
    'chargrp': ['face_icon', 'attack_eff'],
    'classinfo': ['name'],
    'commandname': ['name'],
    'creditgrp': ['html', 'image'],
    'entereventgrp': ['skill_sound', 'effect_name', 'anim_name'],
    'eula': ['eula', 'fin'],
    'hairaccessorylocgrp': ['name'],
    'hennagrp': ['name', 'icon', 'symbol_add_name', 'symbol_add_desc'],
    'itemname': ['name', 'add_name', 'description'],
    'mobskillanimgrp': ['seq_name', 'skill_name', 'npc_name', 'npc_class'],
    'musicinfo': [],
    'npcname': ['name', 'description'],
    'obscene': ['text'],
    'questname': ['main_name', 'prog_name', 'description', 'entity_name', 'race_restricion', 'short_description'],
    'servername': ['server_name', 'server_desc'],
    'skillgrp': ['ani_char', 'desc', 'icon_name'],
    'skillname': ['name', 'description', 'desc_add1', 'desc_add2'],
    'skillsoundgrp': [
        'spelleffect_sound_1', 'spelleffect_sound_2', 'spelleffect_sound_3',
        'shoteffect_sound_1', 'shoteffect_sound_2', 'shoteffect_sound_3',
        'expeffect_sound_1', 'expeffect_sound_2', 'expeffect_sound_3',
        'mfighter_sub', 'ffighter_sub', 'mdarkelf_sub', 'fdarkelf_sub', 'mdwarf_sub', 'fdwarf_sub',
        'melf_sub', 'felf_sub', 'mmagic_sub', 'fmagic_sub', 'morc_sub', 'forc_sub',
        'mshaman_sub', 'fshaman_sub',
        'mfighter_throw', 'ffighter_throw', 'mdarkelf_throw', 'fdarkelf_throw', 'mdwarf_throw', 'fdwarf_throw',
        'melf_throw', 'felf_throw', 'mmagic_throw', 'fmagic_throw', 'morc_throw', 'forc_throw',
        'mshaman_throw', 'fshaman_throw',
    ],
    'staticobject': ['name'],
    'symbolname': ['filename', 'alias'],
    'sysstring': ['name'],
    'systemmsg': ['message', 'item_sound', 'sys_msg_ref'],
    'zonename': ['zone_name'],
}

# Файлы, у которых в DDF указано "RECCNT = N" (фиксированное число), а не "RECCNT = OFF" —
# значит в бинарнике НЕТ 4-байтного префикса-счётчика записей в начале файла. Число записей
# для disassemble/iter_records и т.п. нужно брать отсюда (fixed_record_count), передавая
# has_reccnt_prefix=False.
FIXED_RECORD_COUNTS = {
    'chargrp': 15,
    'eula': 1,
}

_FIELDS_CACHE = {}


def _base_key(filename: str):
    '''Приводит имя файла к базовому ключу схемы: убирает расширение и языковой суффикс
    (-e, -ru, -c и т.п.), приводит к нижнему регистру.'''
    name = filename.rsplit('/', 1)[-1]
    name = re.sub(r'\.[a-zA-Z0-9]+$', '', name)
    name = re.sub(r'-[a-zA-Z]{1,3}$', '', name)
    return name.lower()


def match_ddf(filename: str):
    '''Возвращает (schema_key, fields, editable_field_names, has_reccnt_prefix,
    fixed_record_count) для файла, если он поддерживается для C4, иначе None.'''
    key = _base_key(filename)
    if key not in _DDF_TEXTS:
        return None
    if key not in _FIELDS_CACHE:
        _FIELDS_CACHE[key] = parse_ddf(_DDF_TEXTS[key])
    fields = _FIELDS_CACHE[key]
    editable = _EDITABLE_TEXT_FIELDS.get(key, [])
    fixed_count = FIXED_RECORD_COUNTS.get(key)
    has_reccnt_prefix = fixed_count is None
    return key, fields, editable, has_reccnt_prefix, fixed_count


def is_supported(filename: str) -> bool:
    return _base_key(filename) in _DDF_TEXTS


def list_supported_keys():
    return sorted(_DDF_TEXTS.keys())
