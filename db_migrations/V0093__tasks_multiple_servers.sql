-- Несколько серверов у одной задачи.
-- Раньше сервер был один (tasks.server, text) — но правка часто выкатывается сразу на несколько
-- серверов, и приходилось заводить копии одной и той же задачи. Добавляем tasks.servers (jsonb)
-- ровно по образцу tasks.assignee_ids: старое поле server остаётся и хранит ПЕРВЫЙ сервер списка,
-- чтобы уже написанные места (патчноуты, фильтры, старые задачи) продолжали работать без правок.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS servers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Переносим уже существующие задачи: один сервер превращается в список из одного элемента.
UPDATE tasks
SET servers = jsonb_build_array(server)
WHERE server IS NOT NULL AND server <> '' AND servers = '[]'::jsonb;
