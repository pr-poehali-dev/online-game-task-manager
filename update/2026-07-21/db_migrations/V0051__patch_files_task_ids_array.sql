ALTER TABLE patch_files ADD COLUMN IF NOT EXISTS task_ids jsonb NOT NULL DEFAULT '[]';

UPDATE patch_files SET task_ids = jsonb_build_array(task_id) WHERE task_id IS NOT NULL AND task_ids = '[]'::jsonb;
