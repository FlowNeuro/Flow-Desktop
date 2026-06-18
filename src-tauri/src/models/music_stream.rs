//! Music playback descriptor.
//!
//! This is the music-specific counterpart to [`crate::models::video::StreamInfo`].
//! It intentionally models an **audio-only** stream (no video variants) plus the
//! `loudnessDb` value YouTube Music exposes for per-track volume normalization.
//!
//! The extractor (`api::innertube::music::playback`) fills `audio_url` with the
//! raw upstream googlevideo URL and `user_agent` with the client UA. The command
//! layer (`commands::music`) then registers that URL with the shared streaming
//! proxy and rewrites `audio_url` to the loopback proxy URL before it crosses the
//! Tauri boundary — exactly mirroring how `get_stream_info` handles video.

use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum MusicAudioQuality {
    Auto,
    High,
    Medium,
    Low,
}

impl Default for MusicAudioQuality {
    fn default() -> Self {
        Self::Auto
    }
}

impl MusicAudioQuality {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "Auto",
            Self::High => "High",
            Self::Medium => "Medium",
            Self::Low => "Low",
        }
    }
}

impl FromStr for MusicAudioQuality {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "" | "auto" => Ok(Self::Auto),
            "high" => Ok(Self::High),
            "medium" => Ok(Self::Medium),
            "low" => Ok(Self::Low),
            other => Err(format!("Unsupported music audio quality: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicStreamInfo {
    pub video_id: String,
    /// Playable audio URL. Upstream googlevideo URL when produced by the
    /// extractor; rewritten to `http://127.0.0.1:{port}/stream/{token}` by the
    /// command layer before returning to the UI.
    pub audio_url: String,
    pub mime_type: String,
    pub itag: u32,
    pub bitrate: Option<u64>,
    pub approx_duration_ms: Option<u64>,
    /// `playerConfig.audioConfig.loudnessDb`, used for volume normalization on
    /// the frontend (WebAudio GainNode). `None` when the client did not report it.
    pub loudness_db: Option<f64>,
    /// `playerConfig.audioConfig.perceptualLoudnessDb` when present.
    pub perceptual_loudness_db: Option<f64>,
    pub expires_in_seconds: u64,
    /// Which InnerTube client successfully resolved this stream (diagnostics/UI).
    pub used_client: String,
    /// Upstream User-Agent the proxy must use to fetch the stream. Not serialized
    /// to the frontend — consumed by proxy session registration in the command layer.
    #[serde(skip)]
    pub user_agent: String,
}
