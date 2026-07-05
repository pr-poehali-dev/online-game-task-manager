
UPDATE t_p84024572_online_game_task_man.users
SET is_active = false, tg_username = 'new_era_l2_dup', username = 'new_era_l2_dup'
WHERE id = 2;

UPDATE t_p84024572_online_game_task_man.users
SET role = 'admin', tg_username = 'new_era_l2', is_active = true, first_name = 'Администратор'
WHERE id = 1;
