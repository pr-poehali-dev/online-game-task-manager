-- Статусы деплоя становятся редактируемым справочником (как servers и categories).
-- Раньше список был жёстко зашит в коде, и добавить свой статус можно было только правкой кода.
--
-- is_system = true — статус, на котором держится логика приложения, его нельзя удалить или
-- переименовать его идентификатор:
--   'none'       — «без статуса», подставляется по умолчанию и используется как запасной вариант
--                  при удалении любого другого статуса;
--   'ready_live' — «можно заливать на лайв», на нём завязан бейдж «Требуется залить в лаунчер»
--                  и уведомления (см. needsLauncherUpload в sharedHelpers.ts и
--                  _needs_launcher_upload в backend/patches/index.py).
-- Остальные статусы колонок todo/progress/hold администратор может создавать, переименовывать
-- и удалять свободно.
CREATE TABLE IF NOT EXISTS deploy_statuses (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    icon        TEXT NOT NULL DEFAULT 'Circle',
    color       TEXT NOT NULL DEFAULT '215 15% 55%',
    column_id   TEXT NOT NULL DEFAULT 'todo',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Переносим текущий жёстко зашитый список без изменений: идентификаторы, подписи, цвета, иконки
-- и привязка к колонкам ровно те же, что были в коде, чтобы уже созданные задачи не потеряли
-- свой статус.
INSERT INTO deploy_statuses (id, label, icon, color, column_id, sort_order, is_system) VALUES
    ('none',          'Без статуса',                          'Minus',        '215 15% 50%', 'todo',     0, true),
    ('unfeasible',    'Нереализуемо',                         'Ban',          '0 0% 55%',    'todo',     1, false),
    ('tested_rework', 'На доработку (есть замечания)',        'CircleX',      '0 65% 60%',   'todo',     2, false),
    ('in_progress',   'Взято в работу',                       'Hammer',       '35 85% 58%',  'progress', 3, false),
    ('local',         'Готово локально у скриптера',          'Code2',        '270 65% 65%', 'progress', 4, false),
    ('test',          'На тестировании (залито на тестовый)', 'FlaskConical', '210 80% 62%', 'progress', 5, false),
    ('tested_ok',     'Протестировано — всё ок',              'CircleCheck',  '152 55% 50%', 'progress', 6, false),
    ('ready_live',    'Можно заливать на лайв',               'Rocket',       '45 90% 55%',  'done',     7, true)
ON CONFLICT (id) DO NOTHING;
