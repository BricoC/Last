use sqlx::SqliteConnection;

pub(crate) async fn create_ddt_schema(db: &mut SqliteConnection) {
    let migrations = include_str!("../../src/shared/data-layer/database.ts");
    for table in ["ddt_documents", "ddt_items"] {
        let definition = format!("CREATE TABLE IF NOT EXISTS {table}");
        let start = migrations.find(&definition).unwrap();
        let (sql, _) = migrations[start..].split_once('`').unwrap();
        sqlx::query(sql).execute(&mut *db).await.unwrap();
    }
    sqlx::raw_sql(
        "ALTER TABLE ddt_documents ADD COLUMN series TEXT NOT NULL DEFAULT '';
         ALTER TABLE ddt_items ADD COLUMN row_kind TEXT NOT NULL DEFAULT 'item';
         ALTER TABLE ddt_items ADD COLUMN deleted_at TEXT;
         ALTER TABLE ddt_items ADD COLUMN updated_by TEXT NOT NULL DEFAULT 'system';
         ALTER TABLE ddt_items ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
         CREATE UNIQUE INDEX ddt_number ON ddt_documents(year, doc_number)
           WHERE deleted_at IS NULL AND doc_number IS NOT NULL;",
    )
    .execute(&mut *db)
    .await
    .unwrap();
}
