const STORAGE_KEY = "last_folder_paths_config_v1";
const LEGACY_SUPPLIER_KEY = "last_supplier_price_list_folder";

export interface FolderPathsConfig {
  supplierPriceListsDir: string;
}

export const DEFAULT_FOLDER_PATHS_CONFIG: FolderPathsConfig = {
  supplierPriceListsDir: "",
};

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
    };
  } catch {
    return { ...DEFAULT_FOLDER_PATHS_CONFIG };
  }
}

export function saveFolderPathsConfig(next: FolderPathsConfig): FolderPathsConfig {
  const clean: FolderPathsConfig = {
    supplierPriceListsDir: next.supplierPriceListsDir.trim(),
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
