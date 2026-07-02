
CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  photo_url TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  member_id TEXT,
  tg_username TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p84024572_online_game_task_man.users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.task_comments (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES t_p84024572_online_game_task_man.users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.task_deploy_statuses (
  id SERIAL PRIMARY KEY,
  task_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'none',
  updated_by INTEGER REFERENCES t_p84024572_online_game_task_man.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON t_p84024572_online_game_task_man.sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON t_p84024572_online_game_task_man.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON t_p84024572_online_game_task_man.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_deploy_task ON t_p84024572_online_game_task_man.task_deploy_statuses(task_id);
