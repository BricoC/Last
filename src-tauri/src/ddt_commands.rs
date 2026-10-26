use crate::ddt_types::DdtSavePayload;
use std::collections::HashSet;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

const DATABASE_KEY: &str = "sqlite:LastData.db";

#[tauri::command]
pub async fn save_ddt_transaction(
    db_instances: State<'_, DbInstances>,
    payload: DdtSavePayload,
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

    let result = persist_ddt(&mut connection, payload).await;
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

pub(crate) async fn persist_ddt(
    connection: &mut sqlx::SqliteConnection,
    mut payload: DdtSavePayload,
) -> Result<(), String> {
    if payload.is_emission && payload.doc_number.is_none() {
        payload.doc_number = Some(
            sqlx::query_scalar::<_, i64>(
                "SELECT COALESCE(MAX(doc_number), 0) + 1 FROM ddt_documents
                 WHERE year = $1 AND deleted_at IS NULL",
            )
            .bind(payload.year)
            .fetch_one(&mut *connection)
            .await
            .map_err(|error| error.to_string())?,
        );
    }

    if let Some(doc_number) = payload.doc_number {
        let conflict = sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT id, deleted_at FROM ddt_documents
             WHERE year = $1 AND doc_number = $2 AND id <> $3 AND deleted_at IS NULL LIMIT 1",
        )
        .bind(payload.year)
        .bind(doc_number)
        .bind(&payload.id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(|error| format!("Impossibile verificare l'univocità del numero DDT: {error}"))?;
        if let Some((_existing_id, deleted_at)) = conflict {
            let state = if deleted_at.is_some() { "anche in un DDT cancellato" } else { "in un altro DDT" };
            return Err(format!(
                "Il DDT n. {doc_number}/{year} è già presente {state}. Il numero non può essere riutilizzato.",
                year = payload.year
            ));
        }
    }

    let existing = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM ddt_documents WHERE id = $1")
        .bind(&payload.id)
        .fetch_one(&mut *connection)
        .await
        .map_err(|error| error.to_string())?
        > 0;

    let status = if payload.is_emission {
        "confermato"
    } else {
        payload.status.as_str()
    };

    if existing {
        sqlx::query(
            "UPDATE ddt_documents SET doc_number = $1, year = $2, series = $3, doc_date = $4, status = $5,
             client_id = $6, client_name = $7, client_address = $8, client_city = $9, client_vat = $10,
             client_fiscal_code = $11, client_sdi = $12, client_phones_json = $13, destination_name = $14,
             destination_address = $15, destination_city = $16, transport_reason = $17, payment_method = $18,
             order_reference = $19, account_or_balance = $20, operator = $21, goods_appearance = $22,
             carriage_terms = $23, packages_count = $24, weight_kg = $25, carrier = $26, pickup_date_time = $27,
             internal_notes = $28, total_taxable_subunits = $29, total_vat_subunits = $30,
             total_document_subunits = $31, updated_at = $32, updated_by = $33, sync_status = 'pending'
             WHERE id = $34",
        )
        .bind(payload.doc_number)
        .bind(payload.year)
        .bind(&payload.series)
        .bind(&payload.doc_date)
        .bind(status)
        .bind(&payload.client_id)
        .bind(&payload.client_name)
        .bind(&payload.client_address)
        .bind(&payload.client_city)
        .bind(&payload.client_vat)
        .bind(&payload.client_fiscal_code)
        .bind(&payload.client_sdi)
        .bind(&payload.client_phones_json)
        .bind(&payload.destination_name)
        .bind(&payload.destination_address)
        .bind(&payload.destination_city)
        .bind(&payload.transport_reason)
        .bind(&payload.payment_method)
        .bind(&payload.order_reference)
        .bind(&payload.account_or_balance)
        .bind(&payload.operator)
        .bind(&payload.goods_appearance)
        .bind(&payload.carriage_terms)
        .bind(&payload.packages_count)
        .bind(&payload.weight_kg)
        .bind(&payload.carrier)
        .bind(&payload.pickup_date_time)
        .bind(&payload.internal_notes)
        .bind(payload.total_taxable_subunits)
        .bind(payload.total_vat_subunits)
        .bind(payload.total_document_subunits)
        .bind(&payload.updated_at)
        .bind(&payload.updated_by)
        .bind(&payload.id)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    } else {
        sqlx::query(
            "INSERT INTO ddt_documents (
             id, doc_number, year, series, doc_date, status, client_id, client_name, client_address,
             client_city, client_vat, client_fiscal_code, client_sdi, client_phones_json, destination_name,
             destination_address, destination_city, transport_reason, payment_method, order_reference,
             account_or_balance, operator, goods_appearance, carriage_terms, packages_count, weight_kg,
             carrier, pickup_date_time, internal_notes, total_taxable_subunits, total_vat_subunits,
             total_document_subunits, created_at, updated_at, updated_by, sync_status
             ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
             $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $33, $34, 'pending'
             )",
        )
        .bind(&payload.id)
        .bind(payload.doc_number)
        .bind(payload.year)
        .bind(&payload.series)
        .bind(&payload.doc_date)
        .bind(status)
        .bind(&payload.client_id)
        .bind(&payload.client_name)
        .bind(&payload.client_address)
        .bind(&payload.client_city)
        .bind(&payload.client_vat)
        .bind(&payload.client_fiscal_code)
        .bind(&payload.client_sdi)
        .bind(&payload.client_phones_json)
        .bind(&payload.destination_name)
        .bind(&payload.destination_address)
        .bind(&payload.destination_city)
        .bind(&payload.transport_reason)
        .bind(&payload.payment_method)
        .bind(&payload.order_reference)
        .bind(&payload.account_or_balance)
        .bind(&payload.operator)
        .bind(&payload.goods_appearance)
        .bind(&payload.carriage_terms)
        .bind(&payload.packages_count)
        .bind(&payload.weight_kg)
        .bind(&payload.carrier)
        .bind(&payload.pickup_date_time)
        .bind(&payload.internal_notes)
        .bind(payload.total_taxable_subunits)
        .bind(payload.total_vat_subunits)
        .bind(payload.total_document_subunits)
        .bind(&payload.updated_at)
        .bind(&payload.updated_by)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    }

    let active_ids = sqlx::query_scalar::<_, String>(
        "SELECT id FROM ddt_items WHERE ddt_id = $1 AND deleted_at IS NULL",
    )
    .bind(&payload.id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| error.to_string())?;
    let mut incoming_ids = HashSet::new();

    for item in payload.items {
        if !incoming_ids.insert(item.id.clone()) {
            return Err(format!("La riga DDT {} è presente più volte", item.id));
        }
        let result = sqlx::query(
            "INSERT INTO ddt_items (
             id, ddt_id, row_index, product_id, code, description, unit, quantity, unit_price_subunits,
             row_kind, discount_pct, net_amount_subunits, vat_rate, vat_amount_subunits, purchase_price_subunits,
             created_at, updated_at, updated_by, deleted_at, sync_status
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16, $17, NULL, 'pending')
             ON CONFLICT(id) DO UPDATE SET
             row_index = excluded.row_index, product_id = excluded.product_id, code = excluded.code,
             description = excluded.description, unit = excluded.unit, quantity = excluded.quantity,
             row_kind = excluded.row_kind,
             unit_price_subunits = excluded.unit_price_subunits, discount_pct = excluded.discount_pct,
             net_amount_subunits = excluded.net_amount_subunits, vat_rate = excluded.vat_rate,
             vat_amount_subunits = excluded.vat_amount_subunits,
             purchase_price_subunits = excluded.purchase_price_subunits, updated_at = excluded.updated_at,
             updated_by = excluded.updated_by, deleted_at = NULL, sync_status = 'pending'
             WHERE ddt_items.ddt_id = excluded.ddt_id AND ddt_items.deleted_at IS NULL",
        )
        .bind(&item.id)
        .bind(&payload.id)
        .bind(item.row_index)
        .bind(&item.product_id)
        .bind(&item.code)
        .bind(&item.description)
        .bind(&item.unit)
        .bind(&item.quantity)
        .bind(item.unit_price_subunits)
        .bind(&item.row_kind)
        .bind(&item.discount_pct)
        .bind(item.net_amount_subunits)
        .bind(item.vat_rate)
        .bind(item.vat_amount_subunits)
        .bind(item.purchase_price_subunits)
        .bind(&payload.updated_at)
        .bind(&payload.updated_by)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
        if result.rows_affected() == 0 {
            return Err(format!(
                "La riga DDT {} appartiene a un altro documento",
                item.id
            ));
        }
    }

    for id in active_ids {
        if !incoming_ids.contains(&id) {
            sqlx::query(
                "UPDATE ddt_items SET deleted_at = $1, updated_at = $1, updated_by = $2,
                 sync_status = 'pending' WHERE id = $3 AND ddt_id = $4 AND deleted_at IS NULL",
            )
            .bind(&payload.updated_at)
            .bind(&payload.updated_by)
            .bind(id)
            .bind(&payload.id)
            .execute(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}
