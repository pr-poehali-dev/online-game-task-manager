-- Настройки уведомлений: список типов внутренних уведомлений, которые пользователь отключил у себя
-- (не путать с tg_notify_muted — та колонка отключает пересылку в Telegram, эта — сами уведомления
-- в приложении). Упоминания (task_mention/idea_mention) и ответы на комментарий (task_reply/idea_reply)
-- в этот список никогда не попадают — отключить их нельзя, см. backend/notifications/index.py.
ALTER TABLE users ADD COLUMN notify_muted_types JSONB NOT NULL DEFAULT '[]'::jsonb;