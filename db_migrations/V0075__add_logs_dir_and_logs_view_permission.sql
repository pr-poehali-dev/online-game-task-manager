-- Раздел "Логи" (см. backend/logs/RESEARCH_NOTES.md за полным контекстом задачи) — просмотр
-- игровых логов (cached/server/npc), которые лежат на отдельном VPS и забираются по SFTP.
--
-- Один SFTP-хост обслуживает логи ВСЕХ серверов проекта (креды заводятся один раз в
-- service_keys, по аналогии с LAUNCHER_SSH_* для лаунчера, см. V0066), но у каждого сервера —
-- своя базовая директория на этом хосте (логи разных игровых серверов физически лежат в разных
-- папках одного VPS). Внутри базовой директории сервера ожидаются три фиксированные подпапки:
-- cached/, server/, npc/ (см. RESEARCH_NOTES.md — структура подтверждена пользователем).
ALTER TABLE servers ADD COLUMN IF NOT EXISTS logs_dir TEXT;

COMMENT ON COLUMN servers.logs_dir IS 'Базовая директория логов этого сервера на SFTP-хосте логов (см. service_keys: LOGS_SFTP_HOST/USER/PASSWORD/PORT). Внутри ожидаются подпапки cached/server/npc.';

-- Новое право доступа к разделу "Логи" — отдельное от patch_edit (по решению пользователя логи
-- не должны автоматически идти в комплекте с доступом к разделу "Патчи", это разные по
-- чувствительности данные: логи содержат факты игровых действий/торговли всех игроков).
-- Регистрация самого ключа в ALL_PERMISSIONS/PermissionKey — на стороне кода
-- (backend/admin/index.py, src/lib/auth.tsx, src/pages/admin/adminShared.ts), эта миграция
-- только выдаёт право владельцу проекта по умолчанию (тот же паттерн, что V0061 для patch_edit) —
-- остальным участникам его сможет выдать сам владелец или админ с team_manage через "Команду".
UPDATE users
SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"logs_view": true}'::jsonb,
    updated_at = NOW()
WHERE id = 1;
