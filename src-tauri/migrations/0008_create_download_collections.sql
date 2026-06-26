CREATE TABLE IF NOT EXISTS download_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    thumbnail_url TEXT,
    folder_path TEXT NOT NULL,
    total_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_download_collections_collection_id ON download_collections(collection_id);
CREATE INDEX IF NOT EXISTS idx_download_collections_created_at ON download_collections(created_at);

ALTER TABLE downloads ADD COLUMN collection_db_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_downloads_collection ON downloads(collection_db_id);
