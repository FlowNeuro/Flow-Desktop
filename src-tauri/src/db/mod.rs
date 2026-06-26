use std::path::PathBuf;
use std::str::FromStr;
use std::time::Duration;

pub mod cache;
pub mod download_collections;
pub mod downloads;
pub mod recommendations;
pub mod settings;
pub mod watch_history;

use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};

use crate::errors::{AppError, AppResult};

pub async fn initialize_database(app_data_dir: PathBuf) -> AppResult<SqlitePool> {
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|error| AppError::Database(error.to_string()))?;

    let db_path = app_data_dir.join("flow-desktop.sqlite");
    let database_url = format!("sqlite://{}", db_path.to_string_lossy());

    // Ensure SQLite database file is created if it does not exist
    if !db_path.exists() {
        std::fs::File::create(&db_path)
            .map_err(|error| AppError::Database(format!("Failed to create DB file: {}", error)))?;
    }

    // 1. Configure the SQLite connection specifically for high concurrency
    let connection_options = SqliteConnectOptions::from_str(&database_url)
        .map_err(|error| AppError::Database(error.to_string()))?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal) // Allows concurrent readers!
        .synchronous(SqliteSynchronous::Normal) // Massive write speed improvement
        .busy_timeout(Duration::from_secs(5)); // Prevent "database is locked" errors

    // 2. Build the optimized Connection Pool
    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .min_connections(1)
        .idle_timeout(Duration::from_secs(90))
        .connect_with(connection_options)
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;

    // Self-healing query: Ensure settings table is created immediately in case of migration mismatches
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );",
    )
    .execute(&pool)
    .await
    .map_err(|error| AppError::Database(error.to_string()))?;

    // Run migrations compile-time verified
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;

    // Bound the recommendation event log so it cannot grow without limit across sessions.
    if let Err(error) = recommendations::prune_recommendation_events(&pool, 2000).await {
        tracing::warn!(%error, "Failed to prune recommendation events");
    }

    Ok(pool)
}
