CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.sprints (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    goal TEXT NOT NULL DEFAULT '',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned',
    created_by INTEGER NULL REFERENCES t_p84024572_online_game_task_man.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO t_p84024572_online_game_task_man.sprints (id, title, goal, start_date, end_date, status)
VALUES
    ('s1', 'Спринт 1 · Старт проекта', 'Запустить базовые системы: античит, лаунчер, лендинг', '2025-06-23', '2025-07-06', 'done'),
    ('s2', 'Спринт 2 · Ивент «Затмение»', 'Подготовить ивент, обновить соцсети и сайт под патч 2.4', '2025-07-07', '2025-07-20', 'active'),
    ('s3', 'Спринт 3 · Гильдейские войны', 'Релиз системы гильдейских войн и рекламная кампания', '2025-07-21', '2025-08-03', 'planned')
ON CONFLICT (id) DO NOTHING;
