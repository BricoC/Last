use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, SqliteConnection};
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

static NEXT_SNAPSHOT: AtomicU64 = AtomicU64::new(0);

pub(crate) fn snapshot_suffix() -> String {
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = NEXT_SNAPSHOT.fetch_add(1, Ordering::Relaxed);
    format!("{time}-{}-{sequence}", std::process::id())
}

pub(crate) fn has_sidecars(path: &Path) -> Result<bool, String> {
    for suffix in ["-wal", "-shm", "-journal"] {
        let mut sidecar = OsString::from(path.as_os_str());
        sidecar.push(suffix);
        if Path::new(&sidecar)
            .try_exists()
            .map_err(|error| error.to_string())?
        {
            return Ok(true);
        }
    }
    Ok(false)
}

pub(crate) fn check_different_paths(source: &Path, target: &Path) -> Result<(), String> {
    let source = fs::canonicalize(source).map_err(|error| format!("Origine SQLite: {error}"))?;
    if target.try_exists().map_err(|error| error.to_string())? {
        let target =
            fs::canonicalize(target).map_err(|error| format!("Destinazione SQLite: {error}"))?;
        if source == target {
            return Err("Origine e destinazione del backup coincidono".into());
        }
    }
    Ok(())
}

pub(crate) async fn open_database(
    path: &Path,
    read_only: bool,
) -> Result<SqliteConnection, String> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .read_only(read_only)
        .busy_timeout(Duration::from_secs(30));
    SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| format!("Impossibile aprire il database SQLite: {error}"))
}

pub(crate) async fn checkpoint(connection: &mut SqliteConnection) -> Result<(), String> {
    let (busy, frames, written): (i64, i64, i64) =
        sqlx::query_as("PRAGMA wal_checkpoint(TRUNCATE)")
            .fetch_one(connection)
            .await
            .map_err(|error| format!("Checkpoint SQLite fallito: {error}"))?;
    if busy != 0 || frames != written {
        return Err(format!(
            "Checkpoint SQLite incompleto (busy={busy}, WAL={frames}, scritti={written})"
        ));
    }
    Ok(())
}

pub(crate) struct StagedSnapshot {
    directory: PathBuf,
    path: PathBuf,
}

impl StagedSnapshot {
    pub(crate) fn new(target: &Path) -> Result<Self, String> {
        let parent = target
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        fs::create_dir_all(parent).map_err(|error| format!("Cartella backup: {error}"))?;
        let directory = parent.join(format!(".last-snapshot-{}", snapshot_suffix()));
        fs::create_dir(&directory)
            .map_err(|error| format!("Cartella temporanea backup: {error}"))?;
        let path = directory.join("snapshot.db");
        Ok(Self { directory, path })
    }

    pub(crate) async fn capture(&self, source: &mut SqliteConnection) -> Result<(), String> {
        let path = self.path.to_str().ok_or("Percorso backup non valido")?;
        sqlx::query("VACUUM INTO $1")
            .bind(path)
            .execute(source)
            .await
            .map_err(|error| format!("Impossibile creare lo snapshot SQLite: {error}"))?;
        fs::OpenOptions::new()
            .write(true)
            .open(&self.path)
            .and_then(|file| file.sync_all())
            .map_err(|error| format!("Impossibile consolidare lo snapshot SQLite: {error}"))?;
        Ok(())
    }

    pub(crate) async fn validate(&self, require_last_schema: bool) -> Result<(), String> {
        let mut connection = open_database(&self.path, true).await?;
        let result: String = sqlx::query_scalar("PRAGMA quick_check(1)")
            .fetch_one(&mut connection)
            .await
            .map_err(|error| format!("Verifica dello snapshot SQLite fallita: {error}"))?;
        if result != "ok" {
            return Err(format!("Snapshot SQLite non integro: {result}"));
        }
        if require_last_schema {
            let table_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'
                 AND name IN ('schema_migrations', 'ddt_documents', 'ddt_items')",
            )
            .fetch_one(&mut connection)
            .await
            .map_err(|error| error.to_string())?;
            if table_count != 3 {
                return Err("Lo snapshot SQLite non contiene lo schema di Last".into());
            }
        }
        connection.close().await.map_err(|error| error.to_string())
    }

    pub(crate) fn install(&self, target: &Path) -> Result<u64, String> {
        if has_sidecars(target)? {
            return Err("La destinazione ha ancora file WAL, SHM o journal SQLite".into());
        }
        let len = fs::metadata(&self.path)
            .map_err(|error| error.to_string())?
            .len();
        // The stage is on the same volume. A failed rename leaves the original in place.
        fs::rename(&self.path, target)
            .map_err(|error| format!("Impossibile sostituire il file SQLite: {error}"))?;
        Ok(len)
    }
}

