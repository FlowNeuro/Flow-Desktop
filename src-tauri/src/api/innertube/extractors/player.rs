use crate::api::innertube::core::botguard::generate_po_token;
use crate::api::innertube::core::context::{get_android_vr_context, get_ios_context};
use crate::api::innertube::core::utils::{
    collect_related_content_items, dedupe_related_content_items,
    extract_channel_id_from_video_renderer, extract_text_from_value, thumbnail_url_from_array,
};
use crate::api::innertube::InnertubeClient;
use crate::errors::{AppError, AppResult};
use crate::models::video::{
    AudioTrack, CaptionTrack, RelatedContentItem, StreamInfo, StreamVariant, VideoChapter,
    VideoDetails,
};
use serde_json::Value;
use tracing::{debug, warn};

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
            "{}:{}:{}",
            variant.quality_label,
            variant.fps.unwrap_or(0),
            variant.is_playable
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
    response["captions"]["playerCaptionsTracklistRenderer"]["captionTracks"]
        .as_array()
        .map(|tracks| {
            tracks
                .iter()
                .enumerate()
                .filter_map(|(index, track)| {
                    let base_url = track["baseUrl"].as_str()?;
                    let language_code = track["languageCode"].as_str().unwrap_or("und").to_string();
                    let label = extract_text_from_value(&track["name"])
                        .unwrap_or_else(|| language_code.clone());
                    let vss_id = track["vssId"].as_str().unwrap_or_default();
                    let is_auto_generated = vss_id.starts_with("a.");
                    let mut url = reqwest::Url::parse(base_url).ok()?;
                    let query_pairs: Vec<(String, String)> = url
                        .query_pairs()
                        .filter(|(key, _)| key != "fmt" && key != "tlang")
                        .map(|(key, value)| (key.into_owned(), value.into_owned()))
                        .collect();
                    url.query_pairs_mut()
                        .clear()
                        .extend_pairs(query_pairs)
                        .append_pair("fmt", "vtt");

                    Some(CaptionTrack {
                        id: format!("caption-{index}-{language_code}"),
                        label,
                        language_code,
                        url: url.to_string(),
                        is_auto_generated,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn collect_audio_tracks(streaming_data: &Value) -> Vec<AudioTrack> {
    let mut tracks = Vec::new();
    let mut seen = std::collections::HashSet::new();

    if let Some(adaptive_formats) = streaming_data["adaptiveFormats"].as_array() {
        for format in adaptive_formats {
            let Some(mime) = format["mimeType"].as_str() else {
                continue;
            };
            if !mime.starts_with("audio/") {
                continue;
            }

            let audio_track = &format["audioTrack"];
            let id = audio_track["id"]
                .as_str()
                .map(ToOwned::to_owned)
                .or_else(|| format["itag"].as_i64().map(|itag| format!("itag-{itag}")))
                .unwrap_or_else(|| "default".to_string());
            let language_code = id
                .split('.')
                .next()
                .filter(|value| value.len() <= 8)
                .map(ToOwned::to_owned);
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
            let track = AudioTrack {
                id: id.clone(),
                label,
                language_code,
                audio_track_type: audio_track["audioIsDefault"]
                    .as_bool()
                    .map(|is_default| if is_default { "default" } else { "alternate" }.to_string()),
                local_url,
                mime_type: format["mimeType"].as_str().map(ToOwned::to_owned),
                bitrate,
                is_default: audio_track["audioIsDefault"]
                    .as_bool()
                    .unwrap_or(tracks.is_empty()),
                init_range_start,
                init_range_end,
                index_range_start,
                index_range_end,
                approx_duration_ms: parse_approx_duration_ms(format),
            };

            if let Some(existing_index) = tracks
                .iter()
                .position(|existing: &AudioTrack| existing.id == id)
            {
                let existing_bitrate = tracks[existing_index].bitrate.unwrap_or(0);
                if track.bitrate.unwrap_or(0) > existing_bitrate {
                    tracks[existing_index] = track;
                }
            } else if seen.insert(id.clone()) {
                tracks.push(track);
            }
        }
    }

    tracks.sort_by(|a, b| {
        b.is_default
            .cmp(&a.is_default)
            .then_with(|| b.bitrate.unwrap_or(0).cmp(&a.bitrate.unwrap_or(0)))
    });

    tracks
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
        if let Ok(ref val) = res {
            if check_needs_reload(val) {
                should_fallback_to_ios = true;
            } else if let Some(status) = val["playabilityStatus"]["status"].as_str() {
                if !status.eq_ignore_ascii_case("OK") {
                    warn!(status = %status, video_id = %video_id_trimmed, "ANDROID_VR details request returned a non-OK playability status, falling back to IOS");
                    should_fallback_to_ios = true;
                }
            }
        } else {
            warn!(video_id = %video_id_trimmed, "ANDROID_VR details request failed, falling back to IOS");
            should_fallback_to_ios = true;
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
            if let Some(contents) = next_res["contents"]["twoColumnWatchNextResults"]["results"]
                ["results"]["contents"]
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
                if let Some(views) = primary_info["viewCount"]["videoViewCountRenderer"]
                    ["viewCount"]["simpleText"]
                    .as_str()
                    .or_else(|| {
                        primary_info["viewCount"]["videoViewCountRenderer"]["viewCount"]["runs"][0]
                            ["text"]
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
                            let button_vm = &view_model["likeButtonViewModel"]
                                ["likeButtonViewModel"]["toggleButtonViewModel"]
                                ["toggleButtonViewModel"]["defaultButtonViewModel"]
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
        let mut current_user_agent = "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)";

        if let Ok(ref val) = res {
            if check_needs_reload(val) {
                should_fallback_to_ios = true;
            } else if let Some(status) = val["playabilityStatus"]["status"].as_str() {
                if !status.eq_ignore_ascii_case("OK") {
                    warn!(status = %status, video_id = %video_id_trimmed, "ANDROID_VR returned a non-OK playability status, falling back to IOS");
                    should_fallback_to_ios = true;
                }
            }
        } else {
            warn!(video_id = %video_id_trimmed, "ANDROID_VR player request failed, falling back to IOS");
            should_fallback_to_ios = true;
        }

        if should_fallback_to_ios {
            let po_token = generate_po_token(video_id_trimmed).await;
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
            current_user_agent = "com.google.ios.youtube/19.29.1 (iPhone14,5; U; CPU iOS 17_5_1 like Mac OS X; en_US)";
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

        let local_url = match stream_url {
            Some(url) => url,
            None => {
                return Err(last_stream_error.unwrap_or_else(|| {
                    AppError::Extractor("No playable stream URLs found for this video".into())
                }));
            }
        };

        let expires_in_seconds = streaming_data["expiresInSeconds"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(21600); // Default 6 hours

        // Return expiration time and user-agent string joined by | delimiter
        let composite_expires_at = format!("{}|{}", expires_in_seconds, current_user_agent);

        Ok(StreamInfo {
            stream_id: video_id_trimmed.to_string(),
            local_url,
            expires_at: composite_expires_at,
            variants,
            captions: collect_caption_tracks(&res),
            audio_tracks: collect_audio_tracks(streaming_data),
            hls_manifest_url: streaming_data["hlsManifestUrl"]
                .as_str()
                .map(ToOwned::to_owned),
            dash_manifest_url: streaming_data["dashManifestUrl"]
                .as_str()
                .map(ToOwned::to_owned),
        })
    }
}
