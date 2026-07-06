-- Привязка статей базы знаний к задаче
ALTER TABLE t_p84024572_online_game_task_man.tasks
    ADD COLUMN IF NOT EXISTS kb_article_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
