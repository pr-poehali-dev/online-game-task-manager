-- Возможность скрыть у конкретного участника кнопку "написать в Telegram" в списке команды
ALTER TABLE users ADD COLUMN show_tg_contact BOOLEAN NOT NULL DEFAULT true;
