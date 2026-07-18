-- Возможность скрыть переписку бота в Telegram конкретному участнику
ALTER TABLE users ADD COLUMN tg_notify_muted BOOLEAN NOT NULL DEFAULT false;
