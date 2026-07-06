-- Внутренние уведомления пользователей
CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES t_p84024572_online_game_task_man.users(id),
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT,
    entity_type TEXT,
    entity_id   TEXT,
    actor_id    INTEGER REFERENCES t_p84024572_online_game_task_man.users(id),
    is_read     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON t_p84024572_online_game_task_man.notifications(user_id, is_read, created_at DESC);
