CREATE TABLE IF NOT EXISTS recommendation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    video_id TEXT,
    channel_name TEXT,
    query TEXT,
    value REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recommendation_events_type
ON recommendation_events(event_type);

CREATE INDEX IF NOT EXISTS idx_recommendation_events_video_id
ON recommendation_events(video_id);
