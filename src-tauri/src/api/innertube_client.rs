use async_trait::async_trait;
use std::collections::HashMap;
use serde_json::Value;
use tracing::{debug, warn};

use crate::api::extractor::YoutubeExtractor;
use crate::errors::{AppError, AppResult};
use crate::models::search::{SearchVideosRequest, SearchVideosResponse};
use crate::models::video::{
    AudioTrack, CaptionTrack, MusicHomeChip, MusicHomeSection, RelatedContentItem, StreamInfo,
    StreamVariant, VideoDetails, VideoSummary,
};
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

fn extract_text_from_value(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }

    if let Some(text) = value["simpleText"].as_str() {
        return Some(text.to_string());
    }

    if let Some(text) = value["content"].as_str() {
        return Some(text.to_string());
    }

    if let Some(runs) = value["runs"].as_array() {
        let text = runs
            .iter()
            .filter_map(|run| {
                run["text"]
                    .as_str()
                    .or_else(|| run["content"].as_str())
            })
            .collect::<String>();
        if !text.is_empty() {
            return Some(text);
        }
    }

    None
}

fn thumbnail_url_from_array(value: &Value) -> Option<String> {
    value.as_array()
        .and_then(|thumbnails| thumbnails.last())
        .and_then(|thumb| thumb["url"].as_str().or_else(|| thumb["uri"].as_str()))
        .map(normalize_youtube_image_url)
}

fn normalize_youtube_image_url(url: &str) -> String {
    if url.starts_with("//") {
        format!("https:{url}")
    } else {
        url.to_string()
    }
}

fn build_video_summary_from_compact_video(video: &Value) -> Option<VideoSummary> {
    let video_id = video["videoId"].as_str()?.to_string();
    let title = video["title"]["runs"][0]["text"].as_str()
        .or_else(|| video["title"]["simpleText"].as_str())
        .unwrap_or_default()
        .to_string();

    let channel_name = video["longBylineText"]["runs"][0]["text"].as_str()
        .or_else(|| video["shortBylineText"]["runs"][0]["text"].as_str())
        .or_else(|| video["ownerText"]["runs"][0]["text"].as_str())
        .unwrap_or_default()
        .to_string();

    let thumbnail_url = video["thumbnail"]["thumbnails"].as_array()
        .and_then(|thumbnails| thumbnails.last())
        .and_then(|thumb| thumb["url"].as_str())
        .map(|s| s.to_string());

    let duration_seconds = video["lengthText"]["simpleText"].as_str()
        .or_else(|| video["lengthText"]["runs"][0]["text"].as_str())
        .map(parse_duration_seconds);

    let published_text = video["publishedTimeText"]["simpleText"].as_str()
        .or_else(|| video["publishedTimeText"]["runs"][0]["text"].as_str())
        .map(|s| s.to_string());

    let view_count_text = video["viewCountText"]["simpleText"].as_str()
        .or_else(|| video["viewCountText"]["runs"][0]["text"].as_str())
        .map(|s| s.to_string());

    Some(VideoSummary {
        id: video_id,
        title,
        channel_name,
        channel_id: extract_channel_id_from_video_renderer(video),
        thumbnail_url,
        duration_seconds,
        published_text,
        view_count_text,
    })
}

fn build_related_content_from_compact_video(video: &Value) -> Option<RelatedContentItem> {
    let summary = build_video_summary_from_compact_video(video)?;

    Some(RelatedContentItem {
        id: summary.id.clone(),
        item_type: "video".to_string(),
        title: summary.title,
        channel_name: summary.channel_name,
        channel_id: summary.channel_id,
        thumbnail_url: summary.thumbnail_url,
        duration_seconds: summary.duration_seconds,
        published_text: summary.published_text,
        view_count_text: summary.view_count_text,
        video_id: Some(summary.id),
        playlist_id: None,
        is_mix: false,
    })
}

