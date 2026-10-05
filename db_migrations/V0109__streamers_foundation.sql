-- Стримерская программа: мониторинг трансляций на Kick (см. STREAMER_PROGRAM_PLAN.md).
-- Храним сырые данные (минутные снапшоты), бонусы считаются на лету.

CREATE TABLE streamers (
    id                  SERIAL PRIMARY KEY,
    platform            TEXT NOT NULL DEFAULT 'kick',
    channel_slug        TEXT NOT NULL,
    channel_url         TEXT NOT NULL,
    display_name        TEXT NOT NULL,
    avatar_url          TEXT NULL,
    broadcaster_user_id BIGINT NULL,
    game_user_id        TEXT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    ownership_verified  BOOLEAN NOT NULL DEFAULT false,
    note                TEXT NULL,
    added_by            INTEGER NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT streamers_platform_slug_uq UNIQUE (platform, channel_slug)
);

-- streamer_id NULL = правило по умолчанию для всех стримеров.
CREATE TABLE streamer_rules (
    id          SERIAL PRIMARY KEY,
    streamer_id INTEGER NULL REFERENCES streamers(id),
    keywords    JSONB NOT NULL DEFAULT '[]'::jsonb,
    match_mode  TEXT NOT NULL DEFAULT 'any' CHECK (match_mode IN ('any', 'all')),
    check_title BOOLEAN NOT NULL DEFAULT true,
    check_tags  BOOLEAN NOT NULL DEFAULT false,
    updated_by  INTEGER NULL REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX streamer_rules_streamer_uq ON streamer_rules (streamer_id) WHERE streamer_id IS NOT NULL;
CREATE UNIQUE INDEX streamer_rules_default_uq ON streamer_rules ((true)) WHERE streamer_id IS NULL;

INSERT INTO streamer_rules (streamer_id, keywords, match_mode, check_title, check_tags)
VALUES (NULL, '["la2era"]'::jsonb, 'any', true, false);

CREATE TABLE stream_sessions (
    id              SERIAL PRIMARY KEY,
    streamer_id     INTEGER NOT NULL REFERENCES streamers(id),
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ NULL,
    first_title     TEXT NOT NULL DEFAULT '',
    last_title      TEXT NOT NULL DEFAULT '',
    category        TEXT NULL,
    peak_viewers    INTEGER NOT NULL DEFAULT 0,
    avg_viewers     NUMERIC(10,1) NOT NULL DEFAULT 0,
    minutes_total   INTEGER NOT NULL DEFAULT 0,
    minutes_matched INTEGER NOT NULL DEFAULT 0,
    missed_polls    INTEGER NOT NULL DEFAULT 0,
    review_status   TEXT NOT NULL DEFAULT 'auto' CHECK (review_status IN ('auto', 'confirmed', 'disputed')),
    review_note     TEXT NULL
);
CREATE INDEX stream_sessions_streamer_started_idx ON stream_sessions (streamer_id, started_at DESC);
CREATE INDEX stream_sessions_started_idx ON stream_sessions (started_at DESC);
CREATE UNIQUE INDEX stream_sessions_one_open_uq ON stream_sessions (streamer_id) WHERE ended_at IS NULL;

CREATE TABLE stream_snapshots (
    id           BIGSERIAL PRIMARY KEY,
    session_id   INTEGER NOT NULL REFERENCES stream_sessions(id),
    captured_at  TIMESTAMPTZ NOT NULL,
    viewers      INTEGER NOT NULL DEFAULT 0,
    title        TEXT NOT NULL DEFAULT '',
    tags         JSONB NOT NULL DEFAULT '[]'::jsonb,
    rule_matched BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT stream_snapshots_session_time_uq UNIQUE (session_id, captured_at)
);
CREATE INDEX stream_snapshots_captured_idx ON stream_snapshots (captured_at);

CREATE TABLE stream_events (
    id          SERIAL PRIMARY KEY,
    streamer_id INTEGER NULL REFERENCES streamers(id),
    session_id  INTEGER NULL REFERENCES stream_sessions(id),
    type        TEXT NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stream_events_streamer_created_idx ON stream_events (streamer_id, created_at DESC);

CREATE TABLE streamer_collector_state (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_success_at TIMESTAMPTZ NULL,
    last_error_at   TIMESTAMPTZ NULL,
    last_error_text TEXT NULL
);
INSERT INTO streamer_collector_state (id) VALUES (1);

-- Права streamers_view / streamers_edit: администраторы получают их по умолчанию,
-- остальным выдаёт владелец или админ с team_manage.
UPDATE users
SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"streamers_view": true, "streamers_edit": true}'::jsonb
WHERE role = 'admin';
