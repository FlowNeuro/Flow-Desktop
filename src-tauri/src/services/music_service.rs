//! Thin service over the concrete [`InnertubeClient`] exposing the additive
//! YouTube Music surface. Kept separate from [`crate::services::youtube_service`]
//! (which is a `dyn YoutubeExtractor` and drives the video path) so the music
//! feature is independently wired and the video path is untouched.

use std::sync::Arc;

use crate::api::innertube::InnertubeClient;
use crate::errors::AppResult;
use crate::models::music::{AlbumItem, ArtistPage, ChartsPage, ExplorePage, MoodAndGenreItem, SongItem};
use crate::models::music_pages::{
    AlbumPage, MoodGenrePage, MusicHomePage, MusicPlaylistPage, MusicSearchResponse,
    MusicSearchSuggestions, QueuePage, RelatedPage, SearchSummaryPage,
};
use crate::models::music_stream::{MusicAudioQuality, MusicStreamInfo};

#[derive(Clone)]
pub struct MusicService {
    client: Arc<InnertubeClient>,
}

impl MusicService {
    #[must_use]
    pub fn new(client: Arc<InnertubeClient>) -> Self {
        Self { client }
    }

    // --- Browse -----------------------------------------------------------
    pub async fn home(&self, continuation: Option<&str>) -> AppResult<MusicHomePage> {
        self.client.music_home_page(continuation).await
    }
    pub async fn explore(&self) -> AppResult<ExplorePage> {
        self.client.music_explore_page().await
    }
    pub async fn charts(&self, continuation: Option<&str>) -> AppResult<ChartsPage> {
        self.client.music_charts_page(continuation).await
    }
    pub async fn moods(&self) -> AppResult<Vec<MoodAndGenreItem>> {
        self.client.music_moods().await
    }
    pub async fn new_releases(&self) -> AppResult<Vec<AlbumItem>> {
        self.client.music_new_releases().await
    }
    pub async fn mood_genre(
        &self,
        browse_id: &str,
        params: Option<&str>,
        continuation: Option<&str>,
    ) -> AppResult<MoodGenrePage> {
        self.client.music_mood_genre(browse_id, params, continuation).await
    }

    // --- Search -----------------------------------------------------------
    pub async fn search(&self, query: &str, filter: &str) -> AppResult<MusicSearchResponse> {
        self.client.music_search(query, filter).await
    }
    pub async fn search_continuation(&self, token: &str) -> AppResult<MusicSearchResponse> {
        self.client.music_search_continuation(token).await
    }
    pub async fn search_summary(&self, query: &str) -> AppResult<SearchSummaryPage> {
        self.client.music_search_summary(query).await
    }
    pub async fn search_suggestions(&self, query: &str) -> AppResult<MusicSearchSuggestions> {
        self.client.music_search_suggestions(query).await
    }

    // --- Album / Artist / Playlist ---------------------------------------
    pub async fn album(&self, browse_id: &str) -> AppResult<AlbumPage> {
        self.client.music_album_page(browse_id).await
    }
    pub async fn album_continuation(
        &self,
        token: &str,
    ) -> AppResult<(Vec<SongItem>, Option<String>)> {
        self.client.music_album_continuation(token).await
    }
    pub async fn artist(&self, browse_id: &str) -> AppResult<ArtistPage> {
        self.client.music_artist_page(browse_id).await
    }
    pub async fn playlist(&self, playlist_id: &str) -> AppResult<MusicPlaylistPage> {
        self.client.music_playlist_page(playlist_id).await
    }
    pub async fn playlist_continuation(
        &self,
        token: &str,
    ) -> AppResult<(Vec<SongItem>, Option<String>)> {
        self.client.music_playlist_continuation(token).await
    }

    // --- Watch / queue / lyrics ------------------------------------------
    pub async fn watch_queue(
        &self,
        video_id: Option<&str>,
        playlist_id: Option<&str>,
        params: Option<&str>,
    ) -> AppResult<QueuePage> {
        self.client.music_watch_queue(video_id, playlist_id, params).await
    }
    pub async fn queue_continuation(&self, token: &str) -> AppResult<QueuePage> {
        self.client.music_queue_continuation(token).await
    }
    pub async fn get_queue(
        &self,
        video_ids: &[String],
        playlist_id: Option<&str>,
    ) -> AppResult<QueuePage> {
        self.client.music_get_queue(video_ids, playlist_id).await
    }
    pub async fn related(&self, video_id: &str) -> AppResult<RelatedPage> {
        self.client.music_related_page(video_id).await
    }
    pub async fn lyrics(&self, video_id: &str) -> AppResult<Option<String>> {
        self.client.music_lyrics_text(video_id).await
    }

    // --- Playback ---------------------------------------------------------
    pub async fn resolve_stream(
        &self,
        video_id: &str,
        audio_quality: MusicAudioQuality,
    ) -> AppResult<MusicStreamInfo> {
        self.client
            .resolve_music_stream(video_id, audio_quality)
            .await
    }
}
