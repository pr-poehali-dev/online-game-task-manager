-- Раздел "AI" (см. AI_MANAGER_PLAN.md в корне проекта, Этап 1) — общение сотрудников с
-- ИИ-моделями через единый API-ключ AI Tunnel (chat/images/video), backend/ai/index.py.

-- Новое право доступа к разделу "AI" — привилегированное (как patch_edit/logs_view), т.к.
-- открывает доступ к платному внешнему сервису. Регистрация ключа в ALL_PERMISSIONS/
-- PRIVILEGED_PERMISSIONS/_effective_perms — на стороне кода (backend/admin/index.py,
-- src/lib/auth.tsx, src/pages/admin/adminShared.ts), эта миграция только выдаёт право владельцу
-- проекта по умолчанию (тот же паттерн, что V0075 для logs_view) — остальным участникам его
-- сможет выдать только сам владелец.
UPDATE users
SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"ai_access": true}'::jsonb,
    updated_at = NOW()
WHERE id = 1;

-- Диалоги пользователей с ИИ (как список чатов в ChatGPT — несколько диалогов на пользователя).
CREATE TABLE IF NOT EXISTS ai_chats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL DEFAULT 'Новый чат',
    -- chat = обычный текстовый чат, image = генерация изображений, video = генерация видео,
    -- code = режим помощи с кодом (свой системный промпт под ревью/рефактор).
    mode TEXT NOT NULL DEFAULT 'chat',
    model TEXT NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chats_user_id ON ai_chats(user_id);

-- Сообщения внутри диалога.
CREATE TABLE IF NOT EXISTS ai_messages (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES ai_chats(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    -- [{name, url, contentType, size}] — прикреплённые пользователем файлы/картинки или
    -- сгенерированные ассистентом изображения/видео.
    attachments JSONB,
    -- Модель, которой сгенерирован ответ (для role='assistant'; для 'auto' — фактически
    -- выбранная моделью AI Tunnel модель, приходит в поле model ответа API).
    model TEXT,
    cost_usd NUMERIC(10,5),
    -- Для асинхронной генерации видео (AI Tunnel POST /videos + опрос статуса задачи):
    -- pending -> done/failed. Для остальных типов сообщений всегда 'done'.
    job_status TEXT NOT NULL DEFAULT 'done' CHECK (job_status IN ('pending', 'done', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_chat_id ON ai_messages(chat_id);

-- Месячные лимиты и фактические траты сотрудников на AI.
CREATE TABLE IF NOT EXISTS ai_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    month DATE NOT NULL,
    spent_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
    limit_usd NUMERIC(10,4) NOT NULL DEFAULT 5,
    UNIQUE(user_id, month)
);

COMMENT ON TABLE ai_chats IS 'Диалоги сотрудников с ИИ-моделями через AI Tunnel (раздел "AI").';
COMMENT ON TABLE ai_messages IS 'Сообщения внутри диалогов ai_chats.';
COMMENT ON TABLE ai_usage IS 'Месячный лимит и фактический расход каждого сотрудника на AI (USD), группировка по первому числу месяца.';
