
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_id TEXT,
    channel_name TEXT NOT NULL,
    thumbnail_url TEXT,
    published_text TEXT,
    kind TEXT NOT NULL DEFAULT 'NEW_VIDEO',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

CREATE TABLE IF NOT EXISTS subscription_watermarks (
    channel_id TEXT PRIMARY KEY,
    last_video_id TEXT,
    last_check_time INTEGER NOT NULL DEFAULT 0
);
