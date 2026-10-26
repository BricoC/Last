use serde::Serialize;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tauri::{AppHandle, Manager};

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
pub async fn load_local_ddt_preview_keys(app: AppHandle) -> Result<LocalDdtPreviewSnapshot, String> {
    let path = app.path().app_data_dir()
        .map_err(|_| "Cartella dati Last non disponibile".to_string())?
        .join("LastData.db");
    if !path.exists() {
        return Err("Database locale Last non trovato; la preview non può controllare i conflitti".into());
    }

    let options = SqliteConnectOptions::new()
        .filename(&path)
        .read_only(true)
        .create_if_missing(false);
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(options).await
        .map_err(|_| "Database locale occupato o non leggibile in sola lettura".to_string())?;
    let rows = sqlx::query_as::<_, (String, i64, Option<i64>, String, String, Option<String>)>(
        "SELECT id, year, doc_number, status, sync_status, deleted_at FROM ddt_documents",
    ).fetch_all(&pool).await
        .map_err(|_| "Impossibile leggere le chiavi DDT locali".to_string())?;
    let item_ids = sqlx::query_scalar::<_, String>("SELECT id FROM ddt_items")
        .fetch_all(&pool).await
        .map_err(|_| "Impossibile leggere le chiavi delle righe DDT locali".to_string())?;
    pool.close().await;

    let documents = rows.into_iter().map(|(id, year, doc_number, status, sync_status, deleted_at)| {
        LocalDdtPreviewKey { id, year, doc_number, status, sync_status, deleted_at }
    }).collect();
    Ok(LocalDdtPreviewSnapshot { documents, item_ids })
}
