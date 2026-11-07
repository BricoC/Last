import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";

export interface TableCountItem {
  tableName: string;
  count: number;
}

export interface BackupCategoryReportItem {
  id: string;
  categoryLabel: string;
  tablesIncluded: TableCountItem[];
  recordCount: number;
  description: string;
}

export interface FullBackupReport {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  createdAtFormatted?: string;
  backupType: "full_db" | "modular_json";
  totalTables: number;
  totalRecords: number;
  categories: BackupCategoryReportItem[];
  rawTables: { name: string; count: number }[];
}

/**
 * Ispeziona in modo analitico e dettagliato qualsiasi backup (database .db o modulare .lastbackup)
 * restituendo il conteggio dei record categoria per categoria e tabella per tabella.
 */
export async function inspectBackupFullReport(filePath: string): Promise<FullBackupReport> {
  const isDb = filePath.toLowerCase().endsWith(".db");
  const fileName = filePath.split(/[\\/]/).pop() || filePath;

  if (isDb) {
    interface RawSqliteInspection {
      file_name: string;
      file_path: string;
      size_bytes: number;
      tables_count: number;
      total_records: number;
      tables: { name: string; count: number }[];
    }

    const raw = await invoke<RawSqliteInspection>("inspect_sqlite_backup_file", { filePath });
    const tableMap: Record<string, number> = {};
    for (const t of raw.tables) {
      tableMap[t.name] = t.count;
    }

    const categoriesReport: BackupCategoryReportItem[] = BACKUP_CATEGORIES.map((cat) => {
      let count = 0;
      const foundTables: TableCountItem[] = [];
      for (const t of cat.tables) {
        if (t in tableMap) {
          const c = tableMap[t] || 0;
          count += c;
          foundTables.push({ tableName: t, count: c });
        }
      }
      return {
        id: cat.id,
        categoryLabel: cat.label,
        tablesIncluded: foundTables,
        recordCount: count,
        description: cat.description,
      };
    });

    return {
      fileName: raw.file_name,
      filePath: raw.file_path,
      sizeBytes: raw.size_bytes,
      backupType: "full_db",
      totalTables: raw.tables_count,
      totalRecords: raw.total_records,
      categories: categoriesReport,
      rawTables: raw.tables,
    };
  } else {
    const insp = await inspectBackupFile(filePath);
    if (!insp.pkg) {
      throw new Error(insp.error || "File di backup non valido");
    }

    const pkg = insp.pkg;
    const tableMap = pkg.tableCounts || {};
    let totalRecords = 0;
    const rawTables: { name: string; count: number }[] = [];

    for (const [t, c] of Object.entries(tableMap)) {
      totalRecords += c;
      rawTables.push({ name: t, count: c });
    }

    const categoriesReport: BackupCategoryReportItem[] = BACKUP_CATEGORIES.map((cat) => {
      let count = 0;
      const foundTables: TableCountItem[] = [];
      for (const t of cat.tables) {
        if (t in tableMap) {
          const c = tableMap[t] || 0;
          count += c;
          foundTables.push({ tableName: t, count: c });
        }
      }
      return {
        id: cat.id,
        categoryLabel: cat.label,
        tablesIncluded: foundTables,
        recordCount: count,
        description: cat.description,
      };
    });

    return {
      fileName,
      filePath,
      sizeBytes: 0,
      createdAtFormatted: new Date(pkg.createdAt).toLocaleString("it-IT"),
      backupType: "modular_json",
      totalTables: rawTables.length,
      totalRecords,
      categories: categoriesReport,
      rawTables,
    };
  }
}

export interface BackupCategoryMeta {
  id: string;
  label: string;
  description: string;
  tables: string[];
}

