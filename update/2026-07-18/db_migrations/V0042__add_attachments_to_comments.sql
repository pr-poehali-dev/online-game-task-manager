-- Добавление вложений (файлов/изображений) к комментариям задач и идей
ALTER TABLE task_comments ADD COLUMN attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE idea_comments ADD COLUMN attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
