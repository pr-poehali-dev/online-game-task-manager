-- Позволяет пользователю самостоятельно задать отображаемое имя (никнейм) и аватарку в личном
-- кабинете, независимо от данных Telegram-профиля. Если заполнено — имеет приоритет над
-- first_name/last_name/photo_url, которые продолжают перезаписываться данными из Telegram при
-- каждом входе (см. backend/auth/index.py, backend/tg-webhook/index.py). nickname/avatar_url
-- НИКОГДА не трогаются логикой логина через Telegram — только явным действием самого пользователя
-- в кабинете (backend/auth/index.py actions set_nickname/upload_avatar/remove_avatar).
ALTER TABLE users ADD COLUMN nickname TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;