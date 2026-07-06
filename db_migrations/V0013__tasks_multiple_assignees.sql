-- Множественные исполнители задачи
ALTER TABLE t_p84024572_online_game_task_man.tasks
    ADD COLUMN IF NOT EXISTS assignee_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Перенос текущего одиночного исполнителя в массив
UPDATE t_p84024572_online_game_task_man.tasks
SET assignee_ids = to_jsonb(ARRAY[assignee_id])
WHERE assignee_id IS NOT NULL
  AND (assignee_ids IS NULL OR assignee_ids = '[]'::jsonb);
