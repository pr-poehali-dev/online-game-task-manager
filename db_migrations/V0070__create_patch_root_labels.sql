-- Пользовательская видимая подпись для корневой папки дерева "Патчи" (например хочет видеть
-- "system" вместо "System") — ТОЛЬКО отображение в интерфейсе. Реальный путь файла в patch_files
-- (например "System/itemname-e.dat") и путь, который реально уходит в XML-реестр лаунчера при
-- заливке (там регистр УЖЕ приводится к нижнему автоматически через _to_launcher_path), не
-- меняются — иначе переименование потребовало бы перекладывать все файлы в S3 и в БД, что гораздо
-- рискованнее ради чисто визуального удобства. Работает и для фиксированных корней (System,
-- System_eng и т.д.), и для пользовательских (patch_custom_roots).
CREATE TABLE IF NOT EXISTS patch_root_labels (
    server TEXT NOT NULL,
    root_name TEXT NOT NULL,
    label TEXT NOT NULL,
    updated_by INTEGER NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (server, root_name)
);