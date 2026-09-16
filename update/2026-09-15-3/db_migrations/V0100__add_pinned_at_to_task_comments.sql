ALTER TABLE task_comments
  ADD COLUMN IF NOT EXISTS pinned_at timestamp with time zone NULL;