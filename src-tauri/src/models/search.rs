use serde::{Deserialize, Serialize};

use crate::models::video::VideoSummary;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchVideosRequest {
    pub query: String,
    pub page_token: Option<String>,
    /// Sort order: `relevance` (default) | `date` | `views` | `rating`.
    #[serde(default)]
    pub sort_by: Option<String>,
    /// Upload-date window: `any` | `hour` | `today` | `week` | `month` | `year`.
    #[serde(default)]
    pub upload_date: Option<String>,
    /// Duration bucket: `any` | `short` (<4m) | `medium` (4–20m) | `long` (>20m).
    #[serde(default)]
    pub duration: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchVideosResponse {
    pub items: Vec<VideoSummary>,
    pub next_page_token: Option<String>,
    pub source: String,
}
