-- Кэш токена приложения Kick для сборщика (backend/streamers-collector).
-- Токен живёт около 60 суток; хранится в БД, чтобы холодный старт функции не запрашивал его каждую минуту
-- (облачная функция живёт 5 секунд, лишний запрос к Kick может не уложиться в лимит).
ALTER TABLE streamer_collector_state ADD COLUMN IF NOT EXISTS kick_token TEXT NULL;
ALTER TABLE streamer_collector_state ADD COLUMN IF NOT EXISTS kick_token_expires_at TIMESTAMPTZ NULL;
ALTER TABLE streamer_collector_state ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ NULL;
ALTER TABLE streamer_collector_state ADD COLUMN IF NOT EXISTS last_run_summary JSONB NULL;