impl Drop for StagedSnapshot {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
        let _ = fs::remove_dir(&self.directory);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqliteJournalMode;

    #[test]
    fn restore_snapshot_includes_uncheckpointed_wal_and_replaces_existing_file() {
        tauri::async_runtime::block_on(async {
            let fixture =
                StagedSnapshot::new(&std::env::temp_dir().join("last-backup-test.db")).unwrap();
            let source = SqliteConnectOptions::new()
                .filename(&fixture.path)
                .create_if_missing(true)
                .journal_mode(SqliteJournalMode::Wal);
            let mut writer = SqliteConnection::connect_with(&source).await.unwrap();
            sqlx::raw_sql("PRAGMA wal_autocheckpoint = 0; CREATE TABLE data (value TEXT);")
                .execute(&mut writer)
                .await
                .unwrap();
            checkpoint(&mut writer).await.unwrap();
            sqlx::query("INSERT INTO data VALUES ('latest in WAL')")
                .execute(&mut writer)
                .await
                .unwrap();
            assert!(has_sidecars(&fixture.path).unwrap());

            let active = fixture.directory.join("active.db");
            fs::write(&active, b"original").unwrap();
            let stage = StagedSnapshot::new(&active).unwrap();
            let mut reader = open_database(&fixture.path, true).await.unwrap();
            stage.capture(&mut reader).await.unwrap();
            reader.close().await.unwrap();
            stage.validate(false).await.unwrap();

            let wal = active.with_file_name("active.db-wal");
            fs::write(&wal, b"sidecar").unwrap();
            assert!(stage.install(&active).is_err());
            assert_eq!(fs::read(&active).unwrap(), b"original");
            assert_eq!(fs::read(&wal).unwrap(), b"sidecar");
            fs::remove_file(wal).unwrap();

            #[cfg(windows)]
            {
                use std::os::windows::fs::OpenOptionsExt;
                let lock = fs::OpenOptions::new()
                    .read(true)
                    .share_mode(0)
                    .open(&active)
                    .unwrap();
                assert!(stage.install(&active).is_err());
                drop(lock);
                assert_eq!(fs::read(&active).unwrap(), b"original");
            }

            stage.install(&active).unwrap();
            let mut installed = open_database(&active, true).await.unwrap();
            let value: String = sqlx::query_scalar("SELECT value FROM data")
                .fetch_one(&mut installed)
                .await
                .unwrap();
            assert_eq!(value, "latest in WAL");
            installed.close().await.unwrap();
            writer.close().await.unwrap();
            fs::remove_file(active).unwrap();
        });
    }

    #[test]
    fn checkpoint_reports_busy_when_a_reader_pins_the_wal() {
        tauri::async_runtime::block_on(async {
            let fixture =
                StagedSnapshot::new(&std::env::temp_dir().join("last-checkpoint-test.db")).unwrap();
            let options = SqliteConnectOptions::new()
                .filename(&fixture.path)
                .create_if_missing(true)
                .journal_mode(SqliteJournalMode::Wal)
                .busy_timeout(Duration::ZERO);
            let mut writer = SqliteConnection::connect_with(&options).await.unwrap();
            sqlx::query("CREATE TABLE data (value TEXT)")
                .execute(&mut writer)
                .await
                .unwrap();
            checkpoint(&mut writer).await.unwrap();

            let mut reader = open_database(&fixture.path, true).await.unwrap();
            let mut read_transaction = reader.begin().await.unwrap();
            sqlx::query("SELECT * FROM data")
                .fetch_all(&mut *read_transaction)
                .await
                .unwrap();
            sqlx::query("INSERT INTO data VALUES ('new')")
                .execute(&mut writer)
                .await
                .unwrap();
            assert!(checkpoint(&mut writer)
                .await
                .unwrap_err()
                .contains("busy=1"));
            read_transaction.rollback().await.unwrap();
            reader.close().await.unwrap();
            checkpoint(&mut writer).await.unwrap();
            writer.close().await.unwrap();
        });
    }
}
