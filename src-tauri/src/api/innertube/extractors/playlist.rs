use crate::api::innertube::InnertubeClient;
use crate::api::innertube::core::utils::{
    extract_channel_id_from_video_renderer, parse_mixed_number_word_to_long,
};
use crate::errors::{AppError, AppResult};
use crate::models::playlist::PlaylistDetailsResponse;
use crate::models::video::VideoSummary;
use serde_json::Value;

fn extract_videos_from_playlist_browse(val: &Value) -> (Vec<VideoSummary>, Option<String>) {
    let mut items = Vec::new();
    let mut next_page_token = None;

    let mut process_array = |arr: &Vec<Value>| {
        for item in arr {
            if let Some(video) = item.get("playlistVideoRenderer") {
                if let Some(video_id) = video["videoId"].as_str() {
                    let title = video["title"]["runs"][0]["text"]
                        .as_str()
                        .or_else(|| video["title"]["simpleText"].as_str())
                        .unwrap_or_default()
                        .to_string();

                    let channel_name = video["shortBylineText"]["runs"][0]["text"]
                        .as_str()
                        .or_else(|| video["longBylineText"]["runs"][0]["text"].as_str())
                        .unwrap_or_default()
                        .to_string();

                    let thumbnail_url = video["thumbnail"]["thumbnails"][0]["url"]
                        .as_str()
                        .map(|s| s.to_string());

                    let duration_seconds = video["lengthSeconds"]
                        .as_str()
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
                        channel_avatar_url: None,
                    });
                }
            } else if let Some(cont) = item.get("continuationItemRenderer") {
                if let Some(token) =
                    cont["continuationEndpoint"]["continuationCommand"]["token"].as_str()
                {
                    next_page_token = Some(token.to_string());
                }
            }
        }
    };

    // Case 1: Continuation append/reload
    if let Some(actions) = val["onResponseReceivedActions"].as_array() {
        for action in actions {
            if let Some(items_arr) =
                action["appendContinuationItemsAction"]["continuationItems"].as_array()
            {
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
                        if let Some(items_arr) =
                            section["itemSectionRenderer"]["contents"].as_array()
                        {
                            for sub_item in items_arr {
                                if let Some(playlist_items) =
                                    sub_item["playlistVideoListRenderer"]["contents"].as_array()
                                {
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

impl InnertubeClient {
    pub async fn get_playlist_details(
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

        let res = self
            .post_innertube("browse", "WEB", "2.20260120.01.00", &mut payload)
            .await?;

        let header = &res["header"]["playlistHeaderRenderer"];
        let title = header["title"]["runs"][0]["text"]
            .as_str()
            .or_else(|| header["title"]["simpleText"].as_str())
            .unwrap_or("Unknown Playlist")
            .to_string();

        let description = header["descriptionText"]["runs"][0]["text"]
            .as_str()
            .or_else(|| header["descriptionText"]["simpleText"].as_str())
            .map(|s| s.to_string());

        let channel_name = header["ownerText"]["runs"][0]["text"]
            .as_str()
            .or_else(|| header["ownerText"]["simpleText"].as_str())
            .unwrap_or("Unknown Owner")
            .to_string();

        let video_count = header["numVideosText"]["runs"][0]["text"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .or_else(|| {
                header["numVideosText"]["simpleText"]
                    .as_str()
                    .map(|s| parse_mixed_number_word_to_long(s))
            });

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
}
