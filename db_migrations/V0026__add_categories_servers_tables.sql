-- Динамические категории (для задач, статей базы знаний и идей) и серверы
CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    icon        TEXT NOT NULL DEFAULT 'MoreHorizontal',
    color       TEXT NOT NULL DEFAULT '215 15% 55%',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS servers (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '215 15% 55%',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO categories (id, label, icon, color, sort_order) VALUES
    ('web', 'Веб', 'Globe', '210 80% 62%', 0),
    ('launcher', 'Лаунчер', 'MonitorDown', '270 65% 65%', 1),
    ('client', 'Клиент', 'Gamepad2', '35 85% 58%', 2),
    ('social', 'Соцсети и форум', 'MessagesSquare', '330 70% 62%', 3),
    ('ads', 'Реклама', 'Megaphone', '45 90% 55%', 4),
    ('server-ext', 'Сервер · Экст', 'Database', '0 65% 60%', 5),
    ('server-scripts', 'Сервер · Скрипты', 'Code2', '152 55% 50%', 6),
    ('other', 'Прочее', 'MoreHorizontal', '215 15% 55%', 7)
ON CONFLICT (id) DO NOTHING;

INSERT INTO servers (id, label, color, sort_order) VALUES
    ('c4x1', 'С4х1', '270 65% 65%', 0),
    ('hfx3old', 'HFx3 old', '35 85% 58%', 1),
    ('hfnew', 'HF new', '152 60% 48%', 2)
ON CONFLICT (id) DO NOTHING;

-- Идеи теперь тоже могут иметь категорию (опционально)
ALTER TABLE idea_topics ADD COLUMN IF NOT EXISTS category TEXT;
