-- Раздел «Идеи»: топики-обсуждения и комментарии
CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.idea_topics (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'open',
    author_id   INTEGER REFERENCES t_p84024572_online_game_task_man.users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.idea_comments (
    id          SERIAL PRIMARY KEY,
    topic_id    INTEGER NOT NULL REFERENCES t_p84024572_online_game_task_man.idea_topics(id),
    author_id   INTEGER REFERENCES t_p84024572_online_game_task_man.users(id),
    text        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idea_topics_updated ON t_p84024572_online_game_task_man.idea_topics(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_idea_comments_topic ON t_p84024572_online_game_task_man.idea_comments(topic_id);
