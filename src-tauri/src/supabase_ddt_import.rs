use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, HashSet}, fs, time::{SystemTime, UNIX_EPOCH}};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tauri::{AppHandle, Manager};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DdtImportPayload {
    headers: Vec<DdtImportHeader>,
    lines: Vec<DdtImportLine>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DdtImportHeader {
    id: String, doc_number: i64, year: i64, series: String, doc_date: String, status: String,
    client_name: String, client_address: Option<String>, client_city: Option<String>, client_vat: Option<String>,
    client_fiscal_code: Option<String>, client_sdi: Option<String>, client_phones_json: String,
    destination_name: Option<String>, destination_address: Option<String>, destination_city: Option<String>,
    transport_reason: String, payment_method: Option<String>, order_reference: Option<String>,
    account_or_balance: String, operator: Option<String>, goods_appearance: Option<String>, carriage_terms: String,
    packages_count: Option<String>, weight_kg: Option<String>, carrier: Option<String>, internal_notes: Option<String>,
    total_taxable_subunits: i64, total_vat_subunits: i64, total_document_subunits: i64,
    created_at: String, updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DdtImportLine {
    id: String, cloud_header_id: Option<String>, row_index: i64, description: String, row_kind: String,
    unit: String, quantity: String, unit_price_subunits: i64, discount_pct: String, net_amount_subunits: i64,
    vat_rate: i64, vat_amount_subunits: i64, purchase_price_subunits: i64, created_at: String, updated_at: String,
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

#[derive(sqlx::FromRow)]
struct LocalHeader {
    id: String,
    year: i64,
    doc_number: Option<i64>,
    sync_status: String,
    deleted_at: Option<String>,
}

fn document_key(year: i64, number: i64) -> (i64, i64) { (year, number) }

async fn local_headers(connection: &mut sqlx::SqliteConnection) -> Result<Vec<LocalHeader>, String> {
    sqlx::query_as::<_, LocalHeader>("SELECT id, year, doc_number, sync_status, deleted_at FROM ddt_documents")
        .fetch_all(&mut *connection).await.map_err(|error| format!("Impossibile controllare i DDT locali: {error}"))
}

#[tauri::command]
pub async fn import_supabase_ddt_into_local(
    app: AppHandle,
    payload: DdtImportPayload,
) -> Result<DdtImportResult, String> {
    let data_dir = app.path().app_data_dir().map_err(|_| "Cartella dati Last non disponibile".to_string())?;
    let db_path = data_dir.join("LastData.db");
    if !db_path.exists() { return Err("Database locale Last non trovato".into()); }
    let options = SqliteConnectOptions::new().filename(&db_path).create_if_missing(false);
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(options).await
        .map_err(|error| format!("Impossibile aprire il database locale Last: {error}"))?;
    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    let local = local_headers(&mut connection).await?;
    let local_by_id: HashMap<String, &LocalHeader> = local.iter().map(|header| (header.id.clone(), header)).collect();
    let mut active_numbers = HashSet::new();
    for header in &local {
        if header.deleted_at.is_none() {
            if let Some(number) = header.doc_number { active_numbers.insert(document_key(header.year, number)); }
        }
    }

    let mut cloud_key_counts: HashMap<(i64, i64), usize> = HashMap::new();
    for header in &payload.headers {
        *cloud_key_counts.entry(document_key(header.year, header.doc_number)).or_default() += 1;
    }
    let duplicate_cloud_headers = cloud_key_counts.values().filter(|count| **count > 1).map(|count| *count).sum();
    let mut candidate_ids = HashSet::new();
    let mut conflicts = 0usize;
    let mut already_present = 0usize;

    for header in &payload.headers {
        let key = document_key(header.year, header.doc_number);
        let _disposition = if cloud_key_counts.get(&key).copied().unwrap_or(0) > 1 {
            conflicts += 1; "duplicate"
        } else if let Some(existing) = local_by_id.get(&header.id) {
            if existing.deleted_at.is_none() && existing.year == header.year
                && existing.doc_number == Some(header.doc_number) && existing.sync_status == "synced" {
                already_present += 1; "present"
            } else {
                conflicts += 1; "conflict"
            }
        } else if active_numbers.contains(&key) {
            conflicts += 1; "conflict"
        } else {
            candidate_ids.insert(header.id.clone());
            "candidate"
        };
    }

    let mut orphan_lines = 0usize;
    let mut candidate_lines: Vec<&DdtImportLine> = Vec::new();
    let line_ids = sqlx::query_scalar::<_, String>("SELECT id FROM ddt_items")
        .fetch_all(&mut *connection).await.map_err(|error| format!("Impossibile controllare gli UUID delle righe locali: {error}"))?;
    let existing_line_ids: HashSet<String> = line_ids.into_iter().collect();
    let mut line_id_conflicts = 0usize;
    let mut headers_with_line_id_conflict = HashSet::new();
    for line in &payload.lines {
        let Some(header_id) = line.cloud_header_id.as_deref() else { orphan_lines += 1; continue; };
        if !candidate_ids.contains(header_id) { continue; }
        if existing_line_ids.contains(&line.id) {
            line_id_conflicts += 1;
            headers_with_line_id_conflict.insert(header_id.to_string());
        } else {
            candidate_lines.push(line);
        }
    }
    for header_id in headers_with_line_id_conflict {
        candidate_ids.remove(&header_id);
        conflicts += 1;
    }
    candidate_lines.retain(|line| line.cloud_header_id.as_ref().is_some_and(|id| candidate_ids.contains(id)));

    let candidate_headers: Vec<&DdtImportHeader> = payload.headers.iter()
        .filter(|header| candidate_ids.contains(&header.id)).collect();
    if candidate_headers.is_empty() {
        return Ok(DdtImportResult {
            imported_headers: 0, imported_lines: 0, already_present, conflicts,
            duplicate_cloud_headers, orphan_lines, line_id_conflicts, backup_path: None,
        });
    }

    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_secs();
    let backup = data_dir.join(format!("LastData.pre-supabase-ddt-import-{timestamp}.db"));
    let backup_name = backup.to_string_lossy().to_string();
    sqlx::query("VACUUM INTO $1").bind(&backup_name).execute(&mut *connection).await
        .map_err(|error| format!("Backup SQLite non riuscito; nessun DDT è stato importato: {error}"))?;

    sqlx::query("BEGIN IMMEDIATE").execute(&mut *connection).await
        .map_err(|error| format!("Impossibile avviare la transazione d’importazione: {error}"))?;
    let result = import_transaction(&mut connection, &candidate_headers, &candidate_lines).await;
    match result {
        Ok((imported_headers, imported_lines)) => {
            sqlx::query("COMMIT").execute(&mut *connection).await
                .map_err(|error| format!("Commit importazione non riuscito (backup disponibile in {backup_name}): {error}"))?;
            Ok(DdtImportResult {
                imported_headers, imported_lines, already_present, conflicts,
                duplicate_cloud_headers, orphan_lines, line_id_conflicts, backup_path: Some(backup_name),
            })
        }
        Err(error) => {
            let rollback = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            if let Err(rollback_error) = rollback {
                return Err(format!("{error}; rollback non riuscito: {rollback_error}. Backup disponibile in {backup_name}"));
            }
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
              created_at, updated_at, updated_by, sync_status
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,'supabase-read-only-import','synced'
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
        .bind(&header.created_at).bind(&header.updated_at)
        .execute(&mut *connection).await.map_err(|error| format!("Importazione testata DDT {}/{} fallita: {error}", header.year, header.doc_number))?;
    }

    for line in lines {
        let header_id = line.cloud_header_id.as_deref().ok_or("Riga candidata senza testata collegata")?;
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
