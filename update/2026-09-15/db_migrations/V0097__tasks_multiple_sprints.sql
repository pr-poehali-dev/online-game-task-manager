-- Несколько спринтов у одной задачи.
--
-- Раньше спринт был один (tasks.sprint_id, text): одна и та же правка, попадающая в два
-- параллельных спринта (например «Багфиксы» и «Релиз HF»), требовала копии задачи.
-- Добавляем tasks.sprint_ids (jsonb) ровно по образцу tasks.servers (см. V0093) и
-- tasks.assignee_ids: старое поле sprint_id ОСТАЁТСЯ и хранит ПЕРВЫЙ спринт списка,
-- поэтому уже написанные места и старые задачи продолжают работать без правок.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Переносим уже существующие задачи: один спринт превращается в список из одного элемента.
UPDATE tasks
SET sprint_ids = jsonb_build_array(sprint_id)
WHERE sprint_id IS NOT NULL AND sprint_id <> '' AND sprint_ids = '[]'::jsonb;

COMMENT ON COLUMN tasks.sprint_ids IS 'Спринты задачи (список id). Поле sprint_id сохранено для совместимости и хранит первый спринт списка.';
