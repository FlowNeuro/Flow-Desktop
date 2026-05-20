use serde::{Deserialize, Serialize};

use crate::models::video::VideoSummary;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchVideosRequest {
    pub query: String,
    pub page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchVideosResponse {
    pub items: Vec<VideoSummary>,
    pub next_page_token: Option<String>,
    pub source: String,
}
