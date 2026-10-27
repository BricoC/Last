import React, { useState, useEffect } from "react";
import { X, GitMerge, CheckCircle2, ArrowRight, Building2, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Client } from "../models/client";
import { clientRepository } from "../services/clientRepository";

interface DuplicateGroup {
  canonical: Client;
  duplicates: Client[];
}

interface ClientMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMerged: () => void;
}

export const ClientMergeModal: React.FC<ClientMergeModalProps> = ({
  isOpen,
  onClose,
  onMerged,
}) => {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const data = await clientRepository.detectDuplicateGroups();
      setGroups(data);
    } catch (err) {
      console.error("Errore rilevamento duplicati:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadGroups();
    }
  }, [isOpen]);

  const handleMergeSingle = async (group: DuplicateGroup) => {
    setMerging(true);
    setStatusMessage(`Unione in corso di ${group.canonical.business_name}...`);
    try {
      await clientRepository.mergeClients(
        group.canonical.id,
        group.duplicates.map((d) => d.id)
      );
      // Ricarica i gruppi rimanenti
      const remaining = groups.filter((g) => g.canonical.id !== group.canonical.id);
      setGroups(remaining);
      onMerged();
      setStatusMessage(`Unito con successo: ${group.canonical.business_name}`);
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : "Errore durante l'unione.");
    } finally {
      setMerging(false);
    }
  };

  const handleMergeAll = async () => {
    if (!window.confirm(`Vuoi unire tutti i ${groups.length} gruppi di duplicati rilevati?`)) return;
    setMerging(true);
    setStatusMessage("Unione di tutti i duplicati in corso...");
    try {
      for (const group of groups) {
        await clientRepository.mergeClients(
          group.canonical.id,
          group.duplicates.map((d) => d.id)
        );
      }
      setGroups([]);
      onMerged();
      setStatusMessage("Tutti i duplicati sono stati uniti con successo!");
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : "Errore durante l'unione.");
    } finally {
      setMerging(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex flex-col w-full max-w-3xl h-[80vh] max-h-[700px] rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95">
        {/* HEADER */}
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--card)]/90 select-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
                <span>Rileva & Unisci Clienti Duplicati</span>
                {groups.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400">
                    {groups.length} gruppi trovati
                  </span>
                )}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Fonde anagrafiche con variazioni di punteggiatura o battitura, trasferendo destinazioni e riassegnando tutti i DDT.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-full hover:bg-[var(--background)]"
          >
            <X className="w-4 h-4" />
          </Button>
        </header>

        {/* TOOLBAR AZIONI */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-[var(--border)] bg-[var(--background)]/50 text-xs">
          <span className="text-[var(--muted-foreground)]">
            I clienti duplicati verranno archiviati e i loro DDT riassegnati al nome corretto.
          </span>

          {groups.length > 0 && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleMergeAll()}
              disabled={merging}
              className="h-7.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <GitMerge className="w-3.5 h-3.5 mr-1.5" />
              Unisci Tutti ({groups.length})
            </Button>
          )}
        </div>

        {/* FEEDBACK */}
        {statusMessage && (
          <div className="px-5 py-2 text-xs bg-sky-500/10 text-sky-300 border-b border-sky-500/20 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-sky-400" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* LISTA GRUPPI DUPLICATI */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-xs text-[var(--muted-foreground)] gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
              <span>Analisi e confronto nomi clienti in corso...</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center p-6 text-[var(--muted-foreground)] space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 opacity-60" />
              <p className="text-sm font-semibold text-[var(--foreground)]">Nessun duplicato rilevato!</p>
              <p className="text-xs">L&apos;archivio anagrafico è pulito e privo di varianti o doppioni.</p>
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.canonical.id}
                className="p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] space-y-3 shadow-xs hover:border-[var(--primary)]/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    {/* Nome Canonico */}
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        Nome Corretto
                      </span>
                      <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--foreground)]">
                        <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{group.canonical.business_name}</span>
                      </div>
                    </div>

                    {/* Duplicati da unire */}
                    <div className="pl-3 border-l-2 border-amber-500/40 space-y-1">
                      <span className="text-[11px] font-semibold text-amber-400">
                        Verranno fusi dentro questo cliente:
                      </span>
                      {group.duplicates.map((dup) => (
                        <div
                          key={dup.id}
                          className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]"
                        >
                          <ArrowRight className="w-3 h-3 text-amber-400/80" />
                          <span className="font-semibold text-[var(--foreground)]/90">
                            {dup.business_name}
                          </span>
                          {(dup.destinations?.length ?? 0) > 0 && (
                            <span className="text-[10px] text-sky-400">
                              ({dup.destinations.length} destinazioni)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleMergeSingle(group)}
                    disabled={merging}
                    className="h-8 text-xs font-semibold text-sky-400 border-sky-500/30 hover:bg-sky-500/10 shrink-0"
                  >
                    <GitMerge className="w-3.5 h-3.5 mr-1" />
                    Unisci Gruppo
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* FOOTER */}
        <footer className="flex justify-end px-5 py-3 border-t border-[var(--border)] bg-[var(--card)]/90 select-none">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
            Chiudi
          </Button>
        </footer>
      </div>
    </div>
  );
};