fn build_related_content_from_compact_playlist(
    playlist: &Value,
    item_type: &str,
    is_mix: bool,
) -> Option<RelatedContentItem> {
    let playlist_id = playlist["playlistId"].as_str()
        .or_else(|| playlist["navigationEndpoint"]["watchEndpoint"]["playlistId"].as_str())
        .or_else(|| playlist["navigationEndpoint"]["watchPlaylistEndpoint"]["playlistId"].as_str())?
        .to_string();

    let video_id = playlist["navigationEndpoint"]["watchEndpoint"]["videoId"].as_str()
        .or_else(|| playlist["navigationEndpoint"]["watchPlaylistEndpoint"]["videoId"].as_str())
        .map(|s| s.to_string());

    let title = playlist["title"]["simpleText"].as_str()
        .or_else(|| playlist["title"]["runs"][0]["text"].as_str())
        .unwrap_or_default()
        .to_string();

    let channel_name = playlist["shortBylineText"]["runs"][0]["text"].as_str()
        .or_else(|| playlist["longBylineText"]["runs"][0]["text"].as_str())
        .or_else(|| playlist["ownerText"]["runs"][0]["text"].as_str())
        .unwrap_or_else(|| if is_mix { "YouTube Mix" } else { "Playlist" })
        .to_string();

    let thumbnail_url = playlist["thumbnail"]["thumbnails"].as_array()
        .and_then(|thumbnails| thumbnails.last())
        .and_then(|thumb| thumb["url"].as_str())
        .map(|s| s.to_string());

    let view_count_text = playlist["videoCountText"]["simpleText"].as_str()
        .or_else(|| playlist["videoCountText"]["runs"][0]["text"].as_str())
        .or_else(|| playlist["videoCountShortText"]["simpleText"].as_str())
        .or_else(|| playlist["videoCountShortText"]["runs"][0]["text"].as_str())
        .map(|s| s.to_string())
        .or_else(|| Some(if is_mix { "Mix".to_string() } else { "Playlist".to_string() }));

    Some(RelatedContentItem {
        id: playlist_id.clone(),
        item_type: item_type.to_string(),
        title,
        channel_name,
        channel_id: extract_channel_id_from_video_renderer(playlist),
        thumbnail_url,
        duration_seconds: None,
        published_text: None,
        view_count_text,
        video_id,
        playlist_id: Some(playlist_id),
        is_mix,
    })
}

fn metadata_part_content(lockup: &Value, row_index: usize, part_index: usize) -> Option<String> {
    lockup["metadata"]["lockupMetadataViewModel"]["metadata"]["contentMetadataViewModel"]["metadataRows"]
        .as_array()
        .and_then(|rows| rows.get(row_index))
        .and_then(|row| row["metadataParts"].as_array())
        .and_then(|parts| parts.get(part_index))
        .and_then(|part| part["text"]["content"].as_str())
        .map(ToOwned::to_owned)
}

fn extract_channel_id_from_lockup(lockup: &Value) -> Option<String> {
    lockup["metadata"]["lockupMetadataViewModel"]["image"]["decoratedAvatarViewModel"]["rendererContext"]["commandContext"]["onTap"]["innertubeCommand"]["browseEndpoint"]["browseId"]
        .as_str()
        .or_else(|| {
            lockup["metadata"]["lockupMetadataViewModel"]["image"]["avatarStackViewModel"]["rendererContext"]["commandContext"]["onTap"]["innertubeCommand"]["showDialogCommand"]["panelLoadingStrategy"]["inlineContent"]["dialogViewModel"]["customContent"]["listViewModel"]["listItems"][0]["listItemViewModel"]["rendererContext"]["commandContext"]["onTap"]["innertubeCommand"]["browseEndpoint"]["browseId"]
                .as_str()
        })
        .map(ToOwned::to_owned)
}

fn duration_from_lockup(lockup: &Value) -> Option<u64> {
    lockup["contentImage"]["thumbnailViewModel"]["overlays"]
        .as_array()
        .and_then(|overlays| {
            overlays.iter().find_map(|overlay| {
                overlay["thumbnailBottomOverlayViewModel"]["badges"]
                    .as_array()
                    .and_then(|badges| {
                        badges.iter().find_map(|badge| {
                            let text = badge["thumbnailBadgeViewModel"]["text"].as_str()?;
                            if text.chars().any(|c| c.is_ascii_digit()) {
                                Some(parse_duration_seconds(text))
                            } else {
                                None
                            }
                        })
                    })
            })
        })
}

