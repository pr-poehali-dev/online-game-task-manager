-- Ещё одна пустая сводка успела записаться старым кодом (рассуждающая модель) до публикации
-- исправления. Сбрасываем счётчик, чтобы описание собралось заново уже обычной моделью.
UPDATE ai_projects
SET summary_files_count = 0, summary_updated_at = NULL
WHERE COALESCE(summary, '') = '' AND summary_files_count > 0;
