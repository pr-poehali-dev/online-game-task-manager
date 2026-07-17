-- Убирает жёсткую связь task_assignment_events -> tasks, которая блокировала
-- удаление задачи, если на неё когда-либо назначали исполнителя (ошибка
-- "задача возвращается после обновления страницы" при полном удалении с доски).
ALTER TABLE task_assignment_events DROP CONSTRAINT IF EXISTS task_assignment_events_task_id_fkey;
