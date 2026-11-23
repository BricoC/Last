const STORAGE_KEY = "last_folder_paths_config_v1";
const LEGACY_SUPPLIER_KEY = "last_supplier_price_list_folder";

export interface FolderPathsConfig {
  supplierPriceListsDir: string;
  oneDriveClientiDir: string;
  oneDriveGeneraliDir: string;
  oneDriveGeneraleFileName: string;
  offlineClientiDir: string;
  offlineGeneraliDir: string;
  offlineGeneraleFileName: string;
  offlineDdtDatiDir: string;
  offlineDdtArticoliDir: string;
}

export const DEFAULT_FOLDER_PATHS_CONFIG: FolderPathsConfig = {
  supplierPriceListsDir: "",
  oneDriveClientiDir: "",
  oneDriveGeneraliDir: "",
  oneDriveGeneraleFileName: "LISTINO GENERALE.xlsm",
  offlineClientiDir: "",
  offlineGeneraliDir: "",
  offlineGeneraleFileName: "LISTINO GENERALE.xlsm",
  offlineDdtDatiDir: "",
  offlineDdtArticoliDir: "",
};

function joinWindowsPath(dir: string, fileName: string): string {
  const cleanDir = dir.trim().replace(/[\\/]+$/, "");
  const cleanFile = fileName.trim().replace(/^[\\/]+/, "");
  if (!cleanDir) return "";
  if (!cleanFile) return cleanDir;
  return `${cleanDir}\\${cleanFile}`;
}

export function loadFolderPathsConfig(): FolderPathsConfig {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_FOLDER_PATHS_CONFIG };
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<FolderPathsConfig>) : {};
    const legacySupplier = localStorage.getItem(LEGACY_SUPPLIER_KEY)?.trim() || "";
    return {
      ...DEFAULT_FOLDER_PATHS_CONFIG,
      ...parsed,
      supplierPriceListsDir: (parsed.supplierPriceListsDir ?? legacySupplier).trim(),
      oneDriveClientiDir: (parsed.oneDriveClientiDir ?? "").trim(),
      oneDriveGeneraliDir: (parsed.oneDriveGeneraliDir ?? "").trim(),
      oneDriveGeneraleFileName: (parsed.oneDriveGeneraleFileName ?? "LISTINO GENERALE.xlsm").trim() || "LISTINO GENERALE.xlsm",
      offlineClientiDir: (parsed.offlineClientiDir ?? "").trim(),
      offlineGeneraliDir: (parsed.offlineGeneraliDir ?? "").trim(),
      offlineGeneraleFileName: (parsed.offlineGeneraleFileName ?? "LISTINO GENERALE.xlsm").trim() || "LISTINO GENERALE.xlsm",
      offlineDdtDatiDir: (parsed.offlineDdtDatiDir ?? "").trim(),
      offlineDdtArticoliDir: (parsed.offlineDdtArticoliDir ?? "").trim(),
    };
  } catch {
    return { ...DEFAULT_FOLDER_PATHS_CONFIG };
  }
}

export function saveFolderPathsConfig(next: FolderPathsConfig): FolderPathsConfig {
  const clean: FolderPathsConfig = {
    supplierPriceListsDir: next.supplierPriceListsDir.trim(),
    oneDriveClientiDir: next.oneDriveClientiDir.trim(),
    oneDriveGeneraliDir: next.oneDriveGeneraliDir.trim(),
    oneDriveGeneraleFileName: next.oneDriveGeneraleFileName.trim() || "LISTINO GENERALE.xlsm",
    offlineClientiDir: next.offlineClientiDir.trim(),
    offlineGeneraliDir: next.offlineGeneraliDir.trim(),
    offlineGeneraleFileName: next.offlineGeneraleFileName.trim() || "LISTINO GENERALE.xlsm",
    offlineDdtDatiDir: next.offlineDdtDatiDir.trim(),
    offlineDdtArticoliDir: next.offlineDdtArticoliDir.trim(),
  };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    localStorage.setItem(LEGACY_SUPPLIER_KEY, clean.supplierPriceListsDir);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("folder-paths-updated", { detail: clean }));
  }
  return clean;
}

export function getOneDriveGeneraleFilePath(cfg: FolderPathsConfig = loadFolderPathsConfig()): string {
  return joinWindowsPath(cfg.oneDriveGeneraliDir, cfg.oneDriveGeneraleFileName);
}

export function getOfflineGeneraleFilePath(cfg: FolderPathsConfig = loadFolderPathsConfig()): string {
  return joinWindowsPath(cfg.offlineGeneraliDir, cfg.offlineGeneraleFileName);
}
