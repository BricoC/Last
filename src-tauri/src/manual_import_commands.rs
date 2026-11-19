use crate::sqlite_utils::acquire_configured_connection;
use serde::{Deserialize, Serialize};
use sqlx::{Connection, SqliteConnection};
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;
use tauri_plugin_sql::DbInstances;

#[derive(Deserialize)]
pub struct ClientPriceListSyncRow {
    #[serde(default, alias = "cloudId")]
    pub cloud_id: Option<i64>,
    pub cliente: String,
    pub descrizione: String,
    #[serde(default)]
    pub prezzo_fattura: Option<f64>,
    #[serde(default)]
    pub prezzo_acquisto: Option<f64>,
    #[serde(default)]
    pub acquisto_old: String,
    #[serde(default)]
    pub ricarico: Option<f64>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub note1: Option<String>,
    #[serde(default)]
    pub note2: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientPriceListSyncResult {
    pub updated: usize,
    pub inserted: usize,
}

fn normalize_key(cliente: &str, descrizione: &str) -> (String, String) {
    (
        cliente.trim().to_lowercase(),
        descrizione.trim().to_lowercase(),
    )
}

fn non_empty_opt(val: &str) -> Option<&str> {
    if val.trim().is_empty() {
        None
    } else {
        Some(val)
    }
}

/// Sincronizza in blocco le righe di `listini_clienti` dentro una singola transazione
/// atomica su connessione dedicata, evitando lock contention e timeout SQLite.
#[tauri::command]
pub async fn sync_client_price_lists_to_local(
    db_instances: State<'_, DbInstances>,
    rows: Vec<ClientPriceListSyncRow>,
) -> Result<ClientPriceListSyncResult, String> {
    if rows.is_empty() {
        return Ok(ClientPriceListSyncResult {
            updated: 0,
            inserted: 0,
        });
    }

    let mut connection = acquire_configured_connection(&db_instances).await?;
    sync_rows(&mut connection, rows).await
}

async fn sync_rows(
    connection: &mut SqliteConnection,
    rows: Vec<ClientPriceListSyncRow>,
) -> Result<ClientPriceListSyncResult, String> {
    let mut transaction = connection
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| {
            let msg = error.to_string();
            if msg.to_lowercase().contains("database is locked") || msg.contains("code: 5") {
                format!(
                    "Database LastData.db bloccato da un'altra istanza di Last o processo esterno (chiudi tutte le altre finestre/processi di Last e riprova): {msg}"
                )
            } else {
                format!("Impossibile avviare la transazione listini clienti: {msg}")
            }
        })?;

