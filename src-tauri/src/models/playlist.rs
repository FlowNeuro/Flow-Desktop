use crate::models::video::VideoSummary;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistDetailsResponse {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub channel_name: String,
    pub video_count: Option<u64>,
    pub view_count_text: Option<String>,
    pub videos: Vec<VideoSummary>,
    pub next_page_token: Option<String>,
}
