-- Избранные статьи базы знаний (для каждого пользователя свой список)
CREATE TABLE IF NOT EXISTS kb_favorites (
    user_id     INTEGER NOT NULL REFERENCES users(id),
    article_id  INTEGER NOT NULL REFERENCES kb_articles(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_kb_favorites_user ON kb_favorites(user_id);
