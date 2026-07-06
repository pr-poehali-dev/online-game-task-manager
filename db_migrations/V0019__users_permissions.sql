-- Гранулярные права пользователей. NULL/пусто = набор по умолчанию (задаётся в коде).
ALTER TABLE t_p84024572_online_game_task_man.users
    ADD COLUMN IF NOT EXISTS permissions JSONB;
