use crate::sqlite_backup::{
    check_different_paths, has_sidecars, open_database, replace_active_database, StagedSnapshot,
};
use crate::sqlite_utils::{local_database_path, DATABASE_KEY};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{AssertSqlSafe, Column, Connection, Row, SqliteConnection, TypeInfo, ValueRef};
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Serialize, Deserialize, Clone)]
pub struct TableInspectionInfo {
    pub name: String,
    pub count: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BackupInspectionResult {
    pub file_name: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub tables_count: usize,
    pub total_records: i64,
    pub tables: Vec<TableInspectionInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BackupFileInfo {
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_iso: String,
    pub backup_type: String, // "full_db" | "modular_json" | "unknown"
}

/// Restituisce il percorso del Desktop dell'utente corrente (su Windows USERPROFILE o OneDrive)
#[tauri::command]
pub fn get_default_desktop_folder() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let desktop = std::path::PathBuf::from(&userprofile).join("Desktop");
            if desktop.exists() {
                return Ok(desktop.to_string_lossy().to_string());
            }
        }
        if let Ok(onedrive) = std::env::var("OneDrive") {
            let desktop = std::path::PathBuf::from(&onedrive).join("Desktop");
            if desktop.exists() {
                return Ok(desktop.to_string_lossy().to_string());
            }
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let desktop = std::path::PathBuf::from(&home).join("Desktop");
        if desktop.exists() {
            return Ok(desktop.to_string_lossy().to_string());
        }
    }
    Ok(String::new())
}

fn validate_file_path_with_extensions(
    file_path: &str,
    allowed_extensions: &[&str],
    label: &str,
    allow_unc: bool,
) -> Result<std::path::PathBuf, String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err(format!("Percorso {label} vuoto non valido"));
    }
    let path = Path::new(trimmed);
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                return Err(format!(
                    "Percorso {label} con traversal '..' non consentito"
                ));
            }
            std::path::Component::Prefix(prefix) => {
                if !allow_unc
                    && matches!(
                        prefix.kind(),
                        std::path::Prefix::UNC(_, _) | std::path::Prefix::VerbatimUNC(_, _)
                    )
                {
                    return Err(format!("Percorso di rete UNC non consentito per {label}"));
                }
            }
            _ => {}
        }
    }
    let file_name_lower = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.to_ascii_lowercase())
        .unwrap_or_default();
    if matches!(
        file_name_lower.as_str(),
        "supabase.local.json"
            | "supabase.management.local.json"
            | "supabase.session.local.bin"
            | "supabase.session.dev.local.bin"
    ) {
        return Err(format!(
            "Accesso a file di configurazione interno non consentito per {label}"
        ));
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !allowed_extensions.iter().any(|allowed| *allowed == ext) {
        return Err(format!(
            "Estensione file non consentita per {label}: .{ext}"
        ));
    }
    if let Ok(meta) = fs::symlink_metadata(path) {
        if meta.file_type().is_symlink() {
            return Err(format!("Collegamento simbolico non consentito per {label}"));
        }
        let canonical = fs::canonicalize(path)
            .map_err(|e| format!("Impossibile risolvere percorso {label}: {e}"))?;
        let canon_ext = canonical
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if !allowed_extensions
            .iter()
            .any(|allowed| *allowed == canon_ext)
        {
            return Err(format!(
                "Estensione file risolto non consentita per {label}: .{canon_ext}"
            ));
        }
    }
    Ok(path.to_path_buf())
}

