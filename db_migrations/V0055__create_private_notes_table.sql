CREATE TABLE private_notes (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    comment_id INTEGER NULL REFERENCES task_comments(id),
    author_id INTEGER NOT NULL REFERENCES users(id),
    target_user_id INTEGER NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_private_notes_task ON private_notes (task_id);
CREATE INDEX idx_private_notes_comment ON private_notes (comment_id);
