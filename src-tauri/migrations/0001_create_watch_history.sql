CREATE TABLE IF NOT EXISTS watch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_name TEXT,
    watch_date TEXT NOT NULL,
    watch_duration_seconds INTEGER NOT NULL DEFAULT 0,
    total_duration_seconds INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_watch_history_video_id
ON watch_history(video_id);

CREATE INDEX IF NOT EXISTS idx_watch_history_watch_date
ON watch_history(watch_date);
