use crate::api::innertube::InnertubeClient;
use crate::api::innertube::core::botguard::generate_po_token;
use crate::api::innertube::core::context::{
    get_android_context, get_android_vr_context, get_ios_context,
};
use crate::api::innertube::core::utils::{
    collect_related_content_items, dedupe_related_content_items,
    extract_channel_id_from_video_renderer, extract_text_from_value, thumbnail_url_from_array,
};
use crate::errors::{AppError, AppResult};
use crate::models::video::{
    AudioTrack, CaptionTrack, RelatedContentItem, SabrStreamInfo, StreamInfo, StreamVariant,
    VideoChapter, VideoDetails,
};
use crate::streaming::sabr::engine::decode_b64_loose;
use crate::streaming::sabr::selector::{CodecSupport, SabrFormat, select_formats};
use crate::streaming::sabr::{ClientProfile, SabrSessionDescriptor};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use tracing::{debug, info, warn};

const ANDROID_VR_USER_AGENT: &str = "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)";
const ANDROID_USER_AGENT: &str = "com.google.android.youtube/21.03.38 (Linux; U; Android 14) gzip";
const IOS_USER_AGENT: &str =
    "com.google.ios.youtube/19.29.1 (iPhone14,5; U; CPU iOS 17_5_1 like Mac OS X; en_US)";
// Only referenced by the SABR live smoke test below.
#[cfg(test)]
const IPADOS_USER_AGENT: &str =
    "com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)";
const WEB_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

fn parse_timestamp(s: &str) -> Option<u64> {
    let cleaned: String = s
        .chars()
        .filter(|&c| c.is_ascii_digit() || c == ':')
        .collect();

    let parts: Vec<&str> = cleaned.split(':').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return None;
    }

    for part in &parts {
        if part.is_empty() || !part.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
    }

    if parts.len() == 2 {
        let minutes = parts[0].parse::<u64>().ok()?;
        let seconds = parts[1].parse::<u64>().ok()?;
        if seconds < 60 {
            return Some(minutes * 60 + seconds);
        }
    } else if parts.len() == 3 {
        let hours = parts[0].parse::<u64>().ok()?;
        let minutes = parts[1].parse::<u64>().ok()?;
        let seconds = parts[2].parse::<u64>().ok()?;
        if minutes < 60 && seconds < 60 {
            return Some(hours * 3600 + minutes * 60 + seconds);
        }
    }
    None
}

fn parse_chapters_from_description(description: &str, duration_seconds: u64) -> Vec<VideoChapter> {
    let mut temp_chapters = Vec::new();

    for line in description.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let words: Vec<&str> = line.split_whitespace().collect();
        if words.is_empty() {
            continue;
        }

        let mut found_ts = None;
        let mut ts_index = 0;
        for (idx, word) in words.iter().enumerate() {
            let cleaned: String = word
                .chars()
                .filter(|&c| c.is_ascii_digit() || c == ':')
                .collect();

            if !cleaned.is_empty() && cleaned.contains(':') {
                if let Some(secs) = parse_timestamp(&cleaned) {
                    found_ts = Some(secs);
                    ts_index = idx;
                    break;
                }
            }
        }

        if let Some(start_seconds) = found_ts {
            let mut title_words = Vec::new();
            for (idx, &word) in words.iter().enumerate() {
                if idx == ts_index {
                    continue;
                }
                if word == "-" || word == "–" || word == "|" || word == ":" || word == "—" {
                    continue;
                }
                title_words.push(word);
            }

            let mut title = title_words.join(" ");
            title = title
                .trim_matches(|c: char| {
                    c == '('
                        || c == ')'
                        || c == '['
                        || c == ']'
                        || c == '-'
                        || c == '–'
                        || c == ':'
                        || c == ' '
                })
                .to_string();

            if !title.is_empty() {
                temp_chapters.push((start_seconds, title));
            } else {
                temp_chapters.push((
                    start_seconds,
                    format!("Chapter {}", temp_chapters.len() + 1),
                ));
            }
        }
    }

    if temp_chapters.is_empty() {
        return Vec::new();
    }

    temp_chapters.sort_by_key(|c| c.0);
    temp_chapters.dedup_by_key(|c| c.0);

    if temp_chapters[0].0 > 10 {
        temp_chapters.insert(0, (0, "Intro".to_string()));
    } else {
        temp_chapters[0].0 = 0;
    }

    let mut chapters = Vec::new();
    let num_chapters = temp_chapters.len();
    for i in 0..num_chapters {
        let start_seconds = temp_chapters[i].0;
        let title = temp_chapters[i].1.clone();

        let end_seconds = if i < num_chapters - 1 {
            temp_chapters[i + 1].0
        } else {
            duration_seconds
        };

        if end_seconds > start_seconds {
            chapters.push(VideoChapter {
                title,
                start_seconds,
                end_seconds,
            });
        }
    }

    chapters
}

fn parse_chapters_from_marker_map(
    res: &serde_json::Value,
    duration_seconds: u64,
) -> Option<Vec<VideoChapter>> {
    let chapters_arr = res["markerMap"]["chapters"]["chapters"].as_array()?;
    if chapters_arr.is_empty() {
        return None;
    }

    let mut temp_chapters = Vec::new();
    for chap in chapters_arr {
        let chapter_renderer = &chap["chapterRenderer"];
        if chapter_renderer.is_null() {
            continue;
        }

        let title = if let Some(t) = extract_text_from_value(&chapter_renderer["title"]) {
            t
        } else if let Some(t) = chapter_renderer["title"]["simpleText"].as_str() {
            t.to_string()
        } else {
            continue;
        };

        let start_millis = chapter_renderer["timeRangeStartMillis"].as_u64()?;
        let start_seconds = start_millis / 1000;

        temp_chapters.push((start_seconds, title));
    }

    if temp_chapters.is_empty() {
        return None;
    }

    temp_chapters.sort_by_key(|c| c.0);
    temp_chapters.dedup_by_key(|c| c.0);

    if temp_chapters[0].0 > 10 {
        temp_chapters.insert(0, (0, "Intro".to_string()));
    } else {
        temp_chapters[0].0 = 0;
    }

    let mut chapters = Vec::new();
    let num_chapters = temp_chapters.len();
    for i in 0..num_chapters {
        let start_seconds = temp_chapters[i].0;
        let title = temp_chapters[i].1.clone();
        let end_seconds = if i < num_chapters - 1 {
            temp_chapters[i + 1].0
        } else {
            duration_seconds
        };

        if end_seconds > start_seconds {
            chapters.push(VideoChapter {
                title,
                start_seconds,
                end_seconds,
            });
        }
    }

    Some(chapters)
}

fn check_needs_reload(val: &Value) -> bool {
    if let Some(status) = val["playabilityStatus"]["status"].as_str() {
        if status
            .to_ascii_lowercase()
            .contains("page needs to be reloaded")
        {
            return true;
        }
    }
    if let Some(reason) = val["playabilityStatus"]["reason"].as_str() {
        if reason
            .to_ascii_lowercase()
            .contains("page needs to be reloaded")
        {
            return true;
        }
    }
    false
}

fn is_terminal_playability_status(status: &str) -> bool {
    matches!(
        status.to_ascii_uppercase().as_str(),
        "LIVE_STREAM_OFFLINE" | "UNPLAYABLE" | "ERROR"
    )
}

fn map_playability_error(status: &str, reason: Option<&str>) -> AppError {
    let reason_text = reason.unwrap_or("Unknown content availability error");
    let normalized_reason = reason_text.to_ascii_lowercase();

    if status.eq_ignore_ascii_case("login_required") {
        if normalized_reason.contains("inappropriate for some users") {
            return AppError::AgeRestricted(
                "This age-restricted video cannot be watched anonymously".into(),
            );
        }

        if normalized_reason.contains("private") {
            return AppError::PrivateContent("This video is private".into());
        }

        if normalized_reason.contains("a bot") {
            return AppError::BotCheckRequired(format!(
                "YouTube blocked anonymous watch access: {}: \"{}\"",
                status, reason_text
            ));
        }
    }

    if status.eq_ignore_ascii_case("unplayable") || status.eq_ignore_ascii_case("error") {
        if normalized_reason.contains("music premium") {
            return AppError::MusicPremium("This video is a YouTube Music Premium video".into());
        }

        if normalized_reason.contains("payment") {
            return AppError::PaidContent("This video is a paid video".into());
        }

        if normalized_reason.contains("members") {
            return AppError::PaidContent(
                "This video is only available for channel members".into(),
            );
        }

        if normalized_reason.contains("country") {
            return AppError::GeographicRestriction(
                "This video is not available in the current region".into(),
            );
        }

        if normalized_reason.contains("closed") || normalized_reason.contains("terminated") {
            return AppError::AccountTerminated(reason_text.to_string());
        }
    }

    AppError::ContentNotAvailable(format!("Got error {}: \"{}\"", status, reason_text))
}

