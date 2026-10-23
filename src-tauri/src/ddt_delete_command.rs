use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

const DATABASE_KEY: &str = "sqlite:LastData.db";

#[tauri::command(rename_all = "camelCase")]
pub async fn soft_delete_ddt_transaction(
    db_instances: State<'_, DbInstances>,
    id: String,
    deleted_at: String,
) -> Result<(), String> {
    let pool = {
        let instances = db_instances.0.read().await;
        match instances.get(DATABASE_KEY) {
            Some(DbPool::Sqlite(pool)) => pool.clone(),
            None => return Err("Il database Last non è stato inizializzato".to_string()),
        }
    };

    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Impossibile avviare la transazione DDT: {error}"))?;

    let result = async {
        let header = sqlx::query(
            "UPDATE ddt_documents SET deleted_at = $1, updated_at = $1, updated_by = 'system',
             sync_status = 'pending' WHERE id = $2 AND deleted_at IS NULL",
        )
        .bind(&deleted_at)
        .bind(&id)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;

        if header.rows_affected() == 0 {
            return Err("Il DDT non esiste o risulta già eliminato".to_string());
        }

        sqlx::query(
            "UPDATE ddt_items SET deleted_at = $1, updated_at = $1, updated_by = 'system',
             sync_status = 'pending' WHERE ddt_id = $2 AND deleted_at IS NULL",
        )
        .bind(&deleted_at)
        .bind(&id)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;

        Ok::<(), String>(())
    }
    .await;

    match result {
        Ok(()) => match sqlx::query("COMMIT").execute(&mut *connection).await {
            Ok(_) => Ok(()),
            Err(error) => {
                let rollback = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                match rollback {
                    Ok(_) => Err(format!("Impossibile confermare la transazione DDT: {error}")),
                    Err(rollback_error) => Err(format!(
                        "Impossibile confermare la transazione DDT: {error}; rollback fallito: {rollback_error}"
                    )),
                }
            }
        },
        Err(error) => {
            let rollback = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            match rollback {
                Ok(_) => Err(error),
                Err(rollback_error) => Err(format!(
                    "{error}; anche il rollback della transazione DDT è fallito: {rollback_error}"
                )),
            }
        }
    }
}
