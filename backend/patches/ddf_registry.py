'''Реестр известных DDF-схем (структур .dat файлов Lineage 2) и функция сопоставления
конкретного файла патча (по имени) с подходящей схемой.

DDF-тексты взяты из официального открытого набора определений L2disasm/l2asm (H5pt) — те же,
что использовались при восстановлении и проверке формата ASCF/UNICODE (см. ddf_parser.py).
Из полного набора (89 DDF) исключены файлы, использующие пока не поддерживаемые парсером
сложные типы MTX/MTX2/MTX3/MAT/MAT2 или условные поля ENBBY: armorgrp, etcitemgrp, recipe-c,
vehiclepartsgrp, npcgrp, weapongrp, mantleexception. Остальные 74 файла проверены на
реальных данных (byte-perfect roundtrip disassemble+assemble) и полностью поддерживаются.
'''
import re

from ddf_parser import parse_ddf


_DDF_TEXTS = {
    'additionalitemgrp': '''
{
	UINT id;
	UINT has_ani;
	INT unk;
	UINT include_item[10];
	INT max_energy;
}
''',
    'dbdropdata': '''
{
	UINT npc_id;
	UINT item_id;
	UINT min;
	UINT max;
	FLOAT chance;
}
''',
    'dbitemdata': '''
{
	UINT ItemId;
	ASCF Html;
}
''',
    'dbnpcdata': '''
{
	UINT NpcId;
	UINT Level;
	UINT Hp;
	UINT Mp;
	UINT Exp;
	UINT Sp;
	UINT PAtk;
	UINT PDef;
	UINT MAtk;
	UINT MDef;
	UINT HuntingZoneId;
	FLOAT Scale;
	INT OffsetX;
	INT OffsetY;
	INT CameraDist;
	INT CameraPitch;
	INT CameraYaw;
	INT RotationRate;
	INT SkillID;
}
''',
    'dbspoildata': '''
{
	UINT npc_id;
	UINT item_id;
	UINT min;
	UINT max;
	FLOAT chance;
}
''',
    'dailyquests': '''
{
	UINT id;
	ASCF name;
	ASCF desc;
	ASCF period;
}
''',
    'gradedata': '''
{
	UINT grade_id;
	ASCF texture_name;
	UINT texture_width;
	UINT texture_height;
}
''',
    'helpdata': '''
{
	UINT ID;
	ASCF Name;
	UINT StringID;
	UINT CategoryCount;
}
''',
    'lifestonedata': '''
{
	UINT id;
	UINT type;
	ASCF name;
	ASCF success_message;
	ASCF icon;
	CNTR option_ids;
	UINT  option_id[option_ids];
}
''',
    'productname': '''
{
	UINT id;
	UNICODE name;
	ASCF str;
	UNICODE icon;
}
''',
    'radardata': '''
{
	UINT zone_id;
	INT zone_x;
	INT zone_y;
	FLOAT zoom;
	INT map_x;
	INT map_y;
	ASCF map_tex;
}
''',
    'radarnpcdata': '''
{
	UINT npc_id;
	ASCF npc_icon;
}
''',
    'radiodata': '''
{
	ASCF name;
	ASCF url_addr;
}
''',
    'serveroptions': '''
{
	UINT server_id;
	UCHAR use_classic_list;
	UCHAR disable_gracia_map;
	UCHAR disable_attribute;
	UCHAR disable_kamael;
	UCHAR disable_vitality;
	UCHAR disable_cursed_weapons;
	UCHAR disable_fortress;
	UCHAR disable_territory_war;
	UCHAR disable_navit;
}
''',
    'skilltypedata': '''
{
	UINT skill_id;
	UINT skill_level;
	UINT skill_op_type;
}
''',
    'actionname': '''
{
	UINT tag;
	UINT id;
	INT  type;
	UINT category;
	CNTR cat2_cnt;
	INT  c[cat2_cnt];
	ASCF name;
	ASCF icon;
	ASCF desc;
	UNICODE cmd;
}
''',
    'actionnamepatch': '''
{
	UINT tag;
	UINT id;
	INT  type;
	UINT category;
	CNTR cat2_cnt;
	INT  c[cat2_cnt];
	ASCF name;
	ASCF icon;
	ASCF desc;
	UNICODE cmd;
}
''',
    'additionaleffect': '''
{
	UINT item_id;
	ASCF effect;
	UNICODE bone;
	UINT use_params;
	
	UNICODE mfighter_bone;
	FLOAT mfighter_loc_x;
	FLOAT mfighter_loc_y;
	FLOAT mfighter_loc_z;
	INT mfighter_rot_p;
	INT mfighter_rot_y;
	INT mfighter_rot_r;
	FLOAT mfighter_scale;
	
	UNICODE ffighter_bone;
	FLOAT ffighter_loc_x;
	FLOAT ffighter_loc_y;
	FLOAT ffighter_loc_z;
	INT ffighter_rot_p;
	INT ffighter_rot_y;
	INT ffighter_rot_r;
	FLOAT ffighter_scale;
	
	UNICODE mdarkelf_bone;
	FLOAT mdarkelf_loc_x;
	FLOAT mdarkelf_loc_y;
	FLOAT mdarkelf_loc_z;
	INT mdarkelf_rot_p;
	INT mdarkelf_rot_y;
	INT mdarkelf_rot_r;
	FLOAT mdarkelf_scale;
	
	UNICODE fdarkelf_bone;
	FLOAT fdarkelf_loc_x;
	FLOAT fdarkelf_loc_y;
	FLOAT fdarkelf_loc_z;
	INT fdarkelf_rot_p;
	INT fdarkelf_rot_y;
	INT fdarkelf_rot_r;
	FLOAT fdarkelf_scale;
	
	UNICODE mdwarf_bone;
	FLOAT mdwarf_loc_x;
	FLOAT mdwarf_loc_y;
	FLOAT mdwarf_loc_z;
	INT mdwarf_rot_p;
	INT mdwarf_rot_y;
	INT mdwarf_rot_r;
	FLOAT mdwarf_scale;
	
	UNICODE fdwarf_bone;
	FLOAT fdwarf_loc_x;
	FLOAT fdwarf_loc_y;
	FLOAT fdwarf_loc_z;
	INT fdwarf_rot_p;
	INT fdwarf_rot_y;
	INT fdwarf_rot_r;
	FLOAT fdwarf_scale;
	
	UNICODE melf_bone;
	FLOAT melf_loc_x;
	FLOAT melf_loc_y;
	FLOAT melf_loc_z;
	INT melf_rot_p;
	INT melf_rot_y;
	INT melf_rot_r;
	FLOAT melf_scale;
	
	UNICODE felf_bone;
	FLOAT felf_loc_x;
	FLOAT felf_loc_y;
	FLOAT felf_loc_z;
	INT felf_rot_p;
	INT felf_rot_y;
	INT felf_rot_r;
	FLOAT felf_scale;
	
	UNICODE mmagic_bone;
	FLOAT mmagic_loc_x;
	FLOAT mmagic_loc_y;
	FLOAT mmagic_loc_z;
	INT mmagic_rot_p;
	INT mmagic_rot_y;
	INT mmagic_rot_r;
	FLOAT mmagic_scale;
	
	UNICODE fmagic_bone;
	FLOAT fmagic_loc_x;
	FLOAT fmagic_loc_y;
	FLOAT fmagic_loc_z;
	INT fmagic_rot_p;
	INT fmagic_rot_y;
	INT fmagic_rot_r;
	FLOAT fmagic_scale;
	
	UNICODE morc_bone;
	FLOAT morc_loc_x;
	FLOAT morc_loc_y;
	FLOAT morc_loc_z;
	INT morc_rot_p;
	INT morc_rot_y;
	INT morc_rot_r;
	FLOAT morc_scale;
	
	UNICODE forc_bone;
	FLOAT forc_loc_x;
	FLOAT forc_loc_y;
	FLOAT forc_loc_z;
	INT forc_rot_p;
	INT forc_rot_y;
	INT forc_rot_r;
	FLOAT forc_scale;
	
	UNICODE mshaman_bone;
	FLOAT mshaman_loc_x;
	FLOAT mshaman_loc_y;
	FLOAT mshaman_loc_z;
	INT mshaman_rot_p;
	INT mshaman_rot_y;
	INT mshaman_rot_r;
	FLOAT mshaman_scale;
	
	UNICODE fshaman_bone;
	FLOAT fshaman_loc_x;
	FLOAT fshaman_loc_y;
	FLOAT fshaman_loc_z;
	INT fshaman_rot_p;
	INT fshaman_rot_y;
	INT fshaman_rot_r;
	FLOAT fshaman_scale;
	
	UNICODE mkamael_bone;
	FLOAT mkamael_loc_x;
	FLOAT mkamael_loc_y;
	FLOAT mkamael_loc_z;
	INT mkamael_rot_p;
	INT mkamael_rot_y;
	INT mkamael_rot_r;
	FLOAT mkamael_scale;
	
	UNICODE fkamael_bone;
	FLOAT fkamael_loc_x;
	FLOAT fkamael_loc_y;
	FLOAT fkamael_loc_z;
	INT fkamael_rot_p;
	INT fkamael_rot_y;
	INT fkamael_rot_r;
	FLOAT fkamael_scale;
}
''',
    'britemgrp': '''
{
	UINT ID;
	UINT int1;
	UINT int2;
	UNICODE name;
	UINT IDconn;
	UINT vals[9];
	INT tail;
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
	ASCF extra1;
	ASCF extra2;
	ASCF extra3;
	ASCF extra4;
}
''',
    'charcreategrp': '''
{
	FLOAT PosX;
    FLOAT PosY;
    FLOAT PosZ;
    FLOAT Yaw;
	INT Chest;
	INT Legs;
	INT Gloves;
	INT Feet;
	INT Weapon;
	INT Shield;
}
''',
    'chargrp': '''
{
	UNICODE hair_tab[300];	//WTF !?
	UINT cnt_fm;
	UNICODE face_mesh[cnt_fm];
	UINT cnt_ft;
	UNICODE face_tex[cnt_ft];

	FILLER void_1{360};

	UINT cnt_gm;
	UNICODE glove_mesh[cnt_gm];
	UINT cnt_gt;
	UNICODE glove_tex[cnt_gt];
	UINT cnt_gma;
	UNICODE glove_mesh_add[cnt_gma];
	UINT cnt_gta;
	UNICODE glove_tex_add[cnt_gta];
	CNTR cnt_gtb;
	UCHAR glove_tab_byte[cnt_gtb];
	CNTR cnt_gtd;
	UCHAR glove_tab_byte[cnt_gtd];

	UINT cnt_um;
	UNICODE upper_mesh[cnt_um];
	UINT cnt_ut;
	UNICODE upper_tex[cnt_ut];
	UINT cnt_uma;
	UNICODE upper_mesh_add[cnt_uma];
	UINT cnt_uta;
	UNICODE upper_tex_add[cnt_uta];
	CNTR cnt_utb;
	UCHAR upper_tab_byte[cnt_utb];
	CNTR cnt_utd;
	UCHAR upper_tab_byte[cnt_utd];

	UINT cnt_lm;
	UNICODE lower_mesh[cnt_lm];
	UINT cnt_lt;
	UNICODE lower_tex[cnt_lt];
	UINT cnt_lma;
	UNICODE lower_mesh_add[cnt_lma];
	UINT cnt_lta;
	UNICODE lower_tex_add[cnt_lta];
	CNTR cnt_ltb;
	UCHAR lower_tab_byte[cnt_ltb];
	CNTR cnt_ltd;
	UCHAR lower_tab_byte[cnt_ltd];

	UINT cnt_bm;
	UNICODE boot_mesh[cnt_bm];
	UINT cnt_bt;
	UNICODE boot_tex[cnt_bt];
	UINT cnt_bma;
	UNICODE boot_mesh_add[cnt_bma];
	UINT cnt_bta;
	UNICODE boot_tex_add[cnt_bta];
	CNTR cnt_btb;
	UCHAR boot_tab_byte[cnt_btb];
	CNTR cnt_btd;
	UCHAR boot_tab_byte[cnt_btd];

	FILLER void_2{90};	//Magic #2

	UNICODE attack_eff;
	UINT walkanimframe?;
	UINT cnt_att;
	UINT cnt_def;
	UINT cnt_dmg;
	UNICODE snd_att[cnt_att];
	UNICODE snd_def[cnt_def];
	UNICODE snd_dmg[cnt_dmg];

	UINT cntha;
	UNICODE voice_snd_hand[cntha];
	UINT cnt1h;
	UNICODE voice_snd_1hs[cnt1h];
	UINT cnt2h;
	UNICODE voice_snd_2hs[cnt2h];
	UINT cntd;
	UNICODE voice_snd_dual[cntd];
	UINT cntp;
	UNICODE voice_snd_pole[cntp];

//always 1,0,0, except last row


	UINT cntr1;	//wild guess
	UNICODE voice_snd_reserve1[cntr1];	//wild guess
	UINT cntr2;	//wild guess
	UNICODE voice_snd_reserve2[cntr2];	//wild guess

//	UINT wtf_1;
//	UINT wtf_1[3];

//--always 1,0,0

	UINT cntr3;	//wild guess
	UNICODE voice_snd_reserve3[cntr3];	//wild guess

	UINT cntr4;	//wild guess
	UNICODE voice_snd_reserve4[cntr4];	//wild guess

	UINT cntr5;	//wild guess
	UNICODE voice_snd_reserve5[cntr5];	//wild guess

	UINT cntr6;	//wild guess
	UNICODE voice_snd_reserve6[cntr6];	//wild guess

	UINT final;

	ASCF name;
	INT UNK[3];

	UINT cntp1;
	UNICODE p1[cntp1];
	UINT cntp2;
	UNICODE p2[cntp2];

}
''',
    'classinfo': '''
{
	UINT id;
	ASCF name;
}
''',
    'clientdata': '''
{
	UINT id;
	ASCF desc;
}
''',
    'commandname': '''
{
	UINT nbr;
	INT id;
	ASCF name;
}
''',
    'commandnamepatch': '''
{
	UINT nbr;
	INT id;
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
    'disableskillanimdata': '''
{
	UINT id;
}
''',
    'entereventgrp': '''
{
	UINT id;
	CHAR UNK_0;	//may be empty ASCF as well...
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
	ASCF fin1;
	ASCF fin2;
	ASCF fin3;
}
''',
    'exceptionminimapdata': '''
{
	UINT location_id;
	ASCF location_name;
	INT max_x;
	INT min_x;
	INT max_y;
	INT min_y;
	INT max_z;
	INT min_z;
	INT seen_x;
	INT seen_y;
}
''',
    'gametip': '''
{
	UINT id;
	UINT int1;
	UINT int2;
	UINT enable_?;
	ASCF tip;
}
''',
    'goodsicon': '''
{
	UINT id;
	UNICODE icon;
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
    'huntingzone': '''
{
	UINT id;
	UINT hunting_type;
	UINT level;
	UINT unk_1;
	FLOAT loc_x;
	FLOAT loc_y;
	FLOAT loc_z;
	ASCF extra;
	UINT affiliated_area_id;
	ASCF name;
}
''',
    'idcname': '''
{
	UINT server_id;
	UINT tag_?;
	ASCF server_name;
	ASCF server_desc;	//probably, or just a reserved byte
}
''',
    'instantzonedata': '''
{
	UINT id;
	ASCF name;
}
''',
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

//   UINT unk1[2];
   CHEX unk1[9];
   UINT special_enchant_amount; 
   ASCF special_enchant_desc; 
   UINT unk2;
}
''',
    'itemname_classic': '''
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

//   UINT unk1[2];
   CHEX unk1[9];
   UINT special_enchant_amount; 
   ASCF special_enchant_desc; 
   UINT unk2;
}
''',
    'l2gamedatabase': '''
{
	UINT id;
	ASCF data;
}
''',
    'logongrp': '''
{
	FLOAT x;
	FLOAT y;
	FLOAT z;
	FLOAT yaw;
}
''',
    'macropreset': '''
{
	UINT ID;
	ASCF Name;
	ASCF IconName;
	ASCF IconTextureName;
	ASCF Description;
	ASCF PresetDescription;
	ASCF Command0;
	ASCF Command1;
	ASCF Command2;
	ASCF Command3;
	ASCF Command4;
	ASCF Command5;
	ASCF Command6;
	ASCF Command7;
	ASCF Command8;
	ASCF Command9;
	ASCF Command10;
	ASCF Command11;
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
    'npcstring': '''
{
	UINT id;
	ASCF string;
}
''',
    'obscene': '''
{
	UINT id;
	ASCF text;
}
''',
    'optiondata_client': '''
{
	UINT option_id; 
	UINT option_quality; 
	UINT option_type; 
	ASCF option_desc1; 
	ASCF option_desc2; 
	ASCF option_desc3; 
}
''',
    'posteffectdata': '''
{
	UINT effect_id;
	UNICODE effect_name;
	UINT effect_sort;
	UINT effect_play_type;
	FLOAT play_time;
	UINT effect_fix;
	FLOAT effect_cor1_factor1;
	FLOAT effect_cor1_factor2;
	FLOAT effect_cor1_factor3;
	FLOAT effect_cor2_factor1;
	FLOAT effect_cor2_factor2;
	FLOAT effect_cor2_factor3;
	UINT effect_reservefactor1;
	UINT effect_reservefactor2;
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
   CNTR cnt1;            //num of items to get 
   INT items[cnt1];         //list of items to get by item_id 
   CNTR cnt2;            //count of the items from cnt1 (should be same as cnt1) 
   INT num_items[cnt2];      //num of each coressponding item (0 = infinity) 

   FLOAT quest_x;         //x coord of current "pin" on map 
   FLOAT quest_y;         //y coord of current "pin" on map 
   FLOAT quest_z;         //z coord of current "pin" on map 

   UINT lvl_min;         //lvl req to start quest 
   UINT lvl_max;         //recommended lvl max 
   UINT quest_type;         //0 = quests that lead to rewards (varka, summoning rb, coin quest, etc), 1 = quests that lead to special items (lures, wedding dress), 2 = repeatable, 3 = one time 

/*
	questname-e seems a lil bugged with 6 above values in ~7 rows
*/

   ASCF entity_name;         // 
   UINT get_item_in_quest;      //1 = get item in quest part, 0 = no item obtained in quest 
   UINT UNK_1;            //1 = same tab stack, 0 = end of stack (ex: |11110|10| if ur in the 2nd stack id 6 or 7 in quest prog |12345|67| the displayed stack would be |167| in the display) 
   UINT UNK_2;            //no clue 
   UINT contact_npc_id;      //who starts the quest 
   FLOAT contact_npc_x;      //start quest x_loc 
   FLOAT contact_npc_y;      //start quest x_loc 
   FLOAT contact_npc_z;      //start quest x_loc 
   ASCF restricions;         //can be race or quest pre-reqs 
   ASCF short_description; 
   CNTR cnt3;            //race restriction count 
   INT req_class[cnt3];      //id of class that can do quest 
   CNTR cnt4;            //item quest restriction start count 
   INT req_item[cnt4];      //id of items needed to do quest 
   UINT clan_pet_quest;      //0 = reg quest, 1 = pet/clan quest 
   UINT req_quest_complete;   //id of quest that must be completed first 
   UINT UNK_3;            //unknown all 0 
   UINT area_id;         //area id (goddard, rune, giran, etc) 
   UINT UNK_4;
   CNTR cnt5;
   INT tab5[cnt5];
   CNTR cnt6;
   INT tab6[cnt6];
   CNTR cnt7;
   INT tab7[cnt7];
}
''',
    'raiddata': '''
{ 
   UINT id; 
   UINT npc_id; 
   UINT npc_level; 
   UINT affiliated_area_id; 
   FLOAT loc_x; 
   FLOAT loc_y; 
   FLOAT loc_z; 
   ASCF raid_desc; 
}
''',
    'ridedata': '''
{
	UINT Type;
	UINT NpcId;
	UNICODE Bone;
	FLOAT mfighter_loc_x;
	FLOAT mfighter_loc_y;
	FLOAT mfighter_loc_z;
	FLOAT ffighter_loc_x;
	FLOAT ffighter_loc_y;
	FLOAT ffighter_loc_z;
	FLOAT mmagic_loc_x;
	FLOAT mmagic_loc_y;
	FLOAT mmagic_loc_z;
	FLOAT fmagic_loc_x;
	FLOAT fmagic_loc_y;
	FLOAT fmagic_loc_z;
	FLOAT melf_loc_x;
	FLOAT melf_loc_y;
	FLOAT melf_loc_z;
	FLOAT felf_loc_x;
	FLOAT felf_loc_y;
	FLOAT felf_loc_z;
	FLOAT mdarkelf_loc_x;
	FLOAT mdarkelf_loc_y;
	FLOAT mdarkelf_loc_z;
	FLOAT fdarkelf_loc_x;
	FLOAT fdarkelf_loc_y;
	FLOAT fdarkelf_loc_z;
	FLOAT mdwarf_loc_x;
	FLOAT mdwarf_loc_y;
	FLOAT mdwarf_loc_z;
	FLOAT fdwarf_loc_x;
	FLOAT fdwarf_loc_y;
	FLOAT fdwarf_loc_z;
	FLOAT morc_loc_x;
	FLOAT morc_loc_y;
	FLOAT morc_loc_z;
	FLOAT forc_loc_x;
	FLOAT forc_loc_y;
	FLOAT forc_loc_z;
	FLOAT mshaman_loc_x;
	FLOAT mshaman_loc_y;
	FLOAT mshaman_loc_z;
	FLOAT fshaman_loc_x;
	FLOAT fshaman_loc_y;
	FLOAT fshaman_loc_z;
	FLOAT mkamael_loc_x;
	FLOAT mkamael_loc_y;
	FLOAT mkamael_loc_z;
	FLOAT fkamael_loc_x;
	FLOAT fkamael_loc_y;
	FLOAT fkamael_loc_z;
	FLOAT empty_loc_x;
	FLOAT empty_loc_y;
	FLOAT empty_loc_z;
	INT mfighter_rot_Pitch;
	INT mfighter_rot_Yaw;
	INT mfighter_rot_Roll;
	INT ffighter_rot_Pitch;
	INT ffighter_rot_Yaw;
	INT ffighter_rot_Roll;
	INT mmagic_rot_Pitch;
	INT mmagic_rot_Yaw;
	INT mmagic_rot_Roll;
	INT fmagic_rot_Pitch;
	INT fmagic_rot_Yaw;
	INT fmagic_rot_Roll;
	INT melf_rot_Pitch;
	INT melf_rot_Yaw;
	INT melf_rot_Roll;
	INT felf_rot_Pitch;
	INT felf_rot_Yaw;
	INT felf_rot_Roll;
	INT mdarkelf_rot_Pitch;
	INT mdarkelf_rot_Yaw;
	INT mdarkelf_rot_Roll;
	INT fdarkelf_rot_Pitch;
	INT fdarkelf_rot_Yaw;
	INT fdarkelf_rot_Roll;
	INT mdwarf_rot_Pitch;
	INT mdwarf_rot_Yaw;
	INT mdwarf_rot_Roll;
	INT fdwarf_rot_Pitch;
	INT fdwarf_rot_Yaw;
	INT fdwarf_rot_Roll;
	INT morc_rot_Pitch;
	INT morc_rot_Yaw;
	INT morc_rot_Roll;
	INT forc_rot_Pitch;
	INT forc_rot_Yaw;
	INT forc_rot_Roll;
	INT mshaman_rot_Pitch;
	INT mshaman_rot_Yaw;
	INT mshaman_rot_Roll;
	INT fshaman_rot_Pitch;
	INT fshaman_rot_Yaw;
	INT fshaman_rot_Roll;
	INT mkamael_rot_Pitch;
	INT mkamael_rot_Yaw;
	INT mkamael_rot_Roll;
	INT fkamael_rot_Pitch;
	INT fkamael_rot_Yaw;
	INT fkamael_rot_Roll;
	INT empty_rot_Pitch;
	INT empty_rot_Yaw;
	INT empty_rot_Roll;
	FLOAT NameOffset[17];
	//FLOAT floats[119];
}
''',
    'sceneplayerdata': '''
{
	UINT id;
	UNICODE str;
	FLOAT dat;
}
''',
    'servername': '''
{
	UINT server_id;
	UINT tag_?;
	ASCF server_name;
	ASCF server_desc;	//probably, or just a reserved byte
}
''',
    'shortcutalias': '''
{
	UINT id;
	ASCF name;
//	CHEX val1[4];
//	CHEX val2[4];
	UINT SysStringId;
	UINT SystemMsgId;
}
''',
    'skillgrp': '''
{
	UINT skill_id;
	UINT skill_level;
	UINT icon_type;
	UINT operate_type;
	INT mp_consume;
	INT cast_range;
	UINT cast_style;
	FLOAT hit_time;
	INT is_magic;
	UNICODE ani_char;
	UNICODE desc;
	UNICODE icon_name;
	UNICODE icon_name2;
	UINT is_debuff;
	UINT Enchanted;
	UINT EnchantSkillLevel;
	ASCF nonetext1;
	INT hp_consume;
	INT rumble_self;
	INT rumble_target;
	INT UNK_1;
	ASCF nonetext2;
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
    'skillname_classic': '''
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
	UNICODE mkamael_sub;
	UNICODE fkamael_sub;
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
	UNICODE mkamael_throw;
	UNICODE fkamael_throw;
	UNICODE mextra_throw;
	UNICODE fextra_throw;
	FLOAT sound_vol;
	FLOAT sound_rad;
}
''',
    'skillsoundsource': '''
{
	UINT id;
	UINT shit[9];
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
    'sysstring_classic': '''
{
	UINT id;
	ASCF name;
}
''',
    'sysstringpatch': '''
{
	UINT id;
	ASCF name;
}
''',
    'systemmsg': '''
{
	UINT id;
	UINT UNK_0;
	ASCF SysMsg;
	UINT type;
	CHEX ColorR;
	CHEX ColorG;
	CHEX ColorB;
	CHEX ColorA;
	ASCF Sound;
	ASCF Voice;
	UINT WindowType;
	UINT FontType;
	UINT LifeTime;
	UINT AnimationType;
	UINT BackgroundType;
	ASCF OnScrMsg;
	ASCF Group;
}
''',
    'systemmsg_classic': '''
{
	UINT id;
	UINT UNK_0;
	ASCF message;
	UINT group;
	CHEX rgba[4];
	ASCF item_sound;
	ASCF sys_msg_ref;
	UINT UNK_1[5];
	ASCF sub_msg;
	ASCF type;
}
''',
    'systemmsgpatch': '''
{
	UINT id;
	UINT UNK_0;
	ASCF SysMsg;
	UINT type;
	CHEX ColorR;
	CHEX ColorG;
	CHEX ColorB;
	CHEX ColorA;
	ASCF Sound;
	ASCF Voice;
	UINT WindowType;
	UINT FontType;
	UINT LifeTime;
	UINT AnimationType;
	UINT BackgroundType;
	ASCF OnScrMsg;
	ASCF Group;
}
''',
    'transformdata': '''
{
	UINT id;
	UINT gender;
	UINT npc_id;
	UINT weapon_id;
	UNICODE transform_effect_name;
	UNICODE return_effect_name;
	UINT transform_type;
	FLOAT character_scale;
	UINT character_offset_x;
	UINT character_offset_y;
}
''',
    'variationeffectgrp': '''
{
	UINT int1;
	UINT int2;
	UINT int3;
	UINT int4;
	UINT int5;
	UNICODE effect;
	ASCF attribute;
}
''',
    'warningnotice': '''
{
	ASCF Notice;
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
	INT coords?[6];
	FLOAT unk02;
	ASCF map;
	UINT dupa;
}
''',
    'zonename_classic': '''
{
	UINT nbr;
	UINT zone_color_id;
	UINT x_world_grid;
	UINT y_world_grid;

	FLOAT top_z;
	FLOAT bottom_z;
	ASCF zone_name;
	INT coords?[6];
	FLOAT unk02;
	ASCF map;
	UINT dupa;
}
''',
}