export const BACKUP_CATEGORIES: BackupCategoryMeta[] = [
  {
    id: "price_lists",
    label: "Listini Prezzi e Prodotti",
    description: "Catalogo generale articoli (9.700+), listini clienti personalizzati (18.500+), cestino e log.",
    tables: [
      "listino_generale",
      "listini_clienti",
      "listino_generale_cestino",
      "listini_clienti_cestino",
      "listini_prezzi_log",
    ],
  },
  {
    id: "ddt",
    label: "DDT e Righe Documento",
    description: "Tutti i DDT archiviati (11.000+), righe articoli (32.000+), destinazioni e log.",
    tables: ["ddt_documents", "ddt_items", "ddt_logs"],
  },
  {
    id: "clients",
    label: "Clienti e Destinazioni",
    description: "Anagrafica completa clienti Brico Class e sedi operative di consegna.",
    tables: ["clients"],
  },
  {
    id: "invoices",
    label: "Fatture Fornitori ed Elettroniche",
    description: "Archivio fornitori, fatture di acquisto registrate e relative righe di costo.",
    tables: ["suppliers", "supplier_invoices", "supplier_invoice_items"],
  },
  {
    id: "notes",
    label: "Note e Cestino Note",
    description: "Tutte le note di testo, fogli di lavoro e storico cestino a 10 elementi.",
    tables: ["notes", "notes_trash"],
  },
  {
    id: "offers",
    label: "Offerte e Cestino Offerte",
    description: "Proposte commerciali salvate, righe e cestino offerte.",
    tables: ["offers", "offers_trash"],
  },
  {
    id: "quotes",
    label: "Preventivi e Cestino",
    description: "Preventivi clienti emessi, righe articoli, sequenze annuali e cestino.",
    tables: ["quotes", "quote_items", "quotes_trash", "quote_sequences"],
  },
  {
    id: "orders",
    label: "Ordini Fornitori e Numeri OR",
    description: "Registri ordini emessi e storico audit log.",
    tables: ["orders", "order_audit_logs"],
  },
  {
    id: "settings",
    label: "Impostazioni e Configurazioni",
    description: "Dati aziendali, email banca/commercialista, utenti di accesso e preferenze.",
    tables: ["company_settings", "email_settings", "app_preferences", "app_users"],
  },
];

export interface BackupPackage {
  app: "Last";
  version: "1.0";
  createdAt: string;
  type: "full" | "modular";
  selectedCategories: string[];
  tableCounts: Record<string, number>;
  tables: Record<string, any[]>;
}

export interface BackupFileInfo {
  filename: string;
  path: string;
  size_bytes: number;
  modified_iso: string;
  backup_type: "full_db" | "modular_json" | "unknown";
}

export interface BackupConfig {
  folderPath: string;
  autoDailyEnabled: boolean;
  autoBackupType: "full" | "modular";
  autoCategories: string[];
  lastRunDate: string | null;
  lastRunTimestamp: string | null;
  lastRunBy: string | null;
  maxHistoryCount: number; // Massimo 15 backup (FIFO)
}

export const DEFAULT_MAX_HISTORY = 15;
export const DEFAULT_BACKUP_FOLDER = "";

/**
 * Restituisce il percorso del Desktop dell'utente corrente (su Windows USERPROFILE o OneDrive)
 */
export async function getDefaultDesktopFolder(): Promise<string> {
  try {
    const desktop = await invoke<string>("get_default_desktop_folder");
    return desktop || "";
  } catch (err) {
    console.warn("[backupService] Errore recupero Desktop predefinito:", err);
    return "";
  }
}

const CONFIG_STORAGE_KEY = "last_backup_configuration_v1";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  configPath: string;
}

let cachedSupabaseConfig: SupabaseConfig | null = null;

async function getSupabaseCredentials(): Promise<SupabaseConfig | null> {
  if (cachedSupabaseConfig) return cachedSupabaseConfig;
  try {
    const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
    if (status?.config?.projectUrl && status?.config?.anonKey) {
      cachedSupabaseConfig = {
        projectUrl: status.config.projectUrl.replace(/\/$/, ""),
        anonKey: status.config.anonKey.trim(),
      };
      return cachedSupabaseConfig;
    }
  } catch (err) {
    console.warn("[backupService] Impossibile recuperare credenziali Supabase:", err);
  }
  return null;
}

