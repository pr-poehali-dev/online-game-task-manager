INSERT INTO t_p84024572_online_game_task_man.users
    (telegram_id, username, first_name, last_name, role, tg_username, specialization, is_active, is_hidden)
VALUES
    (-9001, 'test_member_1', 'Тест', 'Участник 1', 'member', 'test_member_1', 'Тестовый аккаунт', true, false),
    (-9002, 'test_member_2', 'Тест', 'Участник 2', 'member', 'test_member_2', 'Тестовый аккаунт', true, false)
ON CONFLICT (telegram_id) DO NOTHING;
