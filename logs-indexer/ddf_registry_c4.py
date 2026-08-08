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

MTX/MAT-поля (armorgrp, etcitemgrp, recipe-c) ПОДДЕРЖИВАЮТСЯ — формат разобран экспериментально
и подтверждён byte-perfect сверкой с официальным TXT-экспортом l2disasm (armorgrp/etcitemgrp
пользователя), см. подробности в docstring ddf_parser.py про MTX/MAT. У этих трёх файлов нет
"человеческих" текстовых полей (названия/описания) — вместо привычного текстового редактора для
них на фронтенде используется РЕЖИМ RAW: вся запись показывается одной строкой значений через
таб (как в l2disasm TSV-экспорте) и правится целиком одним textarea — см. ddf_raw.py.

Особый случай — armorgrp.dat: пользователь намеренно добавляет 2 нулевых байта в САМЫЙ конец
файла (после стандартного 20-байтного tail) как защиту от несанкционированного использования
файла в чужом инструментарии. Это НЕ часть формата dat/DDF — общий алгоритм расшифровки
(l2encdec.py) эти байты не ожидает и не учитывает. Backend (index.py) отрезает их перед decode
и дописывает обратно после encode — см. ARMORGRP_TRAILING_QUIRK_BYTES ниже и _ddf_strip_quirk/
_ddf_restore_quirk в index.py.

hairgrp/helmetgrp/logongrp ПОДДЕРЖИВАЮТСЯ через RAW-режим (см. выше) — hairgrp/helmetgrp состоят
только из числовых CHAR-полей (индексы моделей/цветов волос и шлемов на расу/пол, 120 полей на
запись, RECCNT=15 без reccnt-префикса), там нет отдельных "человеческих" текстовых полей вообще.
helmetgrp.dat использует ТУ ЖЕ бинарную схему, что и hairgrp (официального отдельного DDF для
helmetgrp не было — подтверждено экспериментально byte-perfect на реальных данных: те же 120
CHAR-полей, RECCNT=15). logongrp (точки спавна камеры на экране логина, RECCNT=26, без
reccnt-префикса) — поля x/y/z/yaw в оригинальном DDF ошибочно помечены как INT, но реальные
данные — это биты FLOAT-координат (подтверждено экспериментально: как INT значения выглядят как
бессмысленные огромные числа вроде -964568064, как FLOAT — как разумные координаты вроде
-16622.0); опечатка исправлена здесь на FLOAT, что не влияет на byte-perfect совместимость (тот
же размер поля 4 байта), но даёт осмысленные значения в редакторе.

hairaccessarygrp.dat — ПРОПУЩЕН осознанно: пользователь подтвердил, что это кастомный
(самостоятельно добавленный на сервер) файл без официальной DDF-схемы в архиве инструментария —
похожий по названию hairaccessorylocgrp.ddf НЕ подходит (структура записи не совпадает, размер
файла и header-count не сходятся при disassemble). Без подлинной схемы поддержать нельзя.

weapongrp ПОДДЕРЖИВАЕТСЯ через RAW-режим — использует ENBBY (условные поля, читаются только если
другое поле в этой же записи равно заданному значению). Формат ENBBY разобран экспериментально
и подтверждён byte-perfect + побайтовым сравнением с официальным TXT-экспортом l2disasm
(weapongrp.txt пользователя, 0 расхождений на 1134 записях) — см. подробности в docstring
parse_ddf() в ddf_parser.py. Единственное отличие RAW-режима проекта от l2disasm — для
динамических массивов переменной длины (wpn_mesh/wpn_tex/item_sound) l2disasm использует
ФИКСИРОВАННУЮ ширину столбцов (максимум count по ВСЕМ записям файла, с пустыми ячейками-
заполнителями для записей с меньшим count), а в проекте — переменную ширину ПО ЗАПИСИ (ровно
такое число колонок, сколько элементов реально в этой записи) — это осознанное упрощение (не
нужно вычислять максимум по всему файлу перед показом одной записи) и не нарушает
самосогласованность (row -> raw line -> row round-trip подтверждён 0 расхождений на всех 1134
записях).

