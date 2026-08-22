-- Правка миграции V0076: AI Tunnel считает и списывает стоимость в РУБЛЯХ (usage.cost_rub /
-- usage.balance в каждом ответе API — см. docs/ai-tunnel-api-reference.md, раздел "Баланс и
-- оплата"), а не в USD. Таблицы были созданы ещё до сверки со справочником API — переименовываем
-- денежные колонки под фактическую валюту, таблицы пока пустые (Этап 2 backend не реализован),
-- переименование безопасно.

ALTER TABLE ai_messages RENAME COLUMN cost_usd TO cost_rub;
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS job_id TEXT;
COMMENT ON COLUMN ai_messages.job_id IS 'id асинхронной задачи генерации видео (POST /v1/videos), пока job_status = pending.';
COMMENT ON COLUMN ai_messages.cost_rub IS 'Стоимость сообщения в рублях, из поля usage.cost_rub ответа AI Tunnel.';

ALTER TABLE ai_usage RENAME COLUMN spent_usd TO spent_rub;
ALTER TABLE ai_usage RENAME COLUMN limit_usd TO limit_rub;
ALTER TABLE ai_usage ALTER COLUMN spent_rub TYPE NUMERIC(10,2);
ALTER TABLE ai_usage ALTER COLUMN limit_rub TYPE NUMERIC(10,2);
ALTER TABLE ai_usage ALTER COLUMN limit_rub SET DEFAULT 300;
COMMENT ON COLUMN ai_usage.spent_rub IS 'Фактически потрачено сотрудником в этом месяце, ₽.';
COMMENT ON COLUMN ai_usage.limit_rub IS 'Месячный лимит трат сотрудника, ₽.';
