-- Настройки лаунчера для заливки файлов патчей на внешний VPS (SFTP) — см. LAUNCHER_UPLOAD.md.
-- Пути на диске сервера лаунчера (не URL) для быстрого и полного обновления: каталог, куда
-- складываются .zip-архивы файлов, и путь к XML-реестру (files.xml), который лаунчер клиента
-- читает, чтобы понять, что и откуда скачивать.
ALTER TABLE servers ADD COLUMN IF NOT EXISTS launcher_fast_dir TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS launcher_fast_xml TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS launcher_full_dir TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS launcher_full_xml TEXT;

-- Факт и версия заливки конкретного файла патчей в fast/full на VPS лаунчера. Хранится отдельно
-- от patch_files, чтобы можно было сравнивать hash файла на момент последней заливки с текущим
-- hash в patch_files и показывать в дереве бейдж "устарело, требуется перезалить" при расхождении.
CREATE TABLE IF NOT EXISTS patch_launcher_uploads (
    id SERIAL PRIMARY KEY,
    server TEXT NOT NULL,
    path TEXT NOT NULL,
    target TEXT NOT NULL CHECK (target IN ('fast', 'full')),
    file_hash TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    uploaded_by INTEGER NULL REFERENCES users(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (server, path, target)
);

CREATE INDEX IF NOT EXISTS idx_patch_launcher_uploads_server ON patch_launcher_uploads(server);
