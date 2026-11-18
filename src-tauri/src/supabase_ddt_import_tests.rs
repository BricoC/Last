use super::*;
use crate::sqlite_test_support::create_ddt_schema;
use serde_json::json;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use std::time::Duration;

fn payload(number: i64) -> DdtImportPayload {
    serde_json::from_value(json!({
        "headers": [{
            "id": format!("cloud-{number}"), "docNumber": number, "year": 2026, "series": "",
            "docDate": "2026-03-01", "status": "confermato", "clientName": "Cliente", "clientPhonesJson": "[]",
            "transportReason": "Vendita", "accountOrBalance": "", "carriageTerms": "Franco",
            "totalTaxableSubunits": 0, "totalVatSubunits": 0, "totalDocumentSubunits": 0,
            "createdAt": "2026-03-01T00:00:00Z", "updatedAt": "2026-03-01T00:00:00Z"
        }],
        "lines": []
    })).unwrap()
}

#[test]
fn import_requires_the_write_lock_and_saves_distinct_pre_import_snapshots() {
    tauri::async_runtime::block_on(async {
        let folder = std::env::temp_dir().join(format!("last-ddt-import-{}", snapshot_suffix()));
        fs::create_dir(&folder).unwrap();
        let path = folder.join("active.db");
        let options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(Duration::ZERO);
        let mut competing = SqliteConnection::connect_with(&options).await.unwrap();
        create_ddt_schema(&mut competing).await;
        let mut importer = SqliteConnection::connect_with(&options).await.unwrap();
        let mut writer = competing.begin_with("BEGIN IMMEDIATE").await.unwrap();
        sqlx::query(
            "INSERT INTO ddt_documents
              (id, year, doc_number, doc_date, client_name, created_at, updated_at, updated_by)
             VALUES ('local', 2026, 7, '2026-03-01', 'Locale', 'originale', 'originale', 'locale')",
        )
        .execute(&mut *writer)
        .await
        .unwrap();

        let conflicting_payload = payload(7);
        let result =
            import_with_snapshot(&mut importer, &path, &folder, &conflicting_payload).await;
        assert!(matches!(result, Err(error) if error.contains("transazione")));
        assert!(!fs::read_dir(&folder).unwrap().flatten().any(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with("LastData.pre-supabase-ddt-import-")
        }));
        writer.commit().await.unwrap();

        let conflict = import_with_snapshot(&mut importer, &path, &folder, &conflicting_payload)
            .await
            .unwrap();
        assert_eq!((conflict.conflicts, conflict.imported_headers), (1, 0));
        assert!(conflict.backup_path.is_none());
        let first = import_with_snapshot(&mut importer, &path, &folder, &payload(8))
            .await
            .unwrap();
        let second = import_with_snapshot(&mut importer, &path, &folder, &payload(9))
            .await
            .unwrap();
        assert_eq!((first.imported_headers, second.imported_headers), (1, 1));
        let first_path = first.backup_path.unwrap();
        let second_path = second.backup_path.unwrap();
        assert_ne!(first_path, second_path);
        for (path, expected_count) in [(&first_path, 1), (&second_path, 2)] {
            let mut snapshot = open_database(Path::new(path), true).await.unwrap();
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ddt_documents")
                .fetch_one(&mut snapshot)
                .await
                .unwrap();
            assert_eq!(count, expected_count);
            snapshot.close().await.unwrap();
            fs::remove_file(path).unwrap();
        }
        importer.close().await.unwrap();
        competing.close().await.unwrap();
        fs::remove_file(path).unwrap();
        fs::remove_dir(folder).unwrap();
    });
}
