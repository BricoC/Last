use serde::Deserialize;
use serde_json::Value;
use sqlx::{AssertSqlSafe, Connection, SqliteConnection};
use tauri::State;
use tauri_plugin_sql::DbInstances;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteWrite {
    sql: String,
    params: Vec<Value>,
    expected_rows: Option<u64>,
}

impl SqliteWrite {
    pub(crate) async fn execute(self, connection: &mut SqliteConnection) -> Result<(), String> {
        // The statement is application-authored; runtime values are bound below.
        let mut query = sqlx::query(AssertSqlSafe(self.sql.as_str()));
        for param in self.params {
            query = match param {
                Value::Null => query.bind(None::<String>),
                Value::Bool(value) => query.bind(value),
                Value::Number(value) => {
                    if let Some(integer) = value.as_i64() {
                        query.bind(integer)
                    } else {
                        query.bind(value.as_f64())
                    }
                }
                Value::String(value) => query.bind(value),
                _ => return Err("Parametro SQLite non scalare".into()),
            };
        }
        let affected = query
            .execute(connection)
            .await
            .map_err(|error| error.to_string())?
            .rows_affected();
        if self
            .expected_rows
            .is_some_and(|expected| affected != expected)
        {
            return Err("I dati locali sono cambiati durante l'operazione".into());
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn apply_local_database_batch(
    db_instances: State<'_, DbInstances>,
    writes: Vec<SqliteWrite>,
    validate_references_after_write: bool,
    reference_tables: Option<Vec<String>>,
) -> Result<(), String> {
    let mut connection = crate::sqlite_utils::acquire_configured_connection(&db_instances).await?;
    if validate_references_after_write {
        // Restore may replace a parent while retaining children outside the backup.
        // Keep those children and check the final references before committing.
        connection.close_on_drop();
        sqlx::query("PRAGMA foreign_keys = OFF")
            .execute(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
    }
    let references =
        validate_references_after_write.then(|| reference_tables.as_deref().unwrap_or_default());
    apply_batch(&mut connection, writes, references).await
}

async fn apply_batch(
    connection: &mut SqliteConnection,
    writes: Vec<SqliteWrite>,
    reference_tables: Option<&[String]>,
) -> Result<(), String> {
    let mut transaction = connection
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())?;
    let result = async {
        for (index, write) in writes.into_iter().enumerate() {
            write
                .execute(&mut transaction)
                .await
                .map_err(|error| format!("Operazione SQLite {}: {error}", index + 1))?;
        }
        if let Some(tables) = reference_tables {
            let scope = if tables.is_empty() {
                None
            } else {
                Some(serde_json::to_string(tables).map_err(|error| error.to_string())?)
            };
            let broken_reference = sqlx::query_scalar::<_, String>(
                "SELECT \"table\" FROM pragma_foreign_key_check
                 WHERE $1 IS NULL OR \"table\" IN (SELECT value FROM json_each($1))
                   OR parent IN (SELECT value FROM json_each($1))
                 LIMIT 1",
            )
            .bind(scope)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
            if let Some(table) = broken_reference {
                return Err(format!(
                    "Il ripristino lascerebbe riferimenti non validi in {table}"
                ));
            }
        }
        Ok(())
    }
    .await;

    if let Err(error) = result {
        return match transaction.rollback().await {
            Ok(()) => Err(error),
            Err(rollback) => Err(format!("{error}. Errore durante il rollback: {rollback}")),
        };
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(sql: &str) -> SqliteWrite {
        SqliteWrite {
            sql: sql.into(),
            params: vec![],
            expected_rows: None,
        }
    }

    #[test]
    fn failed_batch_rolls_back_previous_deletion_and_insert() {
        tauri::async_runtime::block_on(async {
            let mut connection = SqliteConnection::connect("sqlite::memory:").await.unwrap();
            sqlx::raw_sql(
                "CREATE TABLE data (id TEXT PRIMARY KEY, value TEXT NOT NULL);
                INSERT INTO data VALUES ('original', 'kept');",
            )
            .execute(&mut connection)
            .await
            .unwrap();
            let writes = vec![
                write("DELETE FROM data"),
                write("INSERT INTO data VALUES ('first', 'valid')"),
                write("INSERT INTO data VALUES ('second', NULL)"),
            ];
            assert!(apply_batch(&mut connection, writes, None).await.is_err());
            let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM data")
                .fetch_all(&mut connection)
                .await
                .unwrap();
            assert_eq!(ids, ["original"]);
        });
    }

    #[test]
    fn modular_restore_preserves_unselected_children_and_rejects_orphans() {
        tauri::async_runtime::block_on(async {
            let mut connection = SqliteConnection::connect("sqlite::memory:").await.unwrap();
            sqlx::raw_sql("CREATE TABLE parent (id TEXT PRIMARY KEY);
                CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id) ON DELETE CASCADE);
                INSERT INTO parent VALUES ('retained');
                INSERT INTO child VALUES ('child', 'retained');
                CREATE TABLE legacy_child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES other_parent(id));
                CREATE TABLE other_parent (id TEXT PRIMARY KEY);
                PRAGMA foreign_keys = OFF;
                INSERT INTO legacy_child VALUES ('legacy', 'missing');")
                .execute(&mut connection).await.unwrap();
            let scope = ["parent".to_string()];
            apply_batch(
                &mut connection,
                vec![
                    write("DELETE FROM parent"),
                    write("INSERT INTO parent VALUES ('retained')"),
                ],
                Some(&scope),
            )
            .await
            .unwrap();
            let failed = apply_batch(
                &mut connection,
                vec![write("DELETE FROM parent")],
                Some(&scope),
            )
            .await;
            assert!(failed.unwrap_err().contains("child"));
            let children: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM child")
                .fetch_one(&mut connection)
                .await
                .unwrap();
            let parents: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM parent")
                .fetch_one(&mut connection)
                .await
                .unwrap();
            assert_eq!((parents, children), (1, 1));
        });
    }
}
