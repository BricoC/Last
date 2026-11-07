import React, { useEffect } from "react";
import { useAppUpdaterStore } from "@/shared/stores/useAppUpdaterStore";
import { Sparkles, RefreshCw, X, ShieldCheck, ArrowRight, Clock } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export const UpdateReadyModal: React.FC = () => {
  const {
    isModalOpen,
    dismissModal,
    restartApp,
    currentVersion,
    newVersion,
    releaseDate,
    releaseNotes,
    status,
  } = useAppUpdaterStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen) {
        dismissModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, dismissModal]);

  if (!isModalOpen || status !== "ready") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl text-[var(--foreground)] animate-in zoom-in-95 duration-150">
        {/* Pulsante Chiusura X */}
        <button
          type="button"
          onClick={dismissModal}
          className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded-md transition-colors"
          title="Chiudi avviso (potrai riavviare più tardi)"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icona e Titolo */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-xs">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[11px] font-bold border border-emerald-500/20 mb-1">
              <span>Download completato in background</span>
            </div>
            <h2 className="text-lg font-bold text-white">Aggiornamento Pronto</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              La nuova versione del gestionale è stata scaricata ed è pronta per essere applicata.
            </p>
          </div>
        </div>

        {/* Badge Versione (Da v0.x -> v1.x) */}
        <div className="my-5 p-3 rounded-lg bg-[var(--background)]/80 border border-[var(--border)] flex items-center justify-between font-mono text-xs">
          <div className="flex items-center gap-3">
            <div>
              <span className="text-[10px] uppercase text-[var(--muted-foreground)] block">Versione attuale</span>
              <span className="font-semibold text-zinc-300">v{currentVersion}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="text-[10px] uppercase text-emerald-400 block font-bold">Nuova versione</span>
              <span className="font-extrabold text-emerald-300">v{newVersion || "..."}</span>
            </div>
          </div>
          {releaseDate && (
            <span className="text-[11px] text-[var(--muted-foreground)] font-sans">
              Rilasciata: {new Date(releaseDate).toLocaleDateString("it-IT")}
            </span>
          )}
        </div>

        {/* Note di Rilascio (se presenti) */}
        {releaseNotes && (
          <div className="mb-4 p-3 rounded-lg bg-zinc-950/40 border border-[var(--border)]/60 text-xs text-zinc-300 max-h-36 overflow-y-auto font-sans leading-relaxed">
            <span className="text-[10px] uppercase font-bold text-[var(--muted-foreground)] block mb-1">
              Novità di questa versione:
            </span>
            <div className="whitespace-pre-wrap">{releaseNotes}</div>
          </div>
        )}

        {/* Avviso Sicurezza Database */}
        <div className="mb-6 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center gap-2.5 text-xs text-blue-200">
          <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0" />
          <span>
            <strong>I tuoi dati sono al sicuro:</strong> il database locale, i backup e le tue impostazioni non vengono modificati.
          </span>
        </div>

        {/* Pulsanti Azione */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--border)]/60">
          <Button
            type="button"
            variant="ghost"
            onClick={dismissModal}
            className="text-xs text-[var(--muted-foreground)] hover:text-white flex items-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Applica al prossimo avvio</span>
          </Button>

          <Button
            type="button"
            onClick={() => void restartApp()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 flex items-center gap-2 shadow-md cursor-pointer transition-all hover:scale-[1.02]"
          >
            <RefreshCw className="w-4 h-4 animate-spin-reverse" />
            <span>Riavvia e Aggiorna ora (3 sec)</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
