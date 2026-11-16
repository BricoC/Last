use serde::Serialize;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

const DATABASE_KEY: &str = "sqlite:LastData.db";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDdtPreviewKey {
    id: String,
    year: i64,
    doc_number: Option<i64>,
    status: String,
    sync_status: String,
    deleted_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDdtPreviewSnapshot {
    documents: Vec<LocalDdtPreviewKey>,
    item_ids: Vec<String>,
}

#[tauri::command]
pub async fn load_local_ddt_preview_keys(
    db_instances: State<'_, DbInstances>,
) -> Result<LocalDdtPreviewSnapshot, String> {
    let pool = {
        let instances = db_instances.0.read().await;
        match instances.get(DATABASE_KEY) {
            Some(DbPool::Sqlite(pool)) => pool.clone(),
            None => return Err("Il database Last non è stato inizializzato".to_string()),
        }
    };
    let rows = sqlx::query_as::<_, (String, i64, Option<i64>, String, String, Option<String>)>(
        "SELECT id, year, doc_number, status, sync_status, deleted_at FROM ddt_documents",
    )
    .fetch_all(&pool)
    .await
    .map_err(|_| "Impossibile leggere le chiavi DDT locali".to_string())?;
    let item_ids = sqlx::query_scalar::<_, String>("SELECT id FROM ddt_items")
        .fetch_all(&pool)
        .await
        .map_err(|_| "Impossibile leggere le chiavi delle righe DDT locali".to_string())?;

    let documents = rows
        .into_iter()
        .map(
            |(id, year, doc_number, status, sync_status, deleted_at)| LocalDdtPreviewKey {
                id,
                year,
                doc_number,
                status,
                sync_status,
                deleted_at,
            },
        )
        .collect();
    Ok(LocalDdtPreviewSnapshot {
        documents,
        item_ids,
    })
}
