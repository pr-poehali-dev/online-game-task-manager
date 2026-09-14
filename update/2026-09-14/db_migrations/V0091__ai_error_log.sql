-- Журнал ошибок раздела AI. Логи облачной функции живут только на платформе и на боевом сервере
-- недоступны, поэтому причину ошибки «Не удалось выполнить запрос» отследить было нечем.
-- Пишем каждую неудачу прямо в базу — с моделью, действием и ТОЧНЫМ текстом ответа AI Tunnel.
CREATE TABLE IF NOT EXISTS ai_error_log (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    model       TEXT,
    -- error_code: aitunnel_error | aitunnel_unreachable | limit_exceeded и т.п.
    error_code  TEXT NOT NULL,
    -- HTTP-код ответа AI Tunnel: 429 (перегрузка), 401 (ключ), 402 (деньги кончились), 400 и т.д.
    status_code INTEGER,
    -- Дословный текст от AI Tunnel — главная подсказка о настоящей причине.
    message     TEXT,
    chat_id     INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_error_log_created ON ai_error_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_error_log_user ON ai_error_log(user_id);

COMMENT ON TABLE ai_error_log IS 'Ошибки раздела AI: что именно ответил AI Tunnel, по какой модели и какому действию.';
