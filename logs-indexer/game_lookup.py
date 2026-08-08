'''Резолвинг item_id/npc_id/skill_id -> человекочитаемое имя ИЗ ДЕРЕВА ПАТЧЕЙ конкретного сервера
(таблица patch_files, тот же S3 и та же DDF-инфраструктура, что раздел "Патчи"), А НЕ из статичного
снимка настроек — по прямому уточнению пользователя: "settings не расшифровывает item/npc/skill
id, они берутся из itemname-e/skillname-e/npcname-e конкретного сервера в дереве патчей". Только
action_id берётся из статичного справочника backend/logs/reference/action_ids.tsv (это внутренний
код действия сервера, не игровой ресурс — в дереве патчей его нет и быть не может).

ddf_parser.py/ddf_registry.py/ddf_registry_c4.py/l2encdec.py — СКОПИРОВАНЫ из backend/patches/
(backend-функции физически изолированы друг от друга на этой платформе — нет способа импортировать
модуль одной функции из другой, см. backend/logs/RESEARCH_NOTES.md "Важная находка этапа 3").
Копии должны обновляться синхронно с оригиналом в backend/patches/, если там появятся исправления
формата DDF/шифрования, которые влияют на itemname/npcname/skillname схемы.'''
import os

import boto3
from botocore.config import Config

import ddf_parser
import ddf_registry
import ddf_registry_c4
import l2encdec

try:
    _S3_CONFIG = Config(request_checksum_calculation='when_required', response_checksum_validation='when_required')
except TypeError:
    _S3_CONFIG = Config()

# Тот же список C4-серверов, что в backend/patches/index.py DDF_C4_SERVERS — C4 использует
# отдельный (более простой) реестр DDF-схем, см. ddf_registry_c4.py.
DDF_C4_SERVERS = {'c4x1'}

# Схема -> относительный путь файла в дереве патчей (языковой суффикс -e — английская версия,
# та же, что видно в реальных данных patch_files: System/itemname-e.dat и т.п.).
LOOKUP_FILES = {
    'item': 'System/itemname-e.dat',
    'npc': 'System/npcname-e.dat',
    'skill': 'System/skillname-e.dat',
}


def _s3_client():
    # Дефолт указывает на локальный MinIO self-hosted-установки (см. deploy/docker/docker-
    # compose.yml) — эта копия модуля используется ТОЛЬКО индексатором на self-hosted, поэтому
    # (в отличие от backend/logs/game_lookup.py, который может работать и в облаке poehali.dev)
    # облачный адрес здесь не нужен вовсе.
    return boto3.client(
        's3',
        endpoint_url=os.environ.get('S3_ENDPOINT', 'http://127.0.0.1:9000'),
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        config=_S3_CONFIG,
    )


def _bucket():
    return os.environ.get('S3_BUCKET', 'files')


def _registry_for(server):
    return ddf_registry_c4 if server in DDF_C4_SERVERS else ddf_registry


def _load_plain(s3, bucket, schema, cur, server, path):
    '''Возвращает расшифрованное бинарное содержимое .dat файла или None, если он не загружен
    в дерево патчей этого сервера. См. _ddf_load_plain в backend/patches/index.py (тот же принцип,
    упрощённая копия без quirk_bytes — itemname/npcname/skillname их не используют).'''
    cur.execute(
        f"SELECT file_key FROM {schema}.patch_files WHERE server = %s AND path = %s",
        (server, path)
    )
    row = cur.fetchone()
    if not row:
        return None
    file_key = row[0]
    obj = s3.get_object(Bucket=bucket, Key=file_key)
    raw = obj['Body'].read()
    protocol = l2encdec.detect_protocol(raw)
    if protocol is None:
        raise l2encdec.L2CryptError('unknown_protocol')
    return l2encdec.decode(raw, protocol)


# Кэш собранных словарей {(server, kind): {id_str: name}} на время жизни "тёплого" процесса
# функции — расшифровка/разбор itemname-e.dat (~600КБ) или skillname-e.dat (~1МБ, ~8500 записей)
# на каждый запрос была бы избыточно медленной при просмотре многостраничного лога.
_dict_cache = {}


def build_lookup(cur, schema, server, kind):
    '''kind: 'item' | 'npc' | 'skill'. Возвращает dict {str(id): name}, пустой dict если файл ещё
    не загружен в дерево патчей этого сервера (не ошибка — просто резолва не будет, покажем id).
    Для skill (id+level составной ключ в файле) используется ПЕРВОЕ найденное имя для данного id
    (level в логах отдельно не всегда достоверен на всех action, простое приближение для MVP).'''
    cache_key = (server, kind)
    if cache_key in _dict_cache:
        return _dict_cache[cache_key]

    path = LOOKUP_FILES[kind]
    result = {}
    try:
        s3 = _s3_client()
        bucket = _bucket()
        plain = _load_plain(s3, bucket, schema, cur, server, path)
        if plain is not None:
            registry = _registry_for(server)
            match = registry.match_ddf(path)
            if match:
                _key, fields, _editable, has_reccnt_prefix, fixed_record_count, _raw_only = match
                for _idx, row in ddf_parser.iter_records(
                    plain, fields, has_reccnt_prefix=has_reccnt_prefix, fixed_record_count=fixed_record_count
                ):
                    rid = row.get('id')
                    if rid is None:
                        continue
                    name = row.get('name')
                    if name is None:
                        continue
                    key = str(int(rid))
                    if key not in result:
                        result[key] = str(name)
    except Exception as e:
        # Резолвинг — не критичная функция (если дерево патчей повреждено/не загружено, лог всё
        # равно должен показаться с сырыми id) — не роняем весь запрос get_log из-за этого.
        print(f'[logs] game_lookup build_lookup error server={server} kind={kind}: {type(e).__name__}: {e}')
        result = {}

    _dict_cache[cache_key] = result
    return result