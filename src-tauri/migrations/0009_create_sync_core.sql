-- Flow Local Sync core tables.

-- This device's stable identity (single row). Carried in the FLOW-SYNC handshake / HLC stamps.
CREATE TABLE IF NOT EXISTS sync_identity (
    device_id   TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Devices we have synced with (for the "known peers" UI and future delta sync).
CREATE TABLE IF NOT EXISTS sync_peers (
    device_id      TEXT PRIMARY KEY,
    device_name    TEXT NOT NULL,
    platform       TEXT,
    last_synced_at TEXT
);

-- Idempotency ledger: a given (peer, collection, payload_hash) is applied at most once. Also
-- stores a per-peer high-water-mark HLC to enable future delta sync.
CREATE TABLE IF NOT EXISTS sync_log (
    peer_device_id TEXT NOT NULL,
    collection     TEXT NOT NULL,
    payload_hash   TEXT NOT NULL,
    applied_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hwm_hlc        TEXT,
    PRIMARY KEY (peer_device_id, collection, payload_hash)
);
