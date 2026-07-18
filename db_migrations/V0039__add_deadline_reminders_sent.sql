-- Отслеживание отправленных напоминаний о дедлайне задачи (сутки / 6 часов / 30 минут)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_reminders_sent JSONB NOT NULL DEFAULT '[]'::jsonb;
