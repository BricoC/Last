use crate::sqlite_backup::{open_database, snapshot_suffix, StagedSnapshot};
use serde::{Deserialize, Serialize};
use sqlx::{Connection, SqliteConnection};
use std::{fs, path::Path, time::SystemTime};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_sql::DbInstances;

#[path = "supabase_ddt_import_plan.rs"]
mod plan;
use plan::{classify_import, ImportPlan};

#[cfg(test)]
#[path = "supabase_ddt_import_tests.rs"]
mod tests;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdtImportPayload {
    headers: Vec<DdtImportHeader>,
    lines: Vec<DdtImportLine>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DdtImportHeader {
    id: String,
    doc_number: i64,
    year: i64,
    series: String,
    doc_date: String,
    status: String,
    client_name: String,
    client_address: Option<String>,
    client_city: Option<String>,
    client_vat: Option<String>,
    client_fiscal_code: Option<String>,
    client_sdi: Option<String>,
    client_phones_json: String,
    destination_name: Option<String>,
    destination_address: Option<String>,
    destination_city: Option<String>,
    transport_reason: String,
    payment_method: Option<String>,
    order_reference: Option<String>,
    account_or_balance: String,
    operator: Option<String>,
    goods_appearance: Option<String>,
    carriage_terms: String,
    packages_count: Option<String>,
    weight_kg: Option<String>,
    carrier: Option<String>,
    internal_notes: Option<String>,
    total_taxable_subunits: i64,
    total_vat_subunits: i64,
    total_document_subunits: i64,
    created_at: String,
    updated_at: String,
    #[serde(default)]
    project_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DdtImportLine {
    id: String,
    cloud_header_id: Option<String>,
    row_index: i64,
    description: String,
    row_kind: String,
    unit: String,
    quantity: String,
    unit_price_subunits: i64,
    discount_pct: String,
    net_amount_subunits: i64,
    vat_rate: i64,
    vat_amount_subunits: i64,
    purchase_price_subunits: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DdtImportResult {
    imported_headers: usize,
    imported_lines: usize,
    already_present: usize,
    conflicts: usize,
    duplicate_cloud_headers: usize,
    orphan_lines: usize,
    line_id_conflicts: usize,
    backup_path: Option<String>,
}

#[tauri::command]
pub async fn import_supabase_ddt_into_local(
    app: AppHandle,
    db_instances: State<'_, DbInstances>,
    payload: DdtImportPayload,
) -> Result<DdtImportResult, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Cartella dati Last non disponibile".to_string())?;

    let pool = crate::sqlite_utils::get_sqlite_pool(&db_instances).await?;
    let database_path = pool.connect_options().get_filename().to_path_buf();
    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    import_with_snapshot(&mut connection, &database_path, &data_dir, &payload).await
}

async fn import_with_snapshot(
    connection: &mut SqliteConnection,
    database_path: &Path,
    data_dir: &Path,
    payload: &DdtImportPayload,
) -> Result<DdtImportResult, String> {
    let mut transaction = connection
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| format!("Impossibile avviare la transazione d’importazione: {error}"))?;
    let ImportPlan {
        mut result,
        headers,
        lines,
    } = classify_import(&mut transaction, payload).await?;
    if headers.is_empty() {
        transaction
            .commit()
            .await
            .map_err(|error| error.to_string())?;
        return Ok(result);
    }

    let backup = data_dir.join(format!(
        "LastData.pre-supabase-ddt-import-{}.db",
        snapshot_suffix()
    ));
    let stage = StagedSnapshot::new(&backup)?;
    // VACUUM INTO needs its own connection. The write lock keeps that read snapshot
    // consistent with the transaction's classification and the state before the import.
    let mut reader = open_database(database_path, true).await?;
    stage.capture(&mut reader).await?;
    reader.close().await.map_err(|error| error.to_string())?;
    stage.validate(false).await?;
    stage.install(&backup)?;
    let backup_name = backup.to_string_lossy().into_owned();

    match import_transaction(&mut transaction, &headers, &lines).await {
        Ok((imported_headers, imported_lines)) => {
            transaction.commit().await
                .map_err(|error| format!("Commit importazione non riuscito (backup disponibile in {backup_name}): {error}"))?;
            rotate_pre_import_backups(data_dir, 5);
            result.imported_headers = imported_headers;
            result.imported_lines = imported_lines;
            result.backup_path = Some(backup_name);
            Ok(result)
        }
        Err(error) => {
            transaction.rollback().await.map_err(|rollback| {
                format!("{error}; rollback non riuscito: {rollback}. Backup disponibile in {backup_name}")
            })?;
            let _ = fs::remove_file(&backup);
            Err(error)
        }
    }
}

async fn import_transaction(
    connection: &mut sqlx::SqliteConnection,
    headers: &[&DdtImportHeader],
    lines: &[&DdtImportLine],
) -> Result<(usize, usize), String> {
    for header in headers {
        sqlx::query(
            "INSERT INTO ddt_documents (
              id, doc_number, year, series, doc_date, status, client_name, client_address, client_city,
              client_vat, client_fiscal_code, client_sdi, client_phones_json, destination_name,
              destination_address, destination_city, transport_reason, payment_method, order_reference,
              account_or_balance, operator, goods_appearance, carriage_terms, packages_count, weight_kg,
              carrier, internal_notes, total_taxable_subunits, total_vat_subunits, total_document_subunits,
              created_at, updated_at, updated_by, sync_status, project_url
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,'supabase-read-only-import','synced',$33
            )"
        )
        .bind(&header.id).bind(header.doc_number).bind(header.year).bind(&header.series).bind(&header.doc_date)
        .bind(&header.status).bind(&header.client_name).bind(&header.client_address).bind(&header.client_city)
        .bind(&header.client_vat).bind(&header.client_fiscal_code).bind(&header.client_sdi).bind(&header.client_phones_json)
        .bind(&header.destination_name).bind(&header.destination_address).bind(&header.destination_city)
        .bind(&header.transport_reason).bind(&header.payment_method).bind(&header.order_reference)
        .bind(&header.account_or_balance).bind(&header.operator).bind(&header.goods_appearance).bind(&header.carriage_terms)
        .bind(&header.packages_count).bind(&header.weight_kg).bind(&header.carrier).bind(&header.internal_notes)
        .bind(header.total_taxable_subunits).bind(header.total_vat_subunits).bind(header.total_document_subunits)
        .bind(&header.created_at).bind(&header.updated_at).bind(&header.project_url)
        .execute(&mut *connection).await.map_err(|error| format!("Importazione testata DDT {}/{} fallita: {error}", header.year, header.doc_number))?;
    }

