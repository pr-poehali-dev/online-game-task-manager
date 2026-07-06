-- Ответы (треды) и упоминания в комментариях идей
ALTER TABLE t_p84024572_online_game_task_man.idea_comments
    ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES t_p84024572_online_game_task_man.idea_comments(id),
    ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Ответы (треды) и упоминания в комментариях задач
ALTER TABLE t_p84024572_online_game_task_man.task_comments
    ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES t_p84024572_online_game_task_man.task_comments(id),
    ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_idea_comments_parent ON t_p84024572_online_game_task_man.idea_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON t_p84024572_online_game_task_man.task_comments(task_id);
