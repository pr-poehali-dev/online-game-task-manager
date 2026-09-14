-- Этап 2 плана AI_PROJECTS_PLAN.md — поиск по содержимому файлов проекта.
--
-- Файлы разбираются на ФРАГМЕНТЫ (~1000 символов): при вопросе сотрудника ассистент получает не
-- все документы целиком (это не влезет в контекст модели и будет стоить дорого), а только те
-- несколько фрагментов, которые относятся к вопросу.
--
-- ВАЖНО про способ поиска: расширения pgvector на сервере нет (проверено), поэтому используем
-- встроенный полнотекстовый поиск PostgreSQL с русской морфологией — это и был предусмотренный
-- планом фолбэк. Колонка embedding заведена заранее (JSONB, а не vector), чтобы при появлении
-- pgvector можно было включить поиск по смыслу без пересоздания таблицы и потери данных.

CREATE TABLE IF NOT EXISTS ai_file_chunks (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL,
    -- Дубли для быстрой фильтрации без JOIN: поиск всегда ограничен проектом и владельцем.
    project_id INTEGER,
    user_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    -- Место под будущие эмбеддинги (поиск по смыслу), заполняется только если появится pgvector.
    embedding JSONB,
    -- Морфологический поисковый образ фрагмента: 'договор' найдётся по 'договоры', 'договором'.
    tsv TSVECTOR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chunks_project ON ai_file_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_file ON ai_file_chunks(file_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_tsv ON ai_file_chunks USING GIN(tsv);

COMMENT ON TABLE ai_file_chunks IS 'Фрагменты файлов раздела "AI" для поиска по содержимому проекта (см. AI_PROJECTS_PLAN.md, этап 2).';

-- Статус разбора файла: pending — в очереди, indexing — идёт разбор порциями, ready — готов к
-- поиску, failed — не удалось разобрать, unsupported — формат без извлекаемого текста
-- (картинки, видео, архивы) — такие файлы просто не участвуют в поиске, это не ошибка.
ALTER TABLE ai_files ADD COLUMN IF NOT EXISTS index_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE ai_files ADD COLUMN IF NOT EXISTS chunks_count INTEGER NOT NULL DEFAULT 0;
-- Сколько символов файла уже разобрано — позволяет продолжить разбор со следующего вызова функции,
-- не начиная заново (обход таймаута функции на больших документах).
ALTER TABLE ai_files ADD COLUMN IF NOT EXISTS index_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_files ADD COLUMN IF NOT EXISTS index_error TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN ai_files.index_status IS 'Разбор файла для поиска: pending/indexing/ready/failed/unsupported.';
