ALTER TABLE task_comments
  ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone NULL;