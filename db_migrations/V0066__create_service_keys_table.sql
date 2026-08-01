-- Универсальное хранилище служебных ключей проекта (раздел "Управление проектом → Служебные
-- ключи" в кабинете) — для данных, которые пользователь хочет вводить и менять сам через
-- интерфейс, а не через системные секреты платформы. Первое применение — SSH-реквизиты VPS
-- игрового лаунчера для заливки файлов патчей (см. LAUNCHER_UPLOAD.md), но таблица не привязана
-- к конкретной фиче — key/value с пометкой is_secret (значение маскируется в интерфейсе, как
-- пароль). Доступ — эксклюзивно владельцу проекта (см. OWNER_USER_ID в backend/patches/index.py),
-- как и другие самые чувствительные разделы (patch_edit, приватные заметки).
CREATE TABLE IF NOT EXISTS service_keys (
    key TEXT PRIMARY KEY,
    value TEXT,
    is_secret BOOLEAN NOT NULL DEFAULT false,
    updated_by INTEGER NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
