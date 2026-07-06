-- Архивация задач: флаг архива и исход
ALTER TABLE t_p84024572_online_game_task_man.tasks
    ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS outcome TEXT,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_archived ON t_p84024572_online_game_task_man.tasks(archived);
