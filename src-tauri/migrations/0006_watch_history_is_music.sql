-- Distinguish music plays from video plays so the History screen can filter
-- (All / Videos / Music) and music personalization can seed from listening history.
ALTER TABLE watch_history ADD COLUMN is_music INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_watch_history_is_music
ON watch_history(is_music);
