-- Отдельная отметка "Готово" в разделе «На лайв» для КАЖДОГО сервера задачи.
-- Раньше restart_done был одним булевым полем на всю задачу (см. V0016) — если задача привязана
-- сразу к нескольким серверам (V0093), закрытие "Готово" на одном сервере автоматически отражалось
-- и на остальных, т.к. это было одно и то же поле. Теперь per-server статус хранится в jsonb-объекте
-- {serverId: true/false}, той же схемой, что servers/sprint_ids/assignee_ids в этой таблице.
-- Старое restart_done оставлено как есть (не удаляем) — на него ничего больше не завязано после
-- перехода фронта/бэкенда на restart_done_servers, но миграция форвард-only, поэтому проще не трогать.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS restart_done_servers jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Бэкфилл: для задач, у которых старое restart_done уже true, проставляем true для ВСЕХ их текущих
-- серверов — это сохраняет видимое поведение "Готово" для уже существующих задач в разделе «На лайв»
-- (у большинства таких задач сервер всего один, так что расхождения по смыслу не будет).
UPDATE tasks
SET restart_done_servers = (
    SELECT jsonb_object_agg(srv, true)
    FROM jsonb_array_elements_text(
        CASE WHEN jsonb_array_length(servers) > 0 THEN servers ELSE jsonb_build_array(server) END
    ) AS srv
)
WHERE restart_done = true
  AND (server IS NOT NULL OR jsonb_array_length(servers) > 0);
