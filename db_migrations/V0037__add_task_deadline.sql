-- Дедлайн задачи: дата и время, до которого нужно выполнить задачу
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;
