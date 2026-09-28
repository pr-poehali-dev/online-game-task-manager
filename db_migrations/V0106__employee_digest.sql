-- Ежедневный дайджест событий для сотрудника: блокирующий попап при входе со сводкой за время с
-- последнего "Ознакомлен" (см. backend/digest/index.py, src/pages/index/DailyDigestModal.tsx).
-- Один сотрудник = один набор настроек (какие из 5 метрик ему интересны) + одно состояние
-- (когда последний раз нажал «Ознакомлен» — от этого момента считается период для следующего показа).

-- Настройки: какие блоки дайджеста показывать этому сотруднику (управляется в личном кабинете).
-- Отсутствие строки = ещё не настраивал, все 5 метрик включены по умолчанию.
CREATE TABLE employee_digest_prefs (
    user_id               INTEGER NOT NULL PRIMARY KEY REFERENCES users(id),
    patchnotes_enabled    BOOLEAN NOT NULL DEFAULT true,
    new_tasks_enabled     BOOLEAN NOT NULL DEFAULT true,
    closed_tasks_enabled  BOOLEAN NOT NULL DEFAULT true,
    new_ideas_enabled     BOOLEAN NOT NULL DEFAULT true,
    new_articles_enabled  BOOLEAN NOT NULL DEFAULT true,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Состояние показа: last_ack_at — момент последнего нажатия «Ознакомлен». Дайджест показывается
-- не чаще раза в календарные сутки: сравнивается календарная дата (по МСК) last_ack_at с текущей
-- датой — если сотрудник не заходил несколько дней, период считается от last_ack_at до текущего
-- момента (набегает сводка за все пропущенные дни разом), а не только за "вчера".
-- Отсутствие строки = сотрудник ещё ни разу не видел дайджест (в т.ч. все существующие сотрудники
-- на момент введения фичи) — при первой проверке строка создаётся с last_ack_at = NOW() без показа
-- попапа (бутстрап), чтобы точкой отсчёта стал момент релиза фичи, а не вся история аккаунта.
CREATE TABLE employee_digest_state (
    user_id      INTEGER NOT NULL PRIMARY KEY REFERENCES users(id),
    last_ack_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