# Человекочитаемые названия полей (для фронтенда) — какие поля показывать как редактируемый
# текст (все ASCF/UNICODE не-табличные поля из схемы), а какие как служебные (id/индексы/числа).
_EDITABLE_TEXT_FIELDS = {
    'additionalitemgrp': [],
    'dbdropdata': [],
    'dbitemdata': ['Html'],
    'dbnpcdata': [],
    'dbspoildata': [],
    'dailyquests': ['name', 'desc', 'period'],
    'gradedata': ['texture_name'],
    'helpdata': ['Name'],
    'lifestonedata': ['name', 'success_message', 'icon'],
    'productname': ['name', 'str', 'icon'],
    'radardata': ['map_tex'],
    'radarnpcdata': ['npc_icon'],
    'radiodata': ['name', 'url_addr'],
    'serveroptions': [],
    'skilltypedata': [],
    'actionname': ['name', 'icon', 'desc', 'cmd'],
    'actionnamepatch': ['name', 'icon', 'desc', 'cmd'],
    'additionaleffect': ['effect', 'bone', 'mfighter_bone', 'ffighter_bone', 'mdarkelf_bone', 'fdarkelf_bone', 'mdwarf_bone', 'fdwarf_bone', 'melf_bone', 'felf_bone', 'mmagic_bone', 'fmagic_bone', 'morc_bone', 'forc_bone', 'mshaman_bone', 'fshaman_bone', 'mkamael_bone', 'fkamael_bone'],
    'britemgrp': ['name'],
    'castlename': ['castle_name', 'location', 'desc', 'extra1', 'extra2', 'extra3', 'extra4'],
    'charcreategrp': [],
    'chargrp': ['attack_eff', 'name'],
    'classinfo': ['name'],
    'clientdata': ['desc'],
    'commandname': ['name'],
    'commandnamepatch': ['name'],
    'creditgrp': ['html', 'image'],
    'disableskillanimdata': [],
    'entereventgrp': ['skill_sound', 'effect_name', 'anim_name'],
    'eula': ['eula', 'fin1', 'fin2', 'fin3'],
    'exceptionminimapdata': ['location_name'],
    'gametip': ['tip'],
    'goodsicon': ['icon'],
    'hairaccessorylocgrp': ['name'],
    'hennagrp': ['name', 'icon', 'symbol_add_name', 'symbol_add_desc'],
    'huntingzone': ['extra', 'name'],
    'idcname': ['server_name', 'server_desc'],
    'instantzonedata': ['name'],
    'itemname': ['name', 'add_name', 'description', 'set_bonus_desc', 'set_extra_desc', 'special_enchant_desc'],
    'itemname_classic': ['name', 'add_name', 'description', 'set_bonus_desc', 'set_extra_desc', 'special_enchant_desc'],
    'l2gamedatabase': ['data'],
    'logongrp': [],
    'macropreset': ['Name', 'IconName', 'IconTextureName', 'Description', 'PresetDescription', 'Command0', 'Command1', 'Command2', 'Command3', 'Command4', 'Command5', 'Command6', 'Command7', 'Command8', 'Command9', 'Command10', 'Command11'],
    'mobskillanimgrp': ['seq_name', 'skill_name', 'npc_name', 'npc_class'],
    'musicinfo': [],
    'npcname': ['name', 'description'],
    'npcstring': ['string'],
    'obscene': ['text'],
    'optiondata_client': ['option_desc1', 'option_desc2', 'option_desc3'],
    'posteffectdata': ['effect_name'],
    'questname': ['main_name', 'prog_name', 'description', 'entity_name', 'restricions', 'short_description'],
    'raiddata': ['raid_desc'],
    'ridedata': ['Bone'],
    'sceneplayerdata': ['str'],
    'servername': ['server_name', 'server_desc'],
    'shortcutalias': ['name'],
    'skillgrp': ['ani_char', 'desc', 'icon_name', 'icon_name2', 'nonetext1', 'nonetext2'],
    'skillname': ['name', 'description', 'desc_add1', 'desc_add2'],
    'skillname_classic': ['name', 'description', 'desc_add1', 'desc_add2'],
    'skillsoundgrp': ['spelleffect_sound_1', 'spelleffect_sound_2', 'spelleffect_sound_3', 'shoteffect_sound_1', 'shoteffect_sound_2', 'shoteffect_sound_3', 'expeffect_sound_1', 'expeffect_sound_2', 'expeffect_sound_3', 'mfighter_sub', 'ffighter_sub', 'mdarkelf_sub', 'fdarkelf_sub', 'mdwarf_sub', 'fdwarf_sub', 'melf_sub', 'felf_sub', 'mmagic_sub', 'fmagic_sub', 'morc_sub', 'forc_sub', 'mshaman_sub', 'fshaman_sub', 'mkamael_sub', 'fkamael_sub', 'mfighter_throw', 'ffighter_throw', 'mdarkelf_throw', 'fdarkelf_throw', 'mdwarf_throw', 'fdwarf_throw', 'melf_throw', 'felf_throw', 'mmagic_throw', 'fmagic_throw', 'morc_throw', 'forc_throw', 'mshaman_throw', 'fshaman_throw', 'mkamael_throw', 'fkamael_throw', 'mextra_throw', 'fextra_throw'],
    'skillsoundsource': [],
    'staticobject': ['name'],
    'symbolname': ['filename', 'alias'],
    'sysstring': ['name'],
    'sysstring_classic': ['name'],
    'sysstringpatch': ['name'],
    'systemmsg': ['SysMsg', 'Sound', 'Voice', 'OnScrMsg', 'Group'],
    'systemmsg_classic': ['message', 'item_sound', 'sys_msg_ref', 'sub_msg', 'type'],
    'systemmsgpatch': ['SysMsg', 'Sound', 'Voice', 'OnScrMsg', 'Group'],
    'transformdata': ['transform_effect_name', 'return_effect_name'],
    'variationeffectgrp': ['effect', 'attribute'],
    'warningnotice': ['Notice'],
    'zonename': ['zone_name', 'map'],
    'zonename_classic': ['zone_name', 'map'],
}

