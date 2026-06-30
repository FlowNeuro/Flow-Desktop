//! ledger + migration test. Runs the full migration chain (including the new
//! `0009`/`0010`) against an in-memory SQLite database, then exercises the idempotency ledger and
//! identity/peer persistence. This is also the guard that the new migrations don't break app
//! startup.

use sqlx::sqlite::SqlitePoolOptions;

use flow_desktop_lib::sync::ledger;

/// A single-connection in-memory pool (`:memory:` is per-connection, so the pool must be size 1).
async fn memory_pool() -> sqlx::SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("open in-memory sqlite");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("run migrations");
    pool
}

#[tokio::test]
async fn migrations_apply_and_device_identity_is_stable() {
    let pool = memory_pool().await;

    let id1 = ledger::get_or_create_device_id(&pool).await.unwrap();
    let id2 = ledger::get_or_create_device_id(&pool).await.unwrap();
    assert!(!id1.is_empty());
    assert_eq!(id1, id2, "device id is generated once and persisted");

    let name = ledger::device_name(&pool).await.unwrap();
    assert!(name.starts_with("Flow Desktop ("));
}

#[tokio::test]
async fn sync_log_is_an_idempotency_guard() {
    let pool = memory_pool().await;

    assert!(
        !ledger::already_applied(&pool, "peerX", "watch_history", "hashA")
            .await
            .unwrap()
    );

    ledger::record_applied(
        &pool,
        "peerX",
        "watch_history",
        "hashA",
        Some("100:0:peerX"),
    )
    .await
    .unwrap();
    assert!(
        ledger::already_applied(&pool, "peerX", "watch_history", "hashA")
            .await
            .unwrap()
    );

    // Re-recording the same payload is a no-op (INSERT OR IGNORE) and must not error.
    ledger::record_applied(&pool, "peerX", "watch_history", "hashA", None)
        .await
        .unwrap();

    // A different payload / collection / peer is tracked independently.
    assert!(
        !ledger::already_applied(&pool, "peerX", "watch_history", "hashB")
            .await
            .unwrap()
    );
    assert!(
        !ledger::already_applied(&pool, "peerY", "watch_history", "hashA")
            .await
            .unwrap()
    );
}

#[tokio::test]
async fn peer_upsert_inserts_then_updates() {
    let pool = memory_pool().await;

    ledger::upsert_peer(&pool, "peerX", "Pixel 8", "android")
        .await
        .unwrap();
    ledger::upsert_peer(&pool, "peerX", "Pixel 8 Pro", "android")
        .await
        .unwrap();

    let (name, count): (String, i64) = sqlx::query_as(
        "SELECT device_name, (SELECT COUNT(*) FROM sync_peers) FROM sync_peers WHERE device_id = ?",
    )
    .bind("peerX")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1, "upsert must not create a duplicate row");
    assert_eq!(name, "Pixel 8 Pro", "second upsert updates the name");
}
