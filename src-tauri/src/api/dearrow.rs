use crate::errors::AppResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeArrowTitle {
    pub title: String,
    pub votes: i32,
    pub locked: bool,
    pub original: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeArrowThumbnail {
    pub timestamp: Option<f32>,
    pub thumbnail: Option<String>,
    pub votes: i32,
    pub locked: bool,
    pub original: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeArrowContent {
    #[serde(default)]
    pub titles: Vec<DeArrowTitle>,
    #[serde(default)]
    pub thumbnails: Vec<DeArrowThumbnail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeArrowOverride {
    pub title: Option<String>,
    pub thumbnail_url: Option<String>,
}

pub async fn fetch_dearrow_override_api(video_id: &str) -> AppResult<Option<DeArrowOverride>> {
    let client = crate::api::http::shared_client();

    let url = format!("https://sponsor.ajay.app/api/branding?videoID={}", video_id);
    let res = client
        .get(&url)
        .header(reqwest::header::USER_AGENT, "FlowYouTube/1.0")
        .send()
        .await;

    let response = match res {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("Failed to fetch DeArrow data for {}: {}", video_id, e);
            return Ok(None);
        }
    };

    if !response.status().is_success() {
        return Ok(None);
    }

    let content: DeArrowContent = match response.json().await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Failed to parse DeArrow JSON for {}: {}", video_id, e);
            return Ok(None);
        }
    };

    // Filter and pick the best title
    // - Prefers locked entries over voted ones
    // - Ignores entries with negative votes (downvoted)
    // - Ignores "original" entries (keep as-is)
    let best_title = content
        .titles
        .iter()
        .filter(|t| !t.original && (t.votes >= 0 || t.locked))
        .max_by_key(|t| if t.locked { i32::MAX } else { t.votes })
        .map(|t| t.title.clone());

    // Filter and pick the best thumbnail
    let best_thumb = content
        .thumbnails
        .iter()
        .filter(|t| !t.original && (t.votes >= 0 || t.locked))
        .max_by_key(|t| if t.locked { i32::MAX } else { t.votes });

    let thumbnail_url = if let Some(thumb) = best_thumb {
        if let Some(t_url) = &thumb.thumbnail {
            Some(t_url.clone())
        } else if let Some(ts) = thumb.timestamp {
            Some(format!(
                "https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID={}&time={}",
                video_id, ts
            ))
        } else {
            None
        }
    } else {
        None
    };

    if best_title.is_none() && thumbnail_url.is_none() {
        Ok(None)
    } else {
        Ok(Some(DeArrowOverride {
            title: best_title,
            thumbnail_url,
        }))
    }
}
