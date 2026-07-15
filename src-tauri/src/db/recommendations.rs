use crate::errors::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationEvent {
    pub id: Option<i64>,
    pub event_type: String,
    pub video_id: Option<String>,
    pub channel_name: Option<String>,
    pub query: Option<String>,
    pub value: Option<f64>,
    pub created_at: String,
}

pub async fn log_recommendation_event(
    pool: &SqlitePool,
    event_type: &str,
    video_id: Option<&str>,
    channel_name: Option<&str>,
    query: Option<&str>,
    value: Option<f64>,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO recommendation_events (event_type, video_id, channel_name, query, value)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(event_type)
    .bind(video_id)
    .bind(channel_name)
    .bind(query)
    .bind(value)
    .execute(pool)
    .await
    .map_err(AppError::from)?;

    Ok(())
}

pub async fn get_recommendation_events(
    pool: &SqlitePool,
    limit: i64,
) -> AppResult<Vec<RecommendationEvent>> {
    let records = sqlx::query_as::<_, RecommendationEvent>(
        "SELECT id, event_type, video_id, channel_name, query, value, created_at
         FROM recommendation_events
         ORDER BY created_at DESC
         LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(AppError::from)?;

    Ok(records)
}

pub async fn clear_recommendation_events(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM recommendation_events")
        .execute(pool)
        .await
        .map_err(AppError::from)?;

    Ok(())
}

/// Bounds the (otherwise unbounded) event log to the most recent `keep` rows.
pub async fn prune_recommendation_events(pool: &SqlitePool, keep: i64) -> AppResult<()> {
    sqlx::query(
        "DELETE FROM recommendation_events
         WHERE id NOT IN (
            SELECT id FROM recommendation_events ORDER BY created_at DESC, id DESC LIMIT ?
         )",
    )
    .bind(keep)
    .execute(pool)
    .await
    .map_err(AppError::from)?;

    Ok(())
}
