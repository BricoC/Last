use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager};

static MGMT_LOCK: Mutex<()> = Mutex::new(());
const MGMT_CONFIG_FILE: &str = "supabase.management.local.bin";
const LEGACY_MGMT_CONFIG_FILE: &str = "supabase.management.local.json";
const SUPABASE_CONFIG_FILE: &str = "supabase.local.json";

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupabaseManagementConfig {
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub expires_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagementConfigStatus {
    pub has_token: bool,
    pub access_token: String,
    pub expires_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BasicSupabaseConfig {
    project_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSizeEntry {
    pub table_name: String,
    pub total_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupabaseCloudMetrics {
    pub project_ref: String,
    pub project_name: String,
    pub region: String,
    pub postgres_version: String,
    pub project_status: String,
    pub db_size_bytes: u64,
    pub storage_size_bytes: u64,
    pub egress_bytes: Option<u64>,
    pub table_sizes: Vec<TableSizeEntry>,
}

fn mgmt_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(MGMT_CONFIG_FILE))
        .map_err(|_| "Cartella dati Last non disponibile".into())
}

fn legacy_mgmt_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(LEGACY_MGMT_CONFIG_FILE))
        .map_err(|_| "Cartella dati Last non disponibile".into())
}

fn supabase_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(SUPABASE_CONFIG_FILE))
        .map_err(|_| "Cartella dati Last non disponibile".into())
}

fn read_mgmt_config(app: &AppHandle) -> Result<SupabaseManagementConfig, String> {
    let path = mgmt_config_path(app)?;
    match fs::read(&path) {
        Ok(bytes) => {
            let plain = crate::supabase_session_store::dpapi::unprotect(&bytes)?;
            serde_json::from_slice(&plain)
                .map_err(|_| "Configurazione token Management non valida".to_string())
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            let legacy_path = legacy_mgmt_config_path(app)?;
            let file = match fs::File::open(&legacy_path) {
                Ok(file) => file,
                Err(legacy_err) if legacy_err.kind() == std::io::ErrorKind::NotFound => {
                    return Ok(SupabaseManagementConfig::default());
                }
                Err(_) => return Err("Impossibile leggere la configurazione token Management".into()),
            };
            serde_json::from_reader(file)
                .map_err(|_| "Configurazione token Management non valida".to_string())
        }
        Err(_) => Err("Impossibile leggere la configurazione token Management".into()),
    }
}

fn extract_project_ref(project_url: &str) -> Result<String, String> {
    let trimmed = project_url.trim().trim_end_matches('/');
    let ref_part = trimmed
        .strip_prefix("https://")
        .and_then(|v| v.strip_suffix(".supabase.co"))
        .ok_or("URL progetto Supabase non valido (atteso https://<ref>.supabase.co)")?;
    if ref_part.is_empty()
        || ref_part.len() > 64
        || !ref_part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Project ref Supabase non valido".into());
    }
    Ok(ref_part.to_string())
}

fn mask_mgmt_token(token: &str) -> String {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let tail: String = trimmed
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("sbp_••••••••{tail}")
}