fn check_playability_status(playability_status: &Value) -> AppResult<()> {
    let Some(status) = playability_status["status"].as_str() else {
        return Ok(());
    };

    if status.eq_ignore_ascii_case("ok") {
        return Ok(());
    }

    Err(map_playability_error(
        status,
        playability_status["reason"].as_str(),
    ))
}

fn validate_stream_url(stream_url: &str, video_id: &str) -> AppResult<String> {
    let parsed_url = reqwest::Url::parse(stream_url).map_err(|error| {
        AppError::Extractor(format!(
            "Failed to parse extracted stream URL for video {video_id}: {error}"
        ))
    })?;

    let has_throttling_parameter = parsed_url
        .query_pairs()
        .any(|(key, value)| key == "n" && !value.is_empty());

    if has_throttling_parameter {
        return Err(AppError::Extractor(format!(
            "Stream URL for video {video_id} still requires throttling parameter deobfuscation"
        )));
    }

    Ok(parsed_url.into())
}

fn extract_stream_url_from_format(format: &Value, video_id: &str) -> AppResult<Option<String>> {
    if let Some(url) = format["url"].as_str() {
        return validate_stream_url(url, video_id).map(Some);
    }

    let Some(cipher_string) = format["cipher"]
        .as_str()
        .or_else(|| format["signatureCipher"].as_str())
    else {
        return Ok(None);
    };

    let query_url = reqwest::Url::parse(&format!("https://example.invalid/?{cipher_string}"))
        .map_err(|error| {
            AppError::Extractor(format!(
                "Failed to parse stream cipher for video {video_id}: {error}"
            ))
        })?;

    let mut base_url = None;
    let mut signature_parameter = None;
    let mut direct_signature = None;
    let mut encrypted_signature = None;

    for (key, value) in query_url.query_pairs() {
        match key.as_ref() {
            "url" => base_url = Some(value.into_owned()),
            "sp" => signature_parameter = Some(value.into_owned()),
            "sig" | "signature" => direct_signature = Some(value.into_owned()),
            "s" => encrypted_signature = Some(value.into_owned()),
            _ => {}
        }
    }

    let Some(base_url) = base_url else {
        return Err(AppError::Extractor(format!(
            "Cipher-protected format for video {video_id} is missing its base URL"
        )));
    };

    if let Some(signature) = direct_signature {
        let parameter_name = signature_parameter.unwrap_or_else(|| "signature".to_string());
        let mut parsed_url = reqwest::Url::parse(&base_url).map_err(|error| {
            AppError::Extractor(format!(
                "Failed to parse signed stream URL for video {video_id}: {error}"
            ))
        })?;

        parsed_url
            .query_pairs_mut()
            .append_pair(&parameter_name, &signature);

        return validate_stream_url(parsed_url.as_ref(), video_id).map(Some);
    }

    if encrypted_signature.is_some() {
        return Err(AppError::Extractor(format!(
            "Cipher-protected stream for video {video_id} still requires signature deobfuscation"
        )));
    }

    validate_stream_url(&base_url, video_id).map(Some)
}

fn quality_height(format: &Value) -> Option<u64> {
    format["height"].as_u64().or_else(|| {
        format["qualityLabel"].as_str().and_then(|label| {
            let digits = label
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>();
            digits.parse::<u64>().ok()
        })
    })
}

fn parse_range_value(range: &Value) -> (Option<u64>, Option<u64>) {
    (
        range["start"]
            .as_str()
            .and_then(|value| value.parse::<u64>().ok()),
        range["end"]
            .as_str()
            .and_then(|value| value.parse::<u64>().ok()),
    )
}

fn parse_approx_duration_ms(format: &Value) -> Option<u64> {
    format["approxDurationMs"]
        .as_str()
        .and_then(|value| value.parse::<u64>().ok())
}

fn parse_content_length(format: &Value) -> Option<u64> {
    format["contentLength"]
        .as_str()
        .and_then(|value| value.parse::<u64>().ok())
        .or_else(|| format["contentLength"].as_u64())
}

fn append_or_replace_query_param(raw_url: &str, key: &str, value: &str) -> Option<String> {
    let mut url = reqwest::Url::parse(raw_url).ok()?;
    let query_pairs: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(existing_key, _)| existing_key != key)
        .map(|(existing_key, existing_value)| {
            (existing_key.into_owned(), existing_value.into_owned())
        })
        .collect();
    url.query_pairs_mut()
        .clear()
        .extend_pairs(query_pairs)
        .append_pair(key, value);
    Some(url.to_string())
}

fn caption_url(base_url: &str, translated_language_code: Option<&str>) -> Option<String> {
    let url = if let Some(language_code) = translated_language_code {
        append_or_replace_query_param(base_url, "tlang", language_code)?
    } else {
        base_url.to_string()
    };
    append_or_replace_query_param(&url, "fmt", "vtt")
}

fn format_is_video(format: &Value) -> bool {
    format["mimeType"]
        .as_str()
        .map(|mime| mime.starts_with("video/"))
        .unwrap_or(false)
        && format["qualityLabel"].as_str().is_some()
}

fn build_stream_variant_from_format(
    format: &Value,
    video_id: &str,
    is_progressive: bool,
) -> AppResult<Option<StreamVariant>> {
    if !format_is_video(format) {
        return Ok(None);
    }

    let itag = format["itag"]
        .as_i64()
        .map(|value| value.to_string())
        .unwrap_or_else(|| format["quality"].as_str().unwrap_or("unknown").to_string());
    let height = quality_height(format);
    let quality_label = format["qualityLabel"]
        .as_str()
        .map(ToOwned::to_owned)
        .or_else(|| height.map(|h| format!("{h}p")))
        .unwrap_or_else(|| "Auto".to_string());

    let local_url = extract_stream_url_from_format(format, video_id)?.unwrap_or_default();
    let is_playable = !local_url.is_empty();
    let (init_range_start, init_range_end) = parse_range_value(&format["initRange"]);
    let (index_range_start, index_range_end) = parse_range_value(&format["indexRange"]);

    Ok(Some(StreamVariant {
        id: itag,
        local_url,
        quality_label,
        mime_type: format["mimeType"].as_str().map(ToOwned::to_owned),
        width: format["width"].as_u64(),
        height,
        fps: format["fps"].as_u64(),
        bitrate: format["bitrate"].as_u64(),
        content_length: parse_content_length(format),
        is_default: false,
        is_playable,
        has_audio: is_progressive,
        is_video_only: !is_progressive,
        delivery_method: if is_progressive {
            "progressive"
        } else {
            "adaptive"
        }
        .to_string(),
        init_range_start,
        init_range_end,
        index_range_start,
        index_range_end,
        approx_duration_ms: parse_approx_duration_ms(format),
    }))
}

fn collect_stream_variants(
    streaming_data: &Value,
    video_id: &str,
) -> (Vec<StreamVariant>, Option<AppError>) {
    let mut variants = Vec::new();
    let mut last_error = None;

    if let Some(formats) = streaming_data["formats"].as_array() {
        for format in formats {
            match build_stream_variant_from_format(format, video_id, true) {
                Ok(Some(variant)) => variants.push(variant),
                Ok(None) => {}
                Err(error) => last_error = Some(error),
            }
        }
    }

    if let Some(adaptive_formats) = streaming_data["adaptiveFormats"].as_array() {
        for format in adaptive_formats {
            if format_is_video(format) {
                match build_stream_variant_from_format(format, video_id, false) {
                    Ok(Some(variant)) => variants.push(variant),
                    Ok(None) => {}
                    Err(error) => last_error = Some(error),
                }
            }
        }
    }

    variants.sort_by(|a, b| {
        b.height
            .unwrap_or(0)
            .cmp(&a.height.unwrap_or(0))
            .then_with(|| b.is_playable.cmp(&a.is_playable))
            .then_with(|| b.bitrate.unwrap_or(0).cmp(&a.bitrate.unwrap_or(0)))
    });

    let mut seen = std::collections::HashSet::new();
    variants.retain(|variant| {
        let key = format!(
            "{}:{}:{}:{}:{}",
            variant.quality_label,
            variant.fps.unwrap_or(0),
            variant.is_playable,
            variant.mime_type.as_deref().unwrap_or_default(),
            variant.delivery_method,
        );
        seen.insert(key)
    });

    if let Some(default_index) = variants.iter().position(|variant| variant.is_playable) {
        if let Some(default) = variants.get_mut(default_index) {
            default.is_default = true;
        }
    }

    (variants, last_error)
}

