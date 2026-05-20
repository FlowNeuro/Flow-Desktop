use async_trait::async_trait;
use serde_json::Value;
use tracing::{debug, warn};

use crate::api::extractor::YoutubeExtractor;
use crate::errors::{AppError, AppResult};
use crate::models::search::{SearchVideosRequest, SearchVideosResponse};
use crate::models::video::{StreamInfo, VideoDetails, VideoSummary, MusicHomeSection, MusicHomeChip};
use crate::models::channel::{ChannelDetails, ChannelVideosResponse};
use crate::models::playlist::PlaylistDetailsResponse;
use crate::models::comment::{Comment, CommentsResponse};
use crate::models::music::{ArtistPage, ExplorePage, ChartsPage};
use crate::api::innertube::parsers::{
    parse_music_search_json, parse_music_album_json, parse_music_artist_json,
    parse_music_explore_json, parse_music_charts_json
};

pub struct InnertubeClient;

fn get_client_id(client_name: &str) -> &'static str {
    match client_name {
        "WEB" => "1",
        "WEB_REMIX" => "67",
        "WEB_CREATOR" => "62",
        "TVHTML5" => "7",
        "TVHTML5_SIMPLY_EMBEDDED_PLAYER" => "85",
        "IOS" => "5",
        "ANDROID" => "3",
        "ANDROID_VR" => "28",
        "ANDROID_CREATOR" => "14",
        "VISIONOS" => "101",
        _ => "1",
    }
}

fn get_ios_context(visitor_data: Option<String>, po_token: Option<String>) -> serde_json::Value {
    let mut client = serde_json::json!({
        "clientName": "IOS",
        "clientVersion": "19.29.1",
        "hl": "en",
        "gl": "US",
        "utcOffsetMinutes": 0,
        "deviceMake": "Apple",
        "deviceModel": "iPhone14,5",
        "osName": "iOS",
        "osVersion": "17.5.1"
    });

    if let Some(vd) = visitor_data {
        client["visitorData"] = serde_json::Value::String(vd);
    }

    let mut context = serde_json::json!({
        "client": client,
    });

    if let Some(token) = po_token {
        context["serviceIntegrityDimensions"] = serde_json::json!({
            "poToken": token
        });
    }

    context
}

fn get_android_vr_context(visitor_data: Option<String>) -> serde_json::Value {
    let mut client = serde_json::json!({
        "clientName": "ANDROID_VR",
        "clientVersion": "1.61.48",
        "hl": "en",
        "gl": "US",
        "utcOffsetMinutes": 0,
        "deviceMake": "Oculus",
        "deviceModel": "Quest 3",
        "osName": "Android",
        "osVersion": "12",
        "androidSdkVersion": "32"
    });

    if let Some(vd) = visitor_data {
        client["visitorData"] = serde_json::Value::String(vd);
    }

    serde_json::json!({
        "client": client,
    })
}

