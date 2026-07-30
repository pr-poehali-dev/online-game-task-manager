CREATE TABLE IF NOT EXISTS patch_file_descriptions (
    id SERIAL PRIMARY KEY,
    -- Ключ сопоставления — нормализованное имя файла/папки (без расширения и языкового суффикса,
    -- в нижнем регистре — та же нормализация, что и describeFile/describeFolder на фронте), либо
    -- полное имя папки. is_folder различает два независимых пространства имён (файл "system" и
    -- папка "system" — разные сущности).
    name_key TEXT NOT NULL,
    is_folder BOOLEAN NOT NULL DEFAULT false,
    description TEXT NOT NULL,
    updated_by INTEGER NOT NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name_key, is_folder)
);