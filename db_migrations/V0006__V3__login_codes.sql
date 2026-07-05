
CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.login_codes (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id INTEGER REFERENCES t_p84024572_online_game_task_man.users(id),
  session_token TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_codes_code ON t_p84024572_online_game_task_man.login_codes(code);
