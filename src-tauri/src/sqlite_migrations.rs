use crate::sqlite_batch::SqliteWrite;
use serde::Deserialize;
use sqlx::{AssertSqlSafe, Connection, SqliteConnection};
use std::collections::HashSet;
use tauri::State;
use tauri_plugin_sql::DbInstances;

const CREATE_HISTORY: &str = "CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
    )";

#[derive(Deserialize)]
pub struct LocalMigration {
    version: i64,
    name: String,
    steps: Vec<MigrationStep>,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum MigrationStep {
    Write {
        write: SqliteWrite,
    },
    AddColumn {
        table: String,
        column: String,
        definition: String,
        backfill: Option<String>,
    },
    RequireEmpty {
        sql: String,
        message: String,
    },
}

#[tauri::command]
pub async fn run_local_migrations(
    db_instances: State<'_, DbInstances>,
    migrations: Vec<LocalMigration>,
) -> Result<(), String> {
    let mut connection = crate::sqlite_utils::acquire_configured_connection(&db_instances).await?;
    sqlx::query(CREATE_HISTORY)
        .execute(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    let applied: HashSet<i64> = sqlx::query_scalar("SELECT version FROM schema_migrations")
        .fetch_all(&mut *connection)
        .await
        .map_err(|error| error.to_string())?
        .into_iter()
        .collect();
    for migration in migrations
        .into_iter()
        .filter(|item| !applied.contains(&item.version))
    {
        let label = format!(
            "Migrazione SQLite {} ({})",
            migration.version, migration.name
        );
        apply_migration(&mut connection, migration)
            .await
            .map_err(|error| format!("{label}: {error}"))?;
    }
    Ok(())
}

async fn apply_migration(
    connection: &mut SqliteConnection,
    migration: LocalMigration,
) -> Result<(), String> {
    let mut transaction = connection
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())?;
    // Another application instance may have migrated since the initial read.
    let applied: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)")
            .bind(migration.version)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    if !applied {
        for step in migration.steps {
            apply_migration_step(&mut transaction, step).await?;
        }
        sqlx::query(
            "INSERT INTO schema_migrations (version, name, applied_at)
             VALUES ($1, $2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(migration.version)
        .bind(migration.name)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())
}

async fn apply_migration_step(
    connection: &mut SqliteConnection,
    step: MigrationStep,
) -> Result<(), String> {
    match step {
        MigrationStep::Write { write } => write.execute(connection).await?,
        MigrationStep::RequireEmpty { sql, message } => {
            let conflicts: Vec<String> = sqlx::query_scalar(AssertSqlSafe(sql.as_str()))
                .fetch_all(connection)
                .await
                .map_err(|error| error.to_string())?;
            if !conflicts.is_empty() {
                return Err(format!("{message} {}", conflicts.join(", ")));
            }
        }
        MigrationStep::AddColumn {
            table,
            column,
            definition,
            backfill,
        } => {
            for identifier in [&table, &column] {
                if identifier.is_empty()
                    || !identifier
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
                {
                    return Err(format!("Identificatore SQLite non valido: {identifier}"));
                }
            }
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info($1) WHERE lower(name) = lower($2))",
            )
            .bind(&table)
            .bind(&column)
            .fetch_one(&mut *connection)
            .await
            .map_err(|error| error.to_string())?;
            if !exists {
                // Identifiers are validated above and definitions come from the app's migration plan.
                sqlx::query(AssertSqlSafe(format!(
                    "ALTER TABLE \"{table}\" ADD COLUMN \"{column}\" {definition}"
                )))
                .execute(&mut *connection)
                .await
                .map_err(|error| error.to_string())?;
                if let Some(sql) = backfill {
                    sqlx::query(AssertSqlSafe(sql.as_str()))
                        .execute(connection)
                        .await
                        .map_err(|error| error.to_string())?;
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn migration(steps: serde_json::Value) -> LocalMigration {
        serde_json::from_value(json!({ "version": 1, "name": "test", "steps": steps })).unwrap()
    }

    #[test]
    fn failed_migration_rolls_back_schema_and_history_and_can_be_retried() {
        tauri::async_runtime::block_on(async {
            let mut db = SqliteConnection::connect("sqlite::memory:").await.unwrap();
            sqlx::query(CREATE_HISTORY).execute(&mut db).await.unwrap();
            sqlx::raw_sql(
                "CREATE TABLE sample (id INTEGER PRIMARY KEY); INSERT INTO sample VALUES (1);",
            )
            .execute(&mut db)
            .await
            .unwrap();
            let broken = migration(json!([
                {"kind":"addColumn","table":"sample","column":"detail","definition":"TEXT",
                 "backfill":"UPDATE sample SET detail = 'originale'"},
                {"kind":"write","write":{"sql":"INSERT INTO sample (id) VALUES (1)","params":[]}}
            ]));
            assert!(apply_migration(&mut db, broken).await.is_err());
            let has_detail: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('sample') WHERE name = 'detail')",
            )
            .fetch_one(&mut db)
            .await
            .unwrap();
            let applied: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM schema_migrations")
                .fetch_one(&mut db)
                .await
                .unwrap();
            assert!(!has_detail);
            assert_eq!(applied, 0);

            let steps = json!([
                {"kind":"addColumn","table":"sample","column":"detail","definition":"TEXT",
                 "backfill":"UPDATE sample SET detail = 'originale'"},
                {"kind":"write","write":{"sql":"INSERT INTO sample (id) VALUES ($1)","params":[2]}}
            ]);
            apply_migration(&mut db, migration(steps.clone()))
                .await
                .unwrap();
            apply_migration(&mut db, migration(steps)).await.unwrap();
            let detail: String = sqlx::query_scalar("SELECT detail FROM sample WHERE id = 1")
                .fetch_one(&mut db)
                .await
                .unwrap();
            let applied: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM schema_migrations")
                .fetch_one(&mut db)
                .await
                .unwrap();
            assert_eq!(detail, "originale");
            assert_eq!(applied, 1);
        });
    }
}
