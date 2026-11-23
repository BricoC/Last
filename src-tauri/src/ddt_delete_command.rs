use sqlx::Connection;
use tauri::State;
use tauri_plugin_sql::DbInstances;

#[tauri::command(rename_all = "camelCase")]
pub async fn soft_delete_ddt_transaction(
    db_instances: State<'_, DbInstances>,
    id: String,
    deleted_at: String,
) -> Result<(), String> {
    let mut connection = crate::sqlite_utils::acquire_configured_connection(&db_instances).await?;
    let mut transaction = connection
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| format!("Impossibile avviare la transazione DDT: {error}"))?;

    let result = async {
        let header = sqlx::query(
            "UPDATE ddt_documents SET deleted_at = $1, updated_at = $1, updated_by = 'system',
             sync_status = 'pending' WHERE id = $2 AND deleted_at IS NULL",
        )
        .bind(&deleted_at)
        .bind(&id)
        .execute(&mut *transaction)
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
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;

        Ok::<(), String>(())
    }
    .await;

    match result {
        Ok(()) => transaction
            .commit()
            .await
            .map_err(|error| format!("Impossibile confermare la transazione DDT: {error}")),
        Err(error) => match transaction.rollback().await {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error}; anche il rollback della transazione DDT è fallito: {rollback_error}"
            )),
        },
    }
}
