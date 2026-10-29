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

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
fn save_file_to_desktop(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let desktop_dir = std::env::var("USERPROFILE")
        .map(|p| PathBuf::from(p).join("Desktop"))
        .or_else(|_| std::env::var("HOME").map(|p| PathBuf::from(p).join("Desktop")))
        .map_err(|_| "Impossibile trovare la cartella Desktop dell'utente".to_string())?;

    let file_path = desktop_dir.join(&filename);
    fs::write(&file_path, bytes).map_err(|e| format!("Errore nel salvataggio del file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            save_file_to_desktop,
            save_pdf_to_desktop,
            print_ddt_silent,
            ddt_commands::save_ddt_transaction,
            ddt_delete_command::soft_delete_ddt_transaction,
            supabase_config::load_supabase_config,
            supabase_config::save_supabase_config,
            supabase_ddt_preview::load_local_ddt_preview_keys,
            supabase_ddt_import::import_supabase_ddt_into_local,
            quote_commands::save_quote_transaction,
            quote_commands::soft_delete_quote_transaction,
            quote_commands::convert_quote_to_ddt_transaction
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
