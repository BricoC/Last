import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";

export interface BackupCategoryMeta {
  id: string;
  label: string;
  description: string;
  tables: string[];
}

export const BACKUP_CATEGORIES: BackupCategoryMeta[] = [
  {
    id: "ddt",
    label: "DDT e Righe Documento",
    description: "Tutti i DDT archiviati, righe articoli, destinazioni e dati collegati.",
    tables: ["ddt_documents", "ddt_items"],
  },
  {
    id: "clients",
    label: "Clienti e Destinazioni",
    description: "Anagrafica completa clienti, sedi operative e listini associati.",
    tables: ["clients", "client_price_lists"],
  },
  {
    id: "price_lists",
    label: "Listini Prezzi e Prodotti",
    description: "Catalogo generale articoli, prezzi di acquisto/vendita e storico listini.",
    tables: ["products", "price_lists", "price_lists_trash"],
  },
  {
    id: "notes",
    label: "Note e Cestino Note",
    description: "Tutte le note di testo, formattazione e storico del cestino a 10 elementi.",
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
    description: "Preventivi clienti emessi, numerazione annuale, righe e cestino preventivi.",
    tables: ["quotes", "quote_rows", "quotes_trash", "quote_rows_trash"],
  },
  {
    id: "orders",
    label: "Ordini Fornitori e Numeri OR",
    description: "Registri ordini emessi, righe e numeratori OR.",
    tables: ["orders", "order_items", "or_numbers"],
  },
  {
    id: "settings",
    label: "Impostazioni e Configurazioni",
    description: "Dati aziendali Brico Class, email destinatari banca, commercialista e cartiere.",
    tables: ["company_settings", "email_settings"],
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
  filename: String;
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
}

const CONFIG_STORAGE_KEY = "last_backup_configuration_v1";

export function loadBackupConfig(): BackupConfig {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          folderPath: parsed.folderPath || "D:\\BricoClassFiles\\Backup",
          autoDailyEnabled: parsed.autoDailyEnabled ?? true,
          autoBackupType: parsed.autoBackupType || "full",
          autoCategories: parsed.autoCategories || BACKUP_CATEGORIES.map((c) => c.id),
          lastRunDate: parsed.lastRunDate || null,
          lastRunTimestamp: parsed.lastRunTimestamp || null,
        };
      }
    }
  } catch (err) {
    console.warn("[backupService] Errore lettura config backup:", err);
  }

  return {
    folderPath: "D:\\BricoClassFiles\\Backup",
    autoDailyEnabled: true,
    autoBackupType: "full",
    autoCategories: BACKUP_CATEGORIES.map((c) => c.id),
    lastRunDate: null,
    lastRunTimestamp: null,
  };
}

export function saveBackupConfig(config: BackupConfig): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    }
  } catch (err) {
    console.warn("[backupService] Errore salvataggio config backup:", err);
  }
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
        // Tabella potrebbe non esistere ancora se migrazione opzionale
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
 * Genera il timestamp per il nome del file
 */
function getTimestampString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

/**
 * Esegue il backup completo dell'intero database SQLite
 */
export async function executeFullDatabaseBackup(folderPath: string): Promise<{
  success: boolean;
  filePath: string;
  sizeBytes: number;
  error?: string;
}> {
  try {
    const ts = getTimestampString();
    const targetFile = `${folderPath.replace(/[\\/]$/, "")}\\Backup_Last_Completo_${ts}.db`;

    const size = await invoke<number>("copy_database_file", { targetFilePath: targetFile });
    return {
      success: true,
      filePath: targetFile,
      sizeBytes: size,
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
 * Esegue il backup modulare (o totale) in formato JSON / .lastbackup
 */
export async function executeModularBackup(
  folderPath: string,
  selectedCategoryIds: string[]
): Promise<{
  success: boolean;
  filePath: string;
  sizeBytes: number;
  tableCounts: Record<string, number>;
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

    const ts = getTimestampString();
    const prefix = isTotal ? "Backup_Last_Totale" : "Backup_Last_Personalizzato";
    const targetFile = `${folderPath.replace(/[\\/]$/, "")}\\${prefix}_${ts}.lastbackup`;

    const json = JSON.stringify(pkg, null, 2);
    const size = await invoke<number>("write_backup_file", {
      filePath: targetFile,
      content: json,
    });

    return {
      success: true,
      filePath: targetFile,
      sizeBytes: size,
      tableCounts,
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
    // Raccoglie le tabelle da ripristinare
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

        // Inserimento con clausola OR REPLACE per gestire i conflitti
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
 * Controllo ed esecuzione automatica del backup giornaliero
 */
export async function checkAndExecuteDailyBackup(): Promise<{
  ran: boolean;
  filePath?: string;
  error?: string;
}> {
  const config = loadBackupConfig();
  if (!config.autoDailyEnabled || !config.folderPath) {
    return { ran: false };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (config.lastRunDate === todayStr) {
    return { ran: false }; // Già eseguito per oggi
  }

  try {
    let res: { success: boolean; filePath: string; error?: string };

    if (config.autoBackupType === "full") {
      res = await executeFullDatabaseBackup(config.folderPath);
    } else {
      res = await executeModularBackup(config.folderPath, config.autoCategories);
    }

    if (res.success) {
      config.lastRunDate = todayStr;
      config.lastRunTimestamp = new Date().toISOString();
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
