use std::collections::HashSet;
use tauri::State;
use serde::Serialize;

use crate::errors::ErrorResponse;
use crate::models::video::VideoSummary;
use crate::services::recommendation_service::RecommendationService;
use crate::flow_neuro::signals::InteractionType;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonaDetails {
    pub name: String,
    pub title: String,
    pub description: String,
    pub icon: String,
}

#[tauri::command]
pub async fn rank_videos(
    candidates: Vec<VideoSummary>,
    user_subs: Vec<String>,
    recommendation_service: State<'_, RecommendationService>,
) -> Result<Vec<VideoSummary>, ErrorResponse> {
    let subs_set = user_subs.into_iter().collect::<HashSet<String>>();
    recommendation_service
        .rank_candidates(candidates, subs_set)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn log_interaction(
    video_id: String,
    title: String,
    channel_name: String,
    channel_id: String,
    description: Option<String>,
    duration_seconds: Option<u64>,
    is_live: bool,
    is_short: bool,
    interaction_type: String,
    percent_watched: f32,
    recommendation_service: State<'_, RecommendationService>,
) -> Result<(), ErrorResponse> {
    let interaction = match interaction_type.to_uppercase().as_str() {
        "CLICK" => InteractionType::Click,
        "LIKED" => InteractionType::Liked,
        "WATCHED" => InteractionType::Watched,
        "SKIPPED" => InteractionType::Skipped,
        "DISLIKED" => InteractionType::Disliked,
        _ => return Err(ErrorResponse::from(crate::errors::AppError::Validation("Invalid interaction type provided".to_string()))),
    };

    recommendation_service
        .log_video_interaction(
            &video_id,
            &title,
            &channel_name,
            &channel_id,
            description.as_deref(),
            duration_seconds,
            is_live,
            is_short,
            interaction,
            percent_watched,
        )
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn mark_not_interested(
    video_id: String,
    title: String,
    channel_name: String,
    channel_id: String,
    description: Option<String>,
    duration_seconds: Option<u64>,
    is_live: bool,
    is_short: bool,
    recommendation_service: State<'_, RecommendationService>,
) -> Result<(), ErrorResponse> {
    recommendation_service
        .log_video_interaction(
            &video_id,
            &title,
            &channel_name,
            &channel_id,
            description.as_deref(),
            duration_seconds,
            is_live,
            is_short,
            InteractionType::Disliked,
            0.0,
        )
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn record_feed_impressions(
    videos: Vec<VideoSummary>,
    recommendation_service: State<'_, RecommendationService>,
) -> Result<(), ErrorResponse> {
    recommendation_service
        .record_feed_impressions(videos)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn complete_onboarding(
    preferred: Vec<String>,
    recommendation_service: State<'_, RecommendationService>,
) -> Result<(), ErrorResponse> {
    let pref_set = preferred.into_iter().collect::<HashSet<String>>();
    recommendation_service
        .complete_onboarding(pref_set)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_onboarding_status(
    recommendation_service: State<'_, RecommendationService>,
) -> Result<bool, ErrorResponse> {
    recommendation_service
        .get_onboarding_status()
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn generate_discovery_queries(
    recommendation_service: State<'_, RecommendationService>,
) -> Result<Vec<String>, ErrorResponse> {
    recommendation_service
        .generate_discovery_queries()
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn get_flow_persona(
    recommendation_service: State<'_, RecommendationService>,
) -> Result<PersonaDetails, ErrorResponse> {
    let persona = recommendation_service
        .get_personality()
        .await
        .map_err(ErrorResponse::from)?;

    Ok(PersonaDetails {
        name: persona.name().to_string(),
        title: persona.title().to_string(),
        description: persona.description().to_string(),
        icon: persona.icon().to_string(),
    })
}

#[tauri::command]
pub async fn get_brain_snapshot(
    recommendation_service: State<'_, RecommendationService>,
) -> Result<crate::flow_neuro::scoring::UserBrain, ErrorResponse> {
    recommendation_service
        .get_brain_snapshot()
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn unblock_topic(
    topic: String,
    recommendation_service: State<'_, RecommendationService>,
) -> Result<(), ErrorResponse> {
    recommendation_service
        .unblock_topic(topic)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn unblock_channel(
    channel_id: String,
    recommendation_service: State<'_, RecommendationService>,
) -> Result<(), ErrorResponse> {
    recommendation_service
        .unblock_channel(channel_id)
        .await
        .map_err(ErrorResponse::from)
}

#[tauri::command]
pub async fn reset_brain(
    recommendation_service: State<'_, RecommendationService>,
) -> Result<(), ErrorResponse> {
    recommendation_service
        .reset_brain()
        .await
        .map_err(ErrorResponse::from)
}
