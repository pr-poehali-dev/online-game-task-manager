-- Отметки прочтения идей конкретным пользователем — раньше механизма "прочитано/не прочитано"
-- для идей не было вообще (в отличие от task_comments/notifications). Идея считается непрочитанной
-- для пользователя, если у неё нет записи здесь, либо idea_topics.updated_at новее read_at
-- (появился новый комментарий/правка после последнего просмотра пользователем).
CREATE TABLE idea_reads (
    user_id  INTEGER NOT NULL REFERENCES users(id),
    topic_id INTEGER NOT NULL REFERENCES idea_topics(id),
    read_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, topic_id)
);

CREATE INDEX idx_idea_reads_user ON idea_reads(user_id);