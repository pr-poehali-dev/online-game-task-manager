'''Портированный на Python алгоритм шифрования/дешифрования клиентских файлов Lineage 2
(.dat) на основе открытого проекта open-l2encdec (https://github.com/ritsuwastaken/open-l2encdec,
в свою очередь основанного на l2encdec автора DStuff и L2crypt автора acmi).

Поддерживается протокол 411/412/413/414 (RSA + zlib) — именно он используется в файлах,
загруженных в раздел "Патчи" (заголовок файла "Lineage2VerXXX", последние 20 байт — контрольная
сумма CRC32 в offset 12). Для шифрования (encode) всегда используется единый "современный" ключ
RSA (modern), для расшифровки (decode) тоже используется modern-ключ — именно он подтверждён
как рабочий на реальных .dat файлах проекта (см. tests.json).

Алгоритм на файл:
  header (28 байт, "Lineage2Ver" + 3 цифры протокола, UTF-16LE) +
  RSA-зашифрованные 128-байтные блоки (внутри — zlib-сжатые данные с 4-байтным префиксом
  исходного размера) +
  tail (20 байт, CRC32 всего файла кроме tail — в offset 12, little-endian).
'''
import struct
import zlib

HEADER_PREFIX = "Lineage2Ver"
HEADER_SIZE = 28
TAIL_SIZE = 20
TAIL_CRC32_OFFSET = 12
BLOCK_SIZE = 128
BLOCK_BODY_SIZE = 124

# "Современный" ключ RSA — используется open-l2encdec по умолчанию как для encode, так и для
# decode всех протоколов 411-414. Подтверждено byte-perfect на реальных файлах сервера.
MODERN_RSA_MODULUS = (
    "75b4d6de5c016544068a1acf125869f43d2e09fc55b8b1e289556daf9b8757635593446288b3653"
    "da1ce91c87bb1a5c18f16323495c55d7d72c0890a83f69bfd1fd9434eb1c02f3e4679edfa4330931"
    "9070129c267c85604d87bb65bae205de3707af1d2108881abb567c3b3d069ae67c3a4c6a3aa93d26"
    "413d4c66094ae2039"
)
MODERN_RSA_PUBLIC_EXP = (
    "30b4c2d798d47086145c75063c8e841e719776e400291d7838d3e6c4405b504c6a07f8fca27f32b8"
    "6643d2649d1d5f124cdd0bf272f0909dd7352fe10a77b34d831043d9ae541f8263c6fe3d1c14c2f0"
    "4e43a7253a6dda9a8c1562cbd493c1b631a1957618ad5dfe5ca28553f746e2fc6f2db816c7db223e"
    "c91e955081c1de65"
)
MODERN_RSA_PRIVATE_EXP = "1d"

SUPPORTED_RSA_PROTOCOLS = (411, 412, 413, 414)


class L2CryptError(Exception):
    pass


def _remove_padding(data: bytes) -> bytes:
    '''Убирает RSA-паддинг: каждый 128-байтный блок хранит в 4-м байте длину полезных данных
    (0-124), которые прижаты к концу блока с выравниванием на 4 байта.'''
    out = bytearray()
    usable = len(data) - (len(data) % BLOCK_SIZE)
    for offset in range(0, usable, BLOCK_SIZE):
        block = data[offset:offset + BLOCK_SIZE]
        chunk_size = min(block[3], BLOCK_BODY_SIZE)
        aligned = (chunk_size + 3) & ~3
        data_offset = BLOCK_SIZE - aligned
        if data_offset + chunk_size > BLOCK_SIZE:
            break
        out.extend(block[data_offset:data_offset + chunk_size])
    return bytes(out)


