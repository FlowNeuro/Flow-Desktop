//! The `FLOW-SYNC/1` QR-code payload — the out-of-band channel that carries the master key.
//!
//! The host serializes a [`QrPayload`] to compact JSON and renders it as a QR image (rendering is
//! done in the frontend). The client scans it, parses it here, and recovers the session id + the
//! master secret to derive the same directional keys and SAS (see `crypto.rs`).
//!
//! Binary fields are **base64url, no padding** (matching the Android decoder). The payload
//! deliberately contains **no nonce/IV** — nonces are per-frame and random (AES-GCM nonce reuse
//! is catastrophic).

#![allow(clippy::must_use_candidate)]

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};

use crate::sync::PROTOCOL_VERSION;
use crate::sync::crypto::{CryptoError, MasterSecret, SessionId};

#[derive(Debug, thiserror::Error)]
pub enum QrError {
    #[error("malformed QR JSON: {0}")]
    Json(String),
    #[error("unsupported protocol version {0}")]
    UnsupportedVersion(u8),
    #[error("bad base64 in field `{0}`")]
    Base64(&'static str),
    #[error(transparent)]
    Crypto(#[from] CryptoError),
}

/// The decoded contents of a Flow Sync QR code. Field names are short to keep the QR dense.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct QrPayload {
    /// Protocol version.
    pub v: u8,
    /// Session id / HKDF salt, base64url(16 bytes).
    pub sid: String,
    /// Master secret, base64url(32 bytes).
    pub k: String,
    /// Host LAN IP.
    pub ip: String,
    /// Host TCP port.
    pub p: u16,
    /// Host display name.
    pub d: String,
    /// Absolute expiry, epoch **seconds**.
    pub exp: u64,
    /// The QR-shower's **data role** (the scanner takes the complement): omitted/`"sender"` = the
    /// host SENDS (scanner receives, the default); `"receiver"` = the host wants to RECEIVE, so the
    /// **scanner must SEND**. This is what lets a camera-less device receive (it shows the QR and
    /// accepts an inbound send). Any value other than `"receiver"` is treated as `"sender"`. Omitted
    /// when sending so older peers stay compatible. (Matches the Android `role` field.)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
}

impl QrPayload {
    /// Build a QR payload for a host that will **send** (the default; `role` omitted ⇒ "sender").
    pub fn new(
        session_id: &SessionId,
        master: &MasterSecret,
        ip: impl Into<String>,
        port: u16,
        device_name: impl Into<String>,
        expires_at_epoch_s: u64,
    ) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            sid: URL_SAFE_NO_PAD.encode(session_id.as_bytes()),
            k: URL_SAFE_NO_PAD.encode(master.as_bytes()),
            ip: ip.into(),
            p: port,
            d: device_name.into(),
            exp: expires_at_epoch_s,
            role: None,
        }
    }

    /// Build a QR payload for a host that will **receive** (`role:"receiver"`); the scanner must SEND.
    pub fn new_receiving(
        session_id: &SessionId,
        master: &MasterSecret,
        ip: impl Into<String>,
        port: u16,
        device_name: impl Into<String>,
        expires_at_epoch_s: u64,
    ) -> Self {
        Self {
            role: Some("receiver".to_string()),
            ..Self::new(
                session_id,
                master,
                ip,
                port,
                device_name,
                expires_at_epoch_s,
            )
        }
    }

    /// True if the QR-shower wants to RECEIVE (so this scanner must send). Any role other than
    /// `"receiver"` (including absent) means the shower sends and this scanner receives.
    pub fn host_receives(&self) -> bool {
        self.role.as_deref() == Some("receiver")
    }

    pub fn to_json(&self) -> String {
        // Infallible for this plain struct.
        serde_json::to_string(self).expect("serialize QrPayload")
    }

    pub fn from_json(s: &str) -> Result<Self, QrError> {
        let payload: QrPayload =
            serde_json::from_str(s).map_err(|e| QrError::Json(e.to_string()))?;
        if payload.v != PROTOCOL_VERSION {
            return Err(QrError::UnsupportedVersion(payload.v));
        }
        Ok(payload)
    }

    /// Recover the session id from the `sid` field.
    pub fn session_id(&self) -> Result<SessionId, QrError> {
        let bytes = URL_SAFE_NO_PAD
            .decode(&self.sid)
            .map_err(|_| QrError::Base64("sid"))?;
        Ok(SessionId::try_from_slice(&bytes)?)
    }

    /// Recover the master secret from the `k` field.
    pub fn master(&self) -> Result<MasterSecret, QrError> {
        let bytes = URL_SAFE_NO_PAD
            .decode(&self.k)
            .map_err(|_| QrError::Base64("k"))?;
        MasterSecret::try_from_slice(&bytes).map_err(QrError::from)
    }

    /// True if the QR has expired relative to the given wall-clock time (epoch seconds).
    pub fn is_expired(&self, now_epoch_s: u64) -> bool {
        now_epoch_s >= self.exp
    }
}

// Tests for this module live in `tests/sync_phase1.rs` (integration test) — see the note in
// `canonical.rs` on why in-crate unit tests can't run on this Tauri crate.
