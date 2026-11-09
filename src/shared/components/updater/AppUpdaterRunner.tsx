import React, { useEffect } from "react";
import { useAppUpdaterStore } from "@/shared/stores/useAppUpdaterStore";
import { UpdateReadyModal } from "./UpdateReadyModal";
import { DownloadCloud } from "lucide-react";

export const AppUpdaterRunner: React.FC = () => {
  const { init, checkForUpdates, status, downloadProgress, newVersion } = useAppUpdaterStore();

  useEffect(() => {
    void init();

    // Attendi 5 secondi dall'avvio dell'applicazione per avviare il controllo silenzioso
    const timer = setTimeout(() => {
      void checkForUpdates(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [init, checkForUpdates]);

  return (
    <>
      {/* Modal Popup stile Windows Update */}
      <UpdateReadyModal />

      {/* Indicatore discreto e non invasivo durante il download in background */}
      {status === "downloading" && (
        <div className="fixed bottom-3 right-3 z-40 bg-[var(--card)]/95 border border-[var(--border)] px-3 py-2 rounded-lg shadow-xl flex items-center gap-2.5 text-xs text-[var(--foreground)] backdrop-blur-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
          <DownloadCloud className="w-4 h-4 text-emerald-400 animate-bounce" />
          <div className="flex flex-col">
            <span className="font-semibold text-[11px]">
              Scaricamento aggiornamento v{newVersion || "..."}
            </span>
            <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
              Progresso in background: {downloadProgress}%
            </span>
          </div>
        </div>
      )}
    </>
  );
};

