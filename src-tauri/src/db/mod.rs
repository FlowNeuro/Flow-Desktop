use std::path::PathBuf;

pub mod watch_history;
pub mod settings;
pub mod cache;
pub mod recommendations;


use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

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

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;

    // Self-healing query: Ensure settings table is created immediately in case of migration mismatches
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );"
    )
    .execute(&pool)
    .await
    .map_err(|error| AppError::Database(error.to_string()))?;

    // Run migrations compile-time verified
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;

    Ok(pool)
}
