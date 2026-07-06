-- Признак выполненной задачи в разделе «К рестарту»
ALTER TABLE t_p84024572_online_game_task_man.tasks
    ADD COLUMN IF NOT EXISTS restart_done BOOLEAN NOT NULL DEFAULT false;
