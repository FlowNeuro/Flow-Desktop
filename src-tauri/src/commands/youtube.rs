use tauri::State;
use tracing::info;

use crate::errors::ErrorResponse;
use crate::models::search::{SearchVideosRequest, SearchVideosResponse};
use crate::models::video::{StreamInfo, VideoDetails, VideoSummary, RelatedContentItem, MusicHomeSection, MusicHomeChip};
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

fn extract_codecs(mime_type: Option<&str>) -> Option<String> {
    let mime_type = mime_type?;
    mime_type
        .split(';')
        .find_map(|part| part.trim().strip_prefix("codecs=").map(|value| value.trim_matches('"').to_string()))
        .filter(|value| !value.is_empty())
}

fn extract_base_mime_type(mime_type: Option<&str>) -> Option<&str> {
    mime_type
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn format_duration_xml(duration_ms: u64) -> String {
    let total_seconds = duration_ms / 1000;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    let millis = duration_ms % 1000;

    let mut output = String::from("PT");
    if hours > 0 {
        output.push_str(&format!("{hours}H"));
    }
    if minutes > 0 {
        output.push_str(&format!("{minutes}M"));
    }
    if millis > 0 {
        output.push_str(&format!("{seconds}.{millis:03}S"));
    } else {
        output.push_str(&format!("{seconds}S"));
    }
    output
}

fn build_synthetic_dash_manifest(stream_info: &StreamInfo) -> Option<String> {
    let audio_track = stream_info.audio_tracks.iter().find(|track| {
        !track.local_url.is_empty()
            && track.init_range_start.is_some()
            && track.init_range_end.is_some()
            && track.index_range_start.is_some()
            && track.index_range_end.is_some()
    })?;

    let video_variants: Vec<_> = stream_info
        .variants
        .iter()
        .filter(|variant| {
            variant.is_video_only
                && variant.is_playable
                && !variant.local_url.is_empty()
                && variant.init_range_start.is_some()
                && variant.init_range_end.is_some()
                && variant.index_range_start.is_some()
                && variant.index_range_end.is_some()
        })
        .collect();

    if video_variants.is_empty() {
        return None;
    }

    let duration_ms = video_variants
        .iter()
        .filter_map(|variant| variant.approx_duration_ms)
        .chain(audio_track.approx_duration_ms)
        .max()?;

    let audio_mime_type = extract_base_mime_type(audio_track.mime_type.as_deref()).unwrap_or("audio/mp4");
    let audio_codecs = extract_codecs(audio_track.mime_type.as_deref()).unwrap_or_else(|| "mp4a.40.2".to_string());
    let mut video_groups: Vec<(String, Vec<_>)> = Vec::new();
    for variant in &video_variants {
        let mime_type = extract_base_mime_type(variant.mime_type.as_deref())
            .unwrap_or("video/mp4")
            .to_string();

        if let Some((_, variants)) = video_groups
            .iter_mut()
            .find(|(group_mime_type, _)| *group_mime_type == mime_type)
        {
            variants.push(*variant);
        } else {
            video_groups.push((mime_type, vec![*variant]));
        }
    }

    let mut manifest = String::new();
    manifest.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    manifest.push_str(&format!(
        "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" profiles=\"urn:mpeg:dash:profile:isoff-on-demand:2011\" minBufferTime=\"PT1.5S\" mediaPresentationDuration=\"{}\">\n",
        format_duration_xml(duration_ms)
    ));
    manifest.push_str("  <Period id=\"flow-period-0\" start=\"PT0S\">\n");
    manifest.push_str(&format!(
        "    <AdaptationSet id=\"audio\" contentType=\"audio\" mimeType=\"{}\" codecs=\"{}\" startWithSAP=\"1\" subsegmentAlignment=\"true\">\n",
        audio_mime_type,
        audio_codecs
    ));
    manifest.push_str(&format!(
        "      <Representation id=\"{}\" bandwidth=\"{}\">\n",
        audio_track.id,
        audio_track.bitrate.unwrap_or(128_000)
    ));
    manifest.push_str(&format!("        <BaseURL>{}</BaseURL>\n", audio_track.local_url));
    manifest.push_str(&format!(
        "        <SegmentBase indexRange=\"{}-{}\">\n",
        audio_track.index_range_start?,
        audio_track.index_range_end?
    ));
    manifest.push_str(&format!(
        "          <Initialization range=\"{}-{}\" />\n",
        audio_track.init_range_start?,
        audio_track.init_range_end?
    ));
    manifest.push_str("        </SegmentBase>\n");
    manifest.push_str("      </Representation>\n");
    manifest.push_str("    </AdaptationSet>\n");
    for (group_index, (video_mime_type, variants)) in video_groups.iter().enumerate() {
        manifest.push_str(&format!(
            "    <AdaptationSet id=\"video-{}\" contentType=\"video\" mimeType=\"{}\" startWithSAP=\"1\" subsegmentAlignment=\"true\">\n",
            group_index,
            video_mime_type
        ));

        for variant in variants {
            let codecs = extract_codecs(variant.mime_type.as_deref()).unwrap_or_else(|| "avc1.640028".to_string());
            manifest.push_str(&format!(
                "      <Representation id=\"{}\" bandwidth=\"{}\" width=\"{}\" height=\"{}\" frameRate=\"{}\" codecs=\"{}\">\n",
                variant.id,
                variant.bitrate.unwrap_or(1_000_000),
                variant.width.unwrap_or(0),
                variant.height.unwrap_or(0),
                variant.fps.unwrap_or(30),
                codecs
            ));
            manifest.push_str(&format!("        <BaseURL>{}</BaseURL>\n", variant.local_url));
            manifest.push_str(&format!(
                "        <SegmentBase indexRange=\"{}-{}\">\n",
                variant.index_range_start?,
                variant.index_range_end?
            ));
            manifest.push_str(&format!(
                "          <Initialization range=\"{}-{}\" />\n",
                variant.init_range_start?,
                variant.init_range_end?
            ));
            manifest.push_str("        </SegmentBase>\n");
            manifest.push_str("      </Representation>\n");
        }

        manifest.push_str("    </AdaptationSet>\n");
    }
    manifest.push_str("  </Period>\n");
    manifest.push_str("</MPD>\n");
    Some(manifest)
}

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
pub async fn get_related_videos(
    video_id: String,
    youtube_service: State<'_, YoutubeService>,
) -> Result<Vec<RelatedContentItem>, ErrorResponse> {
    validate_video_id(&video_id).map_err(ErrorResponse::from)?;

    youtube_service
        .get_related_videos(&video_id)
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
    let proxy_port = streaming_manager.get_port();

    if let Some(manifest_url) = stream_info.dash_manifest_url.clone().filter(|value| !value.is_empty()) {
        let dash_token = uuid::Uuid::new_v4().to_string();
        streaming_manager.register_session(
            dash_token.clone(),
            manifest_url.clone(),
            "application/dash+xml".to_string(),
            dynamic_user_agent.clone(),
        );

        let mut local_manifest_url = reqwest::Url::parse(&format!(
            "http://127.0.0.1:{proxy_port}/proxy/{dash_token}"
        ))
        .expect("failed to build local DASH proxy URL");
        local_manifest_url
            .query_pairs_mut()
            .append_pair("url", &manifest_url);
        stream_info.dash_manifest_url = Some(local_manifest_url.to_string());
    }

    if let Some(manifest_url) = stream_info.hls_manifest_url.clone().filter(|value| !value.is_empty()) {
        let hls_token = uuid::Uuid::new_v4().to_string();
        streaming_manager.register_session(
            hls_token.clone(),
            manifest_url.clone(),
            "application/vnd.apple.mpegurl".to_string(),
            dynamic_user_agent.clone(),
        );

        let mut local_manifest_url = reqwest::Url::parse(&format!(
            "http://127.0.0.1:{proxy_port}/proxy/{hls_token}"
        ))
        .expect("failed to build local HLS proxy URL");
        local_manifest_url
            .query_pairs_mut()
            .append_pair("url", &manifest_url);
        stream_info.hls_manifest_url = Some(local_manifest_url.to_string());
    }

    // Register default stream with local proxy server.
    streaming_manager.register_session(
        token.clone(),
        stream_info.local_url.clone(),
        "video/mp4".to_string(),
        dynamic_user_agent.clone(),
    );

    for variant in &mut stream_info.variants {
        if !variant.is_playable || variant.local_url.is_empty() {
            continue;
        }

        let variant_token = uuid::Uuid::new_v4().to_string();
        let mime_type = variant
            .mime_type
            .as_deref()
            .and_then(|mime| mime.split(';').next())
            .unwrap_or("video/mp4")
            .to_string();

        streaming_manager.register_session(
            variant_token.clone(),
            variant.local_url.clone(),
            mime_type,
            dynamic_user_agent.clone(),
        );

        variant.local_url = format!(
            "http://127.0.0.1:{}/stream/{}",
            proxy_port,
            variant_token
        );
    }

    for caption in &mut stream_info.captions {
        let caption_token = uuid::Uuid::new_v4().to_string();

        streaming_manager.register_session(
            caption_token.clone(),
            caption.url.clone(),
            "text/vtt; charset=utf-8".to_string(),
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string(),
        );

        caption.url = format!(
            "http://127.0.0.1:{}/stream/{}",
            proxy_port,
            caption_token
        );
    }

    for audio_track in &mut stream_info.audio_tracks {
        if audio_track.local_url.is_empty() {
            continue;
        }

        let audio_token = uuid::Uuid::new_v4().to_string();
        let mime_type = audio_track
            .mime_type
            .as_deref()
            .and_then(|mime| mime.split(';').next())
            .unwrap_or("audio/mp4")
            .to_string();

        streaming_manager.register_session(
            audio_token.clone(),
            audio_track.local_url.clone(),
            mime_type,
            dynamic_user_agent.clone(),
        );

        audio_track.local_url = format!(
            "http://127.0.0.1:{}/stream/{}",
            proxy_port,
            audio_token
        );
    }

    if stream_info.dash_manifest_url.as_deref().unwrap_or_default().is_empty() {
        if let Some(manifest) = build_synthetic_dash_manifest(&stream_info) {
            let manifest_token = uuid::Uuid::new_v4().to_string();
            streaming_manager.register_inline_session(
                manifest_token.clone(),
                manifest.into_bytes(),
                "application/dash+xml".to_string(),
            );
            stream_info.dash_manifest_url = Some(format!(
                "http://127.0.0.1:{}/stream/{}",
                proxy_port,
                manifest_token
            ));
            info!(video_id = %video_id, "Generated synthetic DASH manifest for fallback playback");
        }
    }

    // Rewrite to clean expires_at for frontend consumption
    stream_info.expires_at = clean_expires_at;

    // Rewrite to local loopback URL
    stream_info.local_url = format!(
        "http://127.0.0.1:{}/stream/{}",
        proxy_port,
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
