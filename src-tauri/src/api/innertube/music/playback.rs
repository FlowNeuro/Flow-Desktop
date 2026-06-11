//! Multi-client audio stream resolver for YouTube Music.
//!
//! This is the desktop counterpart of `FlowApp_mobile`'s
//! `MusicPlayerUtils.fetchPlaybackData`: it walks an ordered list of InnerTube
//! clients ([`clients::DIRECT_AUDIO_CLIENTS`]) until one returns a directly
//! playable audio stream. Unlike mobile, the desktop has no JS cipher/n-sig
//! solver, so the loop only accepts formats that expose a clean `url` (no
//! unsolved `n` throttle parameter); clients that only return `signatureCipher`
//! are skipped and the loop falls through to the next one — "trying every client
//! so all music is fetched".
//!
//! It is completely independent of the video extractor's `get_stream_info`.

use serde_json::Value;
use tracing::{debug, info, warn};

use super::clients;
use crate::api::innertube::core::botguard::generate_po_token;
use crate::api::innertube::InnertubeClient;
use crate::errors::{AppError, AppResult};
use crate::models::music_stream::MusicStreamInfo;

/// Desktop iOS/Android signed-client signature timestamp (matches the value the
/// working video path uses for `IOS`).
const SIGNATURE_TIMESTAMP: i64 = 19550;

impl InnertubeClient {
    /// Resolve a playable, audio-only stream for a music `video_id` by trying
    /// each direct-audio client in turn. Returns the raw upstream URL + the
    /// User-Agent that must fetch it; the command layer proxies it.
    pub(crate) async fn resolve_music_stream(&self, video_id: &str) -> AppResult<MusicStreamInfo> {
        let video_id = video_id.trim();
        if video_id.is_empty() {
            return Err(AppError::Validation("Video ID cannot be empty".into()));
        }

        let visitor = self.music_visitor_data().await;
        let mut po_token: Option<String> = None;
        let mut last_error: Option<AppError> = None;

        for client in clients::DIRECT_AUDIO_CLIENTS {
            // iOS-family clients get a PO token (sidecar) + signatureTimestamp,
            // mirroring the video path's IOS fallback. Android/VR need neither.
            let (sts, pot) = if client.is_ios_family {
                if po_token.is_none() {
                    po_token = generate_po_token(video_id).await;
                }
                (Some(SIGNATURE_TIMESTAMP), po_token.as_deref())
            } else if client.use_signature_timestamp {
                (Some(SIGNATURE_TIMESTAMP), None)
            } else {
                (None, None)
            };

            let res = match self
                .music_player(client, video_id, sts, pot, visitor.as_deref())
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    debug!(client = client.name, error = %e, "music client request failed");
                    last_error = Some(e);
                    continue;
                }
            };

            let status = res["playabilityStatus"]["status"].as_str().unwrap_or("");
            if !status.eq_ignore_ascii_case("OK") {
                let reason = res["playabilityStatus"]["reason"].as_str();
                warn!(client = client.name, status, reason, "non-OK music playability");
                last_error = Some(map_music_playability(status, reason));
                continue;
            }

            let streaming = &res["streamingData"];
            let Some((format, url)) = pick_audio_format(streaming) else {
                debug!(client = client.name, "no clean direct audio format");
                continue;
            };

            let mime_type = format["mimeType"]
                .as_str()
                .unwrap_or("audio/webm")
                .to_string();
            let itag = format["itag"].as_u64().and_then(|v| u32::try_from(v).ok()).unwrap_or(0);
            let bitrate = format["bitrate"]
                .as_u64()
                .or_else(|| format["averageBitrate"].as_u64());
            let approx_duration_ms = format["approxDurationMs"]
                .as_str()
                .and_then(|s| s.parse::<u64>().ok());
            let loudness_db = res["playerConfig"]["audioConfig"]["loudnessDb"].as_f64();
            let perceptual_loudness_db =
                res["playerConfig"]["audioConfig"]["perceptualLoudnessDb"].as_f64();
            let expires_in_seconds = streaming["expiresInSeconds"]
                .as_str()
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(21600);

            info!(
                client = client.name,
                itag,
                ?bitrate,
                "music stream resolved"
            );

            return Ok(MusicStreamInfo {
                video_id: video_id.to_string(),
                audio_url: url,
                mime_type,
                itag,
                bitrate,
                approx_duration_ms,
                loudness_db,
                perceptual_loudness_db,
                expires_in_seconds,
                used_client: client.name.to_string(),
                user_agent: client.user_agent.to_string(),
            });
        }

        Err(last_error.unwrap_or_else(|| {
            AppError::Extractor(format!(
                "Failed to resolve music stream for {video_id} after trying all clients"
            ))
        }))
    }
}

/// True when the URL has no unsolved `n` throttling parameter (desktop cannot
/// deobfuscate it, so such URLs would be throttled to uselessness).
fn url_is_clean(url: &str) -> bool {
    reqwest::Url::parse(url)
        .map(|u| !u.query_pairs().any(|(k, v)| k == "n" && !v.is_empty()))
        .unwrap_or(false)
}

/// Quality score: bitrate, with a bonus for Opus/WebM and a large bonus for the
/// original (non-dubbed) track. Mirrors mobile's `audioQualityScore` plus an
/// original-language preference.
fn audio_score(format: &Value) -> i64 {
    let mime = format["mimeType"].as_str().unwrap_or("");
    let bitrate = format["averageBitrate"]
        .as_i64()
        .filter(|b| *b > 0)
        .or_else(|| format["bitrate"].as_i64())
        .unwrap_or(0);
    let codec_bonus = if mime.contains("webm") || mime.contains("opus") {
        10_240
    } else {
        0
    };
    let track = &format["audioTrack"];
    let is_original = track.is_null() || track["audioIsDefault"].as_bool() == Some(true);
    let original_bonus = if is_original { 1_000_000 } else { 0 };
    bitrate + codec_bonus + original_bonus
}

/// Choose the best directly-playable audio-only format. Returns `(format, url)`.
fn pick_audio_format(streaming: &Value) -> Option<(Value, String)> {
    let formats = streaming["adaptiveFormats"].as_array()?;
    let mut best: Option<(&Value, String, i64)> = None;

    for format in formats {
        let mime = format["mimeType"].as_str().unwrap_or("");
        if !mime.starts_with("audio/") {
            continue;
        }
        let Some(url) = format["url"].as_str() else {
            continue; // ciphered-only — skip (no solver on desktop)
        };
        if !url_is_clean(url) {
            continue;
        }
        let score = audio_score(format);
        if best.as_ref().map_or(true, |(_, _, best_score)| score > *best_score) {
            best = Some((format, url.to_string(), score));
        }
    }

    best.map(|(format, url, _)| (format.clone(), url))
}

fn map_music_playability(status: &str, reason: Option<&str>) -> AppError {
    let reason_text = reason.unwrap_or("This track is unavailable");
    let normalized = reason_text.to_ascii_lowercase();
    if normalized.contains("premium") {
        return AppError::MusicPremium("This track requires YouTube Music Premium".into());
    }
    AppError::ContentNotAvailable(format!("{status}: {reason_text}"))
}