npcgrp ПОДДЕРЖИВАЕТСЯ через RAW-режим — оригинальный DDF содержит опечатку автора: ВТОРОЕ
текстурное поле названо "tex1" вместо "tex2" (два разных поля с одинаковым именем — подтверждено
на реальном TXT-экспорте l2disasm, где заголовок содержит "tex1[0]..tex1[4]" ЗАТЕМ СНОВА
"tex1[0]..tex1[1]" для cnt_tex2). В самом БИНАРНИКЕ имени поля не существует вообще (это чисто
текстовая метка DDF-схемы для читателя) — но в Python-словаре записи (row-dict) оно используется
как ключ, поэтому дублирование ключа привело бы к тому, что второе значение поля затирает первое
при disassemble, и файл собирался бы обратно НЕ byte-perfect. Опечатка исправлена здесь на "tex2"
(аналогично исправлению INT->FLOAT в logongrp выше) — подтверждено byte-perfect на всех 6445
реальных записях (disassemble+assemble и полный цикл шифрования), у npcgrp НЕТ ENBBY-полей
(закомментированные unk0_cnt/unk0_tab в DDF пропускаются как комментарий — на бинарную структуру
не влияют).
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
    'etcitemgrp': '''
{
	UINT tag;
	UINT id;
	UINT drop_type;
	UINT drop_anim_type;
	UINT drop_radius;
	UINT drop_height;
	UINT UNK_0;
	UNICODE drop_mesh1;
	UNICODE drop_mesh2;
	UNICODE drop_mesh3;
	UNICODE drop_tex1;
	UNICODE drop_tex2;
	UNICODE drop_tex3;
	UNICODE icon[5];
	INT durability;
	UINT weight;
	UINT material;
	UINT crystallizable;
	UINT type1;
	MTX mesh_tex_pair;
	UNICODE item_sound;
	UNICODE equip_sound;
	UINT stackable;
	UINT family;
	UINT grade;
}
''',
    'armorgrp': '''
{
	UINT tag;
	UINT id;
	UINT drop_type;
	UINT drop_anim_type;
	UINT drop_radius;
	UINT drop_height;
	UINT UNK_0;
	UNICODE drop_mesh1;
	UNICODE drop_mesh2;
	UNICODE drop_mesh3;
	UNICODE drop_tex1;
	UNICODE drop_tex2;
	UNICODE drop_tex3;
	UNICODE icon[5];
	INT durability;
	UINT weight;
	UINT material;
	UINT crystallizable;
	UINT UNK_1;
	UINT body_part;
	MTX m_HumnFigh;
	MTX m_HumnFigh_add;
	MTX f_HumnFigh;
	MTX f_HumnFigh_add;
	MTX m_DarkElf;
	MTX m_DarkElf_add;
	MTX f_DarkElf;
	MTX f_DarkElf_add;
	MTX m_Dorf;
	MTX m_Dorf_add;
	MTX f_Dorf;
	MTX f_Dorf_add;
	MTX m_Elf;
	MTX m_Elf_add;
	MTX f_Elf;
	MTX f_Elf_add;
	MTX m_HumnMyst;
	MTX m_HumnMyst_add;
	MTX f_HumnMyst;
	MTX f_HumnMyst_add;
	MTX m_OrcFigh;
	MTX m_OrcFigh_add;
	MTX f_OrcFigh;
	MTX f_OrcFigh_add;
	MTX m_OrcMage;
	MTX m_OrcMage_add;
	MTX f_OrcMage;
	MTX f_OrcMage_add;
	MTX Unknown_MT;
	MTX NPC_MT;
	MTX ACC_MT;
	UNICODE att_eff;
	UINT item_sound_cnt;
	UNICODE item_sound[item_sound_cnt];
	UNICODE drop_sound;
	UNICODE equip_sound;
	UINT UNK_2;
	UINT UNK_3;
	UINT armor_type;
	UINT crystal_type;
	UINT avoid_mod;
	UINT pdef;
	UINT mdef;
	UINT mpbonus;
}
''',
    'recipe': '''
{
	ASCF name;
	UINT id_mk;
	UINT id_recipe;
	UINT level;
	UINT id_item;
	UINT count;
	UINT mp_cost;
	UINT success_rate;
	MAT materials;
}
''',
    # hairgrp и helmetgrp используют ОДНУ И ТУ ЖЕ схему (120 CHAR-полей, RECCNT=15) — см.
    # docstring выше про helmetgrp. _base_key() сведёт оба имени файла к разным ключам словаря,
    # поэтому текст схемы продублирован (а не разделяется через alias), чтобы не усложнять
    # match_ddf() отдельным механизмом ссылок между ключами.
    'hairgrp': '''
{
	CHAR m0_a0; CHAR m0_b0; CHAR m0_a1; CHAR m0_b1; CHAR m0_a2; CHAR m0_b2; CHAR m0_a3; CHAR m0_b3;
	CHAR m0_a4; CHAR m0_b4; CHAR m0_a5; CHAR m0_b5; CHAR m0_a6; CHAR m0_b6; CHAR m0_a7; CHAR m0_b7;
	CHAR m0_a8; CHAR m0_b8; CHAR m0_a9; CHAR m0_b9;
	CHAR m1_a0; CHAR m1_b0; CHAR m1_a1; CHAR m1_b1; CHAR m1_a2; CHAR m1_b2; CHAR m1_a3; CHAR m1_b3;
	CHAR m1_a4; CHAR m1_b4; CHAR m1_a5; CHAR m1_b5; CHAR m1_a6; CHAR m1_b6; CHAR m1_a7; CHAR m1_b7;
	CHAR m1_a8; CHAR m1_b8; CHAR m1_a9; CHAR m1_b9;
	CHAR m2_a0; CHAR m2_b0; CHAR m2_a1; CHAR m2_b1; CHAR m2_a2; CHAR m2_b2; CHAR m2_a3; CHAR m2_b3;
	CHAR m2_a4; CHAR m2_b4; CHAR m2_a5; CHAR m2_b5; CHAR m2_a6; CHAR m2_b6; CHAR m2_a7; CHAR m2_b7;
	CHAR m2_a8; CHAR m2_b8; CHAR m2_a9; CHAR m2_b9;
	CHAR m3_a0; CHAR m3_b0; CHAR m3_a1; CHAR m3_b1; CHAR m3_a2; CHAR m3_b2; CHAR m3_a3; CHAR m3_b3;
	CHAR m3_a4; CHAR m3_b4; CHAR m3_a5; CHAR m3_b5; CHAR m3_a6; CHAR m3_b6; CHAR m3_a7; CHAR m3_b7;
	CHAR m3_a8; CHAR m3_b8; CHAR m3_a9; CHAR m3_b9;
	CHAR m4_a0; CHAR m4_b0; CHAR m4_a1; CHAR m4_b1; CHAR m4_a2; CHAR m4_b2; CHAR m4_a3; CHAR m4_b3;
	CHAR m4_a4; CHAR m4_b4; CHAR m4_a5; CHAR m4_b5; CHAR m4_a6; CHAR m4_b6; CHAR m4_a7; CHAR m4_b7;
	CHAR m4_a8; CHAR m4_b8; CHAR m4_a9; CHAR m4_b9;
	CHAR m5_a0; CHAR m5_b0; CHAR m5_a1; CHAR m5_b1; CHAR m5_a2; CHAR m5_b2; CHAR m5_a3; CHAR m5_b3;
	CHAR m5_a4; CHAR m5_b4; CHAR m5_a5; CHAR m5_b5; CHAR m5_a6; CHAR m5_b6; CHAR m5_a7; CHAR m5_b7;
	CHAR m5_a8; CHAR m5_b8; CHAR m5_a9; CHAR m5_b9;
}
''',
    'helmetgrp': '''
{
	CHAR m0_a0; CHAR m0_b0; CHAR m0_a1; CHAR m0_b1; CHAR m0_a2; CHAR m0_b2; CHAR m0_a3; CHAR m0_b3;
	CHAR m0_a4; CHAR m0_b4; CHAR m0_a5; CHAR m0_b5; CHAR m0_a6; CHAR m0_b6; CHAR m0_a7; CHAR m0_b7;
	CHAR m0_a8; CHAR m0_b8; CHAR m0_a9; CHAR m0_b9;
	CHAR m1_a0; CHAR m1_b0; CHAR m1_a1; CHAR m1_b1; CHAR m1_a2; CHAR m1_b2; CHAR m1_a3; CHAR m1_b3;
	CHAR m1_a4; CHAR m1_b4; CHAR m1_a5; CHAR m1_b5; CHAR m1_a6; CHAR m1_b6; CHAR m1_a7; CHAR m1_b7;
	CHAR m1_a8; CHAR m1_b8; CHAR m1_a9; CHAR m1_b9;
	CHAR m2_a0; CHAR m2_b0; CHAR m2_a1; CHAR m2_b1; CHAR m2_a2; CHAR m2_b2; CHAR m2_a3; CHAR m2_b3;
	CHAR m2_a4; CHAR m2_b4; CHAR m2_a5; CHAR m2_b5; CHAR m2_a6; CHAR m2_b6; CHAR m2_a7; CHAR m2_b7;
	CHAR m2_a8; CHAR m2_b8; CHAR m2_a9; CHAR m2_b9;
	CHAR m3_a0; CHAR m3_b0; CHAR m3_a1; CHAR m3_b1; CHAR m3_a2; CHAR m3_b2; CHAR m3_a3; CHAR m3_b3;
	CHAR m3_a4; CHAR m3_b4; CHAR m3_a5; CHAR m3_b5; CHAR m3_a6; CHAR m3_b6; CHAR m3_a7; CHAR m3_b7;
	CHAR m3_a8; CHAR m3_b8; CHAR m3_a9; CHAR m3_b9;
	CHAR m4_a0; CHAR m4_b0; CHAR m4_a1; CHAR m4_b1; CHAR m4_a2; CHAR m4_b2; CHAR m4_a3; CHAR m4_b3;
	CHAR m4_a4; CHAR m4_b4; CHAR m4_a5; CHAR m4_b5; CHAR m4_a6; CHAR m4_b6; CHAR m4_a7; CHAR m4_b7;
	CHAR m4_a8; CHAR m4_b8; CHAR m4_a9; CHAR m4_b9;
	CHAR m5_a0; CHAR m5_b0; CHAR m5_a1; CHAR m5_b1; CHAR m5_a2; CHAR m5_b2; CHAR m5_a3; CHAR m5_b3;
	CHAR m5_a4; CHAR m5_b4; CHAR m5_a5; CHAR m5_b5; CHAR m5_a6; CHAR m5_b6; CHAR m5_a7; CHAR m5_b7;
	CHAR m5_a8; CHAR m5_b8; CHAR m5_a9; CHAR m5_b9;
}
''',
    # x/y/z/yaw в оригинальном DDF ошибочно помечены как INT — здесь исправлено на FLOAT
    # (реальные данные — координаты, см. docstring выше). Byte-perfect не нарушается (те же
    # 4 байта на поле).
    'logongrp': '''
{
	FLOAT x;
	FLOAT y;
	FLOAT z;
	FLOAT yaw;
}
''',
    'weapongrp': '''
{
	UINT tag;
	UINT id;
	UINT drop_type;
	UINT drop_anim_type;
	UINT drop_radius;
	UINT drop_height;
	UINT UNK_0;
	UNICODE drop_mesh1;
	UNICODE drop_mesh2;
	UNICODE drop_mesh3;
	UNICODE drop_tex1;
	UNICODE drop_tex2;
	UNICODE drop_tex3;
	UNICODE icon[5];
	INT durability;
	UINT weight;
	UINT material;
	UINT crystallizable;
	UINT projectile_?;
	UINT body_part;
	UINT handness;
	UINT wpn_mesh_cnt;
	UNICODE wpn_mesh[wpn_mesh_cnt];
	UINT wpn_tex_cnt;
	UNICODE wpn_tex[wpn_tex_cnt];
	UINT item_sound_cnt;
	UNICODE item_sound[item_sound_cnt];
	UNICODE drop_sound;
	UNICODE equip_sound;
	UNICODE effect;
	UINT random_damage;
	UINT patt;
	UINT matt;
	UINT weapon_type;
	UINT crystal_type;
	UINT critical;
	INT hit_mod;
	INT avoid_mod;
	UINT shield_pdef;
	UINT shield_rate;
	UINT speed;
	UINT mp_consume;
	UINT SS_count;
	UINT SPS_count;
	UINT curvature;
	UINT UNK_2;
	INT is_hero;
	UINT UNK_3;
	UNICODE effA;
	UNICODE effB;
		ENBBY = [(wpn_mesh_cnt,2)];
	FLOAT junk1A[5];
	FLOAT junk1B[5];
		ENBBY = [(wpn_mesh_cnt,2)];
	UNICODE rangeA;
	UNICODE rangeB;
		ENBBY = [(wpn_mesh_cnt,2)];
	FLOAT junk2A[6];
	FLOAT junk2B[6];
		ENBBY = [(wpn_mesh_cnt,2)];
}
''',
    # Оригинальный DDF называет ВТОРОЕ текстурное поле "tex1" (та же опечатка, что и первое) —
    # здесь исправлено на "tex2", см. подробное объяснение в docstring выше.
    'npcgrp': '''
{
	UINT tag;
	UNICODE class;
	UNICODE mesh;
	UINT cnt_tex1;
	UNICODE tex1[cnt_tex1];
	UINT cnt_tex2;
	UNICODE tex2[cnt_tex2];
	CNTR cnt_dtab1;
	UINT dtab1[cnt_dtab1];
	FLOAT npc_speed;
	UINT UNK_0;
	UINT cnt_snd1;
	UNICODE snd1[cnt_snd1];
	UINT cnt_snd2;
	UNICODE snd2[cnt_snd2];
	UINT cnt_snd3;
	UNICODE snd3[cnt_snd3];
	UINT UNK_0a;
	CNTR unk1_cnt;
	UINT unk1_tab[unk1_cnt];
	UINT level_lim_dn;
	UINT level_lim_up;
	UNICODE effect;
	UINT UNK_2;
	FLOAT sound_rad;
	FLOAT sound_vol;
	FLOAT sound_rnd;
	UINT quest_be;
	UINT class_lim_?;
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
    # У этих схем нет "человеческих" текстовых полей (названия/описания) — только технические
    # пути к моделям/текстурам/звукам внутри MTX/MAT-полей, обычных строковых полей, либо чисто
    # числовые индексы/координаты. Редактирование для них выполняется целиком через
    # RAW_ONLY_SCHEMAS (см. ниже).
    'etcitemgrp': [],
    'armorgrp': [],
    'recipe': ['name'],
    'hairgrp': [],
    'helmetgrp': [],
    'logongrp': [],
    'weapongrp': [],
    'npcgrp': [],
}

# Поля, образующие УНИКАЛЬНЫЙ идентификатор записи — см. подробное объяснение в ddf_registry.py
# (_ID_FIELDS). Схема отсутствует в словаре ИЛИ имеет пустой список — проверка на дубликаты не
# выполняется (нет осмысленного понятия "id" — например hairgrp/helmetgrp/logongrp состоят только
# из служебных CHAR/FLOAT-полей без единого идентификатора, различаются исключительно порядковым
# номером записи в файле).
_ID_FIELDS = {
    'actionname': ['id'],
    'armorgrp': ['id'],
    'castlename': ['id'],
    'classinfo': ['id'],
    'commandname': ['id'],
    'creditgrp': ['id'],
    'entereventgrp': ['id'],
    'etcitemgrp': ['id'],
    'hennagrp': ['id'],
    'itemname': ['id'],
    # Механика игры: один и тот же моб (npc_id) использует НЕСКОЛЬКО разных скиллов (skill_id).
    'mobskillanimgrp': ['npc_id', 'skill_id'],
    'musicinfo': ['id'],
    'npcname': ['id'],
    'obscene': ['id'],
    # Механика игры: один quest_id состоит из НЕСКОЛЬКИХ этапов (quest_prog).
    'questname': ['quest_id', 'quest_prog'],
    # id_recipe — реальный уникальный id рецепта (id_mk — id мастерства/профессии, не уникален
    # сам по себе, у одной профессии много рецептов).
    'recipe': ['id_recipe'],
    'servername': ['server_id'],
    # Механика игры: один skill_id имеет НЕСКОЛЬКО уровней (skill_level).
    'skillgrp': ['skill_id', 'skill_level'],
    'skillname': ['id', 'level'],
    'skillsoundgrp': ['skill_id', 'skill_level'],
    'staticobject': ['id'],
    'symbolname': ['id'],
    'sysstring': ['id'],
    'systemmsg': ['id'],
    'weapongrp': ['id'],
    'zonename': ['nbr'],
}

# Схемы без осмысленных "человеческих" editable-полей (или там, где текстовые поля — это лишь
# небольшая часть намного более сложной по структуре записи) — на фронтенде для них вместо
# обычной формы редактирования отдельных полей показывается RAW-режим: вся запись одной строкой
# значений через табуляцию (как в l2disasm TSV-экспорте, см. ddf_raw.py), редактируемой одним
# textarea целиком.
RAW_ONLY_SCHEMAS = {'etcitemgrp', 'armorgrp', 'recipe', 'hairgrp', 'helmetgrp', 'logongrp', 'weapongrp', 'npcgrp'}

# armorgrp.dat: пользователь намеренно дописывает 2 нулевых байта в САМЫЙ конец файла (после
# стандартного 20-байтного l2encdec-tail) как защиту от использования файла в чужом
# инструментарии. Это НЕ часть формата — index.py должен отрезать эти байты перед decode и
# дописывать их обратно после encode (см. _ddf_strip_quirk/_ddf_restore_quirk в index.py).
ARMORGRP_TRAILING_QUIRK_BYTES = 2

# Файлы, у которых в DDF указано "RECCNT = N" (фиксированное число), а не "RECCNT = OFF" —
# значит в бинарнике НЕТ 4-байтного префикса-счётчика записей в начале файла. Число записей
# для disassemble/iter_records и т.п. нужно брать отсюда (fixed_record_count), передавая
# has_reccnt_prefix=False.
FIXED_RECORD_COUNTS = {
    'chargrp': 15,
    'eula': 1,
    'hairgrp': 15,
    'helmetgrp': 15,
    'logongrp': 26,
}

# Группы полей, которые физически хранят RGB(A)-цвет — см. подробное объяснение в
# ddf_registry.py (_COLOR_FIELD_GROUPS). У C4 обе схемы используют компактный формат "один
# массив из 3 CHEX-компонент" (без альфа-канала, в отличие от H5 systemmsg).
_COLOR_FIELD_GROUPS = {
    'npcname': {'fields': ['rgb'], 'array': True},
    'systemmsg': {'fields': ['rgb'], 'array': True},
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
    fixed_record_count, is_raw_only) для файла, если он поддерживается для C4, иначе None.
    is_raw_only=True означает, что у схемы нет осмысленных текстовых полей для обычной формы
    редактирования — фронтенд должен показывать RAW-режим (см. RAW_ONLY_SCHEMAS выше).'''
    key = _base_key(filename)
    if key not in _DDF_TEXTS:
        return None
    if key not in _FIELDS_CACHE:
        _FIELDS_CACHE[key] = parse_ddf(_DDF_TEXTS[key])
    fields = _FIELDS_CACHE[key]
    editable = _EDITABLE_TEXT_FIELDS.get(key, [])
    fixed_count = FIXED_RECORD_COUNTS.get(key)
    has_reccnt_prefix = fixed_count is None
    is_raw_only = key in RAW_ONLY_SCHEMAS
    return key, fields, editable, has_reccnt_prefix, fixed_count, is_raw_only


def is_supported(filename: str) -> bool:
    return _base_key(filename) in _DDF_TEXTS


def list_supported_keys():
    return sorted(_DDF_TEXTS.keys())


def color_group(filename: str):
    '''Возвращает описание цветовой группы полей ({'fields': [...], 'array': bool}) для этой
    схемы, либо None, если у неё нет полей-цвета. См. _COLOR_FIELD_GROUPS выше.'''
    return _COLOR_FIELD_GROUPS.get(_base_key(filename))


def id_fields(filename: str) -> list:
    '''Возвращает список имён полей, образующих уникальный идентификатор записи этой схемы (см.
    _ID_FIELDS выше), либо [] если у схемы нет осмысленного понятия "id" — в этом случае проверка
    на дубликаты не выполняется.'''
    return _ID_FIELDS.get(_base_key(filename), [])