use crate::sqlite_backup::{
    check_different_paths, has_sidecars, open_database, replace_active_database, StagedSnapshot,
};
use crate::sqlite_utils::{local_database_path, DATABASE_KEY};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, SqliteConnection};
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
) -> Result<std::path::PathBuf, String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err(format!("Percorso {label} vuoto non valido"));
    }
    let path = Path::new(trimmed);
    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err(format!(
                "Percorso {label} con traversal '..' non consentito"
            ));
        }
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

/// Scrive un pacchetto di backup testuale (JSON / .lastbackup)
#[tauri::command]
pub fn write_backup_file(file_path: String, content: String) -> Result<u64, String> {
    let path = validate_file_path_with_extensions(&file_path, &["lastbackup", "json"], "backup")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Errore creazione cartella di destinazione: {}", e))?;
    }
    fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Errore scrittura file backup: {}", e))?;
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
    let path = validate_file_path_with_extensions(&file_path, &["lastbackup", "json"], "backup")?;
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
    let target = Path::new(&target_file_path);
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
) -> Result<u64, String> {
    use tauri_plugin_sql::{DbInstances, DbPool};
    let _operation = BACKUP_FILE_OPERATION.lock().await;
    let db_path = local_database_path(&app)?;
    let source_path = Path::new(&source_file_path);
    check_different_paths(source_path, &db_path)?;

    let stage = StagedSnapshot::new(&db_path)?;
    let mut source = open_database(source_path, true).await?;
    stage.capture(&mut source).await?;
    source.close().await.map_err(|error| error.to_string())?;
    stage.validate(true).await?;

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
                return Err(format!(
                    "Ripristino completato, ma riapertura del database fallita: {reopen_error}"
                ));
            }
        }
    }
    result
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
            if (fname.contains(&date_str) || fname.contains(&date_dot))
                && (fname.ends_with(".db")
                    || fname.ends_with(".lastbackup")
                    || fname.ends_with(".json"))
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
    )?;
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
    let path = Path::new(&file_path);
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
