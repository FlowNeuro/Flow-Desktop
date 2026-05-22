use async_trait::async_trait;
use crate::api::extractor::YoutubeExtractor;
use crate::errors::AppResult;
use crate::models::search::{SearchVideosRequest, SearchVideosResponse};
use crate::models::video::{StreamInfo, VideoDetails, VideoSummary, RelatedContentItem, MusicHomeSection, MusicHomeChip};
use crate::models::channel::{ChannelDetails, ChannelTabResponse};
use crate::models::playlist::PlaylistDetailsResponse;
use crate::models::comment::CommentsResponse;
use crate::models::music::{ArtistPage, ExplorePage, ChartsPage};

pub mod parsers;
pub mod core;
pub mod extractors;

pub struct InnertubeClient {
    pub(crate) client: reqwest::Client,
    pub(crate) visitor_data: std::sync::RwLock<Option<String>>,
}

impl InnertubeClient {
    #[must_use]
    pub fn new(_app: &tauri::AppHandle) -> Self {
        let client = reqwest::Client::builder()
            .build()
            .unwrap_or_default();
        Self {
            client,
            visitor_data: std::sync::RwLock::new(None),
        }
    }
}

#[async_trait]
impl YoutubeExtractor for InnertubeClient {
    async fn search_videos(
        &self,
        request: SearchVideosRequest,
    ) -> AppResult<SearchVideosResponse> {
        self.search_videos(request).await
    }

    async fn get_video_details(
        &self,
        video_id: &str,
    ) -> AppResult<VideoDetails> {
        self.get_video_details(video_id).await
    }

    async fn get_related_videos(
        &self,
        video_id: &str,
    ) -> AppResult<Vec<RelatedContentItem>> {
        self.get_related_videos(video_id).await
    }

    async fn get_stream_info(
        &self,
        video_id: &str,
    ) -> AppResult<StreamInfo> {
        self.get_stream_info(video_id).await
    }

    async fn get_channel_details(
        &self,
        channel_id: &str,
    ) -> AppResult<ChannelDetails> {
        self.get_channel_details(channel_id).await
    }

    async fn get_channel_tab(
        &self,
        channel_id: &str,
        params: Option<String>,
        page_token: Option<String>,
        query: Option<String>,
    ) -> AppResult<ChannelTabResponse> {
        self.get_channel_tab(channel_id, params, page_token, query).await
    }

    async fn get_playlist_details(
        &self,
        playlist_id: &str,
        page_token: Option<String>,
    ) -> AppResult<PlaylistDetailsResponse> {
        self.get_playlist_details(playlist_id, page_token).await
    }

    async fn get_comments(
        &self,
        video_id: &str,
        page_token: Option<String>,
    ) -> AppResult<CommentsResponse> {
        self.get_comments(video_id, page_token).await
    }

    async fn get_trending_videos(
        &self,
    ) -> AppResult<Vec<VideoSummary>> {
        self.get_trending_videos().await
    }

    async fn get_search_suggestions(
        &self,
        query: &str,
    ) -> AppResult<Vec<String>> {
        self.get_search_suggestions(query).await
    }

    async fn search_music(
        &self,
        query: &str,
        filter: &str,
    ) -> AppResult<Vec<VideoSummary>> {
        self.search_music(query, filter).await
    }

    fn parse_subscription_export(
        &self,
        data: &str,
    ) -> AppResult<Vec<(String, String)>> {
        self.parse_subscription_export(data)
    }

    async fn get_music_lyrics(
        &self,
        video_id: &str,
    ) -> AppResult<Option<String>> {
        self.get_music_lyrics(video_id).await
    }

    async fn get_music_related(
        &self,
        video_id: &str,
    ) -> AppResult<Vec<VideoSummary>> {
        self.get_music_related(video_id).await
    }

    async fn get_music_album(
        &self,
        album_browse_id: &str,
    ) -> AppResult<Vec<VideoSummary>> {
        self.get_music_album(album_browse_id).await
    }

    async fn get_music_home(
        &self,
    ) -> AppResult<(Vec<MusicHomeSection>, Vec<MusicHomeChip>)> {
        self.get_music_home().await
    }

    async fn get_music_artist(
        &self,
        artist_browse_id: &str,
    ) -> AppResult<ArtistPage> {
        self.get_music_artist(artist_browse_id).await
    }

    async fn get_music_explore(
        &self,
    ) -> AppResult<ExplorePage> {
        self.get_music_explore().await
    }

    async fn get_music_charts(
        &self,
        continuation: Option<String>,
    ) -> AppResult<ChartsPage> {
        self.get_music_charts(continuation).await
    }
}
