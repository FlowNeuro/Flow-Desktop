//! Shared error type for the Flow Local Sync transport/protocol layers.

use tokio_tungstenite::tungstenite::Error as WsError;

#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("transport: {0}")]
    Transport(String),
    #[error("connection closed by peer")]
    ConnectionClosed,
    #[error(transparent)]
    Crypto(#[from] crate::sync::crypto::CryptoError),
    #[error(transparent)]
    Qr(#[from] crate::sync::qr::QrError),
    #[error("codec: {0}")]
    Codec(String),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("protocol: {0}")]
    Protocol(String),
    #[error("frame out of order: expected seq {expected}, got {got}")]
    SeqMismatch { expected: u64, got: u64 },
    #[error("payload hash mismatch for collection {collection}")]
    HashMismatch { collection: String },
    #[error("db: {0}")]
    Db(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

impl From<sqlx::Error> for SyncError {
    fn from(e: sqlx::Error) -> Self {
        SyncError::Db(e.to_string())
    }
}

impl From<WsError> for SyncError {
    fn from(e: WsError) -> Self {
        match e {
            WsError::ConnectionClosed | WsError::AlreadyClosed => SyncError::ConnectionClosed,
            other => SyncError::Transport(other.to_string()),
        }
    }
}
