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
mod music_brain;
mod security;
mod services;
mod streaming;
pub mod sync;

use std::sync::Arc;
use tauri::Manager;

use api::innertube::InnertubeClient;
use commands::db::{
    add_watch_record, add_watch_records_bulk, clear_watch_history, delete_watch_record,
    get_music_history, get_setting, get_watch_history, set_setting,
};
use commands::downloads::{
    DownloadManager, cancel_download, clear_downloads, create_download_collection,
    delete_download_collections, delete_downloads, get_download_formats, get_downloaded_video_ids,
    get_offline_stream, list_download_collections, list_downloads, pause_download, resume_download,
    start_download,
};
use commands::files::write_backup_file;
use commands::music::{
    get_music_album_continuation, get_music_album_page, get_music_artist_items,
    get_music_artist_page, get_music_charts_page, get_music_explore_page, get_music_home_page,
    get_music_lyrics_typed, get_music_mood_genre, get_music_moods, get_music_new_releases,
    get_music_playlist_continuation, get_music_playlist_page, get_music_queue,
    get_music_queue_continuation, get_music_related_typed, get_music_search_suggestions,
    get_music_search_summary, get_music_stream, get_music_watch_queue, lyrics_http_get,
    proxy_image_url, search_music_continuation, search_music_typed,
};
use commands::music_brain::{
    block_music_artist, dislike_music_artist, get_blocked_music_artists, get_daily_mixes,
    get_heavy_rotation, get_music_brain_snapshot, get_music_taste_profile, rank_music_candidates,
    record_music_interaction, reset_music_brain, unblock_music_artist,
};
use commands::notifications::{
    check_subscriptions_now, clear_notifications, delete_notification, get_notifications,
    get_unread_notification_count, mark_notifications_read,
};
use commands::recommendation::{
    add_blocked_topic, add_preferred_topic, block_channel, complete_onboarding,
    generate_discovery_queries, get_brain_snapshot, get_feed_quotas, get_flow_persona,
    get_onboarding_status, get_recommendation_events, log_interaction, mark_not_interested,
    rank_videos, record_feed_impressions, remove_preferred_topic, reset_brain, unblock_channel,
    unblock_topic,
};
use commands::shorts::{get_shorts_feed, load_more_shorts, reset_shorts_feed};
use commands::sync::{
    sync_cancel, sync_device_info, sync_host_receive, sync_respond_consent, sync_scan_join,
    sync_start_host, sync_status,
};
use commands::youtube::{
    fetch_subtitles, get_channel_details, get_channel_tab, get_comments, get_dearrow_override,
    get_live_chat, get_music_album, get_music_artist, get_music_charts, get_music_explore,
    get_music_home, get_music_lyrics, get_music_related, get_personalized_music_recommendations,
    get_playlist_details, get_post_comments, get_related_videos, get_sabr_debug_state,
    get_search_suggestions, get_sponsorblock_segments, get_stream_info,
    get_subscription_rotation_feed, get_subscription_rss_feed, get_trending_videos,
    get_video_details, parse_subscription_export, refresh_music_home, resolve_channel_id,
    search_music, search_videos,
};
use services::music_service::MusicService;
use services::recommendation_service::RecommendationService;
use services::shorts_service::ShortsService;
use services::youtube_service::YoutubeService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Let the BotGuard minter open a hidden WebView for a real-browser
            // poToken (falls back to the headless Node sidecar without this).
            api::innertube::core::webview_pot::set_app_handle(app.handle().clone());

            // Resolve app data directory
            let app_data_dir = app.path().app_data_dir().map_err(|error| {
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    error.to_string(),
                ))
            })?;

            // Initialize native Innertube extractor (shared by the video path and
            // the additive YouTube Music subsystem).
            let extractor = Arc::new(InnertubeClient::new(app.handle()));
            let music_service = MusicService::new(extractor.clone());
            let youtube_service = YoutubeService::new(extractor);
            app.manage(youtube_service);
            app.manage(music_service);

            // Initialize SQLite database
            let pool = tauri::async_runtime::block_on(async {
                db::initialize_database(app_data_dir).await
            })
            .map_err(|error| {
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    error.to_string(),
                ))
            })?;

            // Manage database pool
            app.manage(pool.clone());

            // Run DeArrow cache cleanup asynchronously
            let pool_clone = pool.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::cache::cleanup_dearrow_cache(&pool_clone).await {
                    tracing::error!("Failed to cleanup DeArrow cache: {}", e);
                }
            });

            // Load the single resident recommendation brain (in-memory, debounced writes)
            let brain_store = tauri::async_runtime::block_on(async {
                flow_neuro::brain_store::BrainStore::load(pool.clone()).await
            })
            .map_err(|error| {
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    error.to_string(),
                ))
            })?;

            // Initialize and manage recommendation service
            let rec_service = RecommendationService::new(pool.clone(), brain_store);
            app.manage(rec_service);

            let music_brain_store = tauri::async_runtime::block_on(async {
                music_brain::store::MusicBrainStore::load(pool.clone()).await
            })
            .map_err(|error| {
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    error.to_string(),
                ))
            })?;
            app.manage(music_brain_store);

            app.manage(Arc::new(sync::session::SyncManager::new()));

            // Manage the Shorts feed service (prefetch buffer + session de-dup)
            app.manage(ShortsService::new());
            app.manage(DownloadManager::default());

            // Initialize and manage streaming proxy
            let (streaming_manager, proxy_listener) = streaming::proxy::StreamingManager::new();
            tauri::async_runtime::spawn(streaming::proxy::start_proxy_server(
                streaming_manager.clone(),
                proxy_listener,
            ));
            app.manage(streaming_manager);

            services::notification_service::spawn_poll_loop(app.handle().clone(), pool.clone());

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
            get_post_comments,
            get_live_chat,
            get_trending_videos,
            get_search_suggestions,
            search_music,
            parse_subscription_export,
            get_music_lyrics,
            get_music_related,
            get_music_album,
            get_watch_history,
            get_music_history,
            add_watch_record,
            add_watch_records_bulk,
            delete_watch_record,
            clear_watch_history,
            get_setting,
            set_setting,
            write_backup_file,
            get_download_formats,
            start_download,
            cancel_download,
            pause_download,
            resume_download,
            list_downloads,
            get_downloaded_video_ids,
            get_offline_stream,
            delete_downloads,
            clear_downloads,
            create_download_collection,
            list_download_collections,
            delete_download_collections,
            rank_videos,
            log_interaction,
            mark_not_interested,
            record_feed_impressions,
            complete_onboarding,
            get_onboarding_status,
            generate_discovery_queries,
            get_flow_persona,
            get_brain_snapshot,
            get_feed_quotas,
            get_recommendation_events,
            unblock_topic,
            add_blocked_topic,
            add_preferred_topic,
            remove_preferred_topic,
            unblock_channel,
            block_channel,
            reset_brain,
            get_sponsorblock_segments,
            get_dearrow_override,
            get_music_home,
            refresh_music_home,
            get_personalized_music_recommendations,
            get_subscription_rotation_feed,
            get_subscription_rss_feed,
            resolve_channel_id,
            get_music_artist,
            get_music_explore,
            get_music_charts,
            fetch_subtitles,
            get_sabr_debug_state,
            // --- Shorts feed ---
            get_shorts_feed,
            load_more_shorts,
            reset_shorts_feed,
            // --- YouTube Music subsystem (additive) ---
            get_music_home_page,
            get_music_explore_page,
            get_music_charts_page,
            get_music_moods,
            get_music_new_releases,
            get_music_mood_genre,
            get_music_artist_items,
            search_music_typed,
            search_music_continuation,
            get_music_search_summary,
            get_music_search_suggestions,
            get_music_album_page,
            get_music_album_continuation,
            get_music_artist_page,
            get_music_playlist_page,
            get_music_playlist_continuation,
            get_music_watch_queue,
            get_music_queue_continuation,
            get_music_queue,
            get_music_related_typed,
            get_music_lyrics_typed,
            lyrics_http_get,
            get_music_stream,
            proxy_image_url,
            // --- Dedicated music brain (separate from flow_neuro) ---
            record_music_interaction,
            dislike_music_artist,
            block_music_artist,
            unblock_music_artist,
            get_blocked_music_artists,
            rank_music_candidates,
            get_heavy_rotation,
            get_daily_mixes,
            get_music_brain_snapshot,
            get_music_taste_profile,
            reset_music_brain,
            // --- Flow Local Sync (P2P LAN) ---
            sync_device_info,
            sync_status,
            sync_start_host,
            sync_host_receive,
            sync_scan_join,
            sync_respond_consent,
            sync_cancel,
            get_notifications,
            get_unread_notification_count,
            mark_notifications_read,
            delete_notification,
            clear_notifications,
            check_subscriptions_now
        ])
        .build(tauri::generate_context!())
        .expect("error while building Flow Desktop")
        .run(|app_handle, event| {
            // Flush the resident brain to disk on shutdown so the debounce window is never lost.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(service) = app_handle.try_state::<RecommendationService>() {
                    let _ = tauri::async_runtime::block_on(service.flush_brain());
                }
                if let Some(store) =
                    app_handle.try_state::<std::sync::Arc<music_brain::store::MusicBrainStore>>()
                {
                    let _ = tauri::async_runtime::block_on(store.flush());
                }
            }
        });
}