/// Apre la finestra di dialogo nativa Windows per selezionare una cartella
#[tauri::command]
pub fn select_folder_dialog(default_path: Option<String>) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use base64::{engine::general_purpose, Engine as _};
        let initial_b64 = general_purpose::STANDARD.encode(default_path.unwrap_or_default());
        let ps_script = format!(
            r#"
            function _d($s) {{ [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($s)) }}
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = "Seleziona la cartella per i backup di Last"
            $dialog.ShowNewFolderButton = $true
            $initialFolder = _d '{initial_b64}'
            if ($initialFolder -ne '' -and (Test-Path -LiteralPath $initialFolder -PathType Container)) {{
                $dialog.SelectedPath = $initialFolder
            }}
            $res = $dialog.ShowDialog()
            if ($res -eq [System.Windows.Forms.DialogResult]::OK) {{
                [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
                Write-Output $dialog.SelectedPath
            }}
            "#
        );

        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &ps_script,
        ]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let output = cmd
            .output()
            .map_err(|e| format!("Errore esecuzione selettore cartella: {}", e))?;
        let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if res.is_empty() {
            Ok(None)
        } else {
            Ok(Some(res))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

/// Apre la finestra di dialogo nativa Windows per selezionare un file di backup da importare
#[tauri::command]
pub fn select_backup_file_dialog() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let ps_script = r#"
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.OpenFileDialog
            $dialog.Filter = "Tutti i Backup Last (*.lastbackup;*.json;*.db)|*.lastbackup;*.json;*.db|Backup Modulare (*.lastbackup;*.json)|*.lastbackup;*.json|Database Completo (*.db)|*.db|Tutti i file (*.*)|*.*"
            $dialog.Title = "Seleziona il file di backup da importare"
            $dialog.CheckFileExists = $true
            $res = $dialog.ShowDialog()
            if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
                [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
                Write-Output $dialog.FileName
            }
        "#;

        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            ps_script,
        ]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let output = cmd
            .output()
            .map_err(|e| format!("Errore esecuzione selettore file: {}", e))?;
        let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if res.is_empty() {
            Ok(None)
        } else {
            Ok(Some(res))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

/// Apre la cartella in Esplora Risorse di Windows
#[tauri::command]
pub fn open_folder_in_explorer(folder_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let path = Path::new(&folder_path);
        if !path.exists() || !path.is_dir() {
            return Err(format!(
                "La cartella specificata non esiste o non è una directory: {}",
                folder_path
            ));
        }

        let canonical =
            fs::canonicalize(path).map_err(|e| format!("Percorso cartella non valido: {}", e))?;
        if !canonical.is_dir() {
            return Err("Il percorso indicato non è una directory valida.".to_string());
        }

        let mut cmd = Command::new("explorer");
        cmd.arg(&canonical);
        cmd.spawn()
            .map_err(|e| format!("Impossibile aprire Esplora Risorse: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

/// Scrive un pacchetto di backup testuale (JSON / .lastbackup) in modo atomico (temp + sync + rename)
#[tauri::command]
pub fn write_backup_file(file_path: String, content: String) -> Result<u64, String> {
    use std::io::Write;
    let path =
        validate_file_path_with_extensions(&file_path, &["lastbackup", "json"], "backup", true)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Errore creazione cartella di destinazione: {}", e))?;
    }
    let tmp_name = format!(
        ".{}.tmp.{}",
        path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("backup"),
        std::process::id()
    );
    let tmp_path = path.with_file_name(tmp_name);
    let write_res = (|| -> Result<(), std::io::Error> {
        let mut f = fs::File::create(&tmp_path)?;
        f.write_all(content.as_bytes())?;
        f.sync_all()?;
        Ok(())
    })();
    if let Err(e) = write_res {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Errore scrittura file backup: {}", e));
    }
    if let Err(e) = fs::rename(&tmp_path, &path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Errore finalizzazione file backup: {}", e));
    }
    let len = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    Ok(len)
}

/// Scrive un file binario (es. Excel .xlsx) nella cartella scelta dall'utente
#[tauri::command]
pub fn write_binary_file(file_path: String, bytes: Vec<u8>) -> Result<u64, String> {
    let path = validate_file_path_with_extensions(
        &file_path,
        &["xlsx", "xlsm", "xls", "pdf", "csv"],
        "esportazione",
        false,
    )?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Errore creazione cartella di destinazione: {}", e))?;
    }
    fs::write(&path, &bytes).map_err(|e| format!("Errore scrittura file binario: {}", e))?;
    let len = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    Ok(len)
}

/// Legge il contenuto testuale di un file di backup
#[tauri::command]
pub fn read_backup_file(file_path: String) -> Result<String, String> {
    let path =
        validate_file_path_with_extensions(&file_path, &["lastbackup", "json"], "backup", true)?;
    if !path.exists() || !path.is_file() {
        return Err(format!("File non trovato: {}", file_path));
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Errore lettura file di backup: {}", e))?;
    Ok(content)
}

static BACKUP_FILE_OPERATION: tauri::async_runtime::Mutex<()> =
    tauri::async_runtime::Mutex::const_new(());

/// Writes a consistent SQLite snapshot before replacing the destination file.
#[tauri::command]
pub async fn copy_database_file(
    app: AppHandle,
    target_file_path: String,
    order_queue: String,
) -> Result<u64, String> {
    let _operation = BACKUP_FILE_OPERATION.lock().await;
    let db_path = local_database_path(&app)?;
    let target_buf =
        validate_file_path_with_extensions(&target_file_path, &["db"], "backup database", true)?;
    let target = target_buf.as_path();
    check_different_paths(&db_path, target)?;

    let stage = StagedSnapshot::new(target)?;
    let mut source = open_database(&db_path, true).await?;
    stage.capture(&mut source).await?;
    source.close().await.map_err(|error| error.to_string())?;
    stage.store_order_queue(&order_queue).await?;
    stage.validate(false).await?;
    stage.install(target)
}

/// Restores an independent snapshot of the selected database, including its WAL.
#[tauri::command]
pub async fn restore_database_file(
    app: AppHandle,
    source_file_path: String,
    clear_offline_queues: Option<bool>,
) -> Result<u64, String> {
    use tauri_plugin_sql::{DbInstances, DbPool};
    let _operation = BACKUP_FILE_OPERATION.lock().await;
    let db_path = local_database_path(&app)?;
    let source_buf = validate_file_path_with_extensions(
        &source_file_path,
        &["db"],
        "ripristino database",
        true,
    )?;
    let source_path = source_buf.as_path();
    check_different_paths(source_path, &db_path)?;

    let stage = StagedSnapshot::new(&db_path)?;
    let mut source = open_database(source_path, true).await?;
    stage.capture(&mut source).await?;
    source.close().await.map_err(|error| error.to_string())?;
    stage.validate(true).await?;
    if clear_offline_queues.unwrap_or(false) {
        stage.clear_offline_queues().await?;
    }

    // Stop local writers until the old database is consolidated and the swap completes.
    let state = app.state::<DbInstances>();
    let mut instances = state.0.write().await;
    let previous_options = match instances.remove(DATABASE_KEY) {
        Some(DbPool::Sqlite(pool)) => {
            let options = pool.connect_options();
            pool.close().await;
            Some(options)
        }
        None => None,
    };
    let result = replace_active_database(&db_path, &stage).await;
    // On success, intentionally keep DbInstances closed until relaunch() so no background
    // frontend timer or sync worker can read/write the unmigrated restored database.
    if result.is_err() {
        if let Some(options) = previous_options {
            match sqlx::SqlitePool::connect_with((*options).clone()).await {
                Ok(pool) => {
                    instances.insert(DATABASE_KEY.into(), DbPool::Sqlite(pool));
                }
                Err(reopen_error) => {
                    if let Err(error) = &result {
                        return Err(format!(
                            "{error}. Riapertura del database originale fallita: {reopen_error}"
                        ));
                    }
                }
            }
        }
    }
    result
}

const ALLOWED_BACKUP_EXPORT_TABLES: &[&str] = &[
    "listino_generale",
    "listini_clienti",
    "listino_generale_cestino",
    "listini_clienti_cestino",
    "listini_prezzi_log",
    "products",
    "supplier_price_list_files",
    "supplier_price_list_items",
    "ddt_documents",
    "ddt_items",
    "ddt_logs",
    "ddt_sync_snapshots",
    "clients",
    "suppliers",
    "supplier_invoices",
    "supplier_invoice_items",
    "notes",
    "notes_trash",
    "note_deletions",
    "offers",
    "offers_trash",
    "quotes",
    "quote_items",
    "quotes_trash",
    "quote_sequences",
    "quote_favorite_items",
    "orders",
    "order_audit_logs",
    "company_settings",
    "email_settings",
    "app_preferences",
    "app_users",
];

fn sqlite_row_to_json(row: &sqlx::sqlite::SqliteRow) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for (idx, col) in row.columns().iter().enumerate() {
        let name = col.name().to_string();
        let val = match row.try_get_raw(idx) {
            Ok(raw) if raw.is_null() => serde_json::Value::Null,
            Ok(raw) => match raw.type_info().name() {
                "INTEGER" | "INT" | "BIGINT" => row
                    .try_get::<i64, _>(idx)
                    .map(serde_json::Value::from)
                    .unwrap_or(serde_json::Value::Null),
                "REAL" | "FLOAT" | "DOUBLE" | "NUMERIC" => row
                    .try_get::<f64, _>(idx)
                    .ok()
                    .and_then(serde_json::Number::from_f64)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null),
                "BLOB" => row
                    .try_get::<Vec<u8>, _>(idx)
                    .map(|bytes| {
                        serde_json::Value::Array(
                            bytes.into_iter().map(serde_json::Value::from).collect(),
                        )
                    })
                    .unwrap_or(serde_json::Value::Null),
                _ => row
                    .try_get::<String, _>(idx)
                    .map(serde_json::Value::String)
                    .or_else(|_| row.try_get::<i64, _>(idx).map(serde_json::Value::from))
                    .or_else(|_| row.try_get::<f64, _>(idx).map(|f| serde_json::json!(f)))
                    .unwrap_or(serde_json::Value::Null),
            },
            Err(_) => serde_json::Value::Null,
        };
        map.insert(name, val);
    }
    serde_json::Value::Object(map)
}

/// Esporta le tabelle richieste in un'unica transazione di lettura SQLite (snapshot coerente).
#[tauri::command]
pub async fn export_modular_backup_tables(
    app: AppHandle,
    tables: Vec<String>,
    pending_scopes: Vec<String>,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    for table in &tables {
        if !ALLOWED_BACKUP_EXPORT_TABLES.contains(&table.as_str()) {
            return Err(format!(
                "Tabella non consentita nell'export backup: {table}"
            ));
        }
    }
    let db_path = local_database_path(&app)?;
    let mut conn = open_database(&db_path, true).await?;
    sqlx::query("BEGIN DEFERRED")
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Errore avvio transazione lettura backup: {e}"))?;

    let export_result: Result<serde_json::Map<String, serde_json::Value>, String> = async {
        let mut out = serde_json::Map::new();
        for table in &tables {
            let sql = format!("SELECT * FROM \"{table}\"");
            let rows = sqlx::query(AssertSqlSafe(sql))
                .fetch_all(&mut conn)
                .await
                .map_err(|e| format!("Errore lettura tabella {table}: {e}"))?;
            let json_rows: Vec<serde_json::Value> = rows.iter().map(sqlite_row_to_json).collect();
            out.insert(table.clone(), serde_json::Value::Array(json_rows));
        }
        if !pending_scopes.is_empty() {
            let placeholders = (1..=pending_scopes.len())
                .map(|i| format!("?{i}"))
                .collect::<Vec<_>>()
                .join(", ");
            let sql = format!(
                "SELECT * FROM \"pending_cloud_operations\" WHERE scope IN ({placeholders})"
            );
            let mut q = sqlx::query(AssertSqlSafe(sql));
            for scope in &pending_scopes {
                q = q.bind(scope);
            }
            let rows = q
                .fetch_all(&mut conn)
                .await
                .map_err(|e| format!("Errore lettura pending_cloud_operations: {e}"))?;
            let json_rows: Vec<serde_json::Value> = rows.iter().map(sqlite_row_to_json).collect();
            out.insert(
                "pending_cloud_operations".to_string(),
                serde_json::Value::Array(json_rows),
            );
        }
        Ok(out)
    }
    .await;

    let _ = sqlx::query("COMMIT").execute(&mut conn).await;
    let _ = conn.close().await;
    export_result
}

fn is_managed_backup_file(fname: &str, ext: &str) -> bool {
    if ext == "lastbackup" {
        return true;
    }
    if ext == "db" || ext == "json" {
        return fname.to_lowercase().starts_with("backup ");
    }
    false
}

/// Elenca i file di backup presenti nella cartella selezionata ordinati per data di modifica decrescente
#[tauri::command]
pub fn list_backups_in_directory(folder_path: String) -> Result<Vec<BackupFileInfo>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(path).map_err(|e| format!("Errore scansione cartella: {}", e))?;
    let mut files: Vec<(u64, BackupFileInfo)> = Vec::new();

    for entry in entries.flatten() {
        let fpath = entry.path();
        if fpath.is_file() {
            let fname = fpath
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let ext = fpath
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if is_managed_backup_file(&fname, &ext) {
                let meta = entry.metadata().ok();
                let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);

                let modified_secs = meta
                    .and_then(|m| m.modified().ok())
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let modified_iso = if modified_secs > 0 {
                    modified_secs.to_string()
                } else {
                    String::new()
                };

                let backup_type = if ext == "db" {
                    "full_db".to_string()
                } else if ext == "lastbackup" || ext == "json" {
                    "modular_json".to_string()
                } else {
                    "unknown".to_string()
                };

                files.push((
                    modified_secs,
                    BackupFileInfo {
                        filename: fname,
                        path: fpath.to_string_lossy().to_string(),
                        size_bytes,
                        modified_iso,
                        backup_type,
                    },
                ));
            }
        }
    }

    // Ordina dal più recente al più vecchio per timestamp di modifica reale (nome file solo come tie-breaker)
    files.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.filename.cmp(&a.1.filename)));

    Ok(files.into_iter().map(|(_, info)| info).collect())
}

