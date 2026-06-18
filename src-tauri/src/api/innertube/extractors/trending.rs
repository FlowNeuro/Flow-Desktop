use crate::api::innertube::InnertubeClient;
use crate::errors::AppResult;
use crate::models::video::VideoSummary;

impl InnertubeClient {
    pub async fn get_trending_videos(&self) -> AppResult<Vec<VideoSummary>> {
        Ok(Vec::new())
    }
}
