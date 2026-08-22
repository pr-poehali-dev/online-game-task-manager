-- Этап 1 плана AI_PROJECTS_PLAN.md — "Проекты" в разделе AI (аналог Perplexity Projects):
-- сотрудник складывает свои файлы в проект и ведёт внутри него диалоги, а на следующих этапах
-- ассистент будет работать с содержимым проекта агентно (поиск по файлам + инструменты модели).

CREATE TABLE IF NOT EXISTS ai_projects (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL DEFAULT 'Новый проект',
    description TEXT NOT NULL DEFAULT '',
    -- Постоянная инструкция ассистенту именно для этого проекта (вкладка "Знания"): подставляется
    -- в системный промпт каждой сессии проекта, чтобы контекст не приходилось повторять руками.
    instructions TEXT NOT NULL DEFAULT '',
    -- Автосводка по содержимому проекта, будет заполняться на этапе 4 плана.
    summary TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'Folder',
    color TEXT NOT NULL DEFAULT '',
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_projects_user ON ai_projects(user_id, archived, updated_at DESC);

COMMENT ON TABLE ai_projects IS 'Проекты раздела "AI": личное рабочее пространство сотрудника с файлами и диалогами (см. AI_PROJECTS_PLAN.md).';

-- Привязка уже существующих сущностей к проекту. Обе колонки НЕОБЯЗАТЕЛЬНЫЕ: файлы и диалоги вне
-- проектов продолжают работать ровно как раньше — проекты это надстройка, а не замена.
ALTER TABLE ai_files ADD COLUMN IF NOT EXISTS project_id INTEGER;
ALTER TABLE ai_chats ADD COLUMN IF NOT EXISTS project_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_ai_files_project ON ai_files(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_chats_project ON ai_chats(project_id);

COMMENT ON COLUMN ai_files.project_id IS 'Проект, к которому отнесён файл (ai_projects.id). NULL — файл вне проектов, как было до появления проектов.';
COMMENT ON COLUMN ai_chats.project_id IS 'Проект, внутри которого ведётся диалог (ai_projects.id). NULL — обычный диалог вне проектов.';

-- Третий лимит сотрудника рядом с лимитами количества файлов и объёма (V0082/V0083): сколько
-- проектов ему разрешено держать. Настраивается администратором в разделе "Команда".
-- 0 — создание проектов запрещено.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_project_limit INTEGER NOT NULL DEFAULT 10;

COMMENT ON COLUMN users.ai_project_limit IS 'Сколько проектов сотрудник может создать в разделе "AI". 0 — создание проектов запрещено.';
