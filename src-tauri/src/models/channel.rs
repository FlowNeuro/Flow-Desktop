use crate::models::video::VideoSummary;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortVideoSummary {
    pub id: String,
    pub title: String,
    pub thumbnail_url: Option<String>,
    pub view_count_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSummary {
    pub id: String,
    pub title: String,
    pub thumbnail_url: Option<String>,
    pub video_count_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostSummary {
    pub id: String,
    pub author_name: String,
    pub author_avatar: Option<String>,
    pub text_content: Option<String>,
    pub image_attachment: Option<String>,
    pub likes_count_text: Option<String>,
    pub published_time_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChannelItem {
    Video(VideoSummary),
    Short(ShortVideoSummary),
    Playlist(PlaylistSummary),
    Post(PostSummary),
}

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
    pub available_tabs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelTabResponse {
    pub channel_id: String,
    pub items: Vec<ChannelItem>,
    pub next_page_token: Option<String>,
    pub sort_latest_token: Option<String>,
    pub sort_popular_token: Option<String>,
    pub sort_oldest_token: Option<String>,
}