    let result = async {
        let existing_rows = sqlx::query_as::<_, (Option<String>, String, String)>(
            "SELECT id, cliente, descrizione FROM listini_clienti",
        )
        .fetch_all(&mut *transaction)
        .await
        .map_err(|error| format!("Errore lettura listini_clienti locali: {error}"))?;

        let mut existing_by_key: HashMap<(String, String), Vec<String>> =
            HashMap::with_capacity(existing_rows.len());
        let mut used_ids: HashSet<String> =
            HashSet::with_capacity(existing_rows.len() + rows.len());

        for (id_opt, cliente, descrizione) in existing_rows {
            if let Some(id) = id_opt {
                if !id.is_empty() {
                    used_ids.insert(id.clone());
                    existing_by_key
                        .entry(normalize_key(&cliente, &descrizione))
                        .or_default()
                        .push(id);
                }
            }
        }

        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let ts_iso_row: Result<(String,), _> =
            sqlx::query_as("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
                .fetch_one(&mut *transaction)
                .await;
        let now_iso = ts_iso_row
            .map(|(s,)| s)
            .unwrap_or_else(|_| now_millis.to_string());

        let mut updated: usize = 0;
        let mut inserted: usize = 0;

        for (idx, r) in rows.iter().enumerate() {
            let key = normalize_key(&r.cliente, &r.descrizione);
            let acquisto_old_opt = non_empty_opt(&r.acquisto_old);

            if let Some(ids) = existing_by_key.get(&key) {
                for id in ids {
                    let result = sqlx::query(
                        "UPDATE listini_clienti SET
                            prezzo_fattura = COALESCE($1, prezzo_fattura),
                            prezzo_acquisto = COALESCE($2, prezzo_acquisto),
                            acquisto_old = COALESCE($3, acquisto_old),
                            ricarico = COALESCE($4, ricarico),
                            note = $5,
                            note1 = $6,
                            note2 = $7,
                            updated_at = $8
                         WHERE id = $9 AND sync_revision IS NULL",
                    )
                    .bind(r.prezzo_fattura)
                    .bind(r.prezzo_acquisto)
                    .bind(acquisto_old_opt)
                    .bind(r.ricarico)
                    .bind(r.note.as_deref())
                    .bind(r.note1.as_deref())
                    .bind(r.note2.as_deref())
                    .bind(&now_iso)
                    .bind(id)
                    .execute(&mut *transaction)
                    .await
                    .map_err(|error| {
                        format!("Errore aggiornamento listino cliente locale: {error}")
                    })?;
                    updated += result.rows_affected() as usize;
                }
            } else {
                let mut candidate_id = match r.cloud_id {
                    Some(cid) => format!("cli_{cid}"),
                    None => format!("new_mig_{now_millis}_{idx}"),
                };
                if used_ids.contains(&candidate_id) {
                    candidate_id = format!("new_mig_{now_millis}_{idx}");
                }
                let mut suffix = 1usize;
                while used_ids.contains(&candidate_id) {
                    candidate_id = format!("new_mig_{now_millis}_{idx}_{suffix}");
                    suffix += 1;
                }
                used_ids.insert(candidate_id.clone());

                sqlx::query(
                    "INSERT INTO listini_clienti (
                        id, cliente, descrizione, prezzo_fattura, prezzo_acquisto, acquisto_old,
                        ricarico, note, note1, note2, created_at, updated_at
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
                )
                .bind(&candidate_id)
                .bind(&r.cliente)
                .bind(&r.descrizione)
                .bind(r.prezzo_fattura)
                .bind(r.prezzo_acquisto)
                .bind(acquisto_old_opt)
                .bind(r.ricarico)
                .bind(r.note.as_deref())
                .bind(r.note1.as_deref())
                .bind(r.note2.as_deref())
                .bind(&now_iso)
                .bind(&now_iso)
                .execute(&mut *transaction)
                .await
                .map_err(|error| format!("Errore inserimento listino cliente locale: {error}"))?;

                existing_by_key.insert(key, vec![candidate_id]);
                inserted += 1;
            }
        }

        Ok::<ClientPriceListSyncResult, String>(ClientPriceListSyncResult { updated, inserted })
    }
    .await;

    match result {
        Ok(sync_res) => {
            transaction.commit().await.map_err(|error| {
                format!("Impossibile confermare la transazione listini clienti: {error}")
            })?;
            Ok(sync_res)
        }
        Err(error) => match transaction.rollback().await {
            Ok(()) => Err(error),
            Err(rollback) => Err(format!("{error}; rollback listini clienti: {rollback}")),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_imported_purchase_text_keeps_existing_value() {
        tauri::async_runtime::block_on(async {
            let mut db = SqliteConnection::connect("sqlite::memory:").await.unwrap();
            sqlx::raw_sql(
                "CREATE TABLE listini_clienti (
                   id TEXT PRIMARY KEY, cliente TEXT, descrizione TEXT, prezzo_fattura REAL,
                   prezzo_acquisto REAL, acquisto_old TEXT, ricarico REAL, note TEXT, note1 TEXT,
                   note2 TEXT, created_at TEXT, updated_at TEXT, sync_revision TEXT
                ); INSERT INTO listini_clienti (id, cliente, descrizione, acquisto_old, prezzo_acquisto, ricarico)
                   VALUES ('cli_1', 'ACME', 'Articolo', '25 netto', 25, 18);",
            )
            .execute(&mut db)
            .await
            .unwrap();
            let row = serde_json::from_value(serde_json::json!({
                "cliente": "ACME", "descrizione": "Articolo", "acquisto_old": "  ", "prezzo_fattura": 0
            })).unwrap();
            assert_eq!(sync_rows(&mut db, vec![row]).await.unwrap().updated, 1);
            let values: (String, f64, f64, f64) =
                sqlx::query_as("SELECT acquisto_old, prezzo_fattura, prezzo_acquisto, ricarico FROM listini_clienti")
                    .fetch_one(&mut db)
                    .await
                    .unwrap();
            assert_eq!(values, ("25 netto".into(), 0.0, 25.0, 18.0));
        });
    }
}
