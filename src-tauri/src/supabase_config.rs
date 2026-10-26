use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager};

static CONFIG_LOCK: Mutex<()> = Mutex::new(());
const CONFIG_FILE: &str = "supabase.local.json";

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupabaseConfig {
    pub project_url: String,
    #[serde(default)]
    pub anon_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigStatus {
    config: Option<SupabaseConfig>,
    config_path: String,
}

impl SupabaseConfig {
    fn validate(&self) -> Result<(), String> {
        let url = self.project_url.strip_prefix("https://")
            .and_then(|value| value.strip_suffix(".supabase.co"))
            .ok_or("URL non valido: usa https://<project-ref>.supabase.co")?;
        if url.is_empty() || url.len() > 63
            || !url.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            || url.starts_with('-') || url.ends_with('-')
        {
            return Err("URL progetto Supabase non valido".into());
        }
        if self.anon_key.len() > 4096 || self.anon_key.chars().any(char::is_control) {
            return Err("Chiave API non valida".into());
        }
        if self.anon_key.starts_with("sb_secret_")
            || self.anon_key.to_ascii_lowercase().contains("service_role")
        {
            return Err("Usa solo la chiave anon/pubblica; le chiavi secret e service_role non sono accettate".into());
        }
        Ok(())
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|path| path.join(CONFIG_FILE))
        .map_err(|_| "Cartella dati Last non disponibile".into())
}

fn read_config(app: &AppHandle) -> Result<Option<SupabaseConfig>, String> {
    let path = config_path(app)?;
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Impossibile leggere la configurazione locale Supabase".into()),
    };
    if file.metadata().map_err(|_| "Configurazione non leggibile")?.len() > 16_384 {
        return Err("File di configurazione troppo grande".into());
    }
    let config: SupabaseConfig = serde_json::from_reader(file)
        .map_err(|_| "Configurazione Supabase non valida".to_string())?;
    if !config.project_url.is_empty() { config.validate()?; }
    Ok(Some(config))
}

fn status(app: &AppHandle) -> Result<ConfigStatus, String> {
    Ok(ConfigStatus {
        config: read_config(app)?,
        config_path: config_path(app)?.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn load_supabase_config(app: AppHandle) -> Result<ConfigStatus, String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "Configurazione temporaneamente non disponibile")?;
    status(&app)
}

#[tauri::command]
pub fn save_supabase_config(app: AppHandle, config: SupabaseConfig) -> Result<ConfigStatus, String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "Configurazione temporaneamente non disponibile")?;
    config.validate()?;
    let path = config_path(&app)?;
    let directory = path.parent().ok_or("Cartella configurazione non valida")?;
    fs::create_dir_all(directory).map_err(|_| "Impossibile creare la cartella configurazione")?;
    let bytes = serde_json::to_vec_pretty(&config).map_err(|_| "Configurazione non serializzabile")?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, bytes).map_err(|_| "Impossibile scrivere la configurazione locale")?;
    fs::rename(&temporary, &path).map_err(|_| "Impossibile aggiornare la configurazione locale")?;
    status(&app)
}
