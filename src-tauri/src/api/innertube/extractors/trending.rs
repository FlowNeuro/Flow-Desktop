use crate::api::innertube::InnertubeClient;
use crate::api::innertube::core::utils::{
    extract_channel_id_from_video_renderer, parse_duration_seconds, unique_video_summaries,
};
use crate::errors::AppResult;
use crate::models::search::SearchVideosRequest;
use crate::models::video::VideoSummary;
use serde_json::Value;
use tracing::warn;

// Parses and extracts trending kiosk videos
fn parse_trending_json(val: &Value) -> Vec<VideoSummary> {
    let mut items = Vec::new();

    let mut process_array = |arr: &Vec<Value>| {
        for item in arr {
            if let Some(video) = item.get("videoRenderer") {
                if let Some(video_id) = video["videoId"].as_str() {
                    let title = video["title"]["runs"][0]["text"]
                        .as_str()
                        .or_else(|| video["title"]["simpleText"].as_str())
                        .unwrap_or_default()
                        .to_string();

                    let channel_name = video["ownerText"]["runs"][0]["text"]
                        .as_str()
                        .or_else(|| video["longBylineText"]["runs"][0]["text"].as_str())
                        .unwrap_or_default()
                        .to_string();

                    let thumbnail_url = video["thumbnail"]["thumbnails"][0]["url"]
                        .as_str()
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

                    let published_text = video["publishedTimeText"]["simpleText"]
                        .as_str()
                        .or_else(|| video["publishedTimeText"]["runs"][0]["text"].as_str())
                        .map(|s| s.to_string());

                    let view_count_text = video["viewCountText"]["simpleText"]
                        .as_str()
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
                        if let Some(items_arr) =
                            section["itemSectionRenderer"]["contents"].as_array()
                        {
                            for item in items_arr {
                                if let Some(shelf) = item.get("shelfRenderer") {
                                    if let Some(sub_items) =
                                        shelf["content"]["expandedShelfContentsRenderer"]["items"]
                                            .as_array()
                                    {
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

impl InnertubeClient {
    pub async fn get_trending_videos(&self) -> AppResult<Vec<VideoSummary>> {
        let mut payload = serde_json::json!({
            "browseId": "FEtrending"
        });

        match self
            .post_innertube("browse", "WEB", "2.20260120.01.00", &mut payload)
            .await
        {
            Ok(res) => Ok(parse_trending_json(&res)),
            Err(error) => {
                warn!(error = %error, "[get_trending_videos] Trending browse failed, falling back to search queries");

                let mut fallback = Vec::new();
                for query in ["trending", "viral videos", "popular now"] {
                    match self
                        .search_videos(SearchVideosRequest {
                            query: query.to_string(),
                            page_token: None,
                        })
                        .await
                    {
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
}