# Поля, образующие УНИКАЛЬНЫЙ идентификатор записи — используется для защиты от создания
# дубликатов (см. index.py, action ddf_create/ddf_save_raw). Список из 1 поля — простой id (не
# может повторяться ни у одной другой записи файла); список из 2+ полей — составной ключ (по
# механике игры допустимо повторение id ПЕРВОГО поля, но не всей комбинации сразу — например
# skillname: один и тот же skill id встречается много раз с разными level, но пара (id, level)
# должна быть уникальна). Схема отсутствует в словаре ИЛИ имеет пустой список — значит у неё нет
# осмысленного понятия "уникальный id" (например только служебные/координатные FLOAT-поля без
# единого идентификатора) — проверка на дубликаты для таких схем не выполняется вообще.
#
# Для полей вида "tag"/"nbr" — это НЕ идентификатор, а служебное поле (часто константа, например
# tag=1 у всех записей actionname, или последовательный индекс nbr в castlename/zonename,
# СОВПАДАЮЩИЙ с порядковым номером записи в файле, а не смысловой id) — в ключ не включается.
_ID_FIELDS = {
    'actionname': ['id'],
    'actionnamepatch': ['id'],
    'additionaleffect': ['item_id'],
    'additionalitemgrp': ['id'],
    'britemgrp': ['ID'],
    'castlename': ['id'],
    'classinfo': ['id'],
    'clientdata': ['id'],
    'commandname': ['id'],
    'commandnamepatch': ['id'],
    'creditgrp': ['id'],
    'dailyquests': ['id'],
    # npc_id+item_id — один моб дропает много разных предметов (item_id разный), но одна и та же
    # пара npc+item не должна повторяться дважды с разными шансами/диапазонами.
    'dbdropdata': ['npc_id', 'item_id'],
    'dbitemdata': ['ItemId'],
    'dbnpcdata': ['NpcId'],
    'dbspoildata': ['npc_id', 'item_id'],
    'disableskillanimdata': ['id'],
    'entereventgrp': ['id'],
    'exceptionminimapdata': ['location_id'],
    'gametip': ['id'],
    'goodsicon': ['id'],
    'gradedata': ['grade_id'],
    'helpdata': ['ID'],
    'hennagrp': ['id'],
    'huntingzone': ['id'],
    'idcname': ['server_id'],
    'instantzonedata': ['id'],
    'itemname': ['id'],
    'itemname_classic': ['id'],
    'l2gamedatabase': ['id'],
    'lifestonedata': ['id'],
    'macropreset': ['ID'],
    # Механика игры: один и тот же моб (npc_id) использует НЕСКОЛЬКО разных скиллов (skill_id) —
    # уникальна именно пара, а не сам npc_id.
    'mobskillanimgrp': ['npc_id', 'skill_id'],
    'musicinfo': ['id'],
    'npcname': ['id'],
    'npcstring': ['id'],
    'obscene': ['id'],
    'optiondata_client': ['option_id'],
    'posteffectdata': ['effect_id'],
    'productname': ['id'],
    # Механика игры: один quest_id состоит из НЕСКОЛЬКИХ этапов (quest_prog) — уникальна пара.
    'questname': ['quest_id', 'quest_prog'],
    'radardata': ['zone_id'],
    'radarnpcdata': ['npc_id'],
    'raiddata': ['id'],
    # Type (тип ездового животного) + NpcId — на случай, если один NpcId теоретически мог бы
    # использоваться в нескольких Type-контекстах; составной ключ безопаснее (не блокирует
    # легитимные случаи), чем одиночный NpcId.
    'ridedata': ['Type', 'NpcId'],
    'sceneplayerdata': ['id'],
    'servername': ['server_id'],
    'serveroptions': ['server_id'],
    'shortcutalias': ['id'],
    # Механика игры: один skill_id имеет НЕСКОЛЬКО уровней (skill_level) — уникальна пара.
    'skillgrp': ['skill_id', 'skill_level'],
    'skillname': ['id', 'level'],
    'skillname_classic': ['id', 'level'],
    'skillsoundgrp': ['skill_id', 'skill_level'],
    'skillsoundsource': ['id'],
    'skilltypedata': ['skill_id', 'skill_level'],
    'staticobject': ['id'],
    'symbolname': ['id'],
    'sysstring': ['id'],
    'sysstring_classic': ['id'],
    'sysstringpatch': ['id'],
    'systemmsg': ['id'],
    'systemmsg_classic': ['id'],
    'systemmsgpatch': ['id'],
    # gender различает мужской/женский вариант трансформации — один transform id может иметь
    # отдельные записи на каждый пол.
    'transformdata': ['id', 'gender'],
    'zonename': ['nbr'],
    'zonename_classic': ['nbr'],
}