fn build_related_content_from_lockup(lockup: &Value) -> Option<RelatedContentItem> {
    let content_type = lockup["contentType"].as_str().unwrap_or_default();
    let is_video = content_type == "LOCKUP_CONTENT_TYPE_VIDEO";
    let is_playlist = content_type == "LOCKUP_CONTENT_TYPE_PLAYLIST"
        || content_type == "LOCKUP_CONTENT_TYPE_PODCAST";

    if !is_video && !is_playlist {
        return None;
    }

    let video_id = lockup["contentId"].as_str()
        .or_else(|| lockup["rendererContext"]["commandContext"]["onTap"]["innertubeCommand"]["watchEndpoint"]["videoId"].as_str())
        .map(ToOwned::to_owned);

    let playlist_id = lockup["rendererContext"]["commandContext"]["onTap"]["innertubeCommand"]["watchEndpoint"]["playlistId"]
        .as_str()
        .or_else(|| lockup["rendererContext"]["commandContext"]["onTap"]["innertubeCommand"]["watchPlaylistEndpoint"]["playlistId"].as_str())
        .map(ToOwned::to_owned);

    if is_video && video_id.is_none() {
        return None;
    }
    if is_playlist && playlist_id.is_none() {
        return None;
    }

    let title = lockup["metadata"]["lockupMetadataViewModel"]["title"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string();

    let channel_name = metadata_part_content(lockup, 0, 0)
        .unwrap_or_else(|| if is_playlist { "Playlist".to_string() } else { String::new() });

    let thumbnail_url = thumbnail_url_from_array(
        &lockup["contentImage"]["thumbnailViewModel"]["image"]["sources"],
    );

    let (item_type, id, is_mix) = if is_playlist {
        let resolved_playlist_id = playlist_id.clone()?;
        let is_mix = resolved_playlist_id.starts_with("RD") || resolved_playlist_id.starts_with("UL");
        (if is_mix { "mix" } else { "playlist" }.to_string(), resolved_playlist_id, is_mix)
    } else {
        let video_id = video_id.clone()?;
        ("video".to_string(), video_id, false)
    };

    Some(RelatedContentItem {
        id,
        item_type,
        title,
        channel_name,
        channel_id: extract_channel_id_from_lockup(lockup),
        thumbnail_url,
        duration_seconds: duration_from_lockup(lockup),
        published_text: metadata_part_content(lockup, 1, 1),
        view_count_text: metadata_part_content(lockup, 1, 0),
        video_id,
        playlist_id,
        is_mix,
    })
}

fn collect_related_content_items(value: &Value, related: &mut Vec<RelatedContentItem>) {
    if let Some(video) = value.get("compactVideoRenderer") {
        if let Some(summary) = build_related_content_from_compact_video(video) {
            related.push(summary);
        }
        return;
    }

    if let Some(mix) = value.get("compactRadioRenderer") {
        if let Some(summary) = build_related_content_from_compact_playlist(mix, "mix", true) {
            related.push(summary);
        }
        return;
    }

    if let Some(playlist) = value.get("compactPlaylistRenderer") {
        if let Some(summary) = build_related_content_from_compact_playlist(playlist, "playlist", false) {
            related.push(summary);
        }
        return;
    }

    if let Some(lockup) = value.get("lockupViewModel") {
        if let Some(summary) = build_related_content_from_lockup(lockup) {
            related.push(summary);
        }
        return;
    }

    if let Some(array) = value.as_array() {
        for item in array {
            collect_related_content_items(item, related);
        }
        return;
    }

    if let Some(object) = value.as_object() {
        for child in object.values() {
            collect_related_content_items(child, related);
        }
    }
}

fn dedupe_related_content_items(items: Vec<RelatedContentItem>) -> Vec<RelatedContentItem> {
    let mut seen = std::collections::HashSet::new();
    let mut deduped = Vec::new();

    for item in items {
        let identity = format!(
            "{}:{}:{}",
            item.item_type,
            item.video_id.as_deref().unwrap_or(""),
            item.playlist_id.as_deref().unwrap_or(&item.id)
        );

        if seen.insert(identity) {
            deduped.push(item);
        }
    }

    deduped
}

fn unique_video_summaries(items: Vec<VideoSummary>) -> Vec<VideoSummary> {
    let mut seen = std::collections::HashSet::new();
    let mut deduped = Vec::new();

    for item in items {
        if seen.insert(item.id.clone()) {
            deduped.push(item);
        }
    }

    deduped
}

fn collect_comments_from_value(
    value: &Value,
    comments: &mut Vec<Comment>,
    next_page_token: &mut Option<String>,
    mutation_payloads: &HashMap<String, Value>,
) {
    if let Some(thread) = value.get("commentThreadRenderer") {
        if let Some(view_model) = thread["commentViewModel"]["commentViewModel"]
            .as_object()
            .map(|_| &thread["commentViewModel"]["commentViewModel"])
            .or_else(|| thread.get("commentViewModel"))
        {
            if let Some(comment) = build_comment_from_view_model(
                view_model,
                thread.get("replies").and_then(|r| r.get("commentRepliesRenderer")),
                mutation_payloads,
            ) {
                comments.push(comment);
            }
            return;
        }

        let renderer = &thread["comment"]["commentRenderer"];
        if !renderer.is_null() {
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
                } else if let Some(simple) = renderer["contentText"]["simpleText"].as_str() {
                    text = simple.to_string();
                }

                let published_text = renderer["publishedTimeText"]["runs"][0]["text"].as_str()
                    .or_else(|| renderer["publishedTimeText"]["simpleText"].as_str())
                    .map(|s| s.to_string());

                let like_count = renderer["voteCount"]["simpleText"].as_str()
                    .map(parse_mixed_number_word_to_long);

                let reply_count = renderer["replyCount"].as_u64();

                let reply_token = thread["replies"]["commentRepliesRenderer"]["contents"][0]["continuationItemRenderer"]["continuationEndpoint"]["continuationCommand"]["token"].as_str()
                    .map(|s| s.to_string());

                let author_channel_id = renderer["authorEndpoint"]["browseEndpoint"]["browseId"].as_str()
                    .map(|s| s.to_string());

                comments.push(Comment {
                    id,
                    author,
                    author_thumbnail,
                    author_channel_id,
                    text,
                    published_text,
                    like_count,
                    reply_count,
                    continuation_token: reply_token,
                });
            }
        }
        return;
    }

    if let Some(view_model) = value.get("commentViewModel") {
        if let Some(comment) = build_comment_from_view_model(view_model, None, mutation_payloads) {
            comments.push(comment);
        }
        return;
    }

    if let Some(renderer) = value.get("commentRenderer") {
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
            } else if let Some(simple) = renderer["contentText"]["simpleText"].as_str() {
                text = simple.to_string();
            }

            let published_text = renderer["publishedTimeText"]["runs"][0]["text"].as_str()
                .or_else(|| renderer["publishedTimeText"]["simpleText"].as_str())
                .map(|s| s.to_string());

            let like_count = renderer["voteCount"]["simpleText"].as_str()
                .map(parse_mixed_number_word_to_long);

            let author_channel_id = renderer["authorEndpoint"]["browseEndpoint"]["browseId"].as_str()
                .map(|s| s.to_string());

            comments.push(Comment {
                id,
                author,
                author_thumbnail,
                author_channel_id,
                text,
                published_text,
                like_count,
                reply_count: None,
                continuation_token: None,
            });
        }
        return;
    }

    if next_page_token.is_none() {
        if let Some(renderer) = value.get("continuationItemRenderer") {
            if let Some(token) = renderer["continuationEndpoint"]["continuationCommand"]["token"].as_str() {
                *next_page_token = Some(token.to_string());
            }
        }
    }

    if let Some(array) = value.as_array() {
        for item in array {
            collect_comments_from_value(item, comments, next_page_token, mutation_payloads);
        }
        return;
    }

    if let Some(object) = value.as_object() {
        for child in object.values() {
            collect_comments_from_value(child, comments, next_page_token, mutation_payloads);
        }
    }
}

