
INSERT INTO t_p84024572_online_game_task_man.users (telegram_id, username, first_name, role, tg_username, is_active)
VALUES (0, 'new_era_l2', 'Администратор', 'admin', 'new_era_l2', true)
ON CONFLICT (telegram_id) DO NOTHING;

UPDATE t_p84024572_online_game_task_man.users
SET role = 'admin', is_active = true
WHERE tg_username = 'new_era_l2';
