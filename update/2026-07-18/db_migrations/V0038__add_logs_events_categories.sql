-- Добавляем категории "Логи" и "Эвенты" в справочник категорий (задачи, идеи, статьи базы знаний)
INSERT INTO categories (id, label, icon, color, sort_order) VALUES
    ('logs', 'Логи', 'ScrollText', '25 80% 55%', 8),
    ('events', 'Эвенты', 'PartyPopper', '300 65% 62%', 9)
ON CONFLICT (id) DO NOTHING;
