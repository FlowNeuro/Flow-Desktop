CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT,
    title TEXT NOT NULL,
    author TEXT,
    media_kind TEXT NOT NULL,
    file_path TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    quality_label TEXT,
    file_size_bytes INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_downloads_video_id ON downloads(video_id);
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at);
