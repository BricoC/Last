use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, SqliteConnection};
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
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

/// Apre la finestra di dialogo nativa Windows per selezionare una cartella
#[tauri::command]
pub fn select_folder_dialog(default_path: Option<String>) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let initial_folder = default_path.unwrap_or_default().replace('\'', "''");
        let ps_script = format!(
            r#"
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = "Seleziona la cartella per i backup di Last"
            $dialog.ShowNewFolderButton = $true
            if ('{}' -ne '' -and (Test-Path '{}')) {{
                $dialog.SelectedPath = '{}'
            }}
            $res = $dialog.ShowDialog()
            if ($res -eq [System.Windows.Forms.DialogResult]::OK) {{
                [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
                Write-Output $dialog.SelectedPath
            }}
            "#,
            initial_folder, initial_folder, initial_folder
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
        if !path.exists() {
            return Err(format!(
                "La cartella specificata non esiste: {}",
                folder_path
            ));
        }

        let mut cmd = Command::new("explorer");
        cmd.arg(&folder_path);
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
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Errore creazione cartella di destinazione: {}", e))?;
    }
    fs::write(path, content.as_bytes())
        .map_err(|e| format!("Errore scrittura file backup: {}", e))?;
    let len = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    Ok(len)
}

/// Legge il contenuto testuale di un file di backup
#[tauri::command]
pub fn read_backup_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File non trovato: {}", file_path));
    }
    let content =
        fs::read_to_string(path).map_err(|e| format!("Errore lettura file di backup: {}", e))?;
    Ok(content)
}

/// Crea uno snapshot fisico atomico e coerente del database SQLite LastData.db nella cartella di destinazione tramite VACUUM INTO
#[tauri::command]
pub async fn copy_database_file(app: AppHandle, target_file_path: String) -> Result<u64, String> {
    let mut db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Impossibile ottenere cartella app_data_dir: {}", e))?;
    db_path.push("LastData.db");

    if !db_path.exists() {
        return Err(format!(
            "Il database principale non esiste nel percorso: {:?}",
            db_path
        ));
    }

    let target_path = Path::new(&target_file_path);
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Errore creazione cartella destinazione: {}", e))?;
    }

    // Se il file di destinazione esiste già, rimuovilo prima di VACUUM INTO perché SQLite rifiuta di sovrascrivere
    if target_path.exists() {
        let _ = fs::remove_file(target_path);
    }

    // Connettiti a LastData.db ed esegui VACUUM INTO per ottenere uno snapshot ACID atomico al 100%
    let options = SqliteConnectOptions::new().filename(&db_path);
    let mut conn = SqliteConnection::connect_with(&options)
        .await
        .map_err(|e| format!("Impossibile connettersi al database per il backup: {}", e))?;

    sqlx::query("VACUUM INTO $1")
        .bind(&target_file_path)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("Errore VACUUM INTO durante la copia del database SQLite: {}", e))?;

    let len = fs::metadata(target_path).map(|m| m.len()).unwrap_or(0);
    Ok(len)
}

/// Ripristina fisicamente il database LastData.db partendo da un file .db di backup certificandone prima l'integrità
#[tauri::command]
pub async fn restore_database_file(app: AppHandle, source_file_path: String) -> Result<u64, String> {
    let source_path = Path::new(&source_file_path);
    if !source_path.exists() {
        return Err(format!("File di origine non trovato: {}", source_file_path));
    }

    // 1. Verifica preventiva dell'integrità del file di backup prima di toccare il database attivo
    let source_options = SqliteConnectOptions::new().filename(source_path);
    let mut source_conn = SqliteConnection::connect_with(&source_options)
        .await
        .map_err(|e| format!("Il file di backup non è un database SQLite valido o è corrotto: {}", e))?;

    let quick_check: Result<(String,), _> = sqlx::query_as("PRAGMA quick_check(1);")
        .fetch_one(&mut source_conn)
        .await;

    if let Ok((res,)) = quick_check {
        if res.to_lowercase() != "ok" {
            return Err(format!("Il backup non ha superato il controllo di integrità SQLite: {}", res));
        }
    }

    let mut db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Impossibile ottenere cartella app_data_dir: {}", e))?;
    db_path.push("LastData.db");

    // 2. Crea preventivamente una copia di sicurezza certificata del DB attuale prima del ripristino
    if db_path.exists() {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let safety_copy = db_path.with_file_name(format!("LastData_pre_restore_safety_{}.db", ts));
        fs::copy(&db_path, &safety_copy)
            .map_err(|e| format!("Impossibile creare copia preventiva di sicurezza: {}. Operazione annullata.", e))?;
    }

    // 3. Rimuovi eventuali file WAL e SHM temporanei per evitare conflitti con la cache del vecchio DB
    let wal_path = db_path.with_file_name("LastData.db-wal");
    if wal_path.exists() {
        let _ = fs::remove_file(&wal_path);
    }
    let shm_path = db_path.with_file_name("LastData.db-shm");
    if shm_path.exists() {
        let _ = fs::remove_file(&shm_path);
    }

    fs::copy(source_path, &db_path)
        .map_err(|e| format!("Errore durante il ripristino del database: {}", e))?;
    let len = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    Ok(len)
}

/// Elenca i file di backup presenti nella cartella selezionata ordinati per nome/data decrescente
#[tauri::command]
pub fn list_backups_in_directory(folder_path: String) -> Result<Vec<BackupFileInfo>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(path).map_err(|e| format!("Errore scansione cartella: {}", e))?;
    let mut files = Vec::new();

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

            if ext == "lastbackup" || ext == "json" || ext == "db" {
                let meta = entry.metadata().ok();
                let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);

                let modified_iso = meta
                    .and_then(|m| m.modified().ok())
                    .and_then(|time| {
                        let duration = time.duration_since(std::time::UNIX_EPOCH).ok()?;
                        let secs = duration.as_secs();
                        Some(format!("{}", secs))
                    })
                    .unwrap_or_default();

                let backup_type = if ext == "db" {
                    "full_db".to_string()
                } else if ext == "lastbackup" || ext == "json" {
                    "modular_json".to_string()
                } else {
                    "unknown".to_string()
                };

                files.push(BackupFileInfo {
                    filename: fname,
                    path: fpath.to_string_lossy().to_string(),
                    size_bytes,
                    modified_iso,
                    backup_type,
                });
            }
        }
    }

    // Ordina dal più recente al più vecchio (alfabeticamente per nome decrescente, dato che usano YYYY-MM-DD_HH-mm-ss)
    files.sort_by(|a, b| b.filename.cmp(&a.filename));

    Ok(files)
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

    // Pulisci automaticamente eventuali file temporanei SQLite (-shm e -wal) residui nella cartella
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let ep = entry.path();
            if let Some(name) = ep.file_name().and_then(|n| n.to_str()) {
                if name.ends_with(".db-wal") || name.ends_with(".db-shm") {
                    let _ = fs::remove_file(&ep);
                }
            }
        }
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
        if fpath.exists() && fpath.is_file() {
            if fs::remove_file(fpath).is_ok() {
                deleted_count += 1;
            }
        }
    }

    Ok(deleted_count)
}

/// Elimina un singolo file di backup
#[tauri::command]
pub fn delete_backup_file(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if path.exists() && path.is_file() {
        fs::remove_file(path).map_err(|e| format!("Errore eliminazione file: {}", e))?;
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
        let count_query = format!("SELECT COUNT(*) FROM \"{}\"", name);
        let count = sqlx::query_scalar::<_, i64>(&count_query)
            .fetch_one(&mut conn)
            .await
            .unwrap_or(0);

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