export function loadBackupConfig(): BackupConfig {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          folderPath: parsed.folderPath || DEFAULT_BACKUP_FOLDER,
          autoDailyEnabled: parsed.autoDailyEnabled ?? true,
          autoBackupType: parsed.autoBackupType || "full",
          autoCategories: parsed.autoCategories || BACKUP_CATEGORIES.map((c) => c.id),
          lastRunDate: parsed.lastRunDate || null,
          lastRunTimestamp: parsed.lastRunTimestamp || null,
          lastRunBy: parsed.lastRunBy || null,
          maxHistoryCount: parsed.maxHistoryCount || DEFAULT_MAX_HISTORY,
        };
      }
    }
  } catch (err) {
    console.warn("[backupService] Errore lettura config backup:", err);
  }

  return {
    folderPath: DEFAULT_BACKUP_FOLDER,
    autoDailyEnabled: true,
    autoBackupType: "full",
    autoCategories: BACKUP_CATEGORIES.map((c) => c.id),
    lastRunDate: null,
    lastRunTimestamp: null,
    lastRunBy: null,
    maxHistoryCount: DEFAULT_MAX_HISTORY,
  };
}

export function saveBackupConfig(config: BackupConfig): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    }
    // Sincronizza asincronamente con Supabase
    void pushBackupSettingsToSupabase(config);
  } catch (err) {
    console.warn("[backupService] Errore salvataggio config backup:", err);
  }
}

/**
 * Invia la configurazione di backup al Cloud Supabase (tabella backup_settings)
 */