def _add_padding(data: bytes) -> bytes:
    '''Обратная операция: режет данные на куски по 124 байта и упаковывает в 128-байтные блоки
    с 4-байтным заголовком длины и выравниванием на 4 байта.'''
    num_blocks = max(1, (len(data) + BLOCK_BODY_SIZE - 1) // BLOCK_BODY_SIZE)
    out = bytearray(num_blocks * BLOCK_SIZE)
    input_offset = 0
    output_offset = 0
    while input_offset < len(data):
        chunk_size = min(len(data) - input_offset, BLOCK_BODY_SIZE)
        out[output_offset + 3] = chunk_size
        aligned = (chunk_size + 3) & ~3
        data_offset = output_offset + BLOCK_SIZE - aligned
        out[data_offset:data_offset + chunk_size] = data[input_offset:input_offset + chunk_size]
        input_offset += chunk_size
        output_offset += BLOCK_SIZE
    return bytes(out)


def _rsa_apply(data: bytes, modulus_hex: str, exponent_hex: str) -> bytes:
    '''Поблочное модульное возведение в степень (RSA) — эквивалент mbedtls_mpi_exp_mod.'''
    if len(data) % BLOCK_SIZE != 0:
        raise L2CryptError('rsa_block_size_mismatch')
    modulus = int(modulus_hex, 16)
    exponent = int(exponent_hex, 16)
    out = bytearray()
    for offset in range(0, len(data), BLOCK_SIZE):
        block = data[offset:offset + BLOCK_SIZE]
        value = int.from_bytes(block, 'big')
        result = pow(value, exponent, modulus)
        out.extend(result.to_bytes(BLOCK_SIZE, 'big'))
    return bytes(out)


def _zlib_unpack(data: bytes) -> bytes:
    '''Формат: первые 4 байта (little-endian) — размер исходных данных, дальше — обычный
    zlib-поток (deflate с zlib-заголовком).'''
    if len(data) < 4:
        raise L2CryptError('compressed_data_too_short')
    expected_size = struct.unpack('<I', data[:4])[0]
    decompressed = zlib.decompress(data[4:])
    if len(decompressed) != expected_size:
        raise L2CryptError('decompressed_size_mismatch')
    return decompressed


def _zlib_pack(data: bytes) -> bytes:
    size_prefix = struct.pack('<I', len(data))
    co = zlib.compressobj(9)
    compressed = co.compress(data) + co.flush()
    return size_prefix + compressed


def decode(raw: bytes, protocol: int) -> bytes:
    '''Расшифровывает .dat файл (протокол 411-414) в его исходное бинарное содержимое.'''
    if protocol not in SUPPORTED_RSA_PROTOCOLS:
        raise L2CryptError(f'unsupported_protocol_{protocol}')
    if len(raw) < HEADER_SIZE + TAIL_SIZE:
        raise L2CryptError('file_too_short')
    body = raw[HEADER_SIZE:-TAIL_SIZE]
    decrypted = _rsa_apply(body, MODERN_RSA_MODULUS, MODERN_RSA_PRIVATE_EXP)
    unpadded = _remove_padding(decrypted)
    return _zlib_unpack(unpadded)


def encode(plain: bytes, protocol: int) -> bytes:
    '''Шифрует исходное бинарное содержимое обратно в формат .dat файла (протокол 411-414).'''
    if protocol not in SUPPORTED_RSA_PROTOCOLS:
        raise L2CryptError(f'unsupported_protocol_{protocol}')
    compressed = _zlib_pack(plain)
    padded = _add_padding(compressed)
    encrypted = _rsa_apply(padded, MODERN_RSA_MODULUS, MODERN_RSA_PUBLIC_EXP)
    header = (HEADER_PREFIX + str(protocol)).encode('utf-16-le')
    body_with_header = header + encrypted
    crc = zlib.crc32(body_with_header) & 0xffffffff
    tail = bytearray(TAIL_SIZE)
    struct.pack_into('<I', tail, TAIL_CRC32_OFFSET, crc)
    return body_with_header + bytes(tail)


def detect_protocol(raw: bytes) -> int | None:
    '''Пытается определить протокол шифрования по заголовку файла ("Lineage2VerXXX",
    UTF-16LE). Возвращает номер протокола или None, если заголовок не распознан.'''
    if len(raw) < HEADER_SIZE:
        return None
    try:
        header = raw[:HEADER_SIZE].decode('utf-16-le')
    except UnicodeDecodeError:
        return None
    if not header.startswith(HEADER_PREFIX):
        return None
    tail = header[len(HEADER_PREFIX):]
    if not tail.isdigit():
        return None
    return int(tail)