fn collect_caption_tracks(response: &Value) -> Vec<CaptionTrack> {
    let renderer = &response["captions"]["playerCaptionsTracklistRenderer"];
    let Some(tracks) = renderer["captionTracks"].as_array() else {
        return Vec::new();
    };

    let mut captions = Vec::new();
    let mut native_language_codes = HashSet::new();

    for (index, track) in tracks.iter().enumerate() {
        let Some(base_url) = track["baseUrl"].as_str() else {
            continue;
        };
        let language_code = track["languageCode"].as_str().unwrap_or("und").to_string();
        native_language_codes.insert(language_code.clone());
        let label =
            extract_text_from_value(&track["name"]).unwrap_or_else(|| language_code.clone());
        let vss_id = track["vssId"].as_str().unwrap_or_default();
        let is_auto_generated = vss_id.starts_with("a.")
            || track["kind"]
                .as_str()
                .map(|kind| kind.eq_ignore_ascii_case("asr"))
                .unwrap_or(false);
        let Some(url) = caption_url(base_url, None) else {
            continue;
        };

        captions.push(CaptionTrack {
            id: format!("caption-{index}-{language_code}"),
            label,
            language_code,
            url,
            is_auto_generated,
        });
    }

    let translatable_track = tracks.iter().find(|track| {
        track["isTranslatable"].as_bool().unwrap_or(false) && track["baseUrl"].as_str().is_some()
    });

    if let Some(track) = translatable_track {
        let base_url = track["baseUrl"].as_str().unwrap_or_default();
        if let Some(translation_languages) = renderer["translationLanguages"].as_array() {
            let mut seen_translations = HashSet::new();
            for language in translation_languages {
                let Some(language_code) = language["languageCode"].as_str() else {
                    continue;
                };
                if native_language_codes.contains(language_code)
                    || !seen_translations.insert(language_code.to_string())
                {
                    continue;
                }
                let Some(url) = caption_url(base_url, Some(language_code)) else {
                    continue;
                };
                let label = extract_text_from_value(&language["languageName"])
                    .unwrap_or_else(|| language_code.to_string());

                captions.push(CaptionTrack {
                    id: format!("caption-translated-{language_code}"),
                    label: format!("{label} (auto-translated)"),
                    language_code: language_code.to_string(),
                    url,
                    is_auto_generated: true,
                });
            }
        }
    }

    captions
}

// Build the audio track list from a player response's `adaptiveFormats`. The PO
// token is never appended to these GVS media URLs (it belongs only on the player
// request body and the SABR `StreamerContext`); a stale/wrong `&pot=` 403s.
fn collect_audio_tracks(streaming_data: &Value, user_agent: &str) -> Vec<AudioTrack> {
    let mut tracks_by_key: HashMap<String, AudioTrack> = HashMap::new();

    if let Some(adaptive_formats) = streaming_data["adaptiveFormats"].as_array() {
        for format in adaptive_formats {
            let Some(mime) = format["mimeType"].as_str() else {
                continue;
            };
            if !mime.starts_with("audio/") {
                continue;
            }

            let audio_track = &format["audioTrack"];
            let itag = format["itag"]
                .as_i64()
                .map(|itag| itag.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let id = audio_track["id"]
                .as_str()
                .map(ToOwned::to_owned)
                .or_else(|| format["itag"].as_i64().map(|itag| format!("itag-{itag}")))
                .unwrap_or_else(|| "default".to_string());
            let language_code = audio_track_language_code(audio_track, &id);
            let label = audio_track["displayName"]
                .as_str()
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .or_else(|| language_code.clone())
                .unwrap_or_else(|| "Original audio".to_string());
            let local_url = match extract_stream_url_from_format(format, "audio-track") {
                Ok(Some(url)) => url,
                Ok(None) => continue,
                Err(_) => continue,
            };

            let bitrate = format["bitrate"]
                .as_u64()
                .or_else(|| format["averageBitrate"].as_u64());
            let (init_range_start, init_range_end) = parse_range_value(&format["initRange"]);
            let (index_range_start, index_range_end) = parse_range_value(&format["indexRange"]);
            let is_auto_dubbed = audio_track["isAutoDubbed"].as_bool().unwrap_or(false);
            let is_default = audio_track["audioIsDefault"]
                .as_bool()
                .unwrap_or_else(|| !is_auto_dubbed && tracks_by_key.is_empty());
            let mime_type = format["mimeType"].as_str().map(ToOwned::to_owned);
            let track_key = audio_track_identity_key(
                audio_track,
                &id,
                language_code.as_deref(),
                mime_type.as_deref(),
            );
            let track = AudioTrack {
                id: format!("{id}-{itag}"),
                label,
                language_code,
                audio_track_type: Some(
                    if is_default { "original" } else { "alternate" }.to_string(),
                ),
                local_url,
                mime_type,
                bitrate,
                content_length: parse_content_length(format),
                is_default,
                available: is_default,
                init_range_start,
                init_range_end,
                index_range_start,
                index_range_end,
                approx_duration_ms: parse_approx_duration_ms(format),
                user_agent: Some(user_agent.to_string()),
            };

            match tracks_by_key.get(&track_key) {
                Some(existing) if existing.bitrate.unwrap_or(0) >= track.bitrate.unwrap_or(0) => {}
                _ => {
                    tracks_by_key.insert(track_key, track);
                }
            }
        }
    }

    let mut tracks: Vec<_> = tracks_by_key.into_values().collect();
    tracks.sort_by(|a, b| {
        b.is_default
            .cmp(&a.is_default)
            .then_with(|| a.label.cmp(&b.label))
            .then_with(|| b.bitrate.unwrap_or(0).cmp(&a.bitrate.unwrap_or(0)))
    });

    tracks
}

fn audio_track_language_code(audio_track: &Value, id: &str) -> Option<String> {
    if let Some(language_code) = audio_track["languageCode"]
        .as_str()
        .filter(|value| !value.is_empty())
    {
        return Some(language_code.to_string());
    }

    let suffix = id
        .rsplit_once('_')
        .map(|(_, suffix)| suffix)
        .filter(|value| looks_like_language_code(value));
    if let Some(language_code) = suffix {
        return Some(language_code.to_string());
    }

    let prefix = id
        .split_once('.')
        .map(|(prefix, _)| prefix)
        .filter(|value| looks_like_language_code(value));
    if let Some(language_code) = prefix {
        return Some(language_code.to_string());
    }

    id.rsplit_once('.')
        .map(|(_, suffix)| suffix)
        .filter(|value| looks_like_language_code(value))
        .map(ToOwned::to_owned)
}

fn audio_track_identity_key(
    audio_track: &Value,
    id: &str,
    language_code: Option<&str>,
    mime_type: Option<&str>,
) -> String {
    let identity = audio_track["displayName"]
        .as_str()
        .filter(|value| !value.is_empty())
        .map(|value| format!("name:{value}"))
        .or_else(|| language_code.map(|value| format!("lang:{value}")))
        .unwrap_or_else(|| format!("id:{id}"));
    format!("{identity}|{}", mime_type.unwrap_or_default())
}

fn looks_like_language_code(value: &str) -> bool {
    (2..=12).contains(&value.len())
        && value
            .chars()
            .all(|c| c.is_ascii_alphabetic() || c == '-' || c == '_')
        && value.chars().any(|c| c.is_ascii_alphabetic())
}

fn extract_duration_seconds_from_player_response(response: &Value) -> Option<u64> {
    response["videoDetails"]["lengthSeconds"]
        .as_str()
        .and_then(|value| value.parse::<u64>().ok())
        .or_else(|| {
            response["microformat"]["playerMicroformatRenderer"]["lengthSeconds"]
                .as_str()
                .and_then(|value| value.parse::<u64>().ok())
        })
        .or_else(|| {
            response["streamingData"]["adaptiveFormats"]
                .as_array()
                .and_then(|formats| formats.first())
                .and_then(|format| format["approxDurationMs"].as_str())
                .and_then(|value| value.parse::<u64>().ok())
                .map(|duration_ms| duration_ms / 1000)
        })
}

fn clean_like_count_from_accessibility(text: &str) -> String {
    let words: Vec<&str> = text.split_whitespace().collect();
    for w in words {
        let cleaned_word = w.trim_matches(|c: char| !c.is_alphanumeric() && c != ',' && c != '.');
        if cleaned_word.chars().any(|c| c.is_ascii_digit()) {
            return cleaned_word.to_string();
        }
    }
    text.to_string()
}

// ---------------------------------------------------------------------------
// SABR metadata extraction
// ---------------------------------------------------------------------------

fn parse_sabr_formats(streaming_data: &Value) -> Vec<SabrFormat> {
    let mut formats = Vec::new();
    let Some(adaptive) = streaming_data["adaptiveFormats"].as_array() else {
        return formats;
    };
    for format in adaptive {
        let Some(itag) = format["itag"].as_i64() else {
            continue;
        };
        let mime_type = format["mimeType"].as_str().unwrap_or_default().to_string();
        if mime_type.is_empty() {
            continue;
        }
        let is_audio = mime_type.starts_with("audio/");
        let last_modified = format["lastModified"]
            .as_str()
            .and_then(|v| v.parse::<u64>().ok())
            .or_else(|| format["lastModified"].as_u64())
            .unwrap_or(0);
        let xtags = format["xtags"].as_str().map(ToOwned::to_owned);
        let bitrate = format["bitrate"]
            .as_u64()
            .or_else(|| format["averageBitrate"].as_u64())
            .unwrap_or(0);
        let approx_duration_ms = format["approxDurationMs"]
            .as_str()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);

        let audio_track = &format["audioTrack"];
        let audio_track_id = audio_track["id"].as_str().map(ToOwned::to_owned);
        let audio_track_name = audio_track["displayName"].as_str().map(ToOwned::to_owned);
        let audio_is_default = audio_track["audioIsDefault"]
            .as_bool()
            .unwrap_or(audio_track.is_null() && is_audio);

        formats.push(SabrFormat {
            itag: itag as i32,
            last_modified,
            xtags,
            mime_type,
            bitrate,
            width: format["width"].as_u64().unwrap_or(0),
            height: format["height"].as_u64().unwrap_or(0),
            fps: format["fps"].as_u64().unwrap_or(0),
            approx_duration_ms,
            is_audio,
            audio_track_id,
            audio_track_name,
            audio_is_default,
        });
    }
    formats
}