/// Controlla se nella cartella condivisa esiste già un backup per la data specificata (es. "2026-11-07" o "2026.11.07")
#[tauri::command]
pub fn check_today_backup_exists(
    folder_path: String,
    date_str: String,
) -> Result<Option<String>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Ok(None);
    }

    let date_dot = date_str.replace('-', ".");
    let entries = fs::read_dir(path).map_err(|e| format!("Errore lettura cartella: {}", e))?;
    for entry in entries.flatten() {
        let fpath = entry.path();
        if fpath.is_file() {
            let fname = fpath.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let ext = fpath
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let non_empty = fs::metadata(&fpath).map(|m| m.len() > 0).unwrap_or(false);
            if non_empty
                && is_managed_backup_file(fname, &ext)
                && (fname.contains(&date_str) || fname.contains(&date_dot))
            {
                return Ok(Some(fname.to_string()));
            }
        }
    }

    Ok(None)
}

/// Mantiene solo i più recenti `keep_count` backup nella cartella, eliminando i file eccedenti (FIFO a 15 elementi)
#[tauri::command]
pub fn clean_old_backups(folder_path: String, keep_count: usize) -> Result<usize, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Ok(0);
    }

    let list = list_backups_in_directory(folder_path)?;
    if list.len() <= keep_count {
        return Ok(0);
    }

    // I file oltre `keep_count` sono i più vecchi e vengono rimossi
    let to_delete = &list[keep_count..];
    let mut deleted_count = 0;

    for item in to_delete {
        let fpath = Path::new(&item.path);
        if fpath.is_file()
            && (item.backup_type != "full_db" || matches!(has_sidecars(fpath), Ok(false)))
            && fs::remove_file(fpath).is_ok()
        {
            deleted_count += 1;
        }
    }

    Ok(deleted_count)
}

