-- Схема БАЗЫ ЛОГОВ — отдельная PostgreSQL-база данных, которая живёт РЯДОМ с самими файлами
-- логов на вашем хостинге логов (НЕ путать с основной базой проекта ERA Task Manager — это
-- две независимые базы, возможно даже на разных серверах).
--
-- Назначение: разово разобранные строки логов (cached/server/npc) хранятся здесь построчно,
-- чтобы веб-кабинет мог искать по ним мгновенно (SQL по индексам) вместо того, чтобы каждый
-- раз заново скачивать и разбирать файлы по SFTP. Наполняется скриптом indexer.py (см. README.md
-- в этой же папке) — он же следит, какие файлы/строки уже занесены, и дозаписывает только новое.
--
-- Применить один раз при первом развёртывании:
--   psql "postgresql://ЛОГИН:ПАРОЛЬ@localhost:5432/era_logs" -f schema.sql

-- ---------------------------------------------------------------------------------------------
-- Основная таблица: одна строка = одно событие лога.
-- Колонки — прямое отражение полей, которые backend/logs/index.py уже умеет резолвить из сырых
-- CSV-строк (см. backend/logs/RESEARCH_NOTES.md за полным контекстом раскладки полей). Индексатор
-- (indexer.py) обязан заполнять их ТОЙ ЖЕ логикой разбора, что и _parse_log_line в backend/logs/
-- index.py — при обновлении расшифровки полей в index.py не забывайте синхронизировать indexer.py.
CREATE TABLE IF NOT EXISTS logs_events (
    id              BIGSERIAL PRIMARY KEY,
    server          TEXT NOT NULL,          -- id игрового сервера (совпадает с servers.id основной БД проекта)
    log_type        TEXT NOT NULL,          -- 'cached' | 'server' | 'npc'
    event_time      TIMESTAMP NOT NULL,     -- время события ИЗ САМОГО лога (не время индексации)

    action_id       TEXT,
    action_name     TEXT,

    actor           TEXT,
    actor_login     TEXT,
    actor_id        TEXT,
    actor_acc_id    TEXT,
    target          TEXT,
    target_login    TEXT,
    target_id       TEXT,
    target_acc_id   TEXT,

    loc_x           TEXT,
    loc_y           TEXT,
    loc_z           TEXT,

    item_id         TEXT,
    item_name       TEXT,
    item_count      TEXT,
    item_dbid       TEXT,
    item_enchant    TEXT,
    item_stock_after  TEXT,
    item_stock_before TEXT,

    skill_id        TEXT,
    skill_name      TEXT,
    skill_level     TEXT,

    note_label      TEXT,
    note_value      TEXT,

    -- Num1-10 / Str1-3 в нотации desktop-парсера пользователя (см. RESEARCH_NOTES.md) — храним
    -- ВСЕГДА, даже для action_id, чей точный смысл ещё не расшифрован (та же логика, что в
    -- backend/logs/index.py, поля 'nums'/'strs' в ответе API).
    nums            TEXT[],
    strs            TEXT[],

    -- Идентификатор конкретного файла лога и порядковый номер строки внутри него — нужны
    -- ИНДЕКСАТОРУ, чтобы не разбирать одну и ту же строку дважды при повторном запуске (см.
    -- logs_indexed_files ниже). Пользователю кабинета не показываются.
    source_file     TEXT NOT NULL,
    source_line     INTEGER NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Один и тот же файл не должен быть разобран дважды на одну и ту же строку (идемпотентность
-- повторного запуска индексатора, например после его падения на середине файла).
CREATE UNIQUE INDEX IF NOT EXISTS logs_events_source_uidx
    ON logs_events (source_file, source_line);

-- Индексы под РЕАЛЬНЫЕ фильтры кабинета (backend/logs/index.py action=get_log):
-- сервер+тип+время — САМЫЙ частый запрос (список событий за период).
CREATE INDEX IF NOT EXISTS logs_events_main_idx
    ON logs_events (server, log_type, event_time DESC);

-- Поиск по нику игрока (actor ИЛИ target — оба должны быть проверены, см. _matches_filters
-- в backend/logs/index.py) — регистронезависимый частичный поиск, GIN+trigram эффективнее
-- обычного B-tree для LIKE '%...%'.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS logs_events_actor_trgm_idx ON logs_events USING gin (actor gin_trgm_ops);
CREATE INDEX IF NOT EXISTS logs_events_target_trgm_idx ON logs_events USING gin (target gin_trgm_ops);
CREATE INDEX IF NOT EXISTS logs_events_item_name_trgm_idx ON logs_events USING gin (item_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS logs_events_action_name_trgm_idx ON logs_events USING gin (action_name gin_trgm_ops);

-- ---------------------------------------------------------------------------------------------
-- Служебная таблица: какие файлы лога уже полностью прочитаны индексатором и до какой строки.
-- Позволяет ДОЗАПИСЫВАТЬ новые строки в файл, который дописывается в реальном времени игровым
-- сервером (файлы лога на диске растут постепенно, не появляются готовыми целиком), а не
-- перечитывать файл с начала при каждом запуске индексатора.
CREATE TABLE IF NOT EXISTS logs_indexed_files (
    source_file     TEXT PRIMARY KEY,
    server          TEXT NOT NULL,
    log_type        TEXT NOT NULL,
    lines_indexed   INTEGER NOT NULL DEFAULT 0,   -- сколько строк из этого файла уже в logs_events
    file_size_bytes BIGINT,                       -- размер файла на момент последнего чтения (для быстрой проверки "менялся ли файл")
    last_indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------------------------
-- Автоочистка старых данных — хранить только последние N дней (настраивается в indexer.py,
-- см. RETENTION_DAYS в README.md). Ручной запуск при необходимости:
--   DELETE FROM logs_events WHERE event_time < now() - interval '7 days';
--   DELETE FROM logs_indexed_files WHERE last_indexed_at < now() - interval '7 days';
-- indexer.py делает это автоматически при каждом запуске (см. _cleanup_old_data).
