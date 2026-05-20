use serde::{Deserialize, Serialize};
use crate::models::video::VideoSummary;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistDetailsResponse {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub channel_name: String,
    pub video_count: Option<u64>,
    pub videos: Vec<VideoSummary>,
    pub next_page_token: Option<String>,
}
