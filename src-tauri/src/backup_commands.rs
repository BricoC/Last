use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Serialize, Deserialize, Clone)]
pub struct BackupFileInfo {
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_iso: String,
    pub backup_type: String, // "full_db" | "modular_json" | "unknown"
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
        cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &ps_script]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let output = cmd.output().map_err(|e| format!("Errore esecuzione selettore cartella: {}", e))?;
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
        cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps_script]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let output = cmd.output().map_err(|e| format!("Errore esecuzione selettore file: {}", e))?;
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
            return Err(format!("La cartella specificata non esiste: {}", folder_path));
        }

        let mut cmd = Command::new("explorer");
        cmd.arg(&folder_path);
        cmd.spawn().map_err(|e| format!("Impossibile aprire Esplora Risorse: {}", e))?;
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
        fs::create_dir_all(parent).map_err(|e| format!("Errore creazione cartella di destinazione: {}", e))?;
    }
    fs::write(path, content.as_bytes()).map_err(|e| format!("Errore scrittura file backup: {}", e))?;
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
    let content = fs::read_to_string(path).map_err(|e| format!("Errore lettura file di backup: {}", e))?;
    Ok(content)
}

/// Crea una copia fisica del database SQLite LastData.db nella cartella di destinazione
#[tauri::command]
pub fn copy_database_file(app: AppHandle, target_file_path: String) -> Result<u64, String> {
    let mut db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Impossibile ottenere cartella app_data_dir: {}", e))?;
    db_path.push("LastData.db");

    if !db_path.exists() {
        return Err(format!("Il database principale non esiste nel percorso: {:?}", db_path));
    }

    let target_path = Path::new(&target_file_path);
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Errore creazione cartella destinazione: {}", e))?;
    }

    fs::copy(&db_path, target_path).map_err(|e| format!("Errore copia del database SQLite: {}", e))?;
    let len = fs::metadata(target_path).map(|m| m.len()).unwrap_or(0);
    Ok(len)
}

/// Ripristina fisicamente il database LastData.db partendo da un file .db di backup
#[tauri::command]
pub fn restore_database_file(app: AppHandle, source_file_path: String) -> Result<u64, String> {
    let source_path = Path::new(&source_file_path);
    if !source_path.exists() {
        return Err(format!("File di origine non trovato: {}", source_file_path));
    }

    let mut db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Impossibile ottenere cartella app_data_dir: {}", e))?;
    db_path.push("LastData.db");

    // Crea preventivamente una copia di sicurezza del DB attuale
    if db_path.exists() {
        let mut safety_copy = db_path.clone();
        safety_copy.set_extension("db.pre_restore_safety");
        let _ = fs::copy(&db_path, safety_copy);
    }

    fs::copy(source_path, &db_path).map_err(|e| format!("Errore durante la sovrascrittura del database: {}", e))?;
    let len = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    Ok(len)
}

/// Elenca i file di backup presenti nella cartella selezionata
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
            let fname = fpath.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            let ext = fpath.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

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

    // Ordina i file dal più recente al più vecchio (in base a modified_iso o nome)
    files.sort_by(|a, b| b.filename.cmp(&a.filename));

    Ok(files)
}

