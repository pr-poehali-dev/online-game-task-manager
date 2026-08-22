-- Этап 4 плана AI_PROJECTS_PLAN.md — автосводка по проекту: ассистент сам читает документы и
-- коротко описывает, что за материалы внутри.
--
-- Сводка не должна пересобираться при каждом открытии проекта: это лишние деньги за обращение к
-- модели. Поэтому запоминаем, ПО КАКОМУ составу файлов она была собрана — если состав изменился
-- (файл добавили или убрали), сводка помечается устаревшей и пересобирается.
ALTER TABLE ai_projects ADD COLUMN IF NOT EXISTS summary_files_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_projects ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN ai_projects.summary_files_count IS 'Сколько файлов было в проекте, когда собиралась автосводка — если число изменилось, сводка устарела и будет пересобрана.';
COMMENT ON COLUMN ai_projects.summary_updated_at IS 'Когда автосводка собиралась в последний раз.';
