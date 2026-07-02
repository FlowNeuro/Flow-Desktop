CREATE INDEX IF NOT EXISTS idx_watch_history_date_created
ON watch_history(watch_date, created_at);

CREATE INDEX IF NOT EXISTS idx_watch_history_music_date
ON watch_history(is_music, watch_date, created_at);

CREATE INDEX IF NOT EXISTS idx_recommendation_events_created_at
ON recommendation_events(created_at);


CREATE INDEX IF NOT EXISTS idx_downloads_created_id
ON downloads(created_at, id);

DROP INDEX IF EXISTS idx_watch_history_watch_date;
DROP INDEX IF EXISTS idx_watch_history_is_music;