// Custom self-contained URL encoding to keep clean dependencies
fn custom_url_encode(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.as_bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*b as char);
            }
            b' ' => {
                encoded.push('+');
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

// Sidecar helper function to invoke our custom BotGuard PO Token generator
async fn generate_po_token(video_id: &str) -> Option<String> {
    let paths = [
        "C:\\Users\\Anton\\.cargo\\bin\\rustypipe-botguard.exe",
        "binaries\\rustypipe-botguard-x86_64-pc-windows-msvc.exe",
        "src-tauri\\binaries\\rustypipe-botguard-x86_64-pc-windows-msvc.exe",
        "rustypipe-botguard",
    ];

    for path in &paths {
        if let Ok(output) = tokio::process::Command::new(path)
            .args(&["--generate", video_id])
            .output()
            .await
        {
            if output.status.success() {
                let token_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !token_str.is_empty() {
                    debug!(sidecar = %path, "Generated PO token using BotGuard sidecar");
                    return Some(token_str);
                }
            }
        }
    }
    None
}

impl InnertubeClient {
    #[must_use]
    pub fn new(_app: &tauri::AppHandle) -> Self {
        Self
    }

    // Helper to send a robust JSON POST request to the Innertube API mimicking NewPipe
    async fn post_innertube(
        &self,
        endpoint: &str,
        client_name: &str,
        client_version: &str,
        payload: &mut Value,
    ) -> AppResult<Value> {
        let user_agent = match client_name {
            "IOS" => "com.google.ios.youtube/19.29.1 (iPhone14,5; U; CPU iOS 17_5_1 like Mac OS X; en_US)",
            "ANDROID_VR" => "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)",
            _ => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        };

        let client = reqwest::Client::builder()
            .user_agent(user_agent)
            .build()
            .unwrap_or_default();

        // Inject standard NewPipe-style Innertube context if not custom context
        if let Some(obj) = payload.as_object_mut() {
            if !obj.contains_key("context") {
                obj.insert(
                    "context".to_string(),
                    serde_json::json!({
                        "client": {
                            "clientName": client_name,
                            "clientVersion": client_version,
                            "hl": "en",
                            "gl": "US",
                            "utcOffsetMinutes": 0
                        }
                    }),
                );
            }
        }

        let mut custom_referer = None;
        if let Some(obj) = payload.as_object_mut() {
            if let Some(val) = obj.remove("custom_referer") {
                if let Some(s) = val.as_str() {
                    custom_referer = Some(s.to_string());
                }
            }
        }

        let url = format!("https://www.youtube.com/youtubei/v1/{}?prettyPrint=false", endpoint);
        let client_id = get_client_id(client_name);

        let mut req = client.post(&url)
            .header("X-YouTube-Client-Name", client_id)
            .header("X-YouTube-Client-Version", client_version)
            .header("Origin", "https://www.youtube.com")
            .header("Cookie", "SOCS=CAE=") // Bypasses cookie consent blocks!
            .json(payload);

        if let Some(ref ref_url) = custom_referer {
            req = req.header("Referer", ref_url);
        } else {
            req = req.header("Referer", "https://www.youtube.com");
        }

        let res = req.send()
            .await
            .map_err(|e| AppError::Extractor(format!("Network error: {}", e)))?;

        let status = res.status();
        let res_json = res.json::<Value>()
            .await
            .map_err(|e| AppError::Extractor(format!("JSON parse error: {}", e)))?;

        if !status.is_success() {
            return Err(AppError::Extractor(format!(
                "Innertube returned status {}: {}",
                status,
                res_json["error"]["message"].as_str().unwrap_or("Unknown error")
            )));
        }

        Ok(res_json)
    }

    // Helper to fetch visitorData token for dynamic session initialization
    async fn fetch_visitor_data(&self) -> Option<String> {
        let mut payload = serde_json::json!({});
        if let Ok(res) = self.post_innertube("visitor_id", "WEB", "2.20260120.01.00", &mut payload).await {
            if let Some(vd) = res["responseContext"]["visitorData"].as_str() {
                return Some(vd.to_string());
            }
        }
        None
    }

    // Helper to fetch watch-next details (lyrics & related browse pointers) from WEB_REMIX
    async fn fetch_watch_next_metadata(
        &self,
        video_id: &str,
    ) -> AppResult<(Option<String>, Option<String>, Option<String>, Option<String>)> {
        let mut payload = serde_json::json!({
            "videoId": video_id
        });

        let res = self.post_innertube("next", "WEB_REMIX", "67", &mut payload).await?;

        let lyrics_tab = res["contents"]["singleColumnMusicWatchNextResultsRenderer"]["tabbedRenderer"]["watchNextTabbedResultsRenderer"]["tabs"].as_array()
            .and_then(|tabs| tabs.get(1))
            .and_then(|tab| tab.get("tabRenderer"));
        
        let lyrics_browse_id = lyrics_tab
            .and_then(|renderer| renderer["endpoint"]["browseEndpoint"]["browseId"].as_str())
            .map(|s| s.to_string());
            
        let lyrics_params = lyrics_tab
            .and_then(|renderer| renderer["endpoint"]["browseEndpoint"]["params"].as_str())
            .map(|s| s.to_string());

        let related_tab = res["contents"]["singleColumnMusicWatchNextResultsRenderer"]["tabbedRenderer"]["watchNextTabbedResultsRenderer"]["tabs"].as_array()
            .and_then(|tabs| tabs.get(2))
            .and_then(|tab| tab.get("tabRenderer"));

        let related_browse_id = related_tab
            .and_then(|renderer| renderer["endpoint"]["browseEndpoint"]["browseId"].as_str())
            .map(|s| s.to_string());

        let related_params = related_tab
            .and_then(|renderer| renderer["endpoint"]["browseEndpoint"]["params"].as_str())
            .map(|s| s.to_string());

        Ok((lyrics_browse_id, lyrics_params, related_browse_id, related_params))
    }
}

fn parse_duration_seconds(simple_text: &str) -> u64 {
    let parts: Vec<&str> = simple_text.split(':').collect();
    let mut total = 0u64;
    let mut multiplier = 1u64;
    for part in parts.iter().rev() {
        if let Ok(num) = part.parse::<u64>() {
            total += num * multiplier;
            multiplier *= 60;
        }
    }
    total
}

// Parses mixed subscriber strings like "1.23M subscribers" into raw u64 counts matching NewPipe
fn parse_mixed_number_word_to_long(text: &str) -> u64 {
    let cleaned = text.to_lowercase()
        .replace("subscribers", "")
        .replace("subscriber", "")
        .replace("views", "")
        .replace("view", "")
        .replace(",", "")
        .trim()
        .to_string();

    let mut multiplier = 1.0f64;
    let mut number_part = cleaned.clone();

    if cleaned.ends_with('k') {
        multiplier = 1_000.0;
        number_part = cleaned[..cleaned.len()-1].trim().to_string();
    } else if cleaned.ends_with('m') {
        multiplier = 1_000_000.0;
        number_part = cleaned[..cleaned.len()-1].trim().to_string();
    } else if cleaned.ends_with('b') {
        multiplier = 1_000_000_000.0;
        number_part = cleaned[..cleaned.len()-1].trim().to_string();
    }

    if let Ok(num) = number_part.parse::<f64>() {
        (num * multiplier) as u64
    } else {
        0
    }
}

fn extract_continuation_token(item: &Value) -> Option<String> {
    item.get("continuationItemRenderer")
        .and_then(|renderer| {
            renderer["continuationEndpoint"]["continuationCommand"]["token"]
                .as_str()
        })
        .map(ToOwned::to_owned)
}

fn extract_browse_id_from_text_runs(container: &Value, field: &str) -> Option<String> {
    container[field]["runs"]
        .as_array()
        .and_then(|runs| {
            runs.iter().find_map(|run| {
                run["navigationEndpoint"]["browseEndpoint"]["browseId"]
                    .as_str()
                    .map(ToOwned::to_owned)
            })
        })
}

fn extract_channel_id_from_video_renderer(video: &Value) -> Option<String> {
    extract_browse_id_from_text_runs(video, "ownerText")
        .or_else(|| extract_browse_id_from_text_runs(video, "longBylineText"))
        .or_else(|| extract_browse_id_from_text_runs(video, "shortBylineText"))
}

fn extract_channel_id_from_music_renderer(renderer: &Value) -> Option<String> {
    renderer["flexColumns"][1]["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"]
        .as_array()
        .and_then(|runs| {
            runs.iter().find_map(|run| {
                run["navigationEndpoint"]["browseEndpoint"]["browseId"]
                    .as_str()
                    .map(ToOwned::to_owned)
            })
        })
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

    AppError::ContentNotAvailable(format!(
        "Got error {}: \"{}\"",
        status, reason_text
    ))
}

fn check_needs_reload(val: &Value) -> bool {
    if let Some(status) = val["playabilityStatus"]["status"].as_str() {
        if status.to_ascii_lowercase().contains("page needs to be reloaded") {
            return true;
        }
    }
    if let Some(reason) = val["playabilityStatus"]["reason"].as_str() {
        if reason.to_ascii_lowercase().contains("page needs to be reloaded") {
            return true;
        }
    }
    false
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

fn extract_stream_url_from_format(
    format: &Value,
    video_id: &str,
) -> AppResult<Option<String>> {
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

fn validate_stream_url(
    stream_url: &str,
    video_id: &str,
) -> AppResult<String> {
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

// Parses search results using NewPipe's exact keys and paths, with full support for video and channel items
fn parse_innertube_search(val: Value) -> (Vec<VideoSummary>, Option<String>) {
    let mut items = Vec::new();
    let mut next_page_token = None;

    let mut process_search_items = |items_arr: &[Value]| {
        for item in items_arr {
            if let Some(video) = item.get("videoRenderer") {
                let video_id = video["videoId"].as_str().unwrap_or_default().to_string();
                if video_id.is_empty() {
                    continue;
                }

                let title = video["title"]["runs"][0]["text"].as_str()
                    .or_else(|| video["title"]["simpleText"].as_str())
                    .unwrap_or_default()
                    .to_string();

                let channel_name = video["longBylineText"]["runs"][0]["text"].as_str()
                    .or_else(|| video["ownerText"]["runs"][0]["text"].as_str())
                    .or_else(|| video["shortBylineText"]["runs"][0]["text"].as_str())
                    .or_else(|| video["longBylineText"]["simpleText"].as_str())
                    .unwrap_or_default()
                    .to_string();

                let thumbnail_url = video["thumbnail"]["thumbnails"][0]["url"].as_str()
                    .or_else(|| video["thumbnail"]["url"].as_str())
                    .map(|s| s.to_string());

                let duration_text = video["lengthText"]["runs"][0]["text"].as_str()
                    .or_else(|| video["lengthText"]["simpleText"].as_str())
                    .unwrap_or_default();

                let duration_seconds = if duration_text.is_empty() {
                    None
                } else {
                    Some(parse_duration_seconds(duration_text))
                };

                let published_text = video["publishedTimeText"]["runs"][0]["text"].as_str()
                    .or_else(|| video["publishedTimeText"]["simpleText"].as_str())
                    .map(|s| s.to_string());

                let view_count_text = video["viewCountText"]["runs"][0]["text"].as_str()
                    .or_else(|| video["viewCountText"]["simpleText"].as_str())
                    .or_else(|| video["shortViewCountText"]["runs"][0]["text"].as_str())
                    .or_else(|| video["shortViewCountText"]["simpleText"].as_str())
                    .map(|s| s.to_string());

                let channel_id = extract_channel_id_from_video_renderer(video);

                items.push(VideoSummary {
                    id: video_id,
                    title,
                    channel_name,
                    channel_id,
                    thumbnail_url,
                    duration_seconds,
                    published_text,
                    view_count_text,
                });
            } else if let Some(channel) = item.get("channelRenderer") {
                let channel_id = channel["channelId"].as_str().unwrap_or_default().to_string();
                if !channel_id.is_empty() {
                    let title = channel["title"]["simpleText"].as_str()
                        .or_else(|| channel["title"]["runs"][0]["text"].as_str())
                        .unwrap_or_default()
                        .to_string();

                    let thumbnail_url = channel["thumbnail"]["thumbnails"][0]["url"].as_str()
                        .map(|s| s.to_string());

                    let subscriber_count_text = channel["subscriberCountText"]["simpleText"].as_str()
                        .or_else(|| channel["subscriberCountText"]["runs"][0]["text"].as_str())
                        .map(|s| s.to_string());

                    items.push(VideoSummary {
                        id: format!("channel:{}", channel_id),
                        title,
                        channel_name: "Channel".to_string(),
                        channel_id: Some(channel_id),
                        thumbnail_url,
                        duration_seconds: None,
                        published_text: subscriber_count_text,
                        view_count_text: Some("Channel".to_string()),
                    });
                }
            } else if next_page_token.is_none() {
                next_page_token = extract_continuation_token(item);
            }
        }
    };

    if let Some(contents_arr) = val["contents"]["twoColumnSearchResultsRenderer"]["primaryContents"]["sectionListRenderer"]["contents"].as_array() {
        for section in contents_arr {
            if let Some(items_arr) = section["itemSectionRenderer"]["contents"].as_array() {
                process_search_items(items_arr);
            }
        }
    }

    if let Some(commands) = val["onResponseReceivedCommands"].as_array() {
        for command in commands {
            if let Some(items_arr) = command["appendContinuationItemsAction"]["continuationItems"].as_array() {
                process_search_items(items_arr);
            } else if let Some(items_arr) = command["reloadContinuationItemsCommand"]["continuationItems"].as_array() {
                process_search_items(items_arr);
            }
        }
    }

    if let Some(actions) = val["onResponseReceivedActions"].as_array() {
        for action in actions {
            if let Some(items_arr) = action["appendContinuationItemsAction"]["continuationItems"].as_array() {
                process_search_items(items_arr);
            } else if let Some(items_arr) = action["reloadContinuationItemsCommand"]["continuationItems"].as_array() {
                process_search_items(items_arr);
            }
        }
    }

    (items, next_page_token)
}

// Parses and extracts video items and continuations from channel page browse responses
fn extract_videos_from_browse(val: &Value) -> (Vec<VideoSummary>, Option<String>) {
    let mut items = Vec::new();
    let mut next_page_token = None;

    let mut process_array = |arr: &Vec<Value>| {
        for item in arr {
            if let Some(video) = item.get("gridVideoRenderer") {
                if let Some(video_id) = video["videoId"].as_str() {
                    let title = video["title"]["runs"][0]["text"].as_str()
                        .or_else(|| video["title"]["simpleText"].as_str())
                        .unwrap_or_default()
                        .to_string();
                    
                    let channel_name = video["shortBylineText"]["runs"][0]["text"].as_str()
                        .or_else(|| video["longBylineText"]["runs"][0]["text"].as_str())
                        .unwrap_or_default()
                        .to_string();

                    let thumbnail_url = video["thumbnail"]["thumbnails"][0]["url"].as_str()
                        .map(|s| s.to_string());

                    let duration_text = video["thumbnailOverlays"][0]["thumbnailOverlayTimeStatusRenderer"]["text"]["runs"][0]["text"].as_str()
                        .or_else(|| video["thumbnailOverlays"][0]["thumbnailOverlayTimeStatusRenderer"]["text"]["simpleText"].as_str())
                        .unwrap_or_default();

                    let duration_seconds = if duration_text.is_empty() {
                        None
                    } else {
                        Some(parse_duration_seconds(duration_text))
                    };

                    let published_text = video["publishedTimeText"]["simpleText"].as_str()
                        .or_else(|| video["publishedTimeText"]["runs"][0]["text"].as_str())
                        .map(|s| s.to_string());

                    let view_count_text = video["viewCountText"]["simpleText"].as_str()
                        .or_else(|| video["viewCountText"]["runs"][0]["text"].as_str())
                        .map(|s| s.to_string());

                    let channel_id = extract_channel_id_from_video_renderer(video);

                    items.push(VideoSummary {
                        id: video_id.to_string(),
                        title,
                        channel_name,
                        channel_id,
                        thumbnail_url,
                        duration_seconds,
                        published_text,
                        view_count_text,
                    });
                }
            } else if let Some(video) = item.get("richItemRenderer") {
                if let Some(content_video) = video["content"].get("videoRenderer") {
                    let video_id = content_video.get("videoId").and_then(|v| v.as_str()).unwrap_or_default();
                    if !video_id.is_empty() {
                        let title = content_video.get("title").and_then(|t| {
                            t["runs"][0]["text"].as_str().or_else(|| t["simpleText"].as_str())
                        }).unwrap_or_default().to_string();

                        let channel_name = content_video.get("shortBylineText").and_then(|b| {
                            b["runs"][0]["text"].as_str()
                        }).unwrap_or_default().to_string();

                        let thumbnail_url = content_video.get("thumbnail")
                            .and_then(|th| th["thumbnails"][0]["url"].as_str())
                            .map(|s| s.to_string());

                        let duration_text = content_video.get("lengthText")
                            .and_then(|l| l["runs"][0]["text"].as_str().or_else(|| l["simpleText"].as_str()))
                            .unwrap_or_default();

                        let duration_seconds = if duration_text.is_empty() {
                            None
                        } else {
                            Some(parse_duration_seconds(duration_text))
                        };

                        let published_text = content_video.get("publishedTimeText")
                            .and_then(|p| p["simpleText"].as_str().or_else(|| p["runs"][0]["text"].as_str()))
                            .map(|s| s.to_string());

                        let view_count_text = content_video.get("viewCountText")
                            .and_then(|v| v["simpleText"].as_str().or_else(|| v["runs"][0]["text"].as_str()))
                            .map(|s| s.to_string());

                        let channel_id = extract_channel_id_from_video_renderer(content_video);

                        items.push(VideoSummary {
                            id: video_id.to_string(),
                            title,
                            channel_name,
                            channel_id,
                            thumbnail_url,
                            duration_seconds,
                            published_text,
                            view_count_text,
                        });
                    }
                }
            } else if let Some(cont) = item.get("continuationItemRenderer") {
                if let Some(token) = cont["continuationEndpoint"]["continuationCommand"]["token"].as_str() {
                    next_page_token = Some(token.to_string());
                }
            }
        }
    };

    // Case 1: Continuation append/reload
    if let Some(actions) = val["onResponseReceivedActions"].as_array() {
        for action in actions {
            if let Some(items_arr) = action["appendContinuationItemsAction"]["continuationItems"].as_array() {
                process_array(items_arr);
            } else if let Some(items_arr) = action["reloadContinuationItemsCommand"]["continuationItems"].as_array() {
                process_array(items_arr);
            }
        }
    }

    // Case 2: Standard tabbed browse response
    if let Some(tabs) = val["contents"]["twoColumnBrowseResultsRenderer"]["tabs"].as_array() {
        for tab in tabs {
            if let Some(tab_renderer) = tab.get("tabRenderer") {
                let content = &tab_renderer["content"];
                
                if let Some(contents_arr) = content["richGridRenderer"]["contents"].as_array() {
                    process_array(contents_arr);
                }
                
                if let Some(sections) = content["sectionListRenderer"]["contents"].as_array() {
                    for section in sections {
                        if let Some(items_arr) = section["itemSectionRenderer"]["contents"].as_array() {
                            for sub_item in items_arr {
                                if let Some(grid_items) = sub_item["gridRenderer"]["items"].as_array() {
                                    process_array(grid_items);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    (items, next_page_token)
}

// Parses and extracts video items and continuations from playlist browse responses
fn extract_videos_from_playlist_browse(val: &Value) -> (Vec<VideoSummary>, Option<String>) {
    let mut items = Vec::new();
    let mut next_page_token = None;

    let mut process_array = |arr: &Vec<Value>| {
        for item in arr {
            if let Some(video) = item.get("playlistVideoRenderer") {
                if let Some(video_id) = video["videoId"].as_str() {
                    let title = video["title"]["runs"][0]["text"].as_str()
                        .or_else(|| video["title"]["simpleText"].as_str())
                        .unwrap_or_default()
                        .to_string();

                    let channel_name = video["shortBylineText"]["runs"][0]["text"].as_str()
                        .or_else(|| video["longBylineText"]["runs"][0]["text"].as_str())
                        .unwrap_or_default()
                        .to_string();

                    let thumbnail_url = video["thumbnail"]["thumbnails"][0]["url"].as_str()
                        .map(|s| s.to_string());

                    let duration_seconds = video["lengthSeconds"].as_str()
                        .and_then(|s| s.parse::<u64>().ok())
                        .or_else(|| video["lengthSeconds"].as_u64());

                    items.push(VideoSummary {
                        id: video_id.to_string(),
                        title,
                        channel_name,
                        channel_id: extract_channel_id_from_video_renderer(video),
                        thumbnail_url,
                        duration_seconds,
                        published_text: None,
                        view_count_text: None,
                    });
                }
            } else if let Some(cont) = item.get("continuationItemRenderer") {
                if let Some(token) = cont["continuationEndpoint"]["continuationCommand"]["token"].as_str() {
                    next_page_token = Some(token.to_string());
                }
            }
        }
    };

    // Case 1: Continuation append/reload
    if let Some(actions) = val["onResponseReceivedActions"].as_array() {
        for action in actions {
            if let Some(items_arr) = action["appendContinuationItemsAction"]["continuationItems"].as_array() {
                process_array(items_arr);
            }
        }
    }

    // Case 2: Standard tabbed browse response
    if let Some(tabs) = val["contents"]["twoColumnBrowseResultsRenderer"]["tabs"].as_array() {
        for tab in tabs {
            if let Some(tab_renderer) = tab.get("tabRenderer") {
                let content = &tab_renderer["content"];
                if let Some(sections) = content["sectionListRenderer"]["contents"].as_array() {
                    for section in sections {
                        if let Some(items_arr) = section["itemSectionRenderer"]["contents"].as_array() {
                            for sub_item in items_arr {
                                if let Some(playlist_items) = sub_item["playlistVideoListRenderer"]["contents"].as_array() {
                                    process_array(playlist_items);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    (items, next_page_token)
}

// Parses and extracts comment threads from watches and comments endpoints
fn parse_comments_json(val: &Value) -> CommentsResponse {
    let mut comments = Vec::new();
    let mut next_page_token = None;

    let mut process_items = |arr: &Vec<Value>| {
        for item in arr {
            if let Some(thread) = item.get("commentThreadRenderer") {
                let renderer = &thread["comment"]["commentRenderer"];
                if !renderer.is_null() {
                    let id = renderer["commentId"].as_str().unwrap_or_default().to_string();
                    if id.is_empty() {
                        continue;
                    }

                    let author = renderer["authorText"]["runs"][0]["text"].as_str()
                        .or_else(|| renderer["authorText"]["simpleText"].as_str())
                        .unwrap_or("Anonymous")
                        .to_string();

                    let author_thumbnail = renderer["authorThumbnail"]["thumbnails"][0]["url"].as_str()
                        .map(|s| s.to_string());

                    let mut text = String::new();
                    if let Some(runs) = renderer["contentText"]["runs"].as_array() {
                        for run in runs {
                            if let Some(run_text) = run["text"].as_str() {
                                text.push_str(run_text);
                            }
                        }
                    } else if let Some(simple) = renderer["contentText"]["simpleText"].as_str() {
                        text = simple.to_string();
                    }

                    let published_text = renderer["publishedTimeText"]["runs"][0]["text"].as_str()
                        .or_else(|| renderer["publishedTimeText"]["simpleText"].as_str())
                        .map(|s| s.to_string());

                    let like_count = renderer["voteCount"]["simpleText"].as_str()
                        .map(|s| parse_mixed_number_word_to_long(s));

                    let reply_count = renderer["replyCount"].as_u64();

                    let reply_token = thread["replies"]["commentRepliesRenderer"]["contents"][0]["continuationItemRenderer"]["continuationEndpoint"]["continuationCommand"]["token"].as_str()
                        .map(|s| s.to_string());

                    comments.push(Comment {
                        id,
                        author,
                        author_thumbnail,
                        text,
                        published_text,
                        like_count,
                        reply_count,
                        continuation_token: reply_token,
                    });
                }
            } else if let Some(renderer) = item.get("commentRenderer") {
                let id = renderer["commentId"].as_str().unwrap_or_default().to_string();
                if !id.is_empty() {
                    let author = renderer["authorText"]["runs"][0]["text"].as_str()
                        .or_else(|| renderer["authorText"]["simpleText"].as_str())
                        .unwrap_or("Anonymous")
                        .to_string();

                    let author_thumbnail = renderer["authorThumbnail"]["thumbnails"][0]["url"].as_str()
                        .map(|s| s.to_string());

                    let mut text = String::new();
                    if let Some(runs) = renderer["contentText"]["runs"].as_array() {
                        for run in runs {
                            if let Some(run_text) = run["text"].as_str() {
                                text.push_str(run_text);
                            }
                        }
                    }

                    let published_text = renderer["publishedTimeText"]["runs"][0]["text"].as_str()
                        .map(|s| s.to_string());

                    let like_count = renderer["voteCount"]["simpleText"].as_str()
                        .map(|s| parse_mixed_number_word_to_long(s));

                    comments.push(Comment {
                        id,
                        author,
                        author_thumbnail,
                        text,
                        published_text,
                        like_count,
                        reply_count: None,
                        continuation_token: None,
                    });
                }
            } else if let Some(cont) = item.get("continuationItemRenderer") {
                if let Some(token) = cont["continuationEndpoint"]["continuationCommand"]["token"].as_str() {
                    next_page_token = Some(token.to_string());
                }
            }
        }
    };

    if let Some(actions) = val["onResponseReceivedEndpoints"].as_array() {
        for action in actions {
            if let Some(items_arr) = action["reloadContinuationItemsCommand"]["continuationItems"].as_array() {
                process_items(items_arr);
            } else if let Some(items_arr) = action["appendContinuationItemsAction"]["continuationItems"].as_array() {
                process_items(items_arr);
            }
        }
    }

    if let Some(actions) = val["onResponseReceivedActions"].as_array() {
        for action in actions {
            if let Some(items_arr) = action["reloadContinuationItemsCommand"]["continuationItems"].as_array() {
                process_items(items_arr);
            } else if let Some(items_arr) = action["appendContinuationItemsAction"]["continuationItems"].as_array() {
                process_items(items_arr);
            }
        }
    }

    if let Some(contents) = val["contents"]["twoColumnWatchNextResults"]["results"]["results"]["contents"].as_array() {
        for content in contents {
            if let Some(item_section) = content.get("itemSectionRenderer") {
                if item_section["sectionIdentifier"].as_str() == Some("comment-item-section") {
                    if let Some(items_arr) = item_section["contents"].as_array() {
                        process_items(items_arr);
                    }
                }
            }
        }
    }

    CommentsResponse {
        comments,
        next_page_token,
    }
}

// Parses and extracts trending kiosk videos
fn parse_trending_json(val: &Value) -> Vec<VideoSummary> {
    let mut items = Vec::new();

    let mut process_array = |arr: &Vec<Value>| {
        for item in arr {
            if let Some(video) = item.get("videoRenderer") {
                if let Some(video_id) = video["videoId"].as_str() {
                    let title = video["title"]["runs"][0]["text"].as_str()
                        .or_else(|| video["title"]["simpleText"].as_str())
                        .unwrap_or_default()
                        .to_string();

                    let channel_name = video["ownerText"]["runs"][0]["text"].as_str()
                        .or_else(|| video["longBylineText"]["runs"][0]["text"].as_str())
                        .unwrap_or_default()
                        .to_string();

                    let thumbnail_url = video["thumbnail"]["thumbnails"][0]["url"].as_str()
                        .map(|s| s.to_string());

                    let duration_text = video["lengthText"]["runs"][0]["text"].as_str()
                        .or_else(|| video["lengthText"]["simpleText"].as_str())
                        .unwrap_or_default();

                    let duration_seconds = if duration_text.is_empty() {
                        None
                    } else {
                        Some(parse_duration_seconds(duration_text))
                    };

                    let published_text = video["publishedTimeText"]["simpleText"].as_str()
                        .or_else(|| video["publishedTimeText"]["runs"][0]["text"].as_str())
                        .map(|s| s.to_string());

                    let view_count_text = video["viewCountText"]["simpleText"].as_str()
                        .or_else(|| video["viewCountText"]["runs"][0]["text"].as_str())
                        .map(|s| s.to_string());

                    let channel_id = extract_channel_id_from_video_renderer(video);

                    items.push(VideoSummary {
                        id: video_id.to_string(),
                        title,
                        channel_name,
                        channel_id,
                        thumbnail_url,
                        duration_seconds,
                        published_text,
                        view_count_text,
                    });
                }
            }
        }
    };

    if let Some(tabs) = val["contents"]["twoColumnBrowseResultsRenderer"]["tabs"].as_array() {
        for tab in tabs {
            if let Some(tab_renderer) = tab.get("tabRenderer") {
                let content = &tab_renderer["content"];
                if let Some(sections) = content["sectionListRenderer"]["contents"].as_array() {
                    for section in sections {
                        if let Some(items_arr) = section["itemSectionRenderer"]["contents"].as_array() {
                            for item in items_arr {
                                if let Some(shelf) = item.get("shelfRenderer") {
                                    if let Some(sub_items) = shelf["content"]["expandedShelfContentsRenderer"]["items"].as_array() {
                                        process_array(sub_items);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    items
}


#[async_trait]
impl YoutubeExtractor for InnertubeClient {
    async fn search_videos(
        &self,
        request: SearchVideosRequest,
    ) -> AppResult<SearchVideosResponse> {
        let query = request.query.trim();
        if request.page_token.is_none() && query.is_empty() {
            return Err(AppError::Validation("Search query cannot be empty".into()));
        }

        let mut payload = if let Some(page_token) = request.page_token.as_deref() {
            serde_json::json!({
                "continuation": page_token
            })
        } else {
            serde_json::json!({
                "query": query
            })
        };

        // Query Search using the WEB client matching NewPipe's configuration
        let res = self.post_innertube("search", "WEB", "2.20260120.01.00", &mut payload).await?;
        let (items, next_page_token) = parse_innertube_search(res);

        Ok(SearchVideosResponse {
            items,
            next_page_token,
            source: "innertube".to_string(),
        })
    }

    async fn get_video_details(
        &self,
        video_id: &str,
    ) -> AppResult<VideoDetails> {
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

            let mut ios_res = self.post_innertube("player", "IOS", "19.29.1", &mut ios_payload).await;
            
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
                ios_res = self.post_innertube("player", "IOS", "19.29.1", &mut retry_payload).await;
            }
            res = ios_res;
        }

        let res = res?;
        check_playability_status(&res["playabilityStatus"])?;

        let details = &res["videoDetails"];
        if details.is_null() {
            return Err(AppError::Extractor("Failed to fetch video details from Innertube".into()));
        }

        let id = details["videoId"].as_str().unwrap_or(video_id_trimmed).to_string();
        let title = details["title"].as_str().unwrap_or_default().to_string();
        let channel_name = details["author"].as_str().unwrap_or_default().to_string();
        let description = details["shortDescription"].as_str().map(|s| s.to_string());
        
        let thumbnail_url = details["thumbnail"]["thumbnails"][0]["url"]
            .as_str()
            .map(|s| s.to_string());

        let duration_seconds = extract_duration_seconds_from_player_response(&res);

        Ok(VideoDetails {
            id,
            title,
            channel_name,
            description,
            thumbnail_url,
            duration_seconds,
        })
    }

    async fn get_stream_info(
        &self,
        video_id: &str,
    ) -> AppResult<StreamInfo> {
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

        let mut res = self.post_innertube("player", "ANDROID_VR", "1.61.48", &mut vr_payload).await;

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
            let mut ios_res = self.post_innertube("player", "IOS", "19.29.1", &mut ios_payload).await;
            
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
                ios_res = self.post_innertube("player", "IOS", "19.29.1", &mut retry_payload).await;
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
                playability["reason"].as_str().unwrap_or("Unknown playability reason"),
                playability["status"].as_str().unwrap_or("UNKNOWN")
            )));
        }

        // Search in standard combined formats (video + audio)
        let mut stream_url = None;
        let mut last_stream_error = None;
        if let Some(formats) = streaming_data["formats"].as_array() {
            for format in formats {
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
        })
    }

    async fn get_channel_details(
        &self,
        channel_id: &str,
    ) -> AppResult<ChannelDetails> {
        let channel_id_trimmed = channel_id.trim();
        if channel_id_trimmed.is_empty() {
            return Err(AppError::Validation("Channel ID cannot be empty".into()));
        }

        let mut payload = serde_json::json!({
            "browseId": channel_id_trimmed
        });

        let res = self.post_innertube("browse", "WEB", "2.20260120.01.00", &mut payload).await?;

        let metadata = &res["metadata"]["channelMetadataRenderer"];
        let header = &res["header"];

        let id = metadata["externalChannelId"].as_str()
            .or_else(|| res["responseContext"]["serviceTrackingParams"][0]["params"][0]["value"].as_str())
            .unwrap_or(channel_id_trimmed)
            .to_string();

        let name = metadata["title"].as_str()
            .or_else(|| header["c4TabbedHeaderRenderer"]["title"].as_str())
            .or_else(|| header["pageHeaderRenderer"]["content"]["pageHeaderViewModel"]["title"]["dynamicTextViewModel"]["text"]["content"].as_str())
            .unwrap_or("Unknown Channel")
            .to_string();

        let description = metadata["description"].as_str()
            .or_else(|| res["microformat"]["microformatDataRenderer"]["description"].as_str())
            .map(|s| s.to_string());

        let avatar_url = metadata["avatar"]["thumbnails"][0]["url"].as_str()
            .or_else(|| header["c4TabbedHeaderRenderer"]["avatar"]["thumbnails"][0]["url"].as_str())
            .or_else(|| header["pageHeaderRenderer"]["content"]["pageHeaderViewModel"]["image"]["decoratedAvatarViewModel"]["avatar"]["avatarViewModel"]["image"]["sources"][0]["url"].as_str())
            .map(|s| s.to_string());

        let banner_url = header["c4TabbedHeaderRenderer"]["banner"]["thumbnails"][0]["url"].as_str()
            .or_else(|| header["pageHeaderRenderer"]["content"]["pageHeaderViewModel"]["banner"]["imageBannerViewModel"]["image"]["sources"][0]["url"].as_str())
            .map(|s| s.to_string());

        let mut subscriber_count = None;
        let mut subscriber_count_text = None;

        if let Some(text) = header["c4TabbedHeaderRenderer"]["subscriberCountText"]["simpleText"].as_str() {
            subscriber_count_text = Some(text.to_string());
            subscriber_count = Some(parse_mixed_number_word_to_long(text));
        } else if let Some(runs) = header["c4TabbedHeaderRenderer"]["subscriberCountText"]["runs"].as_array() {
            if let Some(text) = runs[0]["text"].as_str() {
                subscriber_count_text = Some(text.to_string());
                subscriber_count = Some(parse_mixed_number_word_to_long(text));
            }
        } else if let Some(rows) = header["pageHeaderRenderer"]["content"]["pageHeaderViewModel"]["metadata"]["contentMetadataViewModel"]["metadataRows"].as_array() {
            if let Some(last_row) = rows.last() {
                if let Some(parts) = last_row["metadataParts"].as_array() {
                    if let Some(text) = parts[0]["text"]["content"].as_str() {
                        subscriber_count_text = Some(text.to_string());
                        subscriber_count = Some(parse_mixed_number_word_to_long(text));
                    }
                }
            }
        }

        let mut verified = false;
        if let Some(badges) = header["c4TabbedHeaderRenderer"]["badges"].as_array() {
            for badge in badges {
                if let Some(style) = badge["metadataBadgeRenderer"]["style"].as_str() {
                    if style == "BADGE_STYLE_TYPE_VERIFIED" || style == "BADGE_STYLE_TYPE_VERIFIED_ARTIST" {
                        verified = true;
                        break;
                    }
                }
            }
        }

        Ok(ChannelDetails {
            id,
            name,
            description,
            avatar_url,
            banner_url,
            subscriber_count,
            subscriber_count_text,
            verified,
        })
    }

    async fn get_channel_videos(
        &self,
        channel_id: &str,
        page_token: Option<String>,
    ) -> AppResult<ChannelVideosResponse> {
        let channel_id_trimmed = channel_id.trim();
        if channel_id_trimmed.is_empty() {
            return Err(AppError::Validation("Channel ID cannot be empty".into()));
        }

        let mut payload = if let Some(ref token) = page_token {
            serde_json::json!({
                "continuation": token
            })
        } else {
            serde_json::json!({
                "browseId": channel_id_trimmed,
                "params": "EgZ2aWRlb3PyBgQKAjoA" // Force videos tab
            })
        };

        let res = self.post_innertube("browse", "WEB", "2.20260120.01.00", &mut payload).await?;
        let (videos, next_page_token) = extract_videos_from_browse(&res);

        Ok(ChannelVideosResponse {
            channel_id: channel_id_trimmed.to_string(),
            videos,
            next_page_token,
        })
    }

    async fn get_playlist_details(
        &self,
        playlist_id: &str,
        page_token: Option<String>,
    ) -> AppResult<PlaylistDetailsResponse> {
        let playlist_id_trimmed = playlist_id.trim();
        if playlist_id_trimmed.is_empty() {
            return Err(AppError::Validation("Playlist ID cannot be empty".into()));
        }

        let mut payload = if let Some(ref token) = page_token {
            serde_json::json!({
                "continuation": token
            })
        } else {
            serde_json::json!({
                "browseId": format!("VL{}", playlist_id_trimmed.replace("VL", ""))
            })
        };

        let res = self.post_innertube("browse", "WEB", "2.20260120.01.00", &mut payload).await?;
        
        let header = &res["header"]["playlistHeaderRenderer"];
        let title = header["title"]["runs"][0]["text"].as_str()
            .or_else(|| header["title"]["simpleText"].as_str())
            .unwrap_or("Unknown Playlist")
            .to_string();

        let description = header["descriptionText"]["runs"][0]["text"].as_str()
            .or_else(|| header["descriptionText"]["simpleText"].as_str())
            .map(|s| s.to_string());

        let channel_name = header["ownerText"]["runs"][0]["text"].as_str()
            .or_else(|| header["ownerText"]["simpleText"].as_str())
            .unwrap_or("Unknown Owner")
            .to_string();

        let video_count = header["numVideosText"]["runs"][0]["text"].as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .or_else(|| header["numVideosText"]["simpleText"].as_str().map(|s| parse_mixed_number_word_to_long(s)));

        let (videos, next_page_token) = extract_videos_from_playlist_browse(&res);

        Ok(PlaylistDetailsResponse {
            id: playlist_id_trimmed.to_string(),
            title,
            description,
            channel_name,
            video_count,
            videos,
            next_page_token,
        })
    }

    async fn get_comments(
        &self,
        video_id: &str,
        page_token: Option<String>,
    ) -> AppResult<CommentsResponse> {
        let video_id_trimmed = video_id.trim();
        if video_id_trimmed.is_empty() && page_token.is_none() {
            return Err(AppError::Validation("Video ID cannot be empty".into()));
        }

        let mut payload = if let Some(ref token) = page_token {
            serde_json::json!({
                "continuation": token
            })
        } else {
            serde_json::json!({
                "videoId": video_id_trimmed
            })
        };

        let res = self.post_innertube("next", "WEB", "2.20260120.01.00", &mut payload).await?;
        let comments_res = parse_comments_json(&res);

        Ok(comments_res)
    }

    async fn get_trending_videos(
        &self,
    ) -> AppResult<Vec<VideoSummary>> {
        let mut payload = serde_json::json!({
            "browseId": "FEtrending"
        });

        let res = self.post_innertube("browse", "WEB", "2.20260120.01.00", &mut payload).await?;
        let trending_videos = parse_trending_json(&res);

        Ok(trending_videos)
    }

    async fn get_search_suggestions(
        &self,
        query: &str,
    ) -> AppResult<Vec<String>> {
        let encoded_query = custom_url_encode(query);
        let url = format!(
            "https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&xhr=t&q={}",
            encoded_query
        );

        let client = reqwest::Client::new();
        let res = client.get(&url)
            .header("Origin", "https://www.youtube.com")
            .header("Referer", "https://www.youtube.com")
            .send()
            .await
            .map_err(|e| AppError::Extractor(format!("Network error suggestions: {}", e)))?;

        let val: Value = res.json()
            .await
            .map_err(|e| AppError::Extractor(format!("JSON error suggestions: {}", e)))?;

        let mut suggestions = Vec::new();
        if let Some(arr) = val.get(1).and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(suggestion_str) = item.get(0).and_then(|s| s.as_str()) {
                    let cleaned = suggestion_str.trim().to_string();
                    if !cleaned.is_empty() {
                        suggestions.push(cleaned);
                    }
                }
            }
        }
        Ok(suggestions)
    }

    async fn search_music(
        &self,
        query: &str,
        filter: &str,
    ) -> AppResult<Vec<VideoSummary>> {
        let params = match filter {
            "songs" => Some("Eg-KAQwIARAAGAAgACgAMABqChAEEAUQAxAKEAk%3D"),
            "videos" => Some("Eg-KAQwIABABGAAgACgAMABqChAEEAUQAxAKEAk%3D"),
            "albums" => Some("Eg-KAQwIABAAGAEgACgAMABqChAEEAUQAxAKEAk%3D"),
            "playlists" => Some("Eg-KAQwIABAAGAAgACgBMABqChAEEAUQAxAKEAk%3D"),
            "artists" => Some("Eg-KAQwIABAAGAAgASgAMABqChAEEAUQAxAKEAk%3D"),
            _ => None,
        };

        let mut payload = serde_json::json!({
            "query": query,
        });
        if let Some(p) = params {
            payload["params"] = serde_json::Value::String(p.to_string());
        }

        let res = self.post_innertube("search", "WEB_REMIX", "67", &mut payload).await?;
        let items = parse_music_search_json(&res);

        Ok(items)
    }

    fn parse_subscription_export(
        &self,
        data: &str,
    ) -> AppResult<Vec<(String, String)>> {
        let mut subscriptions = Vec::new();
        let lines: Vec<&str> = data.lines().collect();

        for line in lines {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Case 1: OPML XML Outline
            if trimmed.contains("<outline") {
                let channel_id = if let Some(pos) = trimmed.find("channel_id=") {
                    let start = pos + 11;
                    if let Some(end) = trimmed[start..].find('"').or_else(|| trimmed[start..].find('\'')) {
                        trimmed[start..start+end].to_string()
                    } else {
                        "".to_string()
                    }
                } else {
                    "".to_string()
                };

                let title = if let Some(pos) = trimmed.find("title=") {
                    let start = pos + 6;
                    if let Some(end) = trimmed[start..].find('"').or_else(|| trimmed[start..].find('\'')) {
                        trimmed[start..start+end].to_string()
                    } else {
                        "".to_string()
                    }
                } else {
                    "".to_string()
                };

                if !channel_id.is_empty() && channel_id.starts_with("UC") {
                    subscriptions.push((channel_id, if title.is_empty() { "Imported Channel".to_string() } else { title }));
                }
                continue;
            }

            // Case 2: Takeout CSV
            if trimmed.contains("Channel Id") || trimmed.contains("Channel Url") {
                continue;
            }

            let parts: Vec<&str> = trimmed.split(',').collect();
            if parts.len() >= 3 {
                let channel_id = parts[0].trim().to_string();
                let title = parts[2].trim().trim_matches('"').to_string();
                if channel_id.starts_with("UC") && channel_id.len() >= 20 {
                    subscriptions.push((channel_id, title));
                    continue;
                }
            }

            // Case 3: Raw URL or ID list
            if trimmed.starts_with("UC") && trimmed.len() >= 20 {
                subscriptions.push((trimmed.to_string(), "Imported Channel".to_string()));
            } else if let Some(pos) = trimmed.find("/channel/") {
                let channel_id = trimmed[pos + 9..].split('/').next().unwrap_or("").to_string();
                if channel_id.starts_with("UC") && channel_id.len() >= 20 {
                    subscriptions.push((channel_id, "Imported Channel".to_string()));
                }
            }
        }

        let mut seen = std::collections::HashSet::new();
        subscriptions.retain(|(id, _)| seen.insert(id.clone()));

        Ok(subscriptions)
    }

    async fn get_music_lyrics(
        &self,
        video_id: &str,
    ) -> AppResult<Option<String>> {
        let video_id_trimmed = video_id.trim();
        if video_id_trimmed.is_empty() {
            return Err(AppError::Validation("Video ID cannot be empty".into()));
        }

        // 1. Fetch metadata from next to get lyrics browseId and params
        let (lyrics_browse_id, lyrics_params, _, _) = match self.fetch_watch_next_metadata(video_id_trimmed).await {
            Ok(data) => data,
            Err(_) => (None, None, None, None),
        };

        let browse_id = match lyrics_browse_id {
            Some(id) => id,
            None => return Ok(None), // Lyrics not available for this song
        };

        // 2. Fetch lyrics using WEB_REMIX client browse
        let mut payload = serde_json::json!({
            "browseId": browse_id
        });
        if let Some(p) = lyrics_params {
            payload["params"] = serde_json::Value::String(p);
        }

        let res = self.post_innertube("browse", "WEB_REMIX", "67", &mut payload).await?;

        let mut lyrics_text = String::new();
        if let Some(contents) = res["contents"]["sectionListRenderer"]["contents"].as_array() {
            for section in contents {
                if let Some(shelf) = section.get("musicDescriptionShelfRenderer") {
                    if let Some(runs) = shelf["description"]["runs"].as_array() {
                        for run in runs {
                            if let Some(t) = run["text"].as_str() {
                                lyrics_text.push_str(t);
                            }
                        }
                    }
                }
            }
        }

        if lyrics_text.is_empty() {
            Ok(None)
        } else {
            Ok(Some(lyrics_text))
        }
    }

    async fn get_music_related(
        &self,
        video_id: &str,
    ) -> AppResult<Vec<VideoSummary>> {
        let video_id_trimmed = video_id.trim();
        if video_id_trimmed.is_empty() {
            return Err(AppError::Validation("Video ID cannot be empty".into()));
        }

        // 1. Fetch metadata from next to get related browseId
        let (_, _, related_browse_id, related_params) = match self.fetch_watch_next_metadata(video_id_trimmed).await {
            Ok(data) => data,
            Err(_) => (None, None, None, None),
        };

        let browse_id = match related_browse_id {
            Some(id) => id,
            None => return Ok(Vec::new()),
        };

        // 2. Fetch related items using WEB_REMIX client browse
        let mut payload = serde_json::json!({
            "browseId": browse_id
        });
        if let Some(p) = related_params {
            payload["params"] = serde_json::Value::String(p);
        }

        let res = self.post_innertube("browse", "WEB_REMIX", "67", &mut payload).await?;

        let mut related_items = Vec::new();
        if let Some(sections) = res["contents"]["sectionListRenderer"]["contents"].as_array() {
            for section in sections {
                if let Some(carousel) = section.get("musicCarouselShelfRenderer") {
                    if let Some(contents_arr) = carousel["contents"].as_array() {
                        for item in contents_arr {
                            let renderer = item.get("musicResponsiveListItemRenderer")
                                .or_else(|| item.get("musicTwoRowItemRenderer"));

                            if let Some(r) = renderer {
                                let video_id = r["playlistItemData"]["videoId"].as_str()
                                    .or_else(|| r["navigationEndpoint"]["watchEndpoint"]["videoId"].as_str())
                                    .or_else(|| r["flexColumns"][0]["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"][0]["navigationEndpoint"]["watchEndpoint"]["videoId"].as_str())
                                    .unwrap_or_default()
                                    .to_string();

                                if video_id.is_empty() {
                                    continue;
                                }

                                let title = r["flexColumns"][0]["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"][0]["text"].as_str()
                                    .or_else(|| r["title"]["runs"][0]["text"].as_str())
                                    .unwrap_or_default()
                                    .to_string();

                                let mut channel_name = String::new();
                                if let Some(runs) = r["flexColumns"][1]["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"].as_array() {
                                    for run in runs {
                                        if let Some(t) = run["text"].as_str() {
                                            if t != "•" && t != " " {
                                                channel_name = t.to_string();
                                                break;
                                            }
                                        }
                                    }
                                }
                                if channel_name.is_empty() {
                                    channel_name = r["subtitle"]["runs"][0]["text"].as_str().unwrap_or("Related Song").to_string();
                                }

                                let thumbnail_url = r["thumbnail"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"][0]["url"].as_str()
                                    .or_else(|| r["thumbnailRenderer"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"][0]["url"].as_str())
                                    .map(|s| s.to_string());

                                related_items.push(VideoSummary {
                                    id: video_id,
                                    title,
                                    channel_name,
                                    channel_id: extract_channel_id_from_music_renderer(r),
                                    thumbnail_url,
                                    duration_seconds: None,
                                    published_text: None,
                                    view_count_text: Some("Related Song".to_string()),
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(related_items)
    }

    async fn get_music_album(
        &self,
        album_browse_id: &str,
    ) -> AppResult<Vec<VideoSummary>> {
        let album_browse_id_trimmed = album_browse_id.trim();
        if album_browse_id_trimmed.is_empty() {
            return Err(AppError::Validation("Album Browse ID cannot be empty".into()));
        }

        let mut payload = serde_json::json!({
            "browseId": album_browse_id_trimmed
        });

        let res = self.post_innertube("browse", "WEB_REMIX", "67", &mut payload).await?;
        let tracks = parse_music_album_json(&res);

        Ok(tracks)
    }

    async fn get_music_home(
        &self,
    ) -> AppResult<(Vec<MusicHomeSection>, Vec<MusicHomeChip>)> {
        let mut payload = serde_json::json!({
            "browseId": "FEmusic_home"
        });
        let res = self.post_innertube("browse", "WEB_REMIX", "67", &mut payload).await?;

        // 1. Parse chips
        let mut chips = Vec::new();
        let chips_val = res["header"]["chipCloudRenderer"]["chips"].as_array()
            .or_else(|| res["header"]["musicHeaderRenderer"]["header"]["chipCloudRenderer"]["chips"].as_array());
        
        if let Some(arr) = chips_val {
            for (idx, item) in arr.iter().enumerate() {
                if let Some(chip_renderer) = item.get("chipCloudChipRenderer") {
                    let title = chip_renderer["text"]["runs"][0]["text"].as_str()
                        .or_else(|| chip_renderer["text"]["simpleText"].as_str())
                        .unwrap_or_default()
                        .to_string();
                    if title.is_empty() {
                        continue;
                    }
                    let browse_id = chip_renderer["navigationEndpoint"]["browseEndpoint"]["browseId"].as_str().map(|s| s.to_string());
                    let params = chip_renderer["navigationEndpoint"]["browseEndpoint"]["params"].as_str().map(|s| s.to_string());
                    chips.push(MusicHomeChip {
                        title,
                        browse_id,
                        params,
                        order_by: idx as i32,
                    });
                }
            }
        }

        // 2. Parse sections
        let mut sections_arr = None;
        if let Some(arr) = res["contents"]["sectionListRenderer"]["contents"].as_array() {
            sections_arr = Some(arr);
        } else if let Some(tabs) = res["contents"]["singleColumnBrowseResultsRenderer"]["tabs"].as_array() {
            if let Some(tab_renderer) = tabs.first().and_then(|t| t.get("tabRenderer")) {
                if let Some(arr) = tab_renderer["content"]["sectionListRenderer"]["contents"].as_array() {
                    sections_arr = Some(arr);
                }
            }
        }

        let mut sections = Vec::new();
        if let Some(arr) = sections_arr {
            let mut order_idx = 0;
            for section in arr {
                if let Some(carousel) = section.get("musicCarouselShelfRenderer") {
                    let title = carousel["header"]["musicCarouselShelfBasicHeaderRenderer"]["title"]["runs"][0]["text"].as_str()
                        .or_else(|| carousel["header"]["musicCarouselShelfBasicHeaderRenderer"]["title"]["simpleText"].as_str())
                        .unwrap_or("Featured")
                        .to_string();
                        
                    let subtitle = carousel["header"]["musicCarouselShelfBasicHeaderRenderer"]["strapline"]["runs"][0]["text"].as_str()
                        .or_else(|| carousel["header"]["musicCarouselShelfBasicHeaderRenderer"]["strapline"]["simpleText"].as_str())
                        .map(|s| s.to_string());
                        
                    let mut tracks = Vec::new();
                    if let Some(contents) = carousel["contents"].as_array() {
                        for item in contents {
                            let renderer = item.get("musicResponsiveListItemRenderer")
                                .or_else(|| item.get("musicTwoRowItemRenderer"));
                                
                            if let Some(r) = renderer {
                                let video_id = r["playlistItemData"]["videoId"].as_str()
                                    .or_else(|| r["navigationEndpoint"]["watchEndpoint"]["videoId"].as_str())
                                    .or_else(|| r["flexColumns"][0]["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"][0]["navigationEndpoint"]["watchEndpoint"]["videoId"].as_str())
                                    .or_else(|| r["title"]["runs"][0]["navigationEndpoint"]["watchEndpoint"]["videoId"].as_str())
                                    .unwrap_or_default()
                                    .to_string();
                                    
                                if video_id.is_empty() {
                                    continue;
                                }
                                
                                let title = r["flexColumns"][0]["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"][0]["text"].as_str()
                                    .or_else(|| r["title"]["runs"][0]["text"].as_str())
                                    .unwrap_or_default()
                                    .to_string();
                                    
                                let mut channel_name = String::new();
                                if let Some(runs) = r["flexColumns"][1]["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"].as_array() {
                                    for run in runs {
                                        if let Some(t) = run["text"].as_str() {
                                            if t != "•" && t != " " {
                                                channel_name = t.to_string();
                                                break;
                                            }
                                        }
                                    }
                                }
                                if channel_name.is_empty() {
                                    if let Some(runs) = r["subtitle"]["runs"].as_array() {
                                        for run in runs {
                                            if let Some(t) = run["text"].as_str() {
                                                if t != "•" && t != " " && t != "Song" && t != "Video" {
                                                    channel_name = t.to_string();
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                                if channel_name.is_empty() {
                                    channel_name = "YouTube Music".to_string();
                                }
                                
                                let thumbnail_url = r["thumbnail"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"][0]["url"].as_str()
                                    .or_else(|| r["thumbnailRenderer"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"][0]["url"].as_str())
                                    .map(|s| s.to_string());
                                    
                                let mut duration_seconds = None;
                                if let Some(runs) = r["flexColumns"][1]["musicResponsiveListItemFlexColumnRenderer"]["text"]["runs"].as_array() {
                                    for run in runs {
                                        if let Some(t) = run["text"].as_str() {
                                            if t.contains(':') {
                                                duration_seconds = Some(parse_duration_seconds(t));
                                                break;
                                            }
                                        }
                                    }
                                }
                                if duration_seconds.is_none() {
                                    if let Some(runs) = r["subtitle"]["runs"].as_array() {
                                        for run in runs {
                                            if let Some(t) = run["text"].as_str() {
                                                if t.contains(':') {
                                                    duration_seconds = Some(parse_duration_seconds(t));
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                tracks.push(VideoSummary {
                                    id: video_id,
                                    title,
                                    channel_name,
                                    channel_id: extract_channel_id_from_music_renderer(r),
                                    thumbnail_url,
                                    duration_seconds,
                                    published_text: None,
                                    view_count_text: Some("Song".to_string()),
                                });
                            }
                        }
                    }
                    
                    if !tracks.is_empty() {
                        let section_id = format!("music_section_{}", order_idx);
                        sections.push(MusicHomeSection {
                            section_id,
                            title,
                            subtitle,
                            tracks,
                            order_by: order_idx,
                        });
                        order_idx += 1;
                    }
                }
            }
        }

        Ok((sections, chips))
    }

    async fn get_music_artist(
        &self,
        artist_browse_id: &str,
    ) -> AppResult<ArtistPage> {
        let mut payload = serde_json::json!({
            "browseId": artist_browse_id
        });
        let res = self.post_innertube("browse", "WEB_REMIX", "67", &mut payload).await?;
        let mut artist_page = parse_music_artist_json(&res)?;
        artist_page.artist.id = artist_browse_id.to_string();
        Ok(artist_page)
    }

    async fn get_music_explore(
        &self,
    ) -> AppResult<ExplorePage> {
        let mut payload = serde_json::json!({
            "browseId": "FEmusic_explore"
        });
        let res = self.post_innertube("browse", "WEB_REMIX", "67", &mut payload).await?;
        parse_music_explore_json(&res)
    }

    async fn get_music_charts(
        &self,
        continuation: Option<String>,
    ) -> AppResult<ChartsPage> {
        let mut payload = if let Some(token) = continuation {
            serde_json::json!({
                "continuation": token
            })
        } else {
            serde_json::json!({
                "browseId": "FEmusic_charts",
                "params": "ggMGCgQIgAQ%3D"
            })
        };
        let res = self.post_innertube("browse", "WEB_REMIX", "67", &mut payload).await?;
        parse_music_charts_json(&res)
    }
}

#[cfg(test)]
mod tests {
    use std::env;

    use serde_json::json;

    use super::{
        check_playability_status, extract_duration_seconds_from_player_response,
        extract_stream_url_from_format, parse_innertube_search, validate_stream_url,
        InnertubeClient,
    };
    use crate::api::extractor::YoutubeExtractor;
    use crate::errors::AppError;

    #[test]
    fn playability_status_maps_age_restricted_error() {
        let result = check_playability_status(&json!({
            "status": "LOGIN_REQUIRED",
            "reason": "This video may be inappropriate for some users"
        }));

        assert!(matches!(result, Err(AppError::AgeRestricted(_))));
    }

    #[test]
    fn search_parser_extracts_items_and_continuation_token() {
        let (items, next_page_token) = parse_innertube_search(json!({
            "contents": {
                "twoColumnSearchResultsRenderer": {
                    "primaryContents": {
                        "sectionListRenderer": {
                            "contents": [
                                {
                                    "itemSectionRenderer": {
                                        "contents": [
                                            {
                                                "videoRenderer": {
                                                    "videoId": "abc123def45",
                                                    "title": { "simpleText": "Test Video" },
                                                    "ownerText": { "runs": [{ "text": "Test Channel" }] },
                                                    "thumbnail": { "thumbnails": [{ "url": "https://img.test/1.jpg" }] },
                                                    "lengthText": { "simpleText": "1:23" },
                                                    "publishedTimeText": { "simpleText": "1 day ago" },
                                                    "viewCountText": { "simpleText": "100 views" }
                                                }
                                            },
                                            {
                                                "continuationItemRenderer": {
                                                    "continuationEndpoint": {
                                                        "continuationCommand": {
                                                            "token": "NEXT_TOKEN"
                                                        }
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        }));

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "abc123def45");
        assert_eq!(next_page_token.as_deref(), Some("NEXT_TOKEN"));
    }

    #[test]
    fn duration_falls_back_to_adaptive_format_approx_duration() {
        let duration = extract_duration_seconds_from_player_response(&json!({
            "videoDetails": {},
            "streamingData": {
                "adaptiveFormats": [
                    {
                        "approxDurationMs": "9876"
                    }
                ]
            }
        }));

        assert_eq!(duration, Some(9));
    }

    #[test]
    fn validate_stream_url_rejects_unresolved_throttling_parameter() {
        let result = validate_stream_url(
            "https://example.com/videoplayback?itag=18&n=throttled",
            "abc123def45",
        );

        assert!(matches!(result, Err(AppError::Extractor(message)) if message.contains("throttling parameter deobfuscation")));
    }

    #[test]
    fn extract_stream_url_uses_direct_signature_cipher() {
        let stream_url = extract_stream_url_from_format(
            &json!({
                "signatureCipher": "url=https%3A%2F%2Fexample.com%2Fvideoplayback%3Fitag%3D18&sp=sig&sig=SIGNED_VALUE"
            }),
            "abc123def45",
        )
        .expect("cipher should parse")
        .expect("cipher should yield a URL");

        assert!(stream_url.contains("sig=SIGNED_VALUE"));
    }

    #[tokio::test]
    #[ignore = "network regression harness"]
    async fn extractor_regression_fetches_known_playable_video() {
        let video_id = env::var("FLOW_EXTRACTOR_TEST_VIDEO_ID")
            .unwrap_or_else(|_| "dQw4w9WgXcQ".to_string());
        let client = InnertubeClient;

        let details = client
            .get_video_details(&video_id)
            .await
            .expect("known playable video should resolve details");
        assert_eq!(details.id, video_id);
        assert!(!details.title.is_empty());

        let stream = client
            .get_stream_info(&video_id)
            .await
            .expect("known playable video should resolve a stream");
        assert_eq!(stream.stream_id, video_id);
        assert!(stream.local_url.starts_with("http"));
    }

    #[tokio::test]
    #[ignore = "network regression harness"]
    async fn extractor_regression_maps_restricted_video_errors_when_configured() {
        let Ok(video_id) = env::var("FLOW_EXTRACTOR_TEST_RESTRICTED_VIDEO_ID") else {
            return;
        };
        let client = InnertubeClient;

        let result = client.get_stream_info(&video_id).await;

        assert!(matches!(
            result,
            Err(
                AppError::AgeRestricted(_)
                    | AppError::PrivateContent(_)
                    | AppError::PaidContent(_)
                    | AppError::GeographicRestriction(_)
                    | AppError::MusicPremium(_)
                    | AppError::BotCheckRequired(_)
                    | AppError::AccountTerminated(_)
                    | AppError::ContentNotAvailable(_)
            )
        ));
    }
}
