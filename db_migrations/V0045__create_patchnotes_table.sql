-- Журнал патчноутов по серверам: автоматически заполняется при архивации задачи из раздела "К рестарту"
CREATE TABLE patchnotes (
    id SERIAL PRIMARY KEY,
    server TEXT NOT NULL,
    task_id INTEGER,
    task_title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patchnotes_server_created ON patchnotes (server, created_at DESC);