fn validate_mgmt_config(cfg: &SupabaseManagementConfig) -> Result<(), String> {
    let token = cfg.access_token.trim();
    if !token.is_empty() {
        if token.len() > 512 || token.chars().any(char::is_control) {
            return Err("Personal Access Token non valido".into());
        }
        if !token.starts_with("sbp_") {
            return Err("Il Personal Access Token Supabase deve iniziare con 'sbp_'".into());
        }
    }
    let exp = cfg.expires_at.trim();
    if !exp.is_empty() {
        let parts: Vec<&str> = exp.split('-').collect();
        if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2 {
            return Err("Data di scadenza non valida (formato atteso YYYY-MM-DD)".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn load_supabase_management_config(app: AppHandle) -> Result<ManagementConfigStatus, String> {
    let _guard = MGMT_LOCK
        .lock()
        .map_err(|_| "Configurazione temporaneamente non disponibile")?;
    let cfg = read_mgmt_config(&app)?;
    Ok(ManagementConfigStatus {
        has_token: !cfg.access_token.trim().is_empty(),
        access_token: mask_mgmt_token(&cfg.access_token),
        expires_at: cfg.expires_at,
    })
}

#[tauri::command]
pub fn save_supabase_management_config(
    app: AppHandle,
    config: SupabaseManagementConfig,
) -> Result<ManagementConfigStatus, String> {
    let _guard = MGMT_LOCK
        .lock()
        .map_err(|_| "Configurazione temporaneamente non disponibile")?;
    let incoming_token = config.access_token.trim();
    let effective_token = if incoming_token.contains('•') {
        read_mgmt_config(&app)?.access_token
    } else {
        incoming_token.to_string()
    };
    let normalized = SupabaseManagementConfig {
        access_token: effective_token,
        expires_at: config.expires_at.trim().to_string(),
    };
    validate_mgmt_config(&normalized)?;

    let path = mgmt_config_path(&app)?;
    let dir = path.parent().ok_or("Cartella configurazione non valida")?;
    fs::create_dir_all(dir).map_err(|_| "Impossibile creare la cartella configurazione")?;
    let bytes = serde_json::to_vec(&normalized)
        .map_err(|_| "Impossibile serializzare la configurazione")?;
    let encrypted = crate::supabase_session_store::dpapi::protect(&bytes)?;
    let tmp = path.with_extension("bin.tmp");
    fs::write(&tmp, encrypted).map_err(|_| "Impossibile scrivere il file token")?;
    fs::rename(&tmp, &path).map_err(|_| "Impossibile aggiornare il file token")?;
    if let Ok(legacy_path) = legacy_mgmt_config_path(&app) {
        let _ = fs::remove_file(legacy_path);
    }

    Ok(ManagementConfigStatus {
        has_token: !normalized.access_token.is_empty(),
        access_token: mask_mgmt_token(&normalized.access_token),
        expires_at: normalized.expires_at,
    })
}

async fn run_mgmt_sql(
    client: &reqwest::Client,
    token: &str,
    project_ref: &str,
    sql: &str,
) -> Result<serde_json::Value, String> {
    let url = format!("https://api.supabase.com/v1/projects/{project_ref}/database/query");
    let body = serde_json::json!({
        "query": sql,
        "read_only": true
    })
    .to_string();

    let res = client
        .post(&url)
        .bearer_auth(token)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Errore rete Supabase Management API: {e}"))?;

    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "Query Management API rifiutata (HTTP {}): {}",
            status.as_u16(),
            text.chars().take(180).collect::<String>()
        ));
    }
    serde_json::from_str(&text)
        .map_err(|e| format!("Risposta JSON Management API non valida: {e}"))
}

#[tauri::command]
pub async fn fetch_supabase_cloud_metrics(app: AppHandle) -> Result<SupabaseCloudMetrics, String> {
    let (project_ref, token) = {
        let _guard = MGMT_LOCK
            .lock()
            .map_err(|_| "Configurazione temporaneamente non disponibile")?;

        let sup_path = supabase_config_path(&app)?;
        let sup_file = fs::File::open(sup_path)
            .map_err(|_| "Configura prima URL e chiave anon di Supabase in Cloud & Database")?;
        let sup_cfg: BasicSupabaseConfig = serde_json::from_reader(sup_file)
            .map_err(|_| "Configurazione Supabase non valida")?;
        let project_ref = extract_project_ref(&sup_cfg.project_url)?;

        let mgmt_cfg = read_mgmt_config(&app)?;
        let token = mgmt_cfg.access_token.trim().to_string();
        if token.is_empty() {
            return Err("Personal Access Token (sbp_...) non configurato".into());
        }
        (project_ref, token)
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Impossibile inizializzare client HTTP: {e}"))?;

    // 1. Metadata progetto (nome, regione, versione Postgres, stato)
    let proj_url = format!("https://api.supabase.com/v1/projects/{project_ref}");
    let proj_res = client
        .get(&proj_url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Connessione a api.supabase.com non riuscita: {e}"))?;

    let proj_status_code = proj_res.status();
    let proj_text = proj_res.text().await.unwrap_or_default();
    if !proj_status_code.is_success() {
        if proj_status_code.as_u16() == 401 || proj_status_code.as_u16() == 403 {
            return Err("Token Supabase (sbp_...) non valido o scaduto (HTTP 401/403)".into());
        }
        return Err(format!(
            "Errore lettura progetto Supabase (HTTP {})",
            proj_status_code.as_u16()
        ));
    }

    let proj_json: serde_json::Value = serde_json::from_str(&proj_text)
        .map_err(|_| "Risposta progetto Supabase non valida".to_string())?;

    let project_name = proj_json["name"]
        .as_str()
        .unwrap_or(&project_ref)
        .to_string();
    let region = proj_json["region"].as_str().unwrap_or("—").to_string();
    let postgres_version = proj_json["database"]["version"]
        .as_str()
        .unwrap_or("—")
        .to_string();
    let project_status = proj_json["status"].as_str().unwrap_or("ACTIVE").to_string();

    // 2. Spazio database reale (bytes) + Storage objects (bytes) + dimensione per tabella
    let db_size_val = run_mgmt_sql(
        &client,
        &token,
        &project_ref,
        "SELECT pg_database_size(current_database())::bigint AS db_size_bytes;",
    )
    .await?;

    let db_size_bytes = db_size_val
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|row| row["db_size_bytes"].as_u64().or_else(|| row["db_size_bytes"].as_str().and_then(|s| s.parse::<u64>().ok())))
        .unwrap_or(0);

    let storage_size_bytes = match run_mgmt_sql(
        &client,
        &token,
        &project_ref,
        "SELECT coalesce(sum((metadata->>'size')::bigint), 0)::bigint AS storage_size_bytes FROM storage.objects;",
    )
    .await
    {
        Ok(val) => val
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|row| row["storage_size_bytes"].as_u64().or_else(|| row["storage_size_bytes"].as_str().and_then(|s| s.parse::<u64>().ok())))
            .unwrap_or(0),
        Err(_) => 0,
    };

    let table_sizes = match run_mgmt_sql(
        &client,
        &token,
        &project_ref,
        "SELECT relname AS table_name, pg_total_relation_size(c.oid)::bigint AS total_bytes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY total_bytes DESC;",
    )
    .await
    {
        Ok(val) => val
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|row| {
                        let name = row["table_name"].as_str()?.to_string();
                        let bytes = row["total_bytes"]
                            .as_u64()
                            .or_else(|| row["total_bytes"].as_str().and_then(|s| s.parse::<u64>().ok()))
                            .unwrap_or(0);
                        Some(TableSizeEntry {
                            table_name: name,
                            total_bytes: bytes,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    };

    // 3. Best-effort Egress tramite endpoint usage organizzazione (se disponibile)
    let mut egress_bytes: Option<u64> = None;
    if let Some(org_id) = proj_json["organization_id"].as_str() {
        let usage_url = format!("https://api.supabase.com/v1/organizations/{org_id}/usage");
        if let Ok(u_res) = client.get(&usage_url).bearer_auth(&token).send().await {
            if u_res.status().is_success() {
                if let Ok(u_text) = u_res.text().await {
                    if let Ok(u_json) = serde_json::from_str::<serde_json::Value>(&u_text) {
                        if let Some(val) = u_json["egress"]["usage"]
                            .as_u64()
                            .or_else(|| u_json["egress_bytes"].as_u64())
                        {
                            egress_bytes = Some(val);
                        }
                    }
                }
            }
        }
    }

    Ok(SupabaseCloudMetrics {
        project_ref,
        project_name,
        region,
        postgres_version,
        project_status,
        db_size_bytes,
        storage_size_bytes,
        egress_bytes,
        table_sizes,
    })
}

#[cfg(test)]
mod tests {
    use super::{extract_project_ref, mask_mgmt_token};

    #[test]
    fn extract_project_ref_validates_strict_format() {
        assert_eq!(
            extract_project_ref("https://abcdef-123.supabase.co/").unwrap(),
            "abcdef-123"
        );
        assert!(extract_project_ref("https://abc/../../evil.supabase.co").is_err());
        assert!(extract_project_ref("https://abc?query=1.supabase.co").is_err());
        assert!(extract_project_ref("http://abcdef.supabase.co").is_err());
    }

    #[test]
    fn mask_mgmt_token_never_exposes_plaintext() {
        assert_eq!(mask_mgmt_token(""), "");
        assert_eq!(mask_mgmt_token("sbp_1234567890abcd"), "sbp_••••••••abcd");
    }
}
