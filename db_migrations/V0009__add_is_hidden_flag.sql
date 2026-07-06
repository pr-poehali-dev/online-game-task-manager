-- Флаг скрытия пользователя из списка команды (мягкое удаление)
ALTER TABLE t_p84024572_online_game_task_man.users
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- Прячем ранее нейтрализованные невалидные аккаунты
UPDATE t_p84024572_online_game_task_man.users
SET is_hidden = true, updated_at = NOW()
WHERE id IN (2, 4);
