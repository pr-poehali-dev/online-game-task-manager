CREATE TABLE IF NOT EXISTS patch_custom_roots (
    id SERIAL PRIMARY KEY,
    server TEXT NOT NULL,
    name TEXT NOT NULL,
    created_by INTEGER NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (server, name)
);