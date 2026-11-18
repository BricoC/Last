use sqlx::pool::PoolConnection;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Sqlite, SqlitePool};
use std::{fs, path::PathBuf, time::Duration};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_sql::{DbInstances, DbPool};

pub const DATABASE_KEY: &str = "sqlite:LastData.db";

pub(crate) fn local_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("LastData.db"))
        .map_err(|error| format!("Cartella dati Last: {error}"))
}

fn local_connect_options(path: PathBuf) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(30))
        .foreign_keys(true)
}

#[tauri::command]
pub async fn initialize_local_database(
    app: AppHandle,
    db_instances: State<'_, DbInstances>,
) -> Result<(), String> {
    let mut instances = db_instances.0.write().await;
    if instances.contains_key(DATABASE_KEY) {
        return Ok(());
    }
    let path = local_database_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Cartella dati Last: {error}"))?;
    }
    let pool = SqlitePoolOptions::new()
        .connect_with(local_connect_options(path))
        .await
        .map_err(|error| format!("Impossibile aprire il database Last: {error}"))?;
    instances.insert(DATABASE_KEY.into(), DbPool::Sqlite(pool));
    Ok(())
}

/// Recupera il pool SQLite condiviso di `LastData.db` registrato da `tauri-plugin-sql`.
pub async fn get_sqlite_pool(db_instances: &DbInstances) -> Result<SqlitePool, String> {
    let instances = db_instances.0.read().await;
    match instances.get(DATABASE_KEY) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        None => Err("Il database Last non è stato inizializzato".to_string()),
    }
}

/// Tutte le connessioni usano le opzioni impostate all'apertura del pool.
pub async fn acquire_configured_connection(
    db_instances: &DbInstances,
) -> Result<PoolConnection<Sqlite>, String> {
    get_sqlite_pool(db_instances)
        .await?
        .acquire()
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_pooled_connection_uses_the_same_pragmas() {
        tauri::async_runtime::block_on(async {
            let path = std::env::temp_dir().join(format!(
                "last-pool-{}.db",
                crate::sqlite_backup::snapshot_suffix()
            ));
            let pool = SqlitePoolOptions::new()
                .max_connections(2)
                .connect_with(local_connect_options(path.clone()))
                .await
                .unwrap();
            let mut first = pool.acquire().await.unwrap();
            let mut second = pool.acquire().await.unwrap();
            for connection in [&mut first, &mut second] {
                for (pragma, expected) in [
                    ("busy_timeout", 30000),
                    ("foreign_keys", 1),
                    ("synchronous", 1),
                ] {
                    let value: i64 = sqlx::query_scalar(&format!("PRAGMA {pragma}"))
                        .fetch_one(&mut **connection)
                        .await
                        .unwrap();
                    assert_eq!(value, expected, "{pragma}");
                }
                let journal: String = sqlx::query_scalar("PRAGMA journal_mode")
                    .fetch_one(&mut **connection)
                    .await
                    .unwrap();
                assert_eq!(journal, "wal");
            }
            drop(first);
            drop(second);
            pool.close().await;
            fs::remove_file(path).unwrap();
        });
    }
}
