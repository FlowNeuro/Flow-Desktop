CREATE TABLE IF NOT EXISTS video_cache (
    video_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    channel_name TEXT,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    description TEXT,
    cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
);
