-- Columns needed to map watch_history rows to the canonical sync model.
-- channel_id: canonical records carry it (the table previously only had channel_name).
-- updated_hlc: the Hybrid Logical Clock stamp used for last-write-wins merge resolution.
-- is_short: mirrors the mobile schema so the short/long distinction survives a sync.
ALTER TABLE watch_history ADD COLUMN channel_id TEXT;
ALTER TABLE watch_history ADD COLUMN updated_hlc TEXT;
ALTER TABLE watch_history ADD COLUMN is_short INTEGER NOT NULL DEFAULT 0;
