-- Несколько серверов у спринта — по образцу tasks.servers (V0093).
-- Спринт часто охватывает сразу несколько серверов, а поле server допускало только один.
-- Добавляем sprints.servers (jsonb); старое поле server остаётся и хранит ПЕРВЫЙ сервер списка,
-- чтобы существующие экраны и уже созданные спринты продолжали работать без правок.
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS servers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Переносим существующие спринты: один сервер превращается в список из одного элемента.
UPDATE sprints
SET servers = jsonb_build_array(server)
WHERE server IS NOT NULL AND server <> '' AND servers = '[]'::jsonb;
