CREATE TABLE IF NOT EXISTS task_comment_reactions (
    id serial PRIMARY KEY,
    comment_id integer NOT NULL REFERENCES task_comments(id),
    user_id integer NOT NULL REFERENCES users(id),
    emoji text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (comment_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_task_comment_reactions_comment_id
    ON task_comment_reactions (comment_id);