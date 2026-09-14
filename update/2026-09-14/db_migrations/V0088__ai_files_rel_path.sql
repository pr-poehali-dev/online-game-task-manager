-- Загрузка ПАПОК в проект раздела "AI": сотрудник перетаскивает целиком папку с исходниками
-- (public/, src/ и т.п.), и структура должна сохраниться — иначе десятки файлов с именами
-- index.ts из разных папок превращаются в неразличимую кучу.
--
-- rel_path — путь файла ВНУТРИ загруженной папки, например "src/pages/index/Ai.tsx".
-- Пустая строка = файл загружен по одному, без папки (прежнее поведение, ничего не меняется).
ALTER TABLE ai_files ADD COLUMN IF NOT EXISTS rel_path TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ai_files_rel_path ON ai_files(project_id, rel_path);

COMMENT ON COLUMN ai_files.rel_path IS 'Путь файла внутри загруженной папки (src/pages/Ai.tsx). Пусто — файл загружен отдельно, вне папки.';
