-- Объединяем статус 'needs_test' в 'test' (единый статус "На тестировании")
UPDATE t_p84024572_online_game_task_man.tasks SET deploy_status = 'test' WHERE deploy_status = 'needs_test';