/// Elimina un singolo file di backup
#[tauri::command]
pub fn delete_backup_file(file_path: String) -> Result<(), String> {
    let path = validate_file_path_with_extensions(
        &file_path,
        &["lastbackup", "json", "db"],
        "eliminazione backup",
        true,
    )?;
    let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !is_managed_backup_file(fname, &ext) {
        return Err("Il file indicato non è un backup gestito da Last".to_string());
    }
    if path.exists() && path.is_file() {
        fs::remove_file(&path).map_err(|e| format!("Errore eliminazione file: {}", e))?;
    }
    Ok(())
}

/// Ispeziona un file di database SQLite (.db) e conta analiticamente tutte le tabelle e i record
#[tauri::command]
pub async fn inspect_sqlite_backup_file(
    file_path: String,
) -> Result<BackupInspectionResult, String> {
    let path_buf =
        validate_file_path_with_extensions(&file_path, &["db"], "ispezione backup", true)?;
    let path = path_buf.as_path();
    if !path.exists() {
        return Err(format!("File non trovato: {}", file_path));
    }

    let meta = fs::metadata(path).map_err(|e| format!("Errore metadati file: {}", e))?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let options = SqliteConnectOptions::new().filename(path).read_only(true);

    let mut conn = SqliteConnection::connect_with(&options)
        .await
        .map_err(|e| format!("Impossibile aprire il database SQLite: {}", e))?;

    let table_names = sqlx::query_scalar::<_, String>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| format!("Errore lettura schema tabelle: {}", e))?;

    let mut tables = Vec::new();
    let mut total_records: i64 = 0;

    for name in table_names {
        let escaped_name = name.replace('"', "\"\"");
        let count_query = format!("SELECT COUNT(*) FROM \"{}\"", escaped_name);
        let count = sqlx::query_scalar::<_, i64>(sqlx::AssertSqlSafe(count_query))
            .fetch_one(&mut conn)
            .await
            .map_err(|e| format!("Errore conteggio tabella '{}': {}", name, e))?;

        total_records += count;
        tables.push(TableInspectionInfo { name, count });
    }

    Ok(BackupInspectionResult {
        file_name,
        file_path,
        size_bytes: meta.len(),
        tables_count: tables.len(),
        total_records,
        tables,
    })
}

#[cfg(test)]
mod tests {
    use super::validate_file_path_with_extensions;

    #[test]
    fn backup_paths_allow_unc_while_exports_reject_unc() {
        let unc = r"\\SERVER\Share\LastBackups\Backup 2026.11.27.db";
        assert!(validate_file_path_with_extensions(unc, &["db"], "backup", true).is_ok());
        assert!(
            validate_file_path_with_extensions(unc, &["xlsx", "db"], "esportazione", false)
                .is_err()
        );
        assert!(validate_file_path_with_extensions(
            r"\\SERVER\Share\..\escape.db",
            &["db"],
            "backup",
            true
        )
        .is_err());
    }
}
