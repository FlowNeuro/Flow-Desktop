use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSummary {
    pub id: String,
    pub title: String,
    pub channel_name: String,
    pub channel_id: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration_seconds: Option<u64>,
    pub published_text: Option<String>,
    pub view_count_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoDetails {
    pub id: String,
    pub title: String,
    pub channel_name: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub stream_id: String,
    pub local_url: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicHomeSection {
    pub section_id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub tracks: Vec<VideoSummary>,
    pub order_by: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicHomeChip {
    pub title: String,
    pub browse_id: Option<String>,
    pub params: Option<String>,
    pub order_by: i32,
}

