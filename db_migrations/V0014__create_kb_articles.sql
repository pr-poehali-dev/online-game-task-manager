-- База знаний: статьи с решениями под рабочие задачи
CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.kb_articles (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'other',
    excerpt     TEXT,
    content     TEXT NOT NULL DEFAULT '',
    author_id   INTEGER REFERENCES t_p84024572_online_game_task_man.users(id),
    updated_by  INTEGER REFERENCES t_p84024572_online_game_task_man.users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_category ON t_p84024572_online_game_task_man.kb_articles(category);
CREATE INDEX IF NOT EXISTS idx_kb_updated ON t_p84024572_online_game_task_man.kb_articles(updated_at DESC);
