use std::fs;
use std::path::PathBuf;
use std::process::Command;

mod ddt_commands;
mod ddt_delete_command;
mod supabase_config;
mod supabase_ddt_preview;
mod supabase_ddt_import;
mod ddt_types;
mod quote_commands;
mod quote_persistence;
mod quote_types;
mod backup_commands;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
fn save_file_to_desktop(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let desktop_dir = std::env::var("USERPROFILE")
        .map(|p| PathBuf::from(p).join("Desktop"))
        .or_else(|_| std::env::var("HOME").map(|p| PathBuf::from(p).join("Desktop")))
        .map_err(|_| "Impossibile trovare la cartella Desktop dell'utente".to_string())?;

    let file_path = desktop_dir.join(&filename);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Errore creazione cartella: {}", e))?;
    }
    fs::write(&file_path, bytes).map_err(|e| format!("Errore nel salvataggio del file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_file_base64_to_desktop(filename: String, base64_content: String) -> Result<String, String> {
    use base64::prelude::*;
    let desktop_dir = std::env::var("USERPROFILE")
        .map(|p| PathBuf::from(p).join("Desktop"))
        .or_else(|_| std::env::var("HOME").map(|p| PathBuf::from(p).join("Desktop")))
        .map_err(|_| "Impossibile trovare la cartella Desktop dell'utente".to_string())?;

    let file_path = desktop_dir.join(&filename);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Errore creazione cartella: {}", e))?;
    }

    let clean_base64 = if let Some(idx) = base64_content.find(";base64,") {
        &base64_content[idx + 8..]
    } else {
        &base64_content
    };

    let decoded = BASE64_STANDARD.decode(clean_base64).map_err(|e| format!("Errore decodifica base64: {}", e))?;
    fs::write(&file_path, decoded).map_err(|e| format!("Errore nel salvataggio del file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ExcelFileInfo {
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
}

#[tauri::command]
fn list_files_in_folder(folder_path: Option<String>, extensions: Option<Vec<String>>) -> Result<Vec<ExcelFileInfo>, String> {
    use std::path::Path;
    let target_dir = folder_path.unwrap_or_else(|| r"D:\BricoClassFiles\Offline\ListiniClienti".to_string());
    let path = Path::new(&target_dir);
    if !path.exists() || !path.is_dir() {
        return Err(format!("La cartella non esiste o non è valida: {}", target_dir));
    }

    let exts: Vec<String> = extensions
        .unwrap_or_else(|| vec!["xls".to_string(), "xlsx".to_string(), "xlsm".to_string(), "csv".to_string()])
        .into_iter()
        .map(|e| e.to_lowercase())
        .collect();

    let mut results = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| format!("Errore lettura cartella: {}", e))?;

    for entry in entries.flatten() {
        let file_path = entry.path();
        if file_path.is_file() {
            let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if exts.contains(&ext) {
                let filename = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                if filename.starts_with("~$") {
                    continue;
                }
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                results.push(ExcelFileInfo {
                    filename,
                    path: file_path.to_string_lossy().to_string(),
                    size_bytes: size,
                });
            }
        }
    }

    results.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    Ok(results)
}

#[tauri::command]
fn list_excel_files_in_folder(folder_path: Option<String>) -> Result<Vec<ExcelFileInfo>, String> {
    list_files_in_folder(folder_path, Some(vec!["xls".to_string(), "xlsx".to_string(), "xlsm".to_string()]))
}

#[tauri::command]
fn read_single_excel_file_base64(file_path: String) -> Result<String, String> {
    use base64::prelude::*;
    let bytes = fs::read(&file_path).map_err(|e| format!("Errore lettura file '{}': {}", file_path, e))?;
    Ok(BASE64_STANDARD.encode(&bytes))
}

#[tauri::command]
fn save_pdf_to_desktop(filename: String, bytes: Vec<u8>) -> Result<String, String> {
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
        let paths_formatted = file_paths
            .iter()
            .map(|p| format!("'{}'", p.to_string_lossy().replace('\'', "''")))
            .collect::<Vec<_>>()
            .join(", ");

        let ps_script = format!(
            r#"
Add-Type -AssemblyName System.Drawing

$imagePaths = @({paths_formatted})
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
            if (Test-Path $imgPath) {{
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
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Errore creazione cartella temporanea: {}", e))?;
    let file_path = temp_dir.join(&filename);
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
    #[cfg(target_os = "windows")]
    {
        use base64::{engine::general_purpose, Engine as _};
        let to_b64 = general_purpose::STANDARD.encode(&to);
        let cc_b64 = general_purpose::STANDARD.encode(&cc.unwrap_or_default());
        let subj_b64 = general_purpose::STANDARD.encode(&subject);
        let body_b64 = general_purpose::STANDARD.encode(&body);
        let att_json = serde_json::to_string(&attachments).unwrap_or_default();
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
                    if (Test-Path $p) {{
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

    #[cfg(target_os = "windows")]
    {
        use base64::{engine::general_purpose, Engine as _};
        let paths_json = serde_json::to_string(&paths).unwrap_or_default();
        let paths_b64 = general_purpose::STANDARD.encode(&paths_json);

        let ps_script = format!(
            r#"
            function _d($s) {{ [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($s)) }}
            $pathsJson = _d '{}'
            if ($pathsJson) {{
                $list = ConvertFrom-Json $pathsJson
                $valid = @()
                foreach ($p in $list) {{
                    if (Test-Path $p) {{
                        $valid += (Resolve-Path $p).Path
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
            ddt_delete_command::soft_delete_ddt_transaction,
            supabase_config::load_supabase_config,
            supabase_config::save_supabase_config,
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
            backup_commands::read_backup_file,
            backup_commands::copy_database_file,
            backup_commands::restore_database_file,
            backup_commands::list_backups_in_directory,
            backup_commands::check_today_backup_exists,
            backup_commands::clean_old_backups,
            backup_commands::delete_backup_file,
            backup_commands::inspect_sqlite_backup_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