# Группы полей, которые физически хранят RGB(A)-цвет — либо один массив однобайтовых
# компонент (CHEX rgb[3] / rgba[4]), либо несколько отдельных скалярных CHEX-полей подряд
# (ColorR/ColorG/ColorB/ColorA). Фронтенд показывает такую группу единым color picker'ом
# вместо потерянных "невидимых" полей (массивы раньше не попадали ни в editable, ни в summary —
# см. RESEARCH_NOTES.md, раздел про systemmsg/rgb). 'fields' — имена ФИЗИЧЕСКИ идут в порядке
# B,G,R[,A] (ОБРАТНОМ! несмотря на названия вроде "ColorR" — имена полей в оригинальном DDF
# присвоены по позиции в файле, а не по факту хранимого канала) — подтверждено экспериментально
# сверкой с реальным цветом текста в игровом чате на скриншоте пользователя, см. подробности в
# _ddf_color_hex()/index.py. 'array' — True, если это ОДНО поле-массив (тогда при записи шлём
# весь список одним значением в ddf_save под именем fields[0]), False — если это N отдельных
# скалярных полей (шлём каждое под своим именем).
_COLOR_FIELD_GROUPS = {
    'npcname': {'fields': ['rgb'], 'array': True},
    'systemmsg': {'fields': ['ColorR', 'ColorG', 'ColorB', 'ColorA'], 'array': False},
    'systemmsg_classic': {'fields': ['rgba'], 'array': True},
    'systemmsgpatch': {'fields': ['ColorR', 'ColorG', 'ColorB', 'ColorA'], 'array': False},
}

_FIELDS_CACHE = {}


def _base_key(filename: str):
    '''Приводит имя файла к базовому ключу схемы: убирает расширение и языковой суффикс
    (-e, -ru, -c и т.п.), приводит к нижнему регистру. "ItemName-e.dat" -> "itemname",
    "NpcString-e.dat" -> "npcstring".'''
    name = filename.rsplit('/', 1)[-1]
    name = re.sub(r'\.[a-zA-Z0-9]+$', '', name)  # strip extension
    name = re.sub(r'-[a-zA-Z]{1,3}$', '', name)  # strip language suffix like -e, -ru, -c
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