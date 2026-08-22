ALTER TABLE ai_messages
    ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_ai_messages_pinned ON ai_messages(chat_id, pinned) WHERE pinned = true;
