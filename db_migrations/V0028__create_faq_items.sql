-- Раздел FAQ: вопросы-ответы о работе задачника (доступно всем, редактирование — только админ)
CREATE TABLE IF NOT EXISTS faq_items (
    id          SERIAL PRIMARY KEY,
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    author_id   INTEGER REFERENCES users(id),
    updated_by  INTEGER REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faq_sort ON faq_items(sort_order ASC, id ASC);
