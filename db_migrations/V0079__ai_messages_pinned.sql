ALTER TABLE t_p84024572_online_game_task_man.ai_messages
    ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_ai_messages_pinned ON t_p84024572_online_game_task_man.ai_messages(chat_id, pinned) WHERE pinned = true;
