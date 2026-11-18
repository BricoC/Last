use sqlx::pool::PoolConnection;
use sqlx::{Sqlite, SqliteConnection, SqlitePool};
use tauri_plugin_sql::{DbInstances, DbPool};

pub const DATABASE_KEY: &str = "sqlite:LastData.db";

/// Recupera il pool SQLite condiviso di `LastData.db` registrato da `tauri-plugin-sql`.
pub async fn get_sqlite_pool(db_instances: &DbInstances) -> Result<SqlitePool, String> {
    let instances = db_instances.0.read().await;
    match instances.get(DATABASE_KEY) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        None => Err("Il database Last non è stato inizializzato".to_string()),
    }
}

/// Applica i PRAGMA di concorrenza e integrità sulla specifica connessione SQLite.
/// In `sqlx::SqlitePool`, PRAGMA come `busy_timeout`, `synchronous` e `foreign_keys`
/// hanno ambito per-connessione e vanno configurati sulla connessione acquisita.
pub async fn configure_connection(connection: &mut SqliteConnection) -> Result<(), String> {
    sqlx::query("PRAGMA busy_timeout = 30000;")
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Impossibile impostare busy_timeout SQLite: {error}"))?;
    sqlx::query("PRAGMA synchronous = NORMAL;")
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Impossibile impostare synchronous SQLite: {error}"))?;
    sqlx::query("PRAGMA foreign_keys = ON;")
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Impossibile impostare foreign_keys SQLite: {error}"))?;
    Ok(())
}

/// Acquisisce una connessione dal pool SQLite configurandola con `busy_timeout = 30000`.
pub async fn acquire_configured_connection(
    db_instances: &DbInstances,
) -> Result<PoolConnection<Sqlite>, String> {
    let pool = get_sqlite_pool(db_instances).await?;
    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    configure_connection(&mut connection).await?;
    Ok(connection)
}
