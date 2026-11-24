use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use tauri::Manager;

mod backup_commands;
mod ddt_commands;
mod ddt_delete_command;
mod ddt_types;
mod quote_commands;
mod quote_persistence;
mod quote_types;
mod sqlite_backup;
mod sqlite_batch;
mod sqlite_migrations;
#[cfg(test)]
mod sqlite_test_support;
mod sqlite_utils;
mod supabase_config;
mod supabase_ddt_import;
mod supabase_ddt_preview;
mod supabase_monitor;
mod supabase_session_store;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn resolve_desktop_dir() -> Result<PathBuf, String> {
    let candidates = [
        std::env::var("USERPROFILE")
            .ok()
            .map(|p| PathBuf::from(p).join("Desktop")),
        std::env::var("OneDrive")
            .ok()
            .map(|p| PathBuf::from(p).join("Desktop")),
        std::env::var("USERPROFILE")
            .ok()
            .map(|p| PathBuf::from(p).join("OneDrive").join("Desktop")),
        std::env::var("HOME")
            .ok()
            .map(|p| PathBuf::from(p).join("Desktop")),
    ];

    for candidate in candidates.iter().flatten() {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    candidates
        .into_iter()
        .flatten()
        .next()
        .ok_or_else(|| "Impossibile trovare la cartella Desktop dell'utente".to_string())
}

fn sanitize_safe_output_path(base_dir: &Path, filename: &str) -> Result<PathBuf, String> {
    let trimmed = filename.trim();
    if trimmed.is_empty() {
        return Err("Nome file non valido o vuoto".to_string());
    }
    let rel = Path::new(trimmed);
    if rel.is_absolute() {
        return Err("Percorso assoluto non consentito nel nome file".to_string());
    }
    let mut normalized = PathBuf::new();
    for comp in rel.components() {
        match comp {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Percorso file non consentito (path traversal rilevato)".to_string());
            }
        }
    }
    if normalized.as_os_str().is_empty() {
        return Err("Nome file non valido".to_string());
    }
    Ok(base_dir.join(normalized))
}

const ALLOWED_OUTPUT_EXTENSIONS: &[&str] = &[
    "pdf", "xlsx", "csv", "txt", "json", "xml", "png", "jpg", "jpeg",
];

fn validate_allowed_extension(path: &Path, allowed: &[&str]) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if ext.is_empty() || !allowed.contains(&ext.as_str()) {
        return Err(format!(
            "Estensione file '.{ext}' non consentita per il salvataggio."
        ));
    }
    Ok(())
}

