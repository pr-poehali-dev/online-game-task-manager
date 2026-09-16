CREATE TABLE IF NOT EXISTS t_p84024572_online_game_task_man.task_comment_reactions (
    id serial PRIMARY KEY,
    comment_id integer NOT NULL REFERENCES t_p84024572_online_game_task_man.task_comments(id),
    user_id integer NOT NULL REFERENCES t_p84024572_online_game_task_man.users(id),
    emoji text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (comment_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_task_comment_reactions_comment_id
    ON t_p84024572_online_game_task_man.task_comment_reactions (comment_id);