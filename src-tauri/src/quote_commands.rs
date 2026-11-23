use crate::ddt_commands::persist_ddt;
use crate::ddt_types::DdtSavePayload;
use crate::quote_persistence::persist_quote;
use crate::quote_types::QuoteSavePayload;
use sqlx::{Connection, Sqlite, Transaction};
use tauri::State;
use tauri_plugin_sql::DbInstances;

#[tauri::command]
pub async fn save_quote_transaction(
    db_instances: State<'_, DbInstances>,
    payload: QuoteSavePayload,
) -> Result<(), String> {
    let mut connection = crate::sqlite_utils::acquire_configured_connection(&db_instances).await?;
    let mut transaction = connection
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| format!("Impossibile avviare la transazione preventivo: {error}"))?;

    match persist_quote(&mut transaction, payload).await {
        Ok(()) => commit(transaction, "preventivo").await,
        Err(error) => rollback(transaction, error, "preventivo").await,
    }
}

#[tauri::command]
pub async fn soft_delete_quote_transaction(
    db_instances: State<'_, DbInstances>,
    id: String,
    deleted_at: String,
    updated_by: String,
) -> Result<(), String> {
    let mut connection = crate::sqlite_utils::acquire_configured_connection(&db_instances).await?;
    let mut transaction = connection
        .begin_with("BEGIN IMMEDIATE")
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
        .execute(&mut *transaction)
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
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        Ok::<(), String>(())
    }
    .await;

    match result {
        Ok(()) => commit(transaction, "archiviazione preventivo").await,
        Err(error) => rollback(transaction, error, "archiviazione preventivo").await,
    }
}

#[tauri::command]
pub async fn convert_quote_to_ddt_transaction(
    db_instances: State<'_, DbInstances>,
    quote_payload: QuoteSavePayload,
    ddt_payload: DdtSavePayload,
) -> Result<String, String> {
    if ddt_payload.is_emission || ddt_payload.doc_number.is_some() {
        return Err("La conversione crea solo una bozza DDT senza progressivo".to_string());
    }
    let ddt_id = ddt_payload.id.clone();
    let quote_id = quote_payload.id.clone();
    let updated_at = ddt_payload.updated_at.clone();
    let updated_by = ddt_payload.updated_by.clone();
    let mut connection = crate::sqlite_utils::acquire_configured_connection(&db_instances).await?;
    let mut transaction = connection
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| format!("Impossibile avviare la conversione preventivo-DDT: {error}"))?;

    let result = async {
        persist_quote(&mut transaction, quote_payload).await?;
        persist_ddt(&mut transaction, ddt_payload).await?;
        let updated = sqlx::query(
            "UPDATE quotes SET status = 'confermato', converted_ddt_id = ?, updated_at = ?, updated_by = ?, sync_status = 'pending'
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(&ddt_id)
        .bind(&updated_at)
        .bind(&updated_by)
        .bind(&quote_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        if updated.rows_affected() == 0 {
            return Err("Preventivo non attivo".to_string());
        }
        Ok::<(), String>(())
    }
    .await;

    match result {
        Ok(()) => {
            commit(transaction, "conversione preventivo-DDT").await?;
            Ok(ddt_id)
        }
        Err(error) => rollback(transaction, error, "conversione preventivo-DDT")
            .await
            .map(|()| ddt_id),
    }
}

async fn commit(transaction: Transaction<'_, Sqlite>, label: &str) -> Result<(), String> {
    transaction
        .commit()
        .await
        .map_err(|error| format!("Impossibile confermare {label}: {error}"))
}

async fn rollback(
    transaction: Transaction<'_, Sqlite>,
    error: String,
    label: &str,
) -> Result<(), String> {
    match transaction.rollback().await {
        Ok(()) => Err(error),
        Err(rollback_error) => Err(format!(
            "{error}; rollback della {label} fallito: {rollback_error}"
        )),
    }
}