fn build_comment_mutation_map(value: &Value) -> HashMap<String, Value> {
    let mut mutations = HashMap::new();

    if let Some(items) = value["frameworkUpdates"]["entityBatchUpdate"]["mutations"].as_array() {
        for mutation in items {
            if let Some(key) = mutation["entityKey"].as_str() {
                mutations.insert(key.to_string(), mutation["payload"].clone());
            }
        }
    }

    mutations
}

fn comment_reply_token(replies_renderer: Option<&Value>) -> Option<String> {
    replies_renderer
        .and_then(|renderer| renderer["contents"].as_array())
        .and_then(|contents| {
            contents.iter().find_map(|content| {
                content["continuationItemRenderer"]["continuationEndpoint"]["continuationCommand"]["token"]
                    .as_str()
                    .map(ToOwned::to_owned)
            })
        })
}

fn build_comment_from_view_model(
    view_model: &Value,
    replies_renderer: Option<&Value>,
    mutation_payloads: &HashMap<String, Value>,
) -> Option<Comment> {
    let comment_key = view_model["commentKey"].as_str().unwrap_or_default();
    let toolbar_key = view_model["toolbarStateKey"].as_str().unwrap_or_default();

    let entity_payload = mutation_payloads
        .get(comment_key)
        .and_then(|payload| payload.get("commentEntityPayload"))?;

    let toolbar_state = mutation_payloads
        .get(toolbar_key)
        .and_then(|payload| payload.get("engagementToolbarStateEntityPayload"));

    let properties = &entity_payload["properties"];
    let author = &entity_payload["author"];
    let toolbar = &entity_payload["toolbar"];

    let id = properties["commentId"]
        .as_str()
        .or_else(|| view_model["commentId"].as_str())
        .unwrap_or_default()
        .to_string();
    if id.is_empty() {
        return None;
    }

    let text = extract_text_from_value(&properties["content"]).unwrap_or_default();
    let author_thumbnail = thumbnail_url_from_array(&entity_payload["avatar"]["image"]["sources"]);

    let reply_count = toolbar["replyCount"]
        .as_str()
        .map(parse_mixed_number_word_to_long)
        .or_else(|| toolbar["replyCount"].as_u64());

    let like_count = toolbar["likeCountNotliked"]
        .as_str()
        .map(parse_mixed_number_word_to_long);

    let continuation_token = comment_reply_token(replies_renderer);
    let _is_hearted = toolbar_state
        .map(|state| state["heartState"].as_str() == Some("TOOLBAR_HEART_STATE_HEARTED"))
        .unwrap_or(false);

    let author_channel_id = author["channelId"]
        .as_str()
        .or_else(|| author["navigationEndpoint"]["browseEndpoint"]["browseId"].as_str())
        .map(|s| s.to_string());

    Some(Comment {
        id,
        author: author["displayName"].as_str().unwrap_or("Anonymous").to_string(),
        author_thumbnail,
        author_channel_id,
        text,
        published_text: properties["publishedTime"].as_str().map(ToOwned::to_owned),
        like_count,
        reply_count,
        continuation_token,
    })
}