#[tauri::command]
fn save_file_to_desktop(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let desktop_dir = resolve_desktop_dir()?;
    let file_path = sanitize_safe_output_path(&desktop_dir, &filename)?;
    validate_allowed_extension(&file_path, ALLOWED_OUTPUT_EXTENSIONS)?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Errore creazione cartella: {}", e))?;
    }
    fs::write(&file_path, bytes).map_err(|e| format!("Errore nel salvataggio del file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_file_base64_to_desktop(filename: String, base64_content: String) -> Result<String, String> {
    use base64::prelude::*;
    let desktop_dir = resolve_desktop_dir()?;
    let file_path = sanitize_safe_output_path(&desktop_dir, &filename)?;
    validate_allowed_extension(&file_path, ALLOWED_OUTPUT_EXTENSIONS)?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Errore creazione cartella: {}", e))?;
    }

    let clean_base64 = if let Some(idx) = base64_content.find(";base64,") {
        &base64_content[idx + 8..]
    } else {
        &base64_content
    };

    let decoded = BASE64_STANDARD
        .decode(clean_base64)
        .map_err(|e| format!("Errore decodifica base64: {}", e))?;
    fs::write(&file_path, decoded)
        .map_err(|e| format!("Errore nel salvataggio del file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ExcelFileInfo {
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
    pub last_modified_ms: u64,
}

#[tauri::command]
fn list_files_in_folder(
    folder_path: Option<String>,
    extensions: Option<Vec<String>>,
) -> Result<Vec<ExcelFileInfo>, String> {
    use std::path::Path;
    let target_dir = match folder_path {
        Some(p) if !p.trim().is_empty() => p,
        _ => return Err("Nessun percorso cartella specificato".to_string()),
    };
    let path = Path::new(&target_dir);
    if !path.exists() || !path.is_dir() {
        return Err(format!(
            "La cartella non esiste o non è valida: {}",
            target_dir
        ));
    }

    let exts: Vec<String> = extensions
        .unwrap_or_else(|| {
            vec![
                "xls".to_string(),
                "xlsx".to_string(),
                "xlsm".to_string(),
                "csv".to_string(),
            ]
        })
        .into_iter()
        .map(|e| e.to_lowercase())
        .collect();

    let mut results = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| format!("Errore lettura cartella: {}", e))?;

    for entry in entries.flatten() {
        let file_path = entry.path();
        if file_path.is_file() {
            let ext = file_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if exts.contains(&ext) {
                let filename = file_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                if filename.starts_with("~$") {
                    continue;
                }
                let metadata = entry.metadata().ok();
                let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                let last_modified_ms = metadata
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
                    .unwrap_or(0);
                results.push(ExcelFileInfo {
                    filename,
                    path: file_path.to_string_lossy().to_string(),
                    size_bytes: size,
                    last_modified_ms,
                });
            }
        }
    }

    results.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    Ok(results)
}

#[tauri::command]
fn list_excel_files_in_folder(folder_path: Option<String>) -> Result<Vec<ExcelFileInfo>, String> {
    list_files_in_folder(
        folder_path,
        Some(vec![
            "xls".to_string(),
            "xlsx".to_string(),
            "xlsm".to_string(),
        ]),
    )
}

fn validate_allowed_file_path(
    file_path: &str,
    allowed_extensions: &[&str],
    label: &str,
) -> Result<std::path::PathBuf, String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err(format!("Percorso {label} vuoto non valido"));
    }
    let path = std::path::Path::new(trimmed);
    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err(format!("Percorso {label} con '..' non consentito"));
        }
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !allowed_extensions.iter().any(|allowed| *allowed == ext) {
        return Err(format!("Estensione non consentita per {label}: .{ext}"));
    }
    if !path.exists() || !path.is_file() {
        return Err(format!("File {label} non trovato: {trimmed}"));
    }
    Ok(path.to_path_buf())
}

#[tauri::command]
fn read_single_excel_file_base64(file_path: String) -> Result<String, String> {
    use base64::prelude::*;
    let path = validate_allowed_file_path(
        &file_path,
        &["xls", "xlsx", "xlsm", "csv", "ods"],
        "Excel/listino",
    )?;
    let bytes =
        fs::read(&path).map_err(|e| format!("Errore lettura file '{}': {}", file_path, e))?;
    Ok(BASE64_STANDARD.encode(&bytes))
}

#[tauri::command]
fn save_pdf_to_desktop(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let desktop_dir = resolve_desktop_dir()?;
    let file_path = sanitize_safe_output_path(&desktop_dir, &filename)?;
    validate_allowed_extension(&file_path, &["pdf"])?;
    save_file_to_desktop(filename, bytes)
}

