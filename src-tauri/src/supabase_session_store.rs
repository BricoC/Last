use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager};

static SESSION_LOCK: Mutex<()> = Mutex::new(());
const SESSION_FILE: &str = "supabase.session.local.bin";
const MAX_SESSION_BYTES: u64 = 65_536;

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSupabaseSession {
    pub project_url: String,
    pub email: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub refresh_token: String,
}

fn session_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(SESSION_FILE))
        .map_err(|_| "Cartella dati Last non disponibile".into())
}

#[cfg(target_os = "windows")]
mod dpapi {
    use std::ffi::c_void;
    use std::ptr::{null, null_mut};

    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            p_data_in: *const DataBlob,
            sz_data_descr: *const u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut c_void,
            p_prompt_struct: *mut c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;

        fn CryptUnprotectData(
            p_data_in: *const DataBlob,
            ppsz_data_descr: *mut *mut u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut c_void,
            p_prompt_struct: *mut c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(h_mem: *mut c_void) -> *mut c_void;
    }

    pub fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
        let mut input = DataBlob {
            cb_data: u32::try_from(plain.len()).map_err(|_| "Sessione troppo grande")?,
            pb_data: plain.as_ptr() as *mut u8,
        };
        let mut output = DataBlob {
            cb_data: 0,
            pb_data: null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &mut input,
                null(),
                null(),
                null_mut(),
                null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 || output.pb_data.is_null() {
            return Err("Impossibile proteggere la sessione sul PC".into());
        }
        let encrypted = unsafe {
            std::slice::from_raw_parts(output.pb_data, output.cb_data as usize).to_vec()
        };
        unsafe {
            LocalFree(output.pb_data as *mut c_void);
        }
        Ok(encrypted)
    }

    pub fn unprotect(encrypted: &[u8]) -> Result<Vec<u8>, String> {
        let mut input = DataBlob {
            cb_data: u32::try_from(encrypted.len()).map_err(|_| "Sessione non valida")?,
            pb_data: encrypted.as_ptr() as *mut u8,
        };
        let mut output = DataBlob {
            cb_data: 0,
            pb_data: null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &mut input,
                null_mut(),
                null(),
                null_mut(),
                null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 || output.pb_data.is_null() {
            return Err("Impossibile decifrare la sessione salvata sul PC".into());
        }
        let plain = unsafe {
            std::slice::from_raw_parts(output.pb_data, output.cb_data as usize).to_vec()
        };
        unsafe {
            LocalFree(output.pb_data as *mut c_void);
        }
        Ok(plain)
    }
}

#[cfg(not(target_os = "windows"))]
mod dpapi {
    pub fn protect(_plain: &[u8]) -> Result<Vec<u8>, String> {
        Err("Protezione DPAPI disponibile solo su Windows".into())
    }

    pub fn unprotect(_encrypted: &[u8]) -> Result<Vec<u8>, String> {
        Err("Protezione DPAPI disponibile solo su Windows".into())
    }
}

fn write_session_to_path(path: &PathBuf, session: &StoredSupabaseSession) -> Result<(), String> {
    let json = serde_json::to_vec(session).map_err(|_| "Sessione non serializzabile")?;
    let protected = dpapi::protect(&json)?;
    let directory = path.parent().ok_or("Cartella sessione non valida")?;
    fs::create_dir_all(directory).map_err(|_| "Impossibile creare la cartella sessione")?;
    let temporary = path.with_extension("bin.tmp");
    fs::write(&temporary, protected).map_err(|_| "Impossibile scrivere la sessione protetta")?;
    fs::rename(&temporary, path).map_err(|_| "Impossibile aggiornare la sessione protetta")?;
    Ok(())
}

fn read_session_from_path(path: &PathBuf) -> Result<Option<StoredSupabaseSession>, String> {
    let meta = match fs::metadata(path) {
        Ok(meta) => meta,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Impossibile leggere la sessione salvata".into()),
    };
    if meta.len() > MAX_SESSION_BYTES {
        return Err("File di sessione troppo grande".into());
    }
    let encrypted = fs::read(path).map_err(|_| "Impossibile leggere la sessione salvata")?;
    let plain = dpapi::unprotect(&encrypted)?;
    let session: StoredSupabaseSession =
        serde_json::from_slice(&plain).map_err(|_| "Sessione salvata non valida")?;
    if session.project_url.trim().is_empty() || session.email.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(session))
}

#[tauri::command]
pub fn save_supabase_station_session(
    app: AppHandle,
    session: StoredSupabaseSession,
) -> Result<(), String> {
    let _guard = SESSION_LOCK
        .lock()
        .map_err(|_| "Archivio sessione temporaneamente non disponibile")?;
    let path = session_path(&app)?;
    write_session_to_path(&path, &session)
}

#[tauri::command]
pub fn load_supabase_station_session(
    app: AppHandle,
) -> Result<Option<StoredSupabaseSession>, String> {
    let _guard = SESSION_LOCK
        .lock()
        .map_err(|_| "Archivio sessione temporaneamente non disponibile")?;
    let path = session_path(&app)?;
    read_session_from_path(&path)
}

#[tauri::command]
pub fn clear_supabase_station_session(app: AppHandle) -> Result<(), String> {
    let _guard = SESSION_LOCK
        .lock()
        .map_err(|_| "Archivio sessione temporaneamente non disponibile")?;
    let path = session_path(&app)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Impossibile rimuovere la sessione salvata".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "windows")]
    #[test]
    fn dpapi_roundtrip_protects_and_restores_session_on_disk() {
        let dir = std::env::temp_dir().join(format!(
            "last-session-test-{}",
            crate::sqlite_backup::snapshot_suffix()
        ));
        let path = dir.join(SESSION_FILE);
        let original = StoredSupabaseSession {
            project_url: "https://demo.supabase.co".into(),
            email: "ufficio@bricoclass.local".into(),
            password: "secret-station-password".into(),
            refresh_token: "rt-123".into(),
        };
        write_session_to_path(&path, &original).unwrap();
        let raw = fs::read(&path).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("secret-station-password"));
        let loaded = read_session_from_path(&path).unwrap().unwrap();
        assert_eq!(loaded, original);
        let _ = fs::remove_dir_all(&dir);
    }
}
