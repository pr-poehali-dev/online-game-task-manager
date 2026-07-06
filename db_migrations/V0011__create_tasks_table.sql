-- Таблица задач с привязкой исполнителя к реальным сотрудникам
CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.tasks (
    id            SERIAL PRIMARY KEY,
    title         TEXT NOT NULL,
    column_id     TEXT NOT NULL DEFAULT 'todo',
    assignee_id   INTEGER REFERENCES t_p84024572_online_game_task_man.users(id),
    priority      TEXT NOT NULL DEFAULT 'medium',
    tag           TEXT,
    version       TEXT,
    server        TEXT,
    category      TEXT NOT NULL DEFAULT 'other',
    sprint_id     TEXT,
    deploy_status TEXT NOT NULL DEFAULT 'none',
    description   TEXT,
    links         JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by    INTEGER REFERENCES t_p84024572_online_game_task_man.users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON t_p84024572_online_game_task_man.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column ON t_p84024572_online_game_task_man.tasks(column_id);
