use crate::quote_persistence::persist_quote;
use crate::quote_types::QuoteSavePayload;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

const DATABASE_KEY: &str = "sqlite:LastData.db";

#[tauri::command]
pub async fn save_quote_transaction(
    db_instances: State<'_, DbInstances>,
    payload: QuoteSavePayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances).await?;
    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Impossibile avviare la transazione preventivo: {error}"))?;

    match persist_quote(&mut connection, payload).await {
        Ok(()) => commit(&mut connection, "preventivo").await,
        Err(error) => rollback(&mut connection, error, "preventivo").await,
    }
}

#[tauri::command]
pub async fn soft_delete_quote_transaction(
    db_instances: State<'_, DbInstances>,
    id: String,
    deleted_at: String,
    updated_by: String,
) -> Result<(), String> {
    let pool = get_pool(&db_instances).await?;
    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Impossibile avviare l'archiviazione preventivo: {error}"))?;

    let result = async {
        let updated = sqlx::query(
            "UPDATE quotes SET deleted_at = ?, updated_at = ?, updated_by = ?, sync_status = 'pending' WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(&deleted_at)
        .bind(&deleted_at)
        .bind(&updated_by)
        .bind(&id)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
        if updated.rows_affected() == 0 {
            return Err("Preventivo attivo non trovato".to_string());
        }
        sqlx::query(
            "UPDATE quote_items SET deleted_at = ?, updated_at = ?, updated_by = ?, sync_status = 'pending' WHERE quote_id = ? AND deleted_at IS NULL",
        )
        .bind(&deleted_at)
        .bind(&deleted_at)
        .bind(&updated_by)
        .bind(&id)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
        Ok::<(), String>(())
    }
    .await;

    match result {
        Ok(()) => commit(&mut connection, "archiviazione preventivo").await,
        Err(error) => rollback(&mut connection, error, "archiviazione preventivo").await,
    }
}

async fn get_pool(db_instances: &DbInstances) -> Result<sqlx::SqlitePool, String> {
    let instances = db_instances.0.read().await;
    match instances.get(DATABASE_KEY) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        None => Err("Il database Last non è stato inizializzato".to_string()),
    }
}

async fn commit(connection: &mut sqlx::SqliteConnection, label: &str) -> Result<(), String> {
    match sqlx::query("COMMIT").execute(&mut *connection).await {
        Ok(_) => Ok(()),
        Err(error) => {
            let rollback_result = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            match rollback_result {
                Ok(_) => Err(format!("Impossibile confermare {label}: {error}")),
                Err(rollback_error) => Err(format!(
                    "Impossibile confermare {label}: {error}; rollback fallito: {rollback_error}"
                )),
            }
        }
    }
}

async fn rollback(
    connection: &mut sqlx::SqliteConnection,
    error: String,
    label: &str,
) -> Result<(), String> {
    match sqlx::query("ROLLBACK").execute(&mut *connection).await {
        Ok(_) => Err(error),
        Err(rollback_error) => Err(format!(
            "{error}; rollback della {label} fallito: {rollback_error}"
        )),
    }
}
