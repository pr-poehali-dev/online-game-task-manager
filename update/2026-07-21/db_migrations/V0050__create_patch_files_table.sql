CREATE TABLE IF NOT EXISTS patch_files (
    id SERIAL PRIMARY KEY,
    server TEXT NOT NULL,
    path TEXT NOT NULL,
    file_key TEXT NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    content_type TEXT,
    task_id INTEGER NULL REFERENCES tasks(id),
    uploaded_by INTEGER NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (server, path)
);

CREATE INDEX IF NOT EXISTS idx_patch_files_server ON patch_files(server);