#[tauri::command]
fn print_ddt_silent(images_bytes: Vec<Vec<u8>>, copies: u32) -> Result<(), String> {
    if images_bytes.is_empty() {
        return Err("Nessuna pagina da stampare".to_string());
    }

    let temp_dir = std::env::temp_dir();
    let mut file_paths = Vec::new();

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    for (i, img) in images_bytes.iter().enumerate() {
        let file_path = temp_dir.join(format!("_ddt_print_{}_{}.png", timestamp, i));
        fs::write(&file_path, img)
            .map_err(|e| format!("Errore salvataggio immagine temporanea: {}", e))?;
        file_paths.push(file_path);
    }

    let actual_copies = copies.max(1);

    #[cfg(target_os = "windows")]
    {
        use base64::{engine::general_purpose, Engine as _};
        let paths_strings: Vec<String> = file_paths
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        let paths_json = serde_json::to_string(&paths_strings)
            .map_err(|e| format!("Errore serializzazione percorsi stampa: {}", e))?;
        let paths_b64 = general_purpose::STANDARD.encode(&paths_json);

        let ps_script = format!(
            r#"
function _d($s) {{ [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($s)) }}
Add-Type -AssemblyName System.Drawing

$imagePaths = @(ConvertFrom-Json (_d '{paths_b64}'))
$copies = {actual_copies}

for ($copyIdx = 1; $copyIdx -le $copies; $copyIdx++) {{
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $doc.OriginAtMargins = $false
    $doc.PrinterSettings.Duplex = [System.Drawing.Printing.Duplex]::Simplex

    foreach ($ps in $doc.PrinterSettings.PaperSizes) {{
        if ($ps.PaperName -like '*A4*') {{
            $doc.DefaultPageSettings.PaperSize = $ps
            break
        }}
    }}

    $script:pageIndex = 0
    $doc.add_PrintPage({{
        param($sender, $e)
        if ($script:pageIndex -lt $imagePaths.Count) {{
            $imgPath = $imagePaths[$script:pageIndex]
            if (Test-Path -LiteralPath $imgPath) {{
                $img = [System.Drawing.Image]::FromFile($imgPath)
                $hX = $e.PageSettings.HardMarginX
                $hY = $e.PageSettings.HardMarginY
                $e.Graphics.TranslateTransform(-$hX, -$hY)
                $e.Graphics.DrawImage($img, 0, 0, $e.PageBounds.Width, $e.PageBounds.Height)
                $img.Dispose()
            }}
            $script:pageIndex++
            $e.HasMorePages = ($script:pageIndex -lt $imagePaths.Count)
        }} else {{
            $e.HasMorePages = $false
        }}
    }})

    $doc.Print()
    $doc.Dispose()
}}

foreach ($p in $imagePaths) {{
    Remove-Item $p -Force -ErrorAction SilentlyContinue
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
            .map_err(|e| format!("Errore esecuzione comando di stampa: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Errore PowerShell durante la stampa: {}", stderr));
        }
    }

    Ok(())
}

#[tauri::command]
fn send_order_email(to: String, subject: String, body: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use base64::{engine::general_purpose, Engine as _};
        let to_b64 = general_purpose::STANDARD.encode(&to);
        let subj_b64 = general_purpose::STANDARD.encode(&subject);
        let body_b64 = general_purpose::STANDARD.encode(&body);

        let ps_script = format!(
            r#"
            function _d($s) {{ [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($s)) }}
            $outlook = New-Object -ComObject Outlook.Application
            $mail = $outlook.CreateItem(0)
            $mail.To = _d '{}'
            $mail.Subject = _d '{}'
            $mail.HTMLBody = _d '{}'
            $mail.Display()
            "#,
            to_b64, subj_b64, body_b64
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
            .map_err(|e| format!("Errore esecuzione comando invio email: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Errore Outlook/PowerShell: {}", stderr));
        }
    }

    Ok(())
}

#[tauri::command]
fn save_temp_file(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("brico_ddt_email");
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Errore creazione cartella temporanea: {}", e))?;
    let file_path = sanitize_safe_output_path(&temp_dir, &filename)?;
    validate_allowed_extension(&file_path, ALLOWED_OUTPUT_EXTENSIONS)?;
    fs::write(&file_path, bytes).map_err(|e| format!("Errore scrittura file temporaneo: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn send_email_with_attachments(
    to: String,
    cc: Option<String>,
    subject: String,
    body: String,
    attachments: Vec<String>,
) -> Result<(), String> {
    let mut validated_attachments = Vec::with_capacity(attachments.len());
    for raw in &attachments {
        let valid = validate_allowed_file_path(
            raw,
            &[
                "pdf", "xlsx", "xlsm", "xls", "csv", "png", "jpg", "jpeg", "txt", "xml", "p7m",
            ],
            "allegato email",
        )?;
        validated_attachments.push(valid.to_string_lossy().to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use base64::{engine::general_purpose, Engine as _};
        let to_b64 = general_purpose::STANDARD.encode(&to);
        let cc_b64 = general_purpose::STANDARD.encode(cc.unwrap_or_default());
        let subj_b64 = general_purpose::STANDARD.encode(&subject);
        let body_b64 = general_purpose::STANDARD.encode(&body);
        let att_json = serde_json::to_string(&validated_attachments).unwrap_or_default();
        let att_b64 = general_purpose::STANDARD.encode(&att_json);

        let ps_script = format!(
            r#"
            function _d($s) {{ [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($s)) }}
            $outlook = New-Object -ComObject Outlook.Application
            $mail = $outlook.CreateItem(0)
            $to = _d '{}'
            if ($to) {{ $mail.To = $to }}
            $cc = _d '{}'
            if ($cc) {{ $mail.CC = $cc }}
            $mail.Subject = _d '{}'
            $mail.HTMLBody = _d '{}'
            $attJson = _d '{}'
            if ($attJson) {{
                $attList = ConvertFrom-Json $attJson
                foreach ($p in $attList) {{
                    if (Test-Path -LiteralPath $p) {{
                        $mail.Attachments.Add($p) | Out-Null
                    }}
                }}
            }}
            $mail.Display()
            "#,
            to_b64, cc_b64, subj_b64, body_b64, att_b64
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
            .map_err(|e| format!("Errore esecuzione comando invio email: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Errore Outlook/PowerShell: {}", stderr));
        }
    }

    Ok(())
}

#[tauri::command]
fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut validated_paths = Vec::with_capacity(paths.len());
    for raw in &paths {
        if raw.trim().starts_with("\\\\") {
            return Err(
                "Percorsi di rete UNC non consentiti per la copia negli appunti".to_string(),
            );
        }
        let valid = validate_allowed_file_path(raw, ALLOWED_OUTPUT_EXTENSIONS, "clipboard")?;
        validated_paths.push(valid.to_string_lossy().to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use base64::{engine::general_purpose, Engine as _};
        let paths_json = serde_json::to_string(&validated_paths).unwrap_or_default();
        let paths_b64 = general_purpose::STANDARD.encode(&paths_json);

        let ps_script = format!(
            r#"
            function _d($s) {{ [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($s)) }}
            $pathsJson = _d '{}'
            if ($pathsJson) {{
                $list = ConvertFrom-Json $pathsJson
                $valid = @()
                foreach ($p in $list) {{
                    if (Test-Path -LiteralPath $p) {{
                        $valid += (Resolve-Path -LiteralPath $p).Path
                    }}
                }}
                if ($valid.Count -gt 0) {{
                    Set-Clipboard -Path $valid
                }}
            }}
            "#,
            paths_b64
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
            .map_err(|e| format!("Errore esecuzione comando clipboard: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Errore PowerShell clipboard: {}", stderr));
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Ok(data_dir) = app.path().app_data_dir() {
                supabase_ddt_import::rotate_pre_import_backups(&data_dir, 5);
            }
            Ok(())
        })
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            save_file_to_desktop,
            save_file_base64_to_desktop,
            save_pdf_to_desktop,
            save_temp_file,
            print_ddt_silent,
            send_order_email,
            send_email_with_attachments,
            copy_files_to_clipboard,
            ddt_commands::save_ddt_transaction,
            ddt_commands::replace_ddt_transaction,
            sqlite_batch::apply_local_database_batch,
            sqlite_utils::initialize_local_database,
            sqlite_migrations::run_local_migrations,
            ddt_delete_command::soft_delete_ddt_transaction,
            supabase_config::load_supabase_config,
            supabase_config::save_supabase_config,
            supabase_session_store::save_supabase_station_session,
            supabase_session_store::load_supabase_station_session,
            supabase_session_store::clear_supabase_station_session,
            supabase_monitor::load_supabase_management_config,
            supabase_monitor::save_supabase_management_config,
            supabase_monitor::fetch_supabase_cloud_metrics,
            supabase_ddt_preview::load_local_ddt_preview_keys,
            supabase_ddt_import::import_supabase_ddt_into_local,
            quote_commands::save_quote_transaction,
            quote_commands::soft_delete_quote_transaction,
            quote_commands::convert_quote_to_ddt_transaction,
            list_excel_files_in_folder,
            list_files_in_folder,
            read_single_excel_file_base64,
            backup_commands::select_folder_dialog,
            backup_commands::select_backup_file_dialog,
            backup_commands::open_folder_in_explorer,
            backup_commands::write_backup_file,
            backup_commands::write_binary_file,
            backup_commands::read_backup_file,
            backup_commands::copy_database_file,
            backup_commands::restore_database_file,
            backup_commands::export_modular_backup_tables,
            backup_commands::list_backups_in_directory,
            backup_commands::check_today_backup_exists,
            backup_commands::clean_old_backups,
            backup_commands::delete_backup_file,
            backup_commands::inspect_sqlite_backup_file,
            backup_commands::get_default_desktop_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{sanitize_safe_output_path, validate_allowed_extension, ALLOWED_OUTPUT_EXTENSIONS};
    use std::path::PathBuf;

    #[test]
    fn sanitize_safe_output_path_blocks_traversal_and_absolute_paths() {
        let base = PathBuf::from("C:\\Users\\Test\\Desktop");
        assert!(sanitize_safe_output_path(&base, "..\\escape.pdf").is_err());
        assert!(sanitize_safe_output_path(&base, "sub/../../escape.pdf").is_err());
        assert!(sanitize_safe_output_path(&base, "/abs/path.pdf").is_err());
        assert!(sanitize_safe_output_path(&base, "").is_err());

        let ok = sanitize_safe_output_path(&base, "DDT 12.pdf").expect("valid filename");
        assert_eq!(ok, base.join("DDT 12.pdf"));
        assert!(validate_allowed_extension(&ok, &["pdf"]).is_ok());
    }

    #[test]
    fn validate_allowed_extension_blocks_executables_and_scripts() {
        for bad in ["drop.exe", "run.bat", "script.ps1", "evil.lnk", "noext"] {
            let p = PathBuf::from(bad);
            assert!(validate_allowed_extension(&p, ALLOWED_OUTPUT_EXTENSIONS).is_err());
        }
        assert!(validate_allowed_extension(
            &PathBuf::from("report.xlsx"),
            ALLOWED_OUTPUT_EXTENSIONS
        )
        .is_ok());
        assert!(validate_allowed_extension(&PathBuf::from("ddt.pdf"), &["pdf"]).is_ok());
        assert!(validate_allowed_extension(&PathBuf::from("ddt.xlsx"), &["pdf"]).is_err());
    }

    #[test]
    fn validate_allowed_file_path_blocks_traversal_and_disallowed_extensions() {
        assert!(super::validate_allowed_file_path("", &["xlsx"], "test").is_err());
        assert!(
            super::validate_allowed_file_path("C:\\tmp\\..\\secret.xlsx", &["xlsx"], "test")
                .is_err()
        );
        assert!(
            super::validate_allowed_file_path("C:\\tmp\\payload.exe", &["xlsx"], "test").is_err()
        );
    }
}
