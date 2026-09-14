-- Раздел "AI": персональный реестр файлов сотрудника + лимит на количество загружаемых файлов.
--
-- Зачем нужен реестр: до сих пор файлы жили ТОЛЬКО внутри ai_messages.attachments (JSONB) и в S3,
-- поэтому нельзя было ни посчитать, сколько файлов залил сотрудник, ни показать ему их общим
-- списком, ни очистить один файл, не трогая переписку. Теперь каждая загрузка регистрируется
-- строкой в ai_files — это источник истины и для лимита, и для "дерева моих файлов" в интерфейсе.

CREATE TABLE IF NOT EXISTS ai_files (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    -- Ключ объекта в S3 (ai/uploads/xxx.pdf) — по нему файл физически убирается из хранилища.
    file_key TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    -- Откуда файл появился: upload — вложение в чат, template — загруженный бланк документа,
    -- image/video/document — результат генерации. В лимит считаются только загрузки сотрудника
    -- (upload/template), сгенерированные файлы лимитом не ограничиваются — они уже оплачены
    -- месячным лимитом трат (ai_usage).
    kind TEXT NOT NULL DEFAULT 'upload' CHECK (kind IN ('upload', 'template', 'image', 'video', 'document')),
    -- Диалог, в котором файл использован (может быть NULL: файл загружен, но сообщение ещё не
    -- отправлено).
    chat_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_files_user_id ON ai_files(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_files_chat_id ON ai_files(chat_id);

COMMENT ON TABLE ai_files IS 'Реестр файлов раздела "AI" по сотрудникам: загруженные вложения и бланки, а также сгенерированные изображения/видео/документы. Используется для лимита файлов и раздела "Мои файлы".';

-- Лимит на КОЛИЧЕСТВО одновременно хранимых файлов сотрудника (в отличие от месячного лимита
-- трат в ai_usage, он не сбрасывается ежемесячно — это ограничение занимаемого места, а не
-- расходов). 0 = загрузка файлов запрещена полностью. Настраивается администратором в разделе
-- "Команда" рядом с лимитом трат (см. backend/admin/index.py, action=set_ai_file_limit).
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_file_limit INTEGER NOT NULL DEFAULT 50;

COMMENT ON COLUMN users.ai_file_limit IS 'Сколько файлов сотрудник может одновременно хранить в разделе "AI" (загруженные вложения и бланки). 0 — загрузка запрещена.';