fn dedupe_comments(comments: Vec<Comment>) -> Vec<Comment> {
    let mut seen = std::collections::HashSet::new();
    let mut deduped = Vec::new();

    for comment in comments {
        if seen.insert(comment.id.clone()) {
            deduped.push(comment);
        }
    }

    deduped
}

fn map_related_content_to_video_summary(item: RelatedContentItem) -> VideoSummary {
    VideoSummary {
        id: item.video_id.unwrap_or(item.id),
        title: item.title,
        channel_name: item.channel_name,
        channel_id: item.channel_id,
        thumbnail_url: item.thumbnail_url,
        duration_seconds: item.duration_seconds,
        published_text: item.published_text,
        view_count_text: item.view_count_text,
    }
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

fn quality_height(format: &Value) -> Option<u64> {
    format["height"]
        .as_u64()
        .or_else(|| {
            format["qualityLabel"]
                .as_str()
                .and_then(|label| {
                    let digits = label
                        .chars()
                        .take_while(|c| c.is_ascii_digit())
                        .collect::<String>();
                    digits.parse::<u64>().ok()
                })
        })
}

fn parse_range_value(range: &Value) -> (Option<u64>, Option<u64>) {
    (range["start"].as_str().and_then(|value| value.parse::<u64>().ok()), range["end"].as_str().and_then(|value| value.parse::<u64>().ok()))
}

fn parse_approx_duration_ms(format: &Value) -> Option<u64> {
    format["approxDurationMs"].as_str().and_then(|value| value.parse::<u64>().ok())
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
        delivery_method: if is_progressive { "progressive" } else { "adaptive" }.to_string(),
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
            variant.quality_label, variant.fps.unwrap_or(0), variant.is_playable
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
                    url.query_pairs_mut().clear().extend_pairs(query_pairs).append_pair("fmt", "vtt");

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
            let language_code = id.split('.').next().filter(|value| value.len() <= 8).map(ToOwned::to_owned);
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
                is_default: audio_track["audioIsDefault"].as_bool().unwrap_or(tracks.is_empty()),
                init_range_start,
                init_range_end,
                index_range_start,
                index_range_end,
                approx_duration_ms: parse_approx_duration_ms(format),
            };

            if let Some(existing_index) = tracks.iter().position(|existing: &AudioTrack| existing.id == id) {
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

fn find_comment_count_text(val: &Value) -> Option<String> {
    // 1. Check in engagementPanels
    if let Some(panels) = val["engagementPanels"].as_array() {
        for panel in panels {
            let section = &panel["engagementPanelSectionListRenderer"];
            let panel_id = section["panelIdentifier"].as_str();
            if panel_id == Some("comment-item-section") || panel_id == Some("engagement-panel-comments-section") {
                let header = &section["header"]["engagementPanelTitleHeaderRenderer"];
                if let Some(text) = header["contextualInfo"]["runs"][0]["text"].as_str() {
                    return Some(text.to_string());
                }
                if let Some(text) = header["contextualInfo"]["simpleText"].as_str() {
                    return Some(text.to_string());
                }
            }
        }
    }

    // 2. Check in twoColumnWatchNextResults -> results -> results -> contents -> itemSectionRenderer
    if let Some(contents) = val["contents"]["twoColumnWatchNextResults"]["results"]["results"]["contents"].as_array() {
        for content in contents {
            let item_section = &content["itemSectionRenderer"];
            let target_id = item_section["targetId"].as_str();
            let section_id = item_section["sectionIdentifier"].as_str();
            let looks_like_comments = target_id == Some("comments-section")
                || section_id == Some("comment-item-section")
                || section_id == Some("comments-section");

            if looks_like_comments {
                let header = &item_section["header"]["commentsHeaderRenderer"];
                if !header.is_null() {
                    // Try to read countText
                    let mut count_str = String::new();
                    if let Some(runs) = header["countText"]["runs"].as_array() {
                        for run in runs {
                            if let Some(t) = run["text"].as_str() {
                                count_str.push_str(t);
                            }
                        }
                    } else if let Some(simple) = header["countText"]["simpleText"].as_str() {
                        count_str = simple.to_string();
                    }

                    if !count_str.is_empty() {
                        return Some(count_str);
                    }
                }
            }
        }
    }

    None
}

// Parses and extracts comment threads from watches and comments endpoints
fn parse_comments_json(val: &Value) -> CommentsResponse {
    let mut comments = Vec::new();
    let mut next_page_token = None;
    let mutation_payloads = build_comment_mutation_map(val);

    collect_comments_from_value(&val["onResponseReceivedEndpoints"], &mut comments, &mut next_page_token, &mutation_payloads);
    collect_comments_from_value(&val["onResponseReceivedActions"], &mut comments, &mut next_page_token, &mutation_payloads);
    collect_comments_from_value(&val["contents"]["twoColumnWatchNextResults"]["results"]["results"]["contents"], &mut comments, &mut next_page_token, &mutation_payloads);
    collect_comments_from_value(&val["engagementPanels"], &mut comments, &mut next_page_token, &mutation_payloads);

    comments = dedupe_comments(comments);

    let comment_count_text = find_comment_count_text(val);

    CommentsResponse {
        comments,
        next_page_token,
        comment_count_text,
    }
}

fn find_initial_comments_token(response: &Value) -> Option<String> {
    response["contents"]["twoColumnWatchNextResults"]["results"]["results"]["contents"]
        .as_array()
        .and_then(|contents| {
            contents.iter().find_map(|content| {
                let item_section = &content["itemSectionRenderer"];
                let target_id = item_section["targetId"].as_str();
                let section_id = item_section["sectionIdentifier"].as_str();
                let looks_like_comments = target_id == Some("comments-section")
                    || section_id == Some("comment-item-section")
                    || section_id == Some("comments-section");

                if !looks_like_comments {
                    return None;
                }

                item_section["contents"]
                    .as_array()
                    .and_then(|section_contents| {
                        section_contents.iter().find_map(|item| {
                            item["continuationItemRenderer"]["continuationEndpoint"]["continuationCommand"]["token"]
                                .as_str()
                                .or_else(|| {
                                    item["continuationItemRenderer"]["button"]["buttonRenderer"]["command"]["continuationCommand"]["token"]
                                        .as_str()
                                })
                                .map(ToOwned::to_owned)
                        })
                    })
                    .or_else(|| {
                        item_section["header"]["commentsHeaderRenderer"]["sortMenu"]["sortFilterSubMenuRenderer"]["subMenuItems"][0]["serviceEndpoint"]["continuationCommand"]["token"]
                            .as_str()
                            .map(ToOwned::to_owned)
                    })
            })
        })
        .or_else(|| {
            response["engagementPanels"].as_array().and_then(|panels| {
                panels.iter().find_map(|panel| {
                    let section = &panel["engagementPanelSectionListRenderer"];
                    let panel_id = section["panelIdentifier"].as_str();
                    if panel_id != Some("comment-item-section")
                        && panel_id != Some("engagement-panel-comments-section")
                    {
                        return None;
                    }

                    section["content"]["sectionListRenderer"]["contents"]
                        .as_array()
                        .and_then(|contents| {
                            contents.iter().find_map(|content| {
                                content["itemSectionRenderer"]["contents"][0]["continuationItemRenderer"]["continuationEndpoint"]["continuationCommand"]["token"]
                                    .as_str()
                                    .map(ToOwned::to_owned)
                            })
                        })
                        .or_else(|| {
                            section["header"]["engagementPanelTitleHeaderRenderer"]["menu"]["sortFilterSubMenuRenderer"]["subMenuItems"][0]["serviceEndpoint"]["continuationCommand"]["token"]
                                .as_str()
                                .map(ToOwned::to_owned)
                        })
                })
            })
        })
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
        if let Ok(next_res) = self.post_innertube("next", "WEB", "2.20260120.01.00", &mut next_payload).await {
            let mut primary_info = &serde_json::Value::Null;
            let mut secondary_info = &serde_json::Value::Null;
            if let Some(contents) = next_res["contents"]["twoColumnWatchNextResults"]["results"]["results"]["contents"].as_array() {
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
                if let Some(views) = primary_info["viewCount"]["videoViewCountRenderer"]["viewCount"]["simpleText"].as_str()
                    .or_else(|| primary_info["viewCount"]["videoViewCountRenderer"]["viewCount"]["runs"][0]["text"].as_str())
                    .or_else(|| primary_info["viewCount"]["videoViewCountRenderer"]["shortViewCount"]["simpleText"].as_str())
                    .or_else(|| primary_info["viewCount"]["videoViewCountRenderer"]["shortViewCount"]["runs"][0]["text"].as_str())
                {
                    view_count_text = Some(views.to_string());
                }

                // Extract published text
                if let Some(pub_date) = primary_info["dateText"]["simpleText"].as_str()
                    .or_else(|| primary_info["dateText"]["runs"][0]["text"].as_str())
                    .or_else(|| primary_info["relativeDateText"]["simpleText"].as_str())
                    .or_else(|| primary_info["relativeDateText"]["runs"][0]["text"].as_str())
                {
                    published_text = Some(pub_date.to_string());
                }

                // Extract like count
                if let Some(top_level_buttons) = primary_info["videoActions"]["menuRenderer"]["topLevelButtons"].as_array() {
                    for btn in top_level_buttons {
                        if let Some(viewModel) = btn.get("segmentedLikeDislikeButtonViewModel") {
                            let button_vm = &viewModel["likeButtonViewModel"]["likeButtonViewModel"]["toggleButtonViewModel"]["toggleButtonViewModel"]["defaultButtonViewModel"]["buttonViewModel"];
                            if let Some(title) = button_vm["title"]["runs"][0]["text"].as_str()
                                .or_else(|| button_vm["title"]["simpleText"].as_str())
                            {
                                like_count_text = Some(title.to_string());
                            } else if let Some(acc_text) = button_vm["accessibilityText"].as_str() {
                                like_count_text = Some(clean_like_count_from_accessibility(acc_text));
                            }
                        }
                        if like_count_text.is_none() {
                            if let Some(renderer) = btn.get("segmentedLikeDislikeButtonRenderer") {
                                let toggle_btn = &renderer["likeButton"]["toggleButtonRenderer"];
                                if !toggle_btn.is_null() {
                                    if let Some(label) = toggle_btn["accessibilityData"]["accessibilityData"]["label"].as_str()
                                        .or_else(|| toggle_btn["accessibility"]["label"].as_str())
                                        .or_else(|| toggle_btn["defaultText"]["accessibility"]["accessibilityData"]["label"].as_str())
                                    {
                                        like_count_text = Some(clean_like_count_from_accessibility(label));
                                    } else if let Some(text) = toggle_btn["defaultText"]["runs"][0]["text"].as_str()
                                        .or_else(|| toggle_btn["defaultText"]["simpleText"].as_str())
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
        })
    }

    async fn get_related_videos(
        &self,
        video_id: &str,
    ) -> AppResult<Vec<RelatedContentItem>> {
        let video_id_trimmed = video_id.trim();
        if video_id_trimmed.is_empty() {
            return Err(AppError::Validation("Video ID cannot be empty".into()));
        }

        let mut payload = serde_json::json!({
            "videoId": video_id_trimmed
        });

        let next_res = self.post_innertube("next", "WEB", "2.20260120.01.00", &mut payload).await?;
        let mut related = Vec::new();
        collect_related_content_items(&next_res["contents"]["twoColumnWatchNextResults"]["secondaryResults"], &mut related);

        if related.is_empty() {
            collect_related_content_items(&next_res["contents"]["twoColumnWatchNextResults"]["autoplay"], &mut related);
        }

        Ok(dedupe_related_content_items(related))
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
            hls_manifest_url: streaming_data["hlsManifestUrl"].as_str().map(ToOwned::to_owned),
            dash_manifest_url: streaming_data["dashManifestUrl"].as_str().map(ToOwned::to_owned),
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

        debug!(channel_id = %channel_id_trimmed, "[get_channel_details] Starting channel details fetch");

        let mut payload = serde_json::json!({
            "browseId": channel_id_trimmed
        });

        let res = self.post_innertube("browse", "WEB", "2.20260120.01.00", &mut payload).await?;

        debug!(
            channel_id = %channel_id_trimmed,
            has_metadata = !res["metadata"]["channelMetadataRenderer"].is_null(),
            has_header = !res["header"].is_null(),
            "[get_channel_details] Browse response received"
        );

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
            .map(normalize_youtube_image_url);

        let banner_url = header["c4TabbedHeaderRenderer"]["banner"]["thumbnails"][0]["url"].as_str()
            .or_else(|| header["pageHeaderRenderer"]["content"]["pageHeaderViewModel"]["banner"]["imageBannerViewModel"]["image"]["sources"][0]["url"].as_str())
            .map(normalize_youtube_image_url);

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

        debug!(video_id = %video_id_trimmed, has_page_token = page_token.is_some(), "[get_comments] Starting comments fetch");

        let res = self.post_innertube("next", "WEB", "2.20260120.01.00", &mut payload).await?;
        let mut comments_res = parse_comments_json(&res);

        debug!(
            video_id = %video_id_trimmed,
            comments_count = comments_res.comments.len(),
            has_next_token = comments_res.next_page_token.is_some(),
            "[get_comments] Initial parse result"
        );

        // On first load, the standard next response only contains a continuation token
        // for the comment section, not actual comments. We need to follow that token.
        if page_token.is_none() && comments_res.comments.is_empty() {
            let initial_count_text = comments_res.comment_count_text.clone();
            let continuation_token = find_initial_comments_token(&res)
                .or_else(|| comments_res.next_page_token.clone());

            debug!(
                video_id = %video_id_trimmed,
                has_continuation = continuation_token.is_some(),
                "[get_comments] Will attempt second fetch for actual comments"
            );

            if let Some(token) = continuation_token {
                let mut next_payload = serde_json::json!({
                    "continuation": token
                });
                let next_res = self.post_innertube("next", "WEB", "2.20260120.01.00", &mut next_payload).await?;
                comments_res = parse_comments_json(&next_res);
                if comments_res.comment_count_text.is_none() {
                    comments_res.comment_count_text = initial_count_text;
                }
                debug!(
                    video_id = %video_id_trimmed,
                    comments_count = comments_res.comments.len(),
                    "[get_comments] Second fetch result"
                );
            }
        }

        Ok(comments_res)
    }

    async fn get_trending_videos(
        &self,
    ) -> AppResult<Vec<VideoSummary>> {
        let mut payload = serde_json::json!({
            "browseId": "FEtrending"
        });

        match self.post_innertube("browse", "WEB", "2.20260120.01.00", &mut payload).await {
            Ok(res) => Ok(parse_trending_json(&res)),
            Err(error) => {
                warn!(error = %error, "[get_trending_videos] Trending browse failed, falling back to search queries");

                let mut fallback = Vec::new();
                for query in ["trending", "viral videos", "popular now"] {
                    match self.search_videos(SearchVideosRequest {
                        query: query.to_string(),
                        page_token: None,
                    }).await {
                        Ok(response) => fallback.extend(response.items),
                        Err(search_error) => {
                            warn!(query = %query, error = %search_error, "[get_trending_videos] Fallback search query failed");
                        }
                    }
                }

                Ok(unique_video_summaries(fallback))
            }
        }
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

        debug!(video_id = %video_id_trimmed, "[get_music_related] Starting related videos fetch");

        // 1. Fetch metadata from next to get related browseId
        let (_, _, related_browse_id, related_params) = match self.fetch_watch_next_metadata(video_id_trimmed).await {
            Ok(data) => {
                debug!(
                    video_id = %video_id_trimmed,
                    has_related_browse_id = data.2.is_some(),
                    "[get_music_related] WEB_REMIX watch next metadata result"
                );
                data
            },
            Err(e) => {
                debug!(video_id = %video_id_trimmed, error = %e, "[get_music_related] WEB_REMIX metadata fetch failed, falling back to WEB");
                (None, None, None, None)
            },
        };

        let browse_id = match related_browse_id {
            Some(id) => id,
            None => {
                // Fallback to standard watch next recommendations if we don't have related_browse_id
                debug!(video_id = %video_id_trimmed, "[get_music_related] No music related browse ID, falling back to WEB next endpoint");
                let standard_related = match self.get_related_videos(video_id_trimmed).await {
                    Ok(results) => results
                        .into_iter()
                        .map(map_related_content_to_video_summary)
                        .collect(),
                    Err(error) => {
                        debug!(video_id = %video_id_trimmed, error = %error, "[get_music_related] WEB next endpoint call failed");
                        Vec::new()
                    }
                };
                debug!(video_id = %video_id_trimmed, count = standard_related.len(), "[get_music_related] Returning standard related videos");
                return Ok(standard_related);
            }
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