// `streamingData.serverAbrStreamingUrl`, if present and non-empty.
fn extract_server_abr_url(streaming_data: &Value) -> Option<String> {
    streaming_data["serverAbrStreamingUrl"]
        .as_str()
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned)
}

// Decode `playerConfig.mediaCommonConfig.mediaUstreamerRequestConfig
// .videoPlaybackUstreamerConfig` (URL-safe base64) into raw protobuf bytes.
fn extract_ustreamer_config(res: &Value) -> Vec<u8> {
    res["playerConfig"]["mediaCommonConfig"]["mediaUstreamerRequestConfig"]
        ["videoPlaybackUstreamerConfig"]
        .as_str()
        .filter(|v| !v.is_empty())
        .and_then(decode_b64_loose)
        .unwrap_or_default()
}

// Build the frontend-facing `SabrStreamInfo` and the internal session
// descriptor from a successful player response. Returns `(None, None)` when no
// SABR metadata is present at all.
fn build_sabr_metadata(
    res: &Value,
    streaming_data: &Value,
    video_id: &str,
    visitor_data: Option<String>,
    po_token: Option<String>,
    client_name: &str,
    duration_seconds: Option<u64>,
) -> (Option<SabrStreamInfo>, Option<SabrSessionDescriptor>) {
    let server_url = extract_server_abr_url(streaming_data);
    let formats = parse_sabr_formats(streaming_data);
    let ustreamer_config = extract_ustreamer_config(res);

    let has_audio = formats.iter().any(|f| f.is_audio);
    let has_video = formats.iter().any(|f| !f.is_audio);
    let selectable = select_formats(&formats, None, CodecSupport::default());

    // Observability: one structured line capturing SABR-capability inputs.
    info!(
        video_id = %video_id,
        client = %client_name,
        sabr_url_present = server_url.is_some(),
        ustreamer_config_present = !ustreamer_config.is_empty(),
        po_token_present = po_token.is_some(),
        adaptive_format_count = formats.len(),
        has_audio,
        has_video,
        selectable = selectable.is_some(),
        "sabr_capability_probe"
    );

    // No SABR endpoint at all: nothing to expose.
    let Some(server_url) = server_url else {
        return (None, None);
    };

    let has_po_token = po_token.as_deref().map(|t| !t.is_empty()).unwrap_or(false);
    let has_visitor_data = visitor_data
        .as_deref()
        .map(|v| !v.is_empty())
        .unwrap_or(false);
    let requires_po_token = !has_po_token;
    let (selected_audio_itag, selected_video_itag) = match &selectable {
        Some(sel) => (Some(sel.audio.itag), Some(sel.video.itag)),
        None => (None, None),
    };

    let available =
        has_audio && has_video && selectable.is_some() && has_po_token && has_visitor_data;
    let reason_unavailable = if available {
        None
    } else if !has_po_token {
        Some("SABR requires a PO token, which is unavailable for this client".to_string())
    } else if !has_visitor_data {
        Some("SABR requires visitor data, which is unavailable".to_string())
    } else if !has_audio || !has_video {
        Some("missing audio or video adaptive formats".to_string())
    } else {
        Some("no playable format pair under codec constraints".to_string())
    };

    let duration_ms = duration_seconds
        .map(|s| s * 1000)
        .or_else(|| {
            formats
                .iter()
                .map(|f| f.approx_duration_ms)
                .filter(|d| *d > 0)
                .max()
        })
        .unwrap_or(0);

    let info = SabrStreamInfo {
        available,
        manifest_url: None,
        audio_url: None,
        video_url: None,
        selected_audio_itag,
        selected_video_itag,
        expires_in_seconds: streaming_data["expiresInSeconds"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok()),
        requires_po_token,
        reason_unavailable,
    };

    let descriptor = if available {
        Some(SabrSessionDescriptor {
            video_id: video_id.to_string(),
            server_abr_streaming_url: server_url,
            visitor_data,
            po_token,
            ustreamer_config,
            client_profile: ClientProfile::from_client_name(client_name),
            duration_ms,
            formats,
        })
    } else {
        None
    };

    (Some(info), descriptor)
}

