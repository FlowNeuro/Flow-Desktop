use crate::api::innertube::InnertubeClient;
use crate::api::innertube::core::utils::{
    extract_channel_id_from_video_renderer, extract_continuation_token, normalize_youtube_image_url,
    parse_duration_seconds,
};
use crate::api::innertube::parsers::parse_music_search_json;
use crate::errors::{AppError, AppResult};
use crate::models::search::{SearchVideosRequest, SearchVideosResponse};
use crate::models::video::VideoSummary;
use serde_json::Value;

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

                let title = video["title"]["runs"][0]["text"]
                    .as_str()
                    .or_else(|| video["title"]["simpleText"].as_str())
                    .unwrap_or_default()
                    .to_string();

                let channel_name = video["longBylineText"]["runs"][0]["text"]
                    .as_str()
                    .or_else(|| video["ownerText"]["runs"][0]["text"].as_str())
                    .or_else(|| video["shortBylineText"]["runs"][0]["text"].as_str())
                    .or_else(|| video["longBylineText"]["simpleText"].as_str())
                    .unwrap_or_default()
                    .to_string();

                let thumbnail_url = video["thumbnail"]["thumbnails"][0]["url"]
                    .as_str()
                    .or_else(|| video["thumbnail"]["url"].as_str())
                    .map(|s| s.to_string());

                let duration_text = video["lengthText"]["runs"][0]["text"]
                    .as_str()
                    .or_else(|| video["lengthText"]["simpleText"].as_str())
                    .unwrap_or_default();

                let duration_seconds = if duration_text.is_empty() {
                    None
                } else {
                    Some(parse_duration_seconds(duration_text))
                };

                let published_text = video["publishedTimeText"]["runs"][0]["text"]
                    .as_str()
                    .or_else(|| video["publishedTimeText"]["simpleText"].as_str())
                    .map(|s| s.to_string());

                let view_count_text = video["viewCountText"]["runs"][0]["text"]
                    .as_str()
                    .or_else(|| video["viewCountText"]["simpleText"].as_str())
                    .or_else(|| video["shortViewCountText"]["runs"][0]["text"].as_str())
                    .or_else(|| video["shortViewCountText"]["simpleText"].as_str())
                    .map(|s| s.to_string());

                let channel_id = extract_channel_id_from_video_renderer(video);

                let channel_avatar_url = video["channelThumbnailSupportedRenderers"]["channelThumbnailWithLinkRenderer"]["thumbnail"]["thumbnails"]
                    .as_array()
                    .and_then(|arr| arr.first())
                    .and_then(|t| t["url"].as_str())
                    .map(normalize_youtube_image_url);

                items.push(VideoSummary {
                    id: video_id,
                    title,
                    channel_name,
                    channel_id,
                    thumbnail_url,
                    duration_seconds,
                    published_text,
                    view_count_text,
                    channel_avatar_url,
                });
            } else if let Some(channel) = item.get("channelRenderer") {
                let channel_id = channel["channelId"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string();
                if !channel_id.is_empty() {
                    let title = channel["title"]["simpleText"]
                        .as_str()
                        .or_else(|| channel["title"]["runs"][0]["text"].as_str())
                        .unwrap_or_default()
                        .to_string();

                    let thumbnail_url = channel["thumbnail"]["thumbnails"][0]["url"]
                        .as_str()
                        .map(|s| s.to_string());

                    let subscriber_count_text = channel["subscriberCountText"]["simpleText"]
                        .as_str()
                        .or_else(|| channel["subscriberCountText"]["runs"][0]["text"].as_str())
                        .map(|s| s.to_string());

                    items.push(VideoSummary {
                        id: format!("channel:{}", channel_id),
                        title,
                        channel_name: "Channel".to_string(),
                        channel_id: Some(channel_id),
                        thumbnail_url: thumbnail_url.clone(),
                        duration_seconds: None,
                        published_text: subscriber_count_text,
                        view_count_text: Some("Channel".to_string()),
                        channel_avatar_url: thumbnail_url,
                    });
                }
            } else if next_page_token.is_none() {
                next_page_token = extract_continuation_token(item);
            }
        }
    };

    if let Some(contents_arr) = val["contents"]["twoColumnSearchResultsRenderer"]["primaryContents"]
        ["sectionListRenderer"]["contents"]
        .as_array()
    {
        for section in contents_arr {
            if let Some(items_arr) = section["itemSectionRenderer"]["contents"].as_array() {
                process_search_items(items_arr);
            }
        }
    }

    if let Some(commands) = val["onResponseReceivedCommands"].as_array() {
        for command in commands {
            if let Some(items_arr) =
                command["appendContinuationItemsAction"]["continuationItems"].as_array()
            {
                process_search_items(items_arr);
            } else if let Some(items_arr) =
                command["reloadContinuationItemsCommand"]["continuationItems"].as_array()
            {
                process_search_items(items_arr);
            }
        }
    }

    if let Some(actions) = val["onResponseReceivedActions"].as_array() {
        for action in actions {
            if let Some(items_arr) =
                action["appendContinuationItemsAction"]["continuationItems"].as_array()
            {
                process_search_items(items_arr);
            } else if let Some(items_arr) =
                action["reloadContinuationItemsCommand"]["continuationItems"].as_array()
            {
                process_search_items(items_arr);
            }
        }
    }

    (items, next_page_token)
}

impl InnertubeClient {
    pub async fn search_videos(
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

        let res = self
            .post_innertube("search", "WEB", "2.20260120.01.00", &mut payload)
            .await?;
        let (items, next_page_token) = parse_innertube_search(res);

        Ok(SearchVideosResponse {
            items,
            next_page_token,
            source: "innertube".to_string(),
        })
    }

    pub async fn get_search_suggestions(&self, query: &str) -> AppResult<Vec<String>> {
        let encoded_query = custom_url_encode(query);
        let url = format!(
            "https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&xhr=t&q={}",
            encoded_query
        );

        let client = reqwest::Client::new();
        let res = client
            .get(&url)
            .header("Origin", "https://www.youtube.com")
            .header("Referer", "https://www.youtube.com")
            .send()
            .await
            .map_err(|e| AppError::Extractor(format!("Network error suggestions: {}", e)))?;

        let val: Value = res
            .json()
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

    pub async fn search_music(&self, query: &str, filter: &str) -> AppResult<Vec<VideoSummary>> {
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

        let res = self
            .post_innertube("search", "WEB_REMIX", "67", &mut payload)
            .await?;
        let items = parse_music_search_json(&res);

        Ok(items)
    }
}