    for line in lines {
        let header_id = line
            .cloud_header_id
            .as_deref()
            .ok_or("Riga candidata senza testata collegata")?;
        sqlx::query(
            "INSERT INTO ddt_items (
              id, ddt_id, row_index, description, row_kind, unit, quantity, unit_price_subunits,
              discount_pct, net_amount_subunits, vat_rate, vat_amount_subunits, purchase_price_subunits,
              created_at, updated_at, updated_by, sync_status
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'supabase-read-only-import','synced')"
        )
        .bind(&line.id).bind(header_id).bind(line.row_index).bind(&line.description).bind(&line.row_kind)
        .bind(&line.unit).bind(&line.quantity).bind(line.unit_price_subunits).bind(&line.discount_pct)
        .bind(line.net_amount_subunits).bind(line.vat_rate).bind(line.vat_amount_subunits)
        .bind(line.purchase_price_subunits).bind(&line.created_at).bind(&line.updated_at)
        .execute(&mut *connection).await.map_err(|error| format!("Importazione riga DDT {} fallita: {error}", line.id))?;
    }
    Ok((headers.len(), lines.len()))
}

/// Mantiene al massimo `max_backups` file di backup pre-importazione nel database locale,
/// rimuovendo a rotazione i più vecchi ed eliminando eventuali vecchi snapshot legacy.
pub fn rotate_pre_import_backups(data_dir: &Path, max_backups: usize) {
    let entries = match fs::read_dir(data_dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    let mut backup_files: Vec<(std::path::PathBuf, SystemTime)> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                let is_pre_import = file_name.starts_with("LastData.pre-supabase-ddt-import-")
                    && file_name.ends_with(".db");
                let is_legacy_pre = (file_name.starts_with("LastData.pre-")
                    || file_name.starts_with("LastData.db.pre-")
                    || file_name.starts_with("LastData_backup_20261028_"))
                    && file_name.ends_with(".db");

                if is_pre_import {
                    let modified = entry
                        .metadata()
                        .and_then(|m| m.modified())
                        .unwrap_or(SystemTime::UNIX_EPOCH);
                    backup_files.push((path, modified));
                } else if is_legacy_pre {
                    let _ = fs::remove_file(&path);
                }
            }
        }
    }

    // Ordina dal più recente al più vecchio
    backup_files.sort_by(|a, b| b.1.cmp(&a.1));

    // Se ci sono più di max_backups, rimuovi i più vecchi
    if backup_files.len() > max_backups {
        for (path, _) in &backup_files[max_backups..] {
            let _ = fs::remove_file(path);
        }
    }
}
