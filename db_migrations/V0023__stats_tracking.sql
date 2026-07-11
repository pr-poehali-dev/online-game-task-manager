-- Кто закрыл (заархивировал) задачу
ALTER TABLE t_p84024572_online_game_task_man.tasks
    ADD COLUMN IF NOT EXISTS closed_by INTEGER REFERENCES t_p84024572_online_game_task_man.users(id);

-- История назначений исполнителей: фиксируем момент, когда пользователя назначили исполнителем задачи
CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.task_assignment_events (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES t_p84024572_online_game_task_man.tasks(id),
    user_id INTEGER NOT NULL REFERENCES t_p84024572_online_game_task_man.users(id),
    assigned_by INTEGER REFERENCES t_p84024572_online_game_task_man.users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_assign_events_user ON t_p84024572_online_game_task_man.task_assignment_events(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assign_events_task ON t_p84024572_online_game_task_man.task_assignment_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assign_events_date ON t_p84024572_online_game_task_man.task_assignment_events(assigned_at);

-- Сессии активности пользователя в приложении (для подсчёта проведённого времени)
CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.user_activity_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES t_p84024572_online_game_task_man.users(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_sessions_user ON t_p84024572_online_game_task_man.user_activity_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_sessions_started ON t_p84024572_online_game_task_man.user_activity_sessions(started_at);