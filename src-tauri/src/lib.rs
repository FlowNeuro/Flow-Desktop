#![warn(clippy::all)]
#![warn(clippy::pedantic)]
#![allow(clippy::missing_errors_doc)]

mod api;
mod commands;
mod config;
mod db;
mod errors;
mod flow_neuro;
mod models;
mod security;
mod services;
mod streaming;

use std::sync::Arc;
use tauri::Manager;

use api::innertube::InnertubeClient;
use commands::youtube::{
    get_channel_details, get_channel_tab, get_comments, get_dearrow_override,
    get_music_album, get_music_artist, get_music_charts, get_music_explore, get_music_home,
    get_music_lyrics, get_music_related, get_personalized_music_recommendations,
    get_playlist_details, get_search_suggestions, get_sponsorblock_segments, get_stream_info,
    get_subscription_rotation_feed, get_trending_videos, get_related_videos, get_video_details,
    parse_subscription_export, refresh_music_home, search_music, search_videos,
    fetch_subtitles,
};
use commands::db::{get_watch_history, add_watch_record, delete_watch_record, clear_watch_history, get_setting, set_setting};
use commands::recommendation::{rank_videos, log_interaction, mark_not_interested, record_feed_impressions, complete_onboarding, get_onboarding_status, generate_discovery_queries, get_flow_persona};
use services::youtube_service::YoutubeService;
use services::recommendation_service::RecommendationService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .setup(|app| {
            // Resolve app data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| Box::new(std::io::Error::new(std::io::ErrorKind::Other, error.to_string())))?;

            // Initialize native Innertube extractor
            let extractor = Arc::new(InnertubeClient::new(app.handle()));
            let youtube_service = YoutubeService::new(extractor);
            app.manage(youtube_service);

            // Initialize SQLite database
            let pool = tauri::async_runtime::block_on(async {
                db::initialize_database(app_data_dir).await
            })
            .map_err(|error| Box::new(std::io::Error::new(std::io::ErrorKind::Other, error.to_string())))?;

            // Manage database pool
            app.manage(pool.clone());

            // Run DeArrow cache cleanup asynchronously
            let pool_clone = pool.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::cache::cleanup_dearrow_cache(&pool_clone).await {
                    tracing::error!("Failed to cleanup DeArrow cache: {}", e);
                }
            });

            // Initialize and manage recommendation service
            let rec_service = RecommendationService::new(pool);
            app.manage(rec_service);

            // Initialize and manage streaming proxy
            let (streaming_manager, proxy_listener) = streaming::proxy::StreamingManager::new();
            tauri::async_runtime::spawn(streaming::proxy::start_proxy_server(
                streaming_manager.clone(),
                proxy_listener,
            ));
            app.manage(streaming_manager);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_videos,
            get_video_details,
            get_related_videos,
            get_stream_info,
            get_channel_details,
            get_channel_tab,
            get_playlist_details,
            get_comments,
            get_trending_videos,
            get_search_suggestions,
            search_music,
            parse_subscription_export,
            get_music_lyrics,
            get_music_related,
            get_music_album,
            get_watch_history,
            add_watch_record,
            delete_watch_record,
            clear_watch_history,
            get_setting,
            set_setting,
            rank_videos,
            log_interaction,
            mark_not_interested,
            record_feed_impressions,
            complete_onboarding,
            get_onboarding_status,
            generate_discovery_queries,
            get_flow_persona,
            get_sponsorblock_segments,
            get_dearrow_override,
            get_music_home,
            refresh_music_home,
            get_personalized_music_recommendations,
            get_subscription_rotation_feed,
            get_music_artist,
            get_music_explore,
            get_music_charts,
            fetch_subtitles
        ])

        .run(tauri::generate_context!())
        .expect("error while running Flow Desktop");
}