impl InnertubeClient {
    pub async fn get_video_details(&self, video_id: &str) -> AppResult<VideoDetails> {
        let video_id_trimmed = video_id.trim();
        if video_id_trimmed.is_empty() {
            return Err(AppError::Validation("Video ID cannot be empty".into()));
        }

        // Initialize visitor session token
        let visitor_data = self.fetch_visitor_data().await;

        let mut vr_payload = serde_json::json!({
            "context": get_android_vr_context(visitor_data.clone()),
            "videoId": video_id_trimmed,
            "contentCheckOk": true,
            "racyCheckOk": true
        });

        let mut res = self
            .post_innertube("player", "ANDROID_VR", "1.61.48", &mut vr_payload)
            .await;

        let mut should_fallback_to_ios = false;
        let mut recovered_with_android = false;
        let mut android_recovery = None;
        if let Ok(ref val) = res {
            if check_needs_reload(val) {
                should_fallback_to_ios = true;
            } else if let Some(status) = val["playabilityStatus"]["status"].as_str() {
                if !status.eq_ignore_ascii_case("OK") {
                    if is_terminal_playability_status(status) {
                        warn!(status = %status, video_id = %video_id_trimmed, "ANDROID_VR details request returned a terminal playability status; trying ANDROID fallback");
                        let mut android_payload = serde_json::json!({
                            "context": get_android_context(visitor_data.clone()),
                            "videoId": video_id_trimmed,
                            "contentCheckOk": true,
                            "racyCheckOk": true
                        });
                        if let Ok(Ok(android_res)) = tokio::time::timeout(
                            std::time::Duration::from_millis(1500),
                            self.post_innertube(
                                "player",
                                "ANDROID",
                                "21.03.38",
                                &mut android_payload,
                            ),
                        )
                        .await
                        {
                            if android_res["playabilityStatus"]["status"]
                                .as_str()
                                .map(|status| status.eq_ignore_ascii_case("OK"))
                                .unwrap_or(false)
                            {
                                android_recovery = Some(android_res);
                                should_fallback_to_ios = false;
                                recovered_with_android = true;
                            }
                        }
                        if !recovered_with_android {
                            return Err(map_playability_error(
                                status,
                                val["playabilityStatus"]["reason"].as_str(),
                            ));
                        }
                    }
                    if !recovered_with_android {
                        warn!(status = %status, video_id = %video_id_trimmed, "ANDROID_VR details request returned a non-OK playability status, falling back to IOS");
                        should_fallback_to_ios = true;
                    }
                }
            }
        } else {
            warn!(video_id = %video_id_trimmed, "ANDROID_VR details request failed, falling back to IOS");
            should_fallback_to_ios = true;
        }
        if let Some(android_res) = android_recovery {
            res = Ok(android_res);
        }

        if should_fallback_to_ios {
            let mut ios_payload = serde_json::json!({
                "context": get_ios_context(visitor_data.clone(), None),
                "videoId": video_id_trimmed,
                "contentCheckOk": true,
                "racyCheckOk": true,
                "playbackContext": {
                    "contentPlaybackContext": {
                        "referer": "https://www.youtube.com",
                        "signatureTimestamp": 19550
                    }
                }
            });

            let mut ios_res = self
                .post_innertube("player", "IOS", "19.29.1", &mut ios_payload)
                .await;

            let mut needs_retry = false;
            if let Ok(ref val) = ios_res {
                if check_needs_reload(val) {
                    needs_retry = true;
                }
            }

            if needs_retry {
                let mut retry_payload = serde_json::json!({
                    "context": get_ios_context(visitor_data, None),
                    "videoId": video_id_trimmed,
                    "contentCheckOk": true,
                    "racyCheckOk": true,
                    "playbackContext": {
                        "contentPlaybackContext": {
                            "referer": format!("https://youtu.be/{}", video_id_trimmed),
                            "signatureTimestamp": 19550
                        }
                    },
                    "custom_referer": format!("https://youtu.be/{}", video_id_trimmed)
                });
                ios_res = self
                    .post_innertube("player", "IOS", "19.29.1", &mut retry_payload)
                    .await;
            }
            res = ios_res;
        }

        let res = res?;
        check_playability_status(&res["playabilityStatus"])?;

        let details = &res["videoDetails"];
        if details.is_null() {
            return Err(AppError::Extractor(
                "Failed to fetch video details from Innertube".into(),
            ));
        }

        let id = details["videoId"]
            .as_str()
            .unwrap_or(video_id_trimmed)
            .to_string();
        let title = details["title"].as_str().unwrap_or_default().to_string();
        let mut channel_name = details["author"].as_str().unwrap_or_default().to_string();
        let description = details["shortDescription"].as_str().map(|s| s.to_string());

        let thumbnail_url = thumbnail_url_from_array(&details["thumbnail"]["thumbnails"]);

        let duration_seconds = extract_duration_seconds_from_player_response(&res);
        let mut channel_id = details["channelId"].as_str().map(|s| s.to_string());

        let mut like_count_text = None;
        let mut view_count_text = None;
        let mut published_text = None;

        let mut next_payload = serde_json::json!({
            "videoId": &id
        });
        if let Ok(next_res) = self
            .post_innertube("next", "WEB", "2.20260120.01.00", &mut next_payload)
            .await
        {
            let mut primary_info = &serde_json::Value::Null;
            let mut secondary_info = &serde_json::Value::Null;
            if let Some(contents) =
                next_res["contents"]["twoColumnWatchNextResults"]["results"]["results"]["contents"]
                    .as_array()
            {
                for c in contents {
                    if c.get("videoPrimaryInfoRenderer").is_some() {
                        primary_info = &c["videoPrimaryInfoRenderer"];
                    }
                    if c.get("videoSecondaryInfoRenderer").is_some() {
                        secondary_info = &c["videoSecondaryInfoRenderer"];
                    }
                }
            }

            if !secondary_info.is_null() {
                let owner = &secondary_info["owner"]["videoOwnerRenderer"];
                if channel_name.is_empty() {
                    if let Some(owner_name) = extract_text_from_value(&owner["title"]) {
                        channel_name = owner_name;
                    }
                }

                if channel_id.is_none() {
                    channel_id = owner["navigationEndpoint"]["browseEndpoint"]["browseId"]
                        .as_str()
                        .map(ToOwned::to_owned)
                        .or_else(|| extract_channel_id_from_video_renderer(owner));
                }
            }

            if !primary_info.is_null() {
                // Extract views
                if let Some(views) =
                    primary_info["viewCount"]["videoViewCountRenderer"]["viewCount"]["simpleText"]
                        .as_str()
                        .or_else(|| {
                            primary_info["viewCount"]["videoViewCountRenderer"]["viewCount"]["runs"]
                                [0]["text"]
                                .as_str()
                        })
                        .or_else(|| {
                            primary_info["viewCount"]["videoViewCountRenderer"]["shortViewCount"]
                            ["simpleText"]
                            .as_str()
                        })
                        .or_else(|| {
                            primary_info["viewCount"]["videoViewCountRenderer"]["shortViewCount"]
                            ["runs"][0]["text"]
                            .as_str()
                        })
                {
                    view_count_text = Some(views.to_string());
                }

                // Extract published text
                if let Some(pub_date) = primary_info["dateText"]["simpleText"]
                    .as_str()
                    .or_else(|| primary_info["dateText"]["runs"][0]["text"].as_str())
                    .or_else(|| primary_info["relativeDateText"]["simpleText"].as_str())
                    .or_else(|| primary_info["relativeDateText"]["runs"][0]["text"].as_str())
                {
                    published_text = Some(pub_date.to_string());
                }

                // Extract like count
                if let Some(top_level_buttons) =
                    primary_info["videoActions"]["menuRenderer"]["topLevelButtons"].as_array()
                {
                    for btn in top_level_buttons {
                        if let Some(view_model) = btn.get("segmentedLikeDislikeButtonViewModel") {
                            let button_vm = &view_model["likeButtonViewModel"]["likeButtonViewModel"]
                                ["toggleButtonViewModel"]["toggleButtonViewModel"]["defaultButtonViewModel"]
                                ["buttonViewModel"];
                            if let Some(title) = button_vm["title"]["runs"][0]["text"]
                                .as_str()
                                .or_else(|| button_vm["title"]["simpleText"].as_str())
                            {
                                like_count_text = Some(title.to_string());
                            } else if let Some(acc_text) = button_vm["accessibilityText"].as_str() {
                                like_count_text =
                                    Some(clean_like_count_from_accessibility(acc_text));
                            }
                        }
                        if like_count_text.is_none() {
                            if let Some(renderer) = btn.get("segmentedLikeDislikeButtonRenderer") {
                                let toggle_btn = &renderer["likeButton"]["toggleButtonRenderer"];
                                if !toggle_btn.is_null() {
                                    if let Some(label) = toggle_btn["accessibilityData"]
                                        ["accessibilityData"]["label"]
                                        .as_str()
                                        .or_else(|| toggle_btn["accessibility"]["label"].as_str())
                                        .or_else(|| {
                                            toggle_btn["defaultText"]["accessibility"]
                                                ["accessibilityData"]["label"]
                                                .as_str()
                                        })
                                    {
                                        like_count_text =
                                            Some(clean_like_count_from_accessibility(label));
                                    } else if let Some(text) = toggle_btn["defaultText"]["runs"][0]
                                        ["text"]
                                        .as_str()
                                        .or_else(|| {
                                            toggle_btn["defaultText"]["simpleText"].as_str()
                                        })
                                    {
                                        like_count_text = Some(text.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let duration_secs = duration_seconds.unwrap_or(0);
        let chapters = parse_chapters_from_marker_map(&res, duration_secs).unwrap_or_else(|| {
            if let Some(ref desc) = description {
                parse_chapters_from_description(desc, duration_secs)
            } else {
                Vec::new()
            }
        });

        Ok(VideoDetails {
            id,
            title,
            channel_name,
            channel_id,
            description,
            thumbnail_url,
            duration_seconds,
            like_count_text,
            view_count_text,
            published_text,
            chapters,
            is_live: res["videoDetails"]["isLive"].as_bool().unwrap_or(false),
        })
    }

    pub async fn get_related_videos(&self, video_id: &str) -> AppResult<Vec<RelatedContentItem>> {
        let video_id_trimmed = video_id.trim();
        if video_id_trimmed.is_empty() {
            return Err(AppError::Validation("Video ID cannot be empty".into()));
        }

        let mut payload = serde_json::json!({
            "videoId": video_id_trimmed
        });

        let next_res = self
            .post_innertube("next", "WEB", "2.20260120.01.00", &mut payload)
            .await?;
        let mut related = Vec::new();
        collect_related_content_items(
            &next_res["contents"]["twoColumnWatchNextResults"]["secondaryResults"],
            &mut related,
        );

        if related.is_empty() {
            collect_related_content_items(
                &next_res["contents"]["twoColumnWatchNextResults"]["autoplay"],
                &mut related,
            );
        }

        Ok(dedupe_related_content_items(related))
    }

    pub async fn get_stream_info(&self, video_id: &str) -> AppResult<StreamInfo> {
        let video_id_trimmed = video_id.trim();
        if video_id_trimmed.is_empty() {
            return Err(AppError::Validation("Video ID cannot be empty".into()));
        }

        // 1. Fetch visitor session data
        let visitor_data = self.fetch_visitor_data().await;
        let mut visitor_data_for_sabr = visitor_data.clone();

        // 2. Prefer ANDROID_VR first for faster playback and keep IOS as a signed fallback.
        let mut vr_payload = serde_json::json!({
            "context": get_android_vr_context(visitor_data.clone()),
            "videoId": video_id_trimmed,
            "contentCheckOk": true,
            "racyCheckOk": true
        });

        let mut res = self
            .post_innertube("player", "ANDROID_VR", "1.61.48", &mut vr_payload)
            .await;

        let mut should_fallback_to_ios = false;
        let mut current_user_agent = ANDROID_VR_USER_AGENT;
        let mut sabr_client_name = "ANDROID_VR";
        let mut po_token_used: Option<String> = None;
        let mut recovered_with_android = false;
        let mut android_recovery = None;

        if let Ok(ref val) = res {
            if check_needs_reload(val) {
                should_fallback_to_ios = true;
            } else if let Some(status) = val["playabilityStatus"]["status"].as_str() {
                if !status.eq_ignore_ascii_case("OK") {
                    if is_terminal_playability_status(status) {
                        warn!(status = %status, video_id = %video_id_trimmed, "ANDROID_VR returned a terminal playability status; trying ANDROID Shorts fallback");
                        let mut android_payload = serde_json::json!({
                            "context": get_android_context(visitor_data.clone()),
                            "videoId": video_id_trimmed,
                            "contentCheckOk": true,
                            "racyCheckOk": true
                        });
                        if let Ok(Ok(android_res)) = tokio::time::timeout(
                            std::time::Duration::from_millis(1500),
                            self.post_innertube(
                                "player",
                                "ANDROID",
                                "21.03.38",
                                &mut android_payload,
                            ),
                        )
                        .await
                        {
                            if android_res["playabilityStatus"]["status"]
                                .as_str()
                                .map(|status| status.eq_ignore_ascii_case("OK"))
                                .unwrap_or(false)
                            {
                                android_recovery = Some(android_res);
                                recovered_with_android = true;
                                should_fallback_to_ios = false;
                                current_user_agent = ANDROID_USER_AGENT;
                                sabr_client_name = "ANDROID";
                            }
                        }
                        if !recovered_with_android {
                            return Err(map_playability_error(
                                status,
                                val["playabilityStatus"]["reason"].as_str(),
                            ));
                        }
                    }
                    if !recovered_with_android {
                        warn!(status = %status, video_id = %video_id_trimmed, "ANDROID_VR returned a non-OK playability status, falling back to IOS");
                        should_fallback_to_ios = true;
                    }
                }
            }
        } else {
            warn!(video_id = %video_id_trimmed, "ANDROID_VR player request failed, falling back to IOS");
            should_fallback_to_ios = true;
        }
        if let Some(android_res) = android_recovery {
            res = Ok(android_res);
        }

        if should_fallback_to_ios {
            // Bind the PO token to the session visitor data so it is valid both
            // in the player request and when echoed on the GVS media URLs.
            let pot_binding = visitor_data_for_sabr
                .as_deref()
                .filter(|value| !value.is_empty())
                .unwrap_or(video_id_trimmed);
            let po_token = generate_po_token(pot_binding).await;
            po_token_used = po_token.clone();
            sabr_client_name = "IOS";
            let mut ios_payload = serde_json::json!({
                "context": get_ios_context(visitor_data.clone(), po_token.clone()),
                "videoId": video_id_trimmed,
                "contentCheckOk": true,
                "racyCheckOk": true,
                "playbackContext": {
                    "contentPlaybackContext": {
                        "referer": "https://www.youtube.com",
                        "signatureTimestamp": 19550
                    }
                }
            });
            let mut ios_res = self
                .post_innertube("player", "IOS", "19.29.1", &mut ios_payload)
                .await;

            let mut needs_retry = false;
            if let Ok(ref val) = ios_res {
                if check_needs_reload(val) {
                    needs_retry = true;
                }
            }

            if needs_retry {
                let mut retry_payload = serde_json::json!({
                    "context": get_ios_context(visitor_data, po_token),
                    "videoId": video_id_trimmed,
                    "contentCheckOk": true,
                    "racyCheckOk": true,
                    "playbackContext": {
                        "contentPlaybackContext": {
                            "referer": format!("https://youtu.be/{}", video_id_trimmed),
                            "signatureTimestamp": 19550
                        }
                    },
                    "custom_referer": format!("https://youtu.be/{}", video_id_trimmed)
                });
                ios_res = self
                    .post_innertube("player", "IOS", "19.29.1", &mut retry_payload)
                    .await;
            }
            res = ios_res;
            current_user_agent = IOS_USER_AGENT;
        }

        let res_is_ok = matches!(&res, Ok(value)
            if value["playabilityStatus"]["status"]
                .as_str()
                .map(|status| status.eq_ignore_ascii_case("OK"))
                .unwrap_or(false));
        if !res_is_ok && std::env::var("FLOW_INPAGE_RECOVERY").is_ok() {
            if let Some(web_res) =
                crate::api::innertube::core::webview_player::fetch_player_response_in_page(
                    video_id_trimmed,
                )
                .await
            {
                if web_res["playabilityStatus"]["status"]
                    .as_str()
                    .map(|status| status.eq_ignore_ascii_case("OK"))
                    .unwrap_or(false)
                {
                    info!(video_id = %video_id_trimmed, "Recovered bot-walled video via in-page WebView (WEB/SABR)");
                    // Bind the SABR pot to the WEB response's own visitor data.
                    if let Some(web_visitor) = web_res["responseContext"]["visitorData"]
                        .as_str()
                        .filter(|value| !value.is_empty())
                    {
                        visitor_data_for_sabr = Some(web_visitor.to_string());
                    }
                    let pot_binding = visitor_data_for_sabr
                        .as_deref()
                        .filter(|value| !value.is_empty())
                        .unwrap_or(video_id_trimmed);
                    po_token_used = generate_po_token(pot_binding).await;
                    sabr_client_name = "WEB";
                    current_user_agent = WEB_USER_AGENT;
                    res = Ok(web_res);
                }
            }
        }

        let res = res?;
        let playability = &res["playabilityStatus"];
        check_playability_status(playability)?;
        debug!(video_id = %video_id_trimmed, ?playability, "Resolved playback playability status");

        let streaming_data = &res["streamingData"];
        if streaming_data.is_null() {
            return Err(AppError::Extractor(format!(
                "No streaming data found. Playability: {} (Status: {})",
                playability["reason"]
                    .as_str()
                    .unwrap_or("Unknown playability reason"),
                playability["status"].as_str().unwrap_or("UNKNOWN")
            )));
        }

        let is_live = res["videoDetails"]["isLive"].as_bool().unwrap_or(false);
        let mut hls_manifest_url = streaming_data["hlsManifestUrl"]
            .as_str()
            .map(ToOwned::to_owned);
        let mut dash_manifest_url = streaming_data["dashManifestUrl"]
            .as_str()
            .map(ToOwned::to_owned);

        // Live broadcasts are served through the HLS/DASH manifest, not a progressive variant.
        // The IOS client reliably exposes a live HLS manifest, so fetch it when the primary
        // client returned none.
        if is_live && hls_manifest_url.is_none() {
            let pot_binding = visitor_data_for_sabr
                .as_deref()
                .filter(|value| !value.is_empty())
                .unwrap_or(video_id_trimmed);
            let po_token = generate_po_token(pot_binding).await;
            let mut live_payload = serde_json::json!({
                "context": get_ios_context(visitor_data_for_sabr.clone(), po_token),
                "videoId": video_id_trimmed,
                "contentCheckOk": true,
                "racyCheckOk": true,
                "playbackContext": {
                    "contentPlaybackContext": {
                        "referer": "https://www.youtube.com",
                        "signatureTimestamp": 19550
                    }
                }
            });
            if let Ok(live_res) = self
                .post_innertube("player", "IOS", "19.29.1", &mut live_payload)
                .await
            {
                if let Some(hls) = live_res["streamingData"]["hlsManifestUrl"].as_str() {
                    hls_manifest_url = Some(hls.to_string());
                }
                if dash_manifest_url.is_none() {
                    if let Some(dash) = live_res["streamingData"]["dashManifestUrl"].as_str() {
                        dash_manifest_url = Some(dash.to_string());
                    }
                }
            }
        }

        let (variants, mut last_stream_error) =
            collect_stream_variants(streaming_data, video_id_trimmed);
        let mut stream_url = variants
            .iter()
            .find(|variant| variant.is_playable)
            .map(|variant| variant.local_url.clone());

        // Fallback: search adaptive formats (video only or audio only)
        if stream_url.is_none() {
            if let Some(adaptive_formats) = streaming_data["adaptiveFormats"].as_array() {
                for format in adaptive_formats {
                    match extract_stream_url_from_format(format, video_id_trimmed) {
                        Ok(Some(url)) => {
                            stream_url = Some(url);
                            break;
                        }
                        Ok(None) => {}
                        Err(error) => {
                            last_stream_error = Some(error);
                        }
                    }
                }
            }
        }

        let has_sabr_url = !streaming_data["serverAbrStreamingUrl"]
            .as_str()
            .unwrap_or_default()
            .is_empty();
        let local_url = match stream_url {
            Some(url) => url,
            None => {
                // A live broadcast plays from its manifest, and a SABR-only response
                // (e.g. the in-page WEB recovery) plays from the SABR engine — so a
                // missing progressive URL is fine in both cases.
                if (is_live && (hls_manifest_url.is_some() || dash_manifest_url.is_some()))
                    || has_sabr_url
                {
                    String::new()
                } else {
                    return Err(last_stream_error.unwrap_or_else(|| {
                        AppError::Extractor("No playable stream URLs found for this video".into())
                    }));
                }
            }
        };

        let expires_in_seconds = streaming_data["expiresInSeconds"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(21600); // Default 6 hours

        // Return expiration time and user-agent string joined by | delimiter
        let composite_expires_at = format!("{}|{}", expires_in_seconds, current_user_agent);

        // Offer only the original audio track. Dubbed/translated languages are
        // delivered as progressive direct URLs that googlevideo 403s for sustained
        // playback in this environment, so they are not surfaced.
        let download_audio_tracks = collect_audio_tracks(streaming_data, current_user_agent);
        let mut audio_tracks = download_audio_tracks.clone();
        if let Some(idx) = audio_tracks.iter().position(|track| track.is_default) {
            audio_tracks = vec![audio_tracks.swap_remove(idx)];
        } else {
            audio_tracks.truncate(1);
        }

        // Extract SABR metadata (safe: never fails the request, only annotates).
        // SABR is retained only as the original-audio bot-wall fallback.
        let duration_seconds = extract_duration_seconds_from_player_response(&res);
        let (sabr, sabr_descriptor) = build_sabr_metadata(
            &res,
            streaming_data,
            video_id_trimmed,
            visitor_data_for_sabr,
            po_token_used,
            sabr_client_name,
            duration_seconds,
        );

        Ok(StreamInfo {
            stream_id: video_id_trimmed.to_string(),
            local_url,
            expires_at: composite_expires_at,
            variants,
            captions: collect_caption_tracks(&res),
            audio_tracks,
            download_audio_tracks,
            hls_manifest_url,
            dash_manifest_url,
            is_live,
            sabr,
            sabr_descriptor,
        })
    }
}

// Live network smoke test for the SABR stack. Ignored by default; run with:
//   FLOW_SABR_VIDEO=3RmOvxilbPM cargo test -p flow sabr_live_smoke -- --ignored --nocapture
#[cfg(test)]
mod sabr_live_smoke {
    use super::*;
    use crate::api::innertube::core::context::get_ipados_context;
    use crate::streaming::sabr::engine::{SabrEngine, SabrEngineConfig};
    use crate::streaming::sabr::selector::{CodecSupport, select_formats};
    use crate::streaming::sabr::session::RequestMode;
    use crate::streaming::sabr::{ClientProfile, SabrSessionDescriptor, SabrTrack};
    use std::sync::Arc;

    fn ipados_profile() -> ClientProfile {
        ClientProfile {
            client_name_id: 5,
            client_version: "21.03.3".into(),
            user_agent: IPADOS_USER_AGENT.into(),
            device_make: "Apple".into(),
            device_model: "iPad7,6".into(),
            os_name: "iPadOS".into(),
            os_version: "17.7.10.21H450".into(),
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore = "hits the network + botguard sidecar"]
    async fn sabr_live_smoke() {
        let _ = tracing_subscriber::fmt()
            .with_max_level(tracing::Level::DEBUG)
            .with_test_writer()
            .try_init();
        let video_id =
            std::env::var("FLOW_SABR_VIDEO").unwrap_or_else(|_| "3RmOvxilbPM".to_string());
        let client = InnertubeClient {
            client: reqwest::Client::new(),
            visitor_data: std::sync::RwLock::new(None),
        };

        let visitor_data = client.fetch_visitor_data().await;
        let po_token = match visitor_data.as_deref() {
            Some(vd) if !vd.is_empty() => {
                crate::api::innertube::core::botguard::generate_po_token(vd).await
            }
            _ => None,
        };
        println!(
            "visitor_data present={} po_token present={}",
            visitor_data.is_some(),
            po_token.is_some()
        );

        let mut payload = serde_json::json!({
            "context": get_ipados_context(visitor_data.clone(), po_token.clone()),
            "videoId": video_id,
            "contentCheckOk": true,
            "racyCheckOk": true,
            "playbackContext": { "contentPlaybackContext": { "signatureTimestamp": 19550 } }
        });
        let res = client
            .post_innertube("player", "IOS", "21.03.3", &mut payload)
            .await
            .expect("ipados player request");
        let streaming_data = &res["streamingData"];

        let server_url = extract_server_abr_url(streaming_data).expect("serverAbrStreamingUrl");
        let ustreamer_config = extract_ustreamer_config(&res);
        let formats = parse_sabr_formats(streaming_data);
        let dubbed = formats
            .iter()
            .filter(|f| f.is_audio && f.xtags.as_deref().is_some_and(|x| x.contains("dubbed")))
            .count();
        println!(
            "formats={} (dubbed audio={}) ustreamer_cfg={}B",
            formats.len(),
            dubbed,
            ustreamer_config.len()
        );
        let selected = select_formats(&formats, None, CodecSupport::default()).expect("selectable");
        println!(
            "selected audio itag={} video itag={} ({}x{})",
            selected.audio.itag, selected.video.itag, selected.video.width, selected.video.height
        );

        let duration_ms = extract_duration_seconds_from_player_response(&res)
            .map(|s| s * 1000)
            .unwrap_or(0);
        let descriptor = SabrSessionDescriptor {
            video_id: video_id.clone(),
            server_abr_streaming_url: server_url,
            visitor_data: visitor_data.clone(),
            po_token,
            ustreamer_config,
            client_profile: ipados_profile(),
            duration_ms,
            formats,
        };

        // Audio-only: video keeps using the range-friendly ANDROID_VR DASH path;
        // SABR carries only the (dubbed-capable) audio. Small segments, no 3MB
        // video blocking the stream.
        let config = SabrEngineConfig {
            mode: RequestMode::AudioOnly,
            segment_wait: std::time::Duration::from_secs(30),
            ..Default::default()
        };
        let engine = Arc::new(SabrEngine::new(
            video_id.clone(),
            descriptor,
            selected,
            config,
        ));
        engine.clone().spawn();

        let timing = match engine.wait_timing(std::time::Duration::from_secs(15)).await {
            Ok(t) => t,
            Err(e) => {
                let st = engine.debug_state().await;
                panic!(
                    "wait_timing failed: {e}; debug_state: req_count={} redirects={} bytes={} \
                     last_error={:?} protection={} a_init={} v_init={} effective_url={}",
                    st.request_count,
                    st.redirect_count,
                    st.bytes_used,
                    st.last_error,
                    st.last_protection_status,
                    st.audio_initialized,
                    st.video_initialized,
                    st.effective_url
                );
            }
        };
        println!(
            "timing: duration_ms={} audio_segs={} video_segs={}",
            timing.duration_ms, timing.audio_segment_count, timing.video_segment_count
        );

        let a_init = engine.get_init(SabrTrack::Audio).await.expect("audio init");
        // Media segments start at sequence 1 (sequence 0 is the init segment).
        let a_seg1 = engine.get_segment(SabrTrack::Audio, 1).await;
        let a_seg2 = engine.get_segment(SabrTrack::Audio, 2).await;
        let a_seg3 = engine.get_segment(SabrTrack::Audio, 3).await;
        let st = engine.debug_state().await;
        println!(
            "FETCHED audio_init={}B audio_seg1={:?} audio_seg2={:?} audio_seg3={:?}",
            a_init.len(),
            a_seg1.as_ref().map(|b| b.len()),
            a_seg2.as_ref().map(|b| b.len()),
            a_seg3.as_ref().map(|b| b.len()),
        );
        println!(
            "debug_state: reqs={} bytes={} a_segs={} a_max={} err={:?}",
            st.request_count, st.bytes_used, st.audio_segments, st.audio_max_seq, st.last_error
        );
        assert!(!a_init.is_empty(), "audio init segment");
        assert!(
            a_seg1.is_ok() && a_seg2.is_ok(),
            "audio media segments must finalize"
        );
        println!("SABR SMOKE OK (audio-only media flowing)");

        // Multi-audio: switch to a dubbed language and verify its audio flows,
        // including a mid-stream segment (exercises the audio-seek path).
        let tracks: Vec<_> = engine.audio_tracks().to_vec();
        println!(
            "audio tracks ({}): {:?}",
            tracks.len(),
            tracks
                .iter()
                .map(|t| format!("{}={}", t.key, t.label))
                .collect::<Vec<_>>()
        );
        if let Some(dubbed) = tracks.iter().find(|t| !t.is_default) {
            println!(
                "switching to dubbed: key={} lang={} label={}",
                dubbed.key, dubbed.lang, dubbed.label
            );
            assert!(engine.set_active_audio(&dubbed.key).await, "known track");
            let d_init = engine.get_init(SabrTrack::Audio).await;
            let d_seg1 = engine.get_segment(SabrTrack::Audio, 1).await;
            engine.ensure_audio_segment(20).await;
            let d_seg20 = engine.get_segment(SabrTrack::Audio, 20).await;
            println!(
                "dubbed[{}] init={:?} seg1={:?} seg20(seek)={:?}",
                dubbed.key,
                d_init.as_ref().map(|b| b.len()),
                d_seg1.as_ref().map(|b| b.len()),
                d_seg20.as_ref().map(|b| b.len()),
            );
            assert!(
                d_init.is_ok() && d_seg1.is_ok(),
                "dubbed audio must flow after switch"
            );
            println!("MULTI-AUDIO SWITCH OK");
        } else {
            println!("NOTE: no dubbed track found on this video");
        }
    }
}

// Sustained multi-client SABR probe.
// This probe streams the WHOLE audio track under each candidate client and reports
// which ones sustain vs. escalate to ATTESTATION_REQUIRED, so we can pick a
// client whose attestation our (web BotGuard) PO token actually satisfies.
//   cargo test -p flow sabr_client_probe -- --ignored --nocapture
#[cfg(test)]
mod sabr_client_probe {
    use super::*;
    use crate::api::innertube::core::context::get_ipados_context;
    use crate::streaming::sabr::engine::{SabrEngine, SabrEngineConfig};
    use crate::streaming::sabr::selector::{CodecSupport, derive_audio_tracks, select_formats};
    use crate::streaming::sabr::session::RequestMode;
    use crate::streaming::sabr::{ClientProfile, SabrSessionDescriptor, SabrTrack};
    use std::collections::BTreeSet;
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    struct Candidate {
        label: &'static str,
        client_name: &'static str,
        client_version: &'static str,
        client_name_id: i32,
        user_agent: &'static str,
    }

    fn context_for(c: &Candidate, visitor: Option<String>, pot: Option<String>) -> Value {
        if c.client_name == "IOS" {
            return get_ipados_context(visitor, pot);
        }
        let mut client = serde_json::json!({
            "clientName": c.client_name,
            "clientVersion": c.client_version,
            "hl": "en",
            "gl": "US",
            "utcOffsetMinutes": 0,
        });
        if let Some(vd) = visitor {
            client["visitorData"] = Value::String(vd);
        }
        let mut ctx = serde_json::json!({
            "client": client,
            "playbackContext": { "contentPlaybackContext": { "signatureTimestamp": 19550 } },
        });
        if let Some(token) = pot {
            ctx["serviceIntegrityDimensions"] = serde_json::json!({ "poToken": token });
        }
        ctx
    }

    async fn raw_player(video_id: &str, c: &Candidate, ctx: Value) -> Option<Value> {
        let payload = serde_json::json!({
            "context": ctx, "videoId": video_id, "contentCheckOk": true, "racyCheckOk": true,
        });
        let r = reqwest::Client::new()
            .post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
            .header(reqwest::header::USER_AGENT, c.user_agent)
            .header("X-YouTube-Client-Name", c.client_name_id.to_string())
            .header("X-YouTube-Client-Version", c.client_version)
            .header("Origin", "https://www.youtube.com")
            .header("Referer", "https://www.youtube.com")
            .header("Cookie", "SOCS=CAE=")
            .json(&payload)
            .send()
            .await
            .ok()?;
        r.json::<Value>().await.ok()
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "hits the network + botguard sidecar"]
    async fn sabr_client_probe() {
        let _ = tracing_subscriber::fmt()
            .with_max_level(tracing::Level::INFO)
            .with_test_writer()
            .try_init();
        let video_id =
            std::env::var("FLOW_SABR_VIDEO").unwrap_or_else(|_| "3RmOvxilbPM".to_string());
        let client = InnertubeClient {
            client: reqwest::Client::new(),
            visitor_data: std::sync::RwLock::new(None),
        };
        // Allow injecting an externally-minted pot+visitor (e.g. from bgutils-js)
        // to test whether a *fresh, valid* pot sustains where the stale sidecar's
        // does not: FLOW_VISITOR=… FLOW_POT=… cargo test … sabr_client_probe …
        let (visitor_data, pot) = match (std::env::var("FLOW_VISITOR"), std::env::var("FLOW_POT")) {
            (Ok(v), Ok(p)) if !v.is_empty() && !p.is_empty() => {
                println!("USING injected visitor+pot (bgutils-js)");
                (Some(v), Some(p))
            }
            _ => {
                let vd = client.fetch_visitor_data().await;
                let p = match vd.as_deref() {
                    Some(vd) if !vd.is_empty() => {
                        crate::api::innertube::core::botguard::generate_po_token(vd).await
                    }
                    _ => None,
                };
                (vd, p)
            }
        };
        println!(
            "video={video_id} visitor={} pot={}\n",
            visitor_data.is_some(),
            pot.is_some()
        );

        // (candidate, send_pot) — the GVS/SABR endpoint validates the web pot
        // regardless of client, so the question is which client+pot combination
        // sustains a SABR stream past the attestation grace window.
        let android = Candidate {
            label: "ANDROID",
            client_name: "ANDROID",
            client_version: "21.03.38",
            client_name_id: 3,
            user_agent: "com.google.android.youtube/21.03.38 (Linux; U; Android 14) gzip",
        };
        let ipados = Candidate {
            label: "iPadOS",
            client_name: "IOS",
            client_version: "21.03.3",
            client_name_id: 5,
            user_agent: "com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)",
        };
        let candidates: [(&Candidate, bool); 4] = [
            (&android, true),
            (&android, false),
            (&ipados, true),
            (&ipados, false),
        ];

        for (c, send_pot) in candidates {
            let use_pot = if send_pot { pot.clone() } else { None };
            println!(
                "==== {} ({} v{}) pot={} ====",
                c.label, c.client_name, c.client_version, send_pot
            );
            let ctx = if c.client_name == "ANDROID" {
                let mut client_obj = serde_json::json!({
                    "clientName": "ANDROID", "clientVersion": c.client_version, "hl": "en", "gl": "US", "utcOffsetMinutes": 0
                });
                if let Some(vd) = visitor_data.clone() {
                    client_obj["visitorData"] = Value::String(vd);
                }
                let mut ctx = serde_json::json!({ "client": client_obj });
                if let Some(t) = &use_pot {
                    ctx["serviceIntegrityDimensions"] = serde_json::json!({ "poToken": t });
                }
                ctx
            } else {
                context_for(c, visitor_data.clone(), use_pot.clone())
            };
            let res = match raw_player(&video_id, c, ctx).await {
                Some(v) => v,
                None => {
                    println!("  player request FAILED\n");
                    continue;
                }
            };
            let status = res["playabilityStatus"]["status"].as_str().unwrap_or("?");
            if !status.eq_ignore_ascii_case("OK") {
                println!(
                    "  playability={status} reason={:?}\n",
                    res["playabilityStatus"]["reason"].as_str()
                );
                continue;
            }
            let streaming_data = &res["streamingData"];
            let server_url = match extract_server_abr_url(streaming_data) {
                Some(u) => u,
                None => {
                    println!("  NO serverAbrStreamingUrl (cannot SABR)\n");
                    continue;
                }
            };
            let has_n = server_url.contains("&n=") || server_url.contains("?n=");
            let ustreamer_config = extract_ustreamer_config(&res);
            let formats = parse_sabr_formats(streaming_data);
            let langs: BTreeSet<String> = formats
                .iter()
                .filter(|f| f.is_audio)
                .filter_map(|f| {
                    f.audio_track_id
                        .as_deref()
                        .map(|id| id.split('.').next().unwrap_or(id).to_string())
                })
                .collect();
            let tracks = derive_audio_tracks(&formats);
            println!(
                "  OK formats={} audio_langs={} derived_tracks={} ustreamer={}B sabr_url_has_n={}",
                formats.len(),
                langs.len(),
                tracks.len(),
                ustreamer_config.len(),
                has_n
            );

            let selected = match select_formats(&formats, None, CodecSupport::default()) {
                Some(s) => s,
                None => {
                    println!("  no selectable formats\n");
                    continue;
                }
            };
            let duration_ms = extract_duration_seconds_from_player_response(&res)
                .map(|s| s * 1000)
                .unwrap_or(0);
            let descriptor = SabrSessionDescriptor {
                video_id: video_id.clone(),
                server_abr_streaming_url: server_url,
                visitor_data: visitor_data.clone(),
                po_token: use_pot.clone(),
                ustreamer_config,
                client_profile: ClientProfile {
                    client_name_id: c.client_name_id,
                    client_version: c.client_version.into(),
                    user_agent: c.user_agent.into(),
                    device_make: String::new(),
                    device_model: String::new(),
                    os_name: String::new(),
                    os_version: String::new(),
                },
                duration_ms,
                formats,
            };
            let config = SabrEngineConfig {
                mode: RequestMode::AudioOnly,
                segment_wait: Duration::from_secs(10),
                ..Default::default()
            };
            let engine = Arc::new(SabrEngine::new(
                video_id.clone(),
                descriptor,
                selected,
                config,
            ));
            engine.clone().spawn();

            // Drive continuous consumption: walk segments forward, ~realtime-ish,
            // for up to ~25s of wall time — long enough to blow past the grace
            // window. Stop on completion or a fatal (attestation) error.
            let start = Instant::now();
            let _ = engine.wait_timing(Duration::from_secs(12)).await;
            let mut next_seq = 1;
            let mut last_seq_ok = 0;
            loop {
                if start.elapsed() > Duration::from_secs(25) {
                    break;
                }
                let st = engine.debug_state().await;
                if st.done {
                    break;
                }
                if let Some(err) = &st.last_error {
                    if err.contains("Attestation") || st.last_protection_status == 3 {
                        break;
                    }
                }
                match engine.get_segment(SabrTrack::Audio, next_seq).await {
                    Ok(_) => {
                        last_seq_ok = next_seq;
                        next_seq += 1;
                    }
                    Err(_) => {
                        tokio::time::sleep(Duration::from_millis(300)).await;
                    }
                }
                tokio::time::sleep(Duration::from_millis(120)).await;
            }
            let st = engine.debug_state().await;
            let err = st.last_error.clone().unwrap_or_default();
            let verdict = if st.last_protection_status == 3 || err.contains("Attestation") {
                "WALLED (attestation)"
            } else if err.contains("Reload") {
                "RELOAD-REQUIRED"
            } else if last_seq_ok >= 8 {
                "SUSTAINED"
            } else if err.is_empty() && st.done {
                "COMPLETED-EARLY"
            } else {
                "STALLED"
            };
            println!(
                "  -> {verdict} | segs_ok={} max_seq={} bytes={} reqs={} protection={} done={} err={:?}",
                last_seq_ok,
                st.audio_max_seq,
                st.bytes_used,
                st.request_count,
                st.last_protection_status,
                st.done,
                st.last_error
            );
            println!();
            engine.cancel();
        }
    }
}