export async function pushBackupSettingsToSupabase(config: BackupConfig): Promise<boolean> {
  try {
    const creds = await getSupabaseCredentials();
    if (!creds) return false;

    const row = {
      id: "backup_config",
      folder_path: config.folderPath,
      auto_daily_enabled: config.autoDailyEnabled,
      auto_backup_type: config.autoBackupType,
      auto_categories: config.autoCategories,
      last_run_date: config.lastRunDate,
      last_run_timestamp: config.lastRunTimestamp,
      last_run_by: config.lastRunBy || "system",
      max_history_count: config.maxHistoryCount || DEFAULT_MAX_HISTORY,
      updated_at: new Date().toISOString(),
    };

    const url = `${creds.projectUrl}/rest/v1/backup_settings`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: creds.anonKey,
        Authorization: `Bearer ${creds.anonKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(row),
    });

    return res.ok;
  } catch (err) {
    console.warn("[backupService] Errore push backup_settings su Supabase:", err);
    return false;
  }
}

/**
 * Scarica la configurazione di backup dal Cloud Supabase
 */
export async function pullBackupSettingsFromSupabase(): Promise<BackupConfig | null> {
  try {
    const creds = await getSupabaseCredentials();
    if (!creds) return null;

    const url = `${creds.projectUrl}/rest/v1/backup_settings?id=eq.backup_config&select=*`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: creds.anonKey,
        Authorization: `Bearer ${creds.anonKey}`,
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0]) {
      const r = data[0];
      const parsed: BackupConfig = {
        folderPath: r.folder_path || DEFAULT_BACKUP_FOLDER,
        autoDailyEnabled: r.auto_daily_enabled ?? true,
        autoBackupType: r.auto_backup_type || "full",
        autoCategories: Array.isArray(r.auto_categories) ? r.auto_categories : BACKUP_CATEGORIES.map((c) => c.id),
        lastRunDate: r.last_run_date || null,
        lastRunTimestamp: r.last_run_timestamp || null,
        lastRunBy: r.last_run_by || null,
        maxHistoryCount: r.max_history_count || DEFAULT_MAX_HISTORY,
      };

      if (typeof localStorage !== "undefined") {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(parsed));
      }

      return parsed;
    }
  } catch (err) {
    console.warn("[backupService] Errore pull backup_settings da Supabase:", err);
  }
  return null;
}

/**
 * Conta i record attuali nel database per ciascuna categoria
 */
export async function getCategoryRecordCounts(): Promise<Record<string, number>> {
  const db = await getDatabase();
  const counts: Record<string, number> = {};

  for (const cat of BACKUP_CATEGORIES) {
    let total = 0;
    for (const table of cat.tables) {
      try {
        const rows = await db.select<{ count: number }[]>(`SELECT COUNT(*) as count FROM ${table}`);
        if (rows && rows[0]) {
          total += rows[0].count;
        }
      } catch {
        // Tabella potrebbe non esistere se non ancora migrata
      }
    }
    counts[cat.id] = total;
  }

  return counts;
}

/**
 * Seleziona la cartella di destinazione tramite finestra nativa Windows
 */
export async function selectBackupFolder(currentPath?: string): Promise<string | null> {
  const chosen = await invoke<string | null>("select_folder_dialog", {
    defaultPath: currentPath || null,
  });
  return chosen;
}

/**
 * Seleziona un file di backup da importare tramite finestra nativa Windows
 */
export async function selectBackupFile(): Promise<string | null> {
  const chosen = await invoke<string | null>("select_backup_file_dialog");
  return chosen;
}

/**
 * Apre la cartella in Esplora Risorse
 */
export async function openFolderInExplorer(folderPath: string): Promise<void> {
  await invoke("open_folder_in_explorer", { folderPath });
}

/**
 * Elenca i backup presenti nella cartella configurata
 */
export async function listBackups(folderPath: string): Promise<BackupFileInfo[]> {
  try {
    const list = await invoke<BackupFileInfo[]>("list_backups_in_directory", { folderPath });
    return list || [];
  } catch (err) {
    console.warn("[backupService] Errore listBackups:", err);
    return [];
  }
}

/**
 * Esegue la pulizia automatica FIFO: mantiene i più recenti N backup (default 15) ed elimina i più vecchi
 */
export async function cleanOldBackups(folderPath: string, keepCount: number = DEFAULT_MAX_HISTORY): Promise<number> {
  try {
    const deleted = await invoke<number>("clean_old_backups", { folderPath, keepCount });
    return deleted;
  } catch (err) {
    console.warn("[backupService] Errore pulizia vecchi backup:", err);
    return 0;
  }
}

/**
 * Elimina un singolo file di backup
 */
export async function deleteBackupFile(filePath: string): Promise<boolean> {
  try {
    await invoke("delete_backup_file", { filePath });
    return true;
  } catch (err) {
    console.warn("[backupService] Errore eliminazione file:", err);
    return false;
  }
}

/**
 * Controlla se nella cartella condivisa o su Supabase esiste già un backup per la data odierna
 */
export async function checkTodayBackupAlreadyDone(
  folderPath: string,
  dateStr: string
): Promise<{ exists: boolean; filename?: string; source?: "shared_folder" | "supabase" }> {
  // 1. Controllo fisico nella cartella condivisa (se un altro PC ha già scritto il file per oggi)
  try {
    const foundFile = await invoke<string | null>("check_today_backup_exists", {
      folderPath,
      dateStr,
    });
    if (foundFile) {
      return { exists: true, filename: foundFile, source: "shared_folder" };
    }
  } catch (err) {
    console.warn("[backupService] Errore verifica file condiviso per oggi:", err);
  }

  // 2. Controllo su Supabase (se un altro PC ha registrato il backup per oggi)
  try {
    const remote = await pullBackupSettingsFromSupabase();
    if (remote && remote.lastRunDate === dateStr) {
      return {
        exists: true,
        filename: `Registrato da ${remote.lastRunBy || "altra postazione"}`,
        source: "supabase",
      };
    }
  } catch (err) {
    console.warn("[backupService] Errore verifica Supabase per oggi:", err);
  }

  return { exists: false };
}

/**
 * Genera il timestamp per il nome del file nel formato: "aaaa.mm.gg ore hh.mm"
 */
function getBackupFileTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  return `${yyyy}.${mm}.${dd} ore ${hh}.${min}`;
}

/**
 * Esegue il backup completo dell'intero database SQLite con pulizia FIFO a 15 elementi
 */
export async function executeFullDatabaseBackup(folderPath: string): Promise<{
  success: boolean;
  filePath: string;
  sizeBytes: number;
  deletedOldBackups?: number;
  error?: string;
}> {
  try {
    const ts = getBackupFileTimestamp();
    const targetFile = `${folderPath.replace(/[\\/]$/, "")}\\Backup Completo ${ts}.db`;

    const size = await invoke<number>("copy_database_file", { targetFilePath: targetFile });

    // Pulizia FIFO: mantieni massimo 15 backup
    const deleted = await cleanOldBackups(folderPath, DEFAULT_MAX_HISTORY);

    return {
      success: true,
      filePath: targetFile,
      sizeBytes: size,
      deletedOldBackups: deleted,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[backupService] Errore backup completo:", msg);
    return {
      success: false,
      filePath: "",
      sizeBytes: 0,
      error: msg,
    };
  }
}

/**
 * Esegue il backup modulare (o totale) in formato JSON / .lastbackup con pulizia FIFO a 15 elementi
 */
export async function executeModularBackup(
  folderPath: string,
  selectedCategoryIds: string[]
): Promise<{
  success: boolean;
  filePath: string;
  sizeBytes: number;
  tableCounts: Record<string, number>;
  deletedOldBackups?: number;
  error?: string;
}> {
  try {
    const db = await getDatabase();
    const tablesToExport = new Set<string>();

    for (const cat of BACKUP_CATEGORIES) {
      if (selectedCategoryIds.includes(cat.id)) {
        for (const t of cat.tables) {
          tablesToExport.add(t);
        }
      }
    }

    const exportedData: Record<string, any[]> = {};
    const tableCounts: Record<string, number> = {};

    for (const table of tablesToExport) {
      try {
        const rows = await db.select<any[]>(`SELECT * FROM ${table}`);
        exportedData[table] = rows || [];
        tableCounts[table] = rows?.length || 0;
      } catch (err) {
        console.warn(`[backupService] Tabella ${table} non disponibile durante esportazione:`, err);
        exportedData[table] = [];
        tableCounts[table] = 0;
      }
    }

    const isTotal = selectedCategoryIds.length === BACKUP_CATEGORIES.length;
    const pkg: BackupPackage = {
      app: "Last",
      version: "1.0",
      createdAt: new Date().toISOString(),
      type: isTotal ? "full" : "modular",
      selectedCategories: selectedCategoryIds,
      tableCounts,
      tables: exportedData,
    };

    const ts = getBackupFileTimestamp();
    const prefix = isTotal ? "Backup Completo Modulare" : "Backup Modulare";
    const targetFile = `${folderPath.replace(/[\\/]$/, "")}\\${prefix} ${ts}.lastbackup`;

    const json = JSON.stringify(pkg, null, 2);
    const size = await invoke<number>("write_backup_file", {
      filePath: targetFile,
      content: json,
    });

    // Pulizia FIFO: mantieni massimo 15 backup
    const deleted = await cleanOldBackups(folderPath, DEFAULT_MAX_HISTORY);

    return {
      success: true,
      filePath: targetFile,
      sizeBytes: size,
      tableCounts,
      deletedOldBackups: deleted,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[backupService] Errore backup modulare:", msg);
    return {
      success: false,
      filePath: "",
      sizeBytes: 0,
      tableCounts: {},
      error: msg,
    };
  }
}

/**
 * Ispeziona un file di backup prima del ripristino
 */
export async function inspectBackupFile(filePath: string): Promise<{
  isValid: boolean;
  isDatabaseFile: boolean;
  pkg?: BackupPackage;
  error?: string;
}> {
  try {
    if (filePath.toLowerCase().endsWith(".db")) {
      return {
        isValid: true,
        isDatabaseFile: true,
      };
    }

    const content = await invoke<string>("read_backup_file", { filePath });
    const parsed: BackupPackage = JSON.parse(content);

    if (parsed.app !== "Last" || !parsed.tables) {
      return {
        isValid: false,
        isDatabaseFile: false,
        error: "Il file selezionato non è un pacchetto di backup valido per Last.",
      };
    }

    return {
      isValid: true,
      isDatabaseFile: false,
      pkg: parsed,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      isValid: false,
      isDatabaseFile: false,
      error: `Impossibile analizzare il file di backup: ${msg}`,
    };
  }
}

/**
 * Ripristina un file di database SQLite fisico (.db)
 */
export async function restoreDatabaseFile(filePath: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    await invoke("restore_database_file", { sourceFilePath: filePath });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Ripristina dati modulari da un pacchetto JSON/.lastbackup
 */
export async function restoreModularBackup(
  pkg: BackupPackage,
  categoriesToRestore: string[],
  mode: "merge" | "replace"
): Promise<{
  success: boolean;
  restoredCounts: Record<string, number>;
  error?: string;
}> {
  const db = await getDatabase();
  const restoredCounts: Record<string, number> = {};

  try {
    const tablesToRestore = new Set<string>();
    for (const cat of BACKUP_CATEGORIES) {
      if (categoriesToRestore.includes(cat.id)) {
        for (const t of cat.tables) {
          tablesToRestore.add(t);
        }
      }
    }

    await db.execute("BEGIN TRANSACTION;");

    for (const table of tablesToRestore) {
      const rows = pkg.tables[table];
      if (!Array.isArray(rows) || rows.length === 0) {
        restoredCounts[table] = 0;
        continue;
      }

      if (mode === "replace") {
        await db.execute(`DELETE FROM ${table};`);
      }

      let count = 0;
      for (const row of rows) {
        const keys = Object.keys(row);
        if (keys.length === 0) continue;

        const columns = keys.map((k) => `"${k}"`).join(", ");
        const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
        const values = keys.map((k) => row[k]);

        const sql = `INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders});`;
        await db.execute(sql, values);
        count++;
      }

      restoredCounts[table] = count;
    }

    await db.execute("COMMIT;");
    return { success: true, restoredCounts };
  } catch (err) {
    await db.execute("ROLLBACK;");
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[backupService] Errore ripristino modulare:", msg);
    return { success: false, restoredCounts: {}, error: msg };
  }
}

/**
 * Controllo ed esecuzione automatica del backup giornaliero con intelligenza multi-utente.
 * Se un'altra postazione ha già effettuato il backup nella cartella condivisa per oggi, salta!
 */
export async function checkAndExecuteDailyBackup(currentUserName?: string): Promise<{
  ran: boolean;
  skippedMultiUser?: boolean;
  alreadyDoneFile?: string;
  filePath?: string;
  error?: string;
}> {
  const config = loadBackupConfig();
  let folder = config.folderPath;
  if (!folder) {
    folder = await getDefaultDesktopFolder();
  }
  if (!config.autoDailyEnabled || !folder) {
    return { ran: false };
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Verifica multi-utente: se il backup per oggi esiste già nella cartella condivisa o su Supabase
  const check = await checkTodayBackupAlreadyDone(folder, todayStr);
  if (check.exists) {
    config.lastRunDate = todayStr;
    saveBackupConfig(config);
    return {
      ran: false,
      skippedMultiUser: true,
      alreadyDoneFile: check.filename,
    };
  }

  // 2. Se non esiste ancora per oggi, questa postazione esegue il backup
  try {
    let res: { success: boolean; filePath: string; error?: string };

    if (config.autoBackupType === "full") {
      res = await executeFullDatabaseBackup(folder);
    } else {
      res = await executeModularBackup(folder, config.autoCategories);
    }

    if (res.success) {
      config.lastRunDate = todayStr;
      config.lastRunTimestamp = new Date().toISOString();
      config.lastRunBy = currentUserName || "PC In Avvio";
      saveBackupConfig(config);
      return { ran: true, filePath: res.filePath };
    } else {
      return { ran: false, error: res.error };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ran: false, error: msg };
  }
}
