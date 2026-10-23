use crate::quote_types::QuoteSavePayload;
use sqlx::{QueryBuilder, Sqlite, SqliteConnection};
use std::collections::HashSet;

pub(crate) async fn persist_quote(
    connection: &mut SqliteConnection,
    payload: QuoteSavePayload,
) -> Result<(), String> {
    if !["bozza", "inviato", "confermato", "rifiutato"].contains(&payload.status.as_str()) {
        return Err("Stato preventivo non valido".to_string());
    }
    if payload.status == "confermato" {
        let is_existing_confirmed = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM quotes WHERE id = ? AND status = 'confermato' AND deleted_at IS NULL",
        )
        .bind(&payload.id)
        .fetch_one(&mut *connection)
        .await
        .map_err(|error| error.to_string())?
            > 0;
        if !is_existing_confirmed {
            return Err(
                "Un preventivo può essere confermato solo durante la conversione in DDT".to_string(),
            );
        }
    }
    persist_header(connection, &payload).await?;

    let active_ids = sqlx::query_scalar::<_, String>(
        "SELECT id FROM quote_items WHERE quote_id = ? AND deleted_at IS NULL",
    )
    .bind(&payload.id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| error.to_string())?;
    let mut incoming_ids = HashSet::new();

    for item in &payload.items {
        if !incoming_ids.insert(item.id.clone()) {
            return Err(format!("La riga preventivo {} è duplicata", item.id));
        }
        persist_item(
            connection,
            &payload.id,
            &payload.updated_at,
            &payload.updated_by,
            item,
        )
        .await?;
    }

    for item_id in active_ids {
        if !incoming_ids.contains(&item_id) {
            sqlx::query(
                "UPDATE quote_items SET deleted_at = ?, updated_at = ?, updated_by = ?, sync_status = 'pending'
                 WHERE id = ? AND quote_id = ? AND deleted_at IS NULL",
            )
            .bind(&payload.updated_at)
            .bind(&payload.updated_at)
            .bind(&payload.updated_by)
            .bind(item_id)
            .bind(&payload.id)
            .execute(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

async fn persist_header(
    connection: &mut SqliteConnection,
    payload: &QuoteSavePayload,
) -> Result<(), String> {
    let mut query = QueryBuilder::<Sqlite>::new(
        "INSERT INTO quotes (
          id, quote_number, year, quote_date, status, client_id, client_name, client_address,
          client_city, client_postal_code, client_province, client_vat, client_fiscal_code,
          client_sdi, client_pec, client_phones_json, destination_name, destination_address,
          destination_city, subject, global_discount_pct, validity_days, payment_method,
          delivery_date, delivery_terms, default_supplier, internal_notes, customer_notes,
          converted_ddt_id, total_taxable_subunits, total_vat_subunits, total_document_subunits,
          total_cost_subunits, total_profit_subunits, created_at, updated_at, updated_by, sync_status
        ) ",
    );
    query.push_values(std::iter::once(payload), |mut row, quote| {
        row.push_bind(&quote.id)
            .push_bind(Option::<i64>::None)
            .push_bind(quote.year)
            .push_bind(&quote.quote_date)
            .push_bind(&quote.status)
            .push_bind(&quote.client_id)
            .push_bind(&quote.client_name)
            .push_bind(&quote.client_address)
            .push_bind(&quote.client_city)
            .push_bind(&quote.client_postal_code)
            .push_bind(&quote.client_province)
            .push_bind(&quote.client_vat)
            .push_bind(&quote.client_fiscal_code)
            .push_bind(&quote.client_sdi)
            .push_bind(&quote.client_pec)
            .push_bind(&quote.client_phones_json)
            .push_bind(&quote.destination_name)
            .push_bind(&quote.destination_address)
            .push_bind(&quote.destination_city)
            .push_bind(&quote.subject)
            .push_bind(&quote.global_discount_pct)
            .push_bind(quote.validity_days)
            .push_bind(&quote.payment_method)
            .push_bind(&quote.delivery_date)
            .push_bind(&quote.delivery_terms)
            .push_bind(&quote.default_supplier)
            .push_bind(&quote.internal_notes)
            .push_bind(&quote.customer_notes)
            .push_bind(Option::<String>::None)
            .push_bind(quote.total_taxable_subunits)
            .push_bind(quote.total_vat_subunits)
            .push_bind(quote.total_document_subunits)
            .push_bind(quote.total_cost_subunits)
            .push_bind(quote.total_profit_subunits)
            .push_bind(&quote.created_at)
            .push_bind(&quote.updated_at)
            .push_bind(&quote.updated_by)
            .push_bind("pending");
    });
    query.push(
        " ON CONFLICT(id) DO UPDATE SET
          year = excluded.year, quote_date = excluded.quote_date, status = excluded.status,
          client_id = excluded.client_id, client_name = excluded.client_name,
          client_address = excluded.client_address, client_city = excluded.client_city,
          client_postal_code = excluded.client_postal_code, client_province = excluded.client_province,
          client_vat = excluded.client_vat, client_fiscal_code = excluded.client_fiscal_code,
          client_sdi = excluded.client_sdi, client_pec = excluded.client_pec,
          client_phones_json = excluded.client_phones_json, destination_name = excluded.destination_name,
          destination_address = excluded.destination_address, destination_city = excluded.destination_city,
          subject = excluded.subject, global_discount_pct = excluded.global_discount_pct,
          validity_days = excluded.validity_days, payment_method = excluded.payment_method,
          delivery_date = excluded.delivery_date, delivery_terms = excluded.delivery_terms,
          default_supplier = excluded.default_supplier, internal_notes = excluded.internal_notes,
          customer_notes = excluded.customer_notes, total_taxable_subunits = excluded.total_taxable_subunits,
          total_vat_subunits = excluded.total_vat_subunits, total_document_subunits = excluded.total_document_subunits,
          total_cost_subunits = excluded.total_cost_subunits, total_profit_subunits = excluded.total_profit_subunits,
          updated_at = excluded.updated_at, updated_by = excluded.updated_by, sync_status = 'pending'
          WHERE quotes.deleted_at IS NULL",
    );
    let result = query
        .build()
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    if result.rows_affected() == 0 {
        return Err("Il preventivo è archiviato o non può essere aggiornato".to_string());
    }
    Ok(())
}

async fn persist_item(
    connection: &mut SqliteConnection,
    quote_id: &str,
    updated_at: &str,
    updated_by: &str,
    item: &crate::quote_types::QuoteItemPayload,
) -> Result<(), String> {
    let mut query = QueryBuilder::<Sqlite>::new(
        "INSERT INTO quote_items (
          id, quote_id, row_index, product_id, supplier, supplier_item_code, code, description,
          unit, quantity, purchase_price_subunits, markup_pct, base_unit_price_subunits,
          effective_unit_price_subunits, forced_unit_price_subunits, discount_pct,
          effective_markup_pct, margin_pct, net_amount_subunits, cost_total_subunits,
          gross_profit_subunits, vat_rate, vat_amount_subunits, availability, notes,
          created_at, updated_at, updated_by, deleted_at, sync_status
        ) ",
    );
    query.push_values(std::iter::once(item), |mut row, value| {
        row.push_bind(&value.id)
            .push_bind(quote_id)
            .push_bind(value.row_index)
            .push_bind(&value.product_id)
            .push_bind(&value.supplier)
            .push_bind(&value.supplier_item_code)
            .push_bind(&value.code)
            .push_bind(&value.description)
            .push_bind(&value.unit)
            .push_bind(&value.quantity)
            .push_bind(value.purchase_price_subunits)
            .push_bind(&value.markup_pct)
            .push_bind(value.base_unit_price_subunits)
            .push_bind(value.effective_unit_price_subunits)
            .push_bind(value.forced_unit_price_subunits)
            .push_bind(&value.discount_pct)
            .push_bind(&value.effective_markup_pct)
            .push_bind(&value.margin_pct)
            .push_bind(value.net_amount_subunits)
            .push_bind(value.cost_total_subunits)
            .push_bind(value.gross_profit_subunits)
            .push_bind(value.vat_rate)
            .push_bind(value.vat_amount_subunits)
            .push_bind(&value.availability)
            .push_bind(&value.notes)
            .push_bind(updated_at)
            .push_bind(updated_at)
            .push_bind(updated_by)
            .push_bind(Option::<String>::None)
            .push_bind("pending");
    });
    query.push(
        " ON CONFLICT(id) DO UPDATE SET row_index = excluded.row_index,
          product_id = excluded.product_id, supplier = excluded.supplier,
          supplier_item_code = excluded.supplier_item_code, code = excluded.code,
          description = excluded.description, unit = excluded.unit, quantity = excluded.quantity,
          purchase_price_subunits = excluded.purchase_price_subunits, markup_pct = excluded.markup_pct,
          base_unit_price_subunits = excluded.base_unit_price_subunits,
          effective_unit_price_subunits = excluded.effective_unit_price_subunits,
          forced_unit_price_subunits = excluded.forced_unit_price_subunits,
          discount_pct = excluded.discount_pct, effective_markup_pct = excluded.effective_markup_pct,
          margin_pct = excluded.margin_pct, net_amount_subunits = excluded.net_amount_subunits,
          cost_total_subunits = excluded.cost_total_subunits, gross_profit_subunits = excluded.gross_profit_subunits,
          vat_rate = excluded.vat_rate, vat_amount_subunits = excluded.vat_amount_subunits,
          availability = excluded.availability, notes = excluded.notes,
          updated_at = excluded.updated_at, updated_by = excluded.updated_by, sync_status = 'pending'
          WHERE quote_items.quote_id = excluded.quote_id AND quote_items.deleted_at IS NULL",
    );
    let result = query
        .build()
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    if result.rows_affected() == 0 {
        return Err(format!("La riga preventivo {} non è aggiornabile", item.id));
    }
    Ok(())
}
