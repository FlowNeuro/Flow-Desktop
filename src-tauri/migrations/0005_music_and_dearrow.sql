CREATE TABLE IF NOT EXISTS music_home_sections (
    section_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT,
    tracks_json TEXT NOT NULL,
    order_by INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS music_home_chips (
    title TEXT PRIMARY KEY,
    browse_id TEXT,
    params TEXT,
    order_by INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dearrow_cache (
    video_id TEXT PRIMARY KEY,
    title TEXT,
    thumbnail_url TEXT,
    cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
