use serde::{Deserialize, Serialize};
use crate::models::video::VideoSummary;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelDetails {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub subscriber_count: Option<u64>,
    pub subscriber_count_text: Option<String>,
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelVideosResponse {
    pub channel_id: String,
    pub videos: Vec<VideoSummary>,
    pub next_page_token: Option<String>,
}
