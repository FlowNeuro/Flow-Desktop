use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub author: String,
    pub author_thumbnail: Option<String>,
    pub text: String,
    pub published_text: Option<String>,
    pub like_count: Option<u64>,
    pub reply_count: Option<u64>,
    pub continuation_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentsResponse {
    pub comments: Vec<Comment>,
    pub next_page_token: Option<String>,
}
