-- Нейтрализация невалидных пользователей id=2 (@new_era_l2_dup) и id=4 (@gryphon_h):
-- деактивируем, снимаем права, разрываем привязку username/telegram_id из белого списка.
UPDATE t_p84024572_online_game_task_man.users
SET is_active = false,
    role = 'member',
    tg_username = NULL,
    telegram_id = -1000 - id,
    updated_at = NOW()
WHERE id IN (2, 4);

-- Завершаем их активные сессии (ставим срок действия в прошлое).
UPDATE t_p84024572_online_game_task_man.sessions
SET expires_at = NOW() - INTERVAL '1 day'
WHERE user_id IN (2, 4);
