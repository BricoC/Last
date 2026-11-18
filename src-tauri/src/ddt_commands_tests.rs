use super::*;
use serde_json::json;

fn document(id: &str, line_ids: &[&str]) -> DdtSavePayload {
    let items: Vec<_> = line_ids.iter().enumerate().map(|(index, id)| json!({
        "id": id, "row_index": index + 1, "description": "Test", "unit": "NR", "quantity": "1",
        "unit_price_subunits": 100000, "discount_pct": "0", "net_amount_subunits": 100000,
        "vat_rate": 0, "vat_amount_subunits": 0, "purchase_price_subunits": 0
    })).collect();
    serde_json::from_value(json!({
        "id": id, "doc_number": 7, "year": 2026, "series": "", "doc_date": "2026-01-01",
        "status": "confermato", "is_emission": false, "updated_at": "2026-01-01T00:00:00Z",
        "updated_by": "original", "client_name": "Cliente", "client_phones_json": "[]",
        "transport_reason": "Vendita", "account_or_balance": "", "carriage_terms": "Franco",
        "total_taxable_subunits": 100000, "total_vat_subunits": 0,
        "total_document_subunits": 100000, "items": items,
    }))
    .unwrap()
}

#[test]
fn replacement_rolls_back_and_preserves_already_deleted_lines_on_retry() {
    tauri::async_runtime::block_on(async {
        let mut db = SqliteConnection::connect("sqlite::memory:").await.unwrap();
        crate::sqlite_test_support::create_ddt_schema(&mut db).await;

        write_ddt(&mut db, document("local", &["active", "in-trash"]), None)
            .await
            .unwrap();
        sqlx::query("UPDATE ddt_items SET deleted_at = 'previous' WHERE id = 'in-trash'")
            .execute(&mut db)
            .await
            .unwrap();

        let replace = Some(("local", "2026-02-02T00:00:00Z"));
        let err = write_ddt(&mut db, document("cloud", &["line", "line"]), replace)
            .await
            .unwrap_err();
        assert!(err.contains("più volte"));
        let headers: Vec<(String, Option<String>, String)> =
            sqlx::query_as("SELECT id, deleted_at, updated_by FROM ddt_documents")
                .fetch_all(&mut db)
                .await
                .unwrap();
        assert_eq!(headers, vec![("local".into(), None, "original".into())]);
        let before: Vec<(String, Option<String>)> =
            sqlx::query_as("SELECT id, deleted_at FROM ddt_items ORDER BY id")
                .fetch_all(&mut db)
                .await
                .unwrap();
        assert_eq!(
            before,
            vec![
                ("active".into(), None),
                ("in-trash".into(), Some("previous".into()))
            ]
        );

        write_ddt(&mut db, document("cloud", &["line"]), replace)
            .await
            .unwrap();
        let after: Vec<(String, Option<String>)> =
            sqlx::query_as("SELECT id, deleted_at FROM ddt_items ORDER BY id")
                .fetch_all(&mut db)
                .await
                .unwrap();
        assert_eq!(
            after,
            vec![
                ("active".into(), Some("2026-02-02T00:00:00Z".into())),
                ("in-trash".into(), Some("previous".into())),
                ("line".into(), None),
            ]
        );
    });
}
