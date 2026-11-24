import React, { useState } from "react";
import { FolderOpen, Save, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  loadFolderPathsConfig,
  saveFolderPathsConfig,
  type FolderPathsConfig,
} from "./services/folderPathsSettings";

type FolderFieldKey = keyof FolderPathsConfig;

interface FieldSpec {
  key: FolderFieldKey;
  label: string;
  placeholder: string;
  isFolder: boolean;
}

const FOLDER_FIELDS: FieldSpec[] = [
  {
    key: "supplierPriceListsDir",
    label: "Cartella Listini Fornitori",
    placeholder: "Es. C:\\Cartella\\Listini Fornitori",
    isFolder: true,
  },
];

export const FolderPathsSettingsPanel: React.FC = () => {
  const [config, setConfig] = useState<FolderPathsConfig>(() => loadFolderPathsConfig());
  const [savedNotice, setSavedNotice] = useState(false);

  const handleBrowse = async (key: FolderFieldKey) => {
    try {
      const current = config[key];
      const chosen = await invoke<string | null>("select_folder_dialog", {
        defaultPath: current || null,
      });
      if (chosen) {
        const next = { ...config, [key]: chosen };
        setConfig(next);
        saveFolderPathsConfig(next);
        setSavedNotice(true);
        window.setTimeout(() => setSavedNotice(false), 2000);
      }
    } catch (err) {
      console.warn("[FolderPathsSettingsPanel] Errore selezione cartella:", err);
    }
  };

  const handleSave = () => {
    const saved = saveFolderPathsConfig(config);
    setConfig(saved);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            Percorsi Cartelle e File Locali / OneDrive
          </h3>
          <p className="text-xs text-[var(--muted-foreground)]">
            Configura la cartella locale usata da Listini Fornitori.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--primary)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0"
        >
          {savedNotice ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          <span>{savedNotice ? "Salvato" : "Salva Percorsi"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FOLDER_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--foreground)] block">
              {field.label}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={config[field.key]}
                onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md font-mono text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
              />
              {field.isFolder && (
                <button
                  type="button"
                  onClick={() => void handleBrowse(field.key)}
                  title="Seleziona cartella"
                  className="px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)] text-xs text-[var(--foreground)] flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Sfoglia</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
