use tauri::State;

use crate::errors::ErrorResponse;
use crate::models::search::{SearchVideosRequest, SearchVideosResponse};
use crate::models::video::{StreamInfo, VideoDetails, VideoSummary, MusicHomeSection, MusicHomeChip};
use crate::models::channel::{ChannelDetails, ChannelVideosResponse};
use crate::models::playlist::PlaylistDetailsResponse;
use crate::models::comment::CommentsResponse;
use crate::models::music::{ArtistPage, ExplorePage, ChartsPage};
use crate::security::validation::{
    validate_browse_id, validate_channel_id, validate_page_token, validate_search_query,
    validate_video_id,
};
use crate::services::youtube_service::YoutubeService;
use crate::services::recommendation_service::RecommendationService;

use crate::streaming::proxy::StreamingManager;

#[tauri::command]
pub async fn search_videos(
    request: SearchVideosRequest,
    youtube_service: State<'_, YoutubeService>,
) -> Result<SearchVideosResponse, ErrorResponse> {
    if let Some(page_token) = request.page_token.as_deref() {
        validate_page_token(page_token).map_err(ErrorResponse::from)?;
    } else {
        validate_search_query(&request.query).map_err(ErrorResponse::from)?;
    }

    youtube_service
        .search_videos(request)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_video_details(
    video_id: String,
    youtube_service: State<'_, YoutubeService>,
) -> Result<VideoDetails, ErrorResponse> {
    validate_video_id(&video_id).map_err(ErrorResponse::from)?;

    youtube_service
        .get_video_details(&video_id)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_stream_info(
    video_id: String,
    youtube_service: State<'_, YoutubeService>,
    streaming_manager: State<'_, StreamingManager>,
) -> Result<StreamInfo, ErrorResponse> {
    validate_video_id(&video_id).map_err(ErrorResponse::from)?;

    let mut stream_info = youtube_service
        .get_stream_info(&video_id)
        .await
        .map_err(ErrorResponse::from)?;

    // Generate secure short-lived token
    let token = uuid::Uuid::new_v4().to_string();

    // Decode composite expires_at value containing both expires duration and target user-agent
    let parts: Vec<&str> = stream_info.expires_at.split('|').collect();
    let clean_expires_at = parts[0].to_string();
    let dynamic_user_agent = parts.get(1).map(|&s| s.to_string()).unwrap_or_else(|| "com.google.ios.youtube/19.29.1 (iPhone14,5; U; CPU iOS 17_5_1 like Mac OS X; en_US)".to_string());

    // Register with local proxy server
    streaming_manager.register_session(
        token.clone(),
        stream_info.local_url,
        "video/mp4".to_string(),
        dynamic_user_agent,
    );

    // Rewrite to clean expires_at for frontend consumption
    stream_info.expires_at = clean_expires_at;

    // Rewrite to local loopback URL
    stream_info.local_url = format!(
        "http://127.0.0.1:{}/stream/{}",
        streaming_manager.get_port(),
        token
    );

    Ok(stream_info)
}

#[tauri::command]
pub async fn get_channel_details(
    channel_id: String,
    youtube_service: State<'_, YoutubeService>,
) -> Result<ChannelDetails, ErrorResponse> {
    validate_channel_id(&channel_id).map_err(ErrorResponse::from)?;

    youtube_service
        .get_channel_details(&channel_id)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_channel_videos(
    channel_id: String,
    page_token: Option<String>,
    youtube_service: State<'_, YoutubeService>,
) -> Result<ChannelVideosResponse, ErrorResponse> {
    validate_channel_id(&channel_id).map_err(ErrorResponse::from)?;
    if let Some(token) = page_token.as_deref() {
        validate_page_token(token).map_err(ErrorResponse::from)?;
    }

    youtube_service
        .get_channel_videos(&channel_id, page_token)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_playlist_details(
    playlist_id: String,
    page_token: Option<String>,
    youtube_service: State<'_, YoutubeService>,
) -> Result<PlaylistDetailsResponse, ErrorResponse> {
    if playlist_id.trim().is_empty() {
        return Err(ErrorResponse::from(crate::errors::AppError::Validation("Playlist ID cannot be empty".into())));
    }
    if let Some(token) = page_token.as_deref() {
        validate_page_token(token).map_err(ErrorResponse::from)?;
    }

    youtube_service
        .get_playlist_details(&playlist_id, page_token)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_comments(
    video_id: String,
    page_token: Option<String>,
    youtube_service: State<'_, YoutubeService>,
) -> Result<CommentsResponse, ErrorResponse> {
    if let Some(token) = page_token.as_deref() {
        validate_page_token(token).map_err(ErrorResponse::from)?;
    } else {
        validate_video_id(&video_id).map_err(ErrorResponse::from)?;
    }

    youtube_service
        .get_comments(&video_id, page_token)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_trending_videos(
    youtube_service: State<'_, YoutubeService>,
) -> Result<Vec<VideoSummary>, ErrorResponse> {
    youtube_service
        .get_trending_videos()
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_search_suggestions(
    query: String,
    youtube_service: State<'_, YoutubeService>,
) -> Result<Vec<String>, ErrorResponse> {
    youtube_service
        .get_search_suggestions(&query)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn search_music(
    query: String,
    filter: String,
    youtube_service: State<'_, YoutubeService>,
) -> Result<Vec<VideoSummary>, ErrorResponse> {
    youtube_service
        .search_music(&query, &filter)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn parse_subscription_export(
    data: String,
    youtube_service: State<'_, YoutubeService>,
) -> Result<Vec<(String, String)>, ErrorResponse> {
    youtube_service
        .parse_subscription_export(&data)
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_music_lyrics(
    video_id: String,
    youtube_service: State<'_, YoutubeService>,
) -> Result<Option<String>, ErrorResponse> {
    youtube_service
        .get_music_lyrics(&video_id)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_music_related(
    video_id: String,
    youtube_service: State<'_, YoutubeService>,
) -> Result<Vec<VideoSummary>, ErrorResponse> {
    youtube_service
        .get_music_related(&video_id)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_music_album(
    album_browse_id: String,
    youtube_service: State<'_, YoutubeService>,
) -> Result<Vec<VideoSummary>, ErrorResponse> {
    youtube_service
        .get_music_album(&album_browse_id)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_sponsorblock_segments(
    video_id: String,
    server_url: Option<String>,
) -> Result<serde_json::Value, ErrorResponse> {
    validate_video_id(&video_id).map_err(ErrorResponse::from)?;
    
    let base_url = server_url.unwrap_or_else(|| "https://sponsor.ajay.app".to_string());
    let url = format!(
        "{}/api/skipSegments?videoID={}&categories=[\"sponsor\",\"intro\",\"outro\",\"selfpromo\",\"interaction\",\"filler\"]",
        base_url,
        video_id
    );
    
    let client = reqwest::Client::builder()
        .user_agent("FlowDesktop/1.0")
        .build()
        .unwrap_or_default();
        
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| crate::errors::AppError::Extractor(format!("Network error: {}", e)))?;
        
    let status = res.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(serde_json::json!([]));
    }
    
    if !status.is_success() {
        return Err(ErrorResponse::from(crate::errors::AppError::Extractor(format!(
            "SponsorBlock server returned status {}",
            status
        ))));
    }
    
    let segments = res.json::<serde_json::Value>()
        .await
        .map_err(|e| crate::errors::AppError::Extractor(format!("JSON parse error: {}", e)))?;
        
    Ok(segments)
}

#[tauri::command]
pub async fn get_dearrow_override(
    video_id: String,
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<Option<crate::api::dearrow::DeArrowOverride>, ErrorResponse> {
    validate_video_id(&video_id).map_err(ErrorResponse::from)?;

    // 1. Try to fetch from local dearrow_cache first.
    if let Ok(Some(cached)) = crate::db::cache::get_cached_dearrow(&pool, &video_id).await {
        // If it's cached but has no title or thumbnail, return None
        if cached.title.is_none() && cached.thumbnail_url.is_none() {
            return Ok(None);
        }
        return Ok(Some(cached));
    }

    // 2. Fetch from SponsorBlock/DeArrow API
    match crate::api::dearrow::fetch_dearrow_override_api(&video_id).await {
        Ok(Some(override_data)) => {
            let _ = crate::db::cache::cache_dearrow(&pool, &video_id, &override_data).await;
            Ok(Some(override_data))
        }
        Ok(None) => {
            let empty_override = crate::api::dearrow::DeArrowOverride { title: None, thumbnail_url: None };
            let _ = crate::db::cache::cache_dearrow(&pool, &video_id, &empty_override).await;
            Ok(None)
        }
        Err(e) => {
            Err(ErrorResponse::from(e))
        }
    }
}

#[tauri::command]
pub async fn get_music_home(
    youtube_service: State<'_, YoutubeService>,
    recommendation_service: State<'_, RecommendationService>,
) -> Result<(Vec<MusicHomeSection>, Vec<MusicHomeChip>), ErrorResponse> {
    if let Ok(Some(cached)) = recommendation_service.get_cached_music_home().await {
        return Ok(cached);
    }

    let (sections, chips) = youtube_service.get_music_home().await.map_err(ErrorResponse::from)?;
    let _ = recommendation_service.cache_music_home(&sections, &chips).await;
    Ok((sections, chips))
}

#[tauri::command]
pub async fn refresh_music_home(
    youtube_service: State<'_, YoutubeService>,
    recommendation_service: State<'_, RecommendationService>,
) -> Result<(Vec<MusicHomeSection>, Vec<MusicHomeChip>), ErrorResponse> {
    let (sections, chips) = youtube_service.get_music_home().await.map_err(ErrorResponse::from)?;
    let _ = recommendation_service.cache_music_home(&sections, &chips).await;
    Ok((sections, chips))
}

#[tauri::command]
pub async fn get_personalized_music_recommendations(
    limit: usize,
    youtube_service: State<'_, YoutubeService>,
    recommendation_service: State<'_, RecommendationService>,
) -> Result<Vec<VideoSummary>, ErrorResponse> {
    recommendation_service
        .get_personalized_music_recommendations(&youtube_service, limit)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_subscription_rotation_feed(
    youtube_service: State<'_, YoutubeService>,
    recommendation_service: State<'_, RecommendationService>,
) -> Result<Vec<VideoSummary>, ErrorResponse> {
    recommendation_service
        .get_subscription_rotation_feed(&youtube_service)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_music_artist(
    artist_browse_id: String,
    youtube_service: State<'_, YoutubeService>,
) -> Result<ArtistPage, ErrorResponse> {
    validate_browse_id(&artist_browse_id).map_err(ErrorResponse::from)?;

    youtube_service
        .get_music_artist(&artist_browse_id)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_music_explore(
    youtube_service: State<'_, YoutubeService>,
) -> Result<ExplorePage, ErrorResponse> {
    youtube_service
        .get_music_explore()
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_music_charts(
    continuation: Option<String>,
    youtube_service: State<'_, YoutubeService>,
) -> Result<ChartsPage, ErrorResponse> {
    if let Some(ref token) = continuation {
        validate_browse_id(token).map_err(ErrorResponse::from)?;
    }

    youtube_service
        .get_music_charts(continuation)
        .await
        .map_err(ErrorResponse::from)
}



