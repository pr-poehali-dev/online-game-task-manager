-- Специализация / список задач участника (текст, отображается на доске под именем)
ALTER TABLE t_p84024572_online_game_task_man.users
    ADD COLUMN IF NOT EXISTS specialization TEXT;
