import React, { useState, useEffect } from "react";
import { FileText, Calendar, MapPin, RefreshCw, BarChart3 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { clientRepository } from "../services/clientRepository";

interface ClientDdtHistoryTabProps {
  clientName: string;
  onOpenArticleHistory?: () => void;
}

interface ClientDdtSummary {
  id: string;
  doc_number: number | null;
  year: number;
  series: string | null;
  doc_date: string;
  destination_name: string | null;
  destination_city: string | null;
  status: string;
}

export const ClientDdtHistoryTab: React.FC<ClientDdtHistoryTabProps> = ({
  clientName,
  onOpenArticleHistory,
}) => {
  const [ddts, setDdts] = useState<ClientDdtSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!clientName.trim()) {
      setDdts([]);
      return;
    }

    setLoading(true);
    void clientRepository
      .getClientDdts(clientName, 60)
      .then((data) => {
        if (active) {
          setDdts(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Errore recupero DDT cliente:", err);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [clientName]);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/50">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Documenti di Trasporto Emessi ({ddts.length})
            </h3>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Elenco dei DDT intestati a {clientName || "questo cliente"}.
          </p>
        </div>

        {onOpenArticleHistory && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onOpenArticleHistory}
            className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
            Apri Resoconto / Storico Articoli Completo
          </Button>
        )}
      </div>

      {/* Lista DDT */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)]/40">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-xs text-[var(--muted-foreground)] gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
            Ricerca DDT per {clientName}...
          </div>
        ) : ddts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-6 text-[var(--muted-foreground)] space-y-2">
            <FileText className="w-8 h-8 opacity-30 text-sky-400" />
            <p className="text-xs font-medium">Nessun DDT trovato per {clientName}.</p>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              I DDT emessi compariranno automaticamente qui e aggiorneranno i dati del cliente.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[var(--background)] border-b border-[var(--border)] select-none text-[var(--muted-foreground)] font-semibold">
              <tr>
                <th className="py-2 px-3 w-28">N. DDT</th>
                <th className="py-2 px-3 w-28">Data</th>
                <th className="py-2 px-3">Destinazione Merce</th>
                <th className="py-2 px-3 w-28 text-right">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11px]">
              {ddts.map((d) => (
                <tr
                  key={d.id}
                  className="hover:bg-[var(--background)]/80 transition-colors"
                >
                  <td className="py-2 px-3 font-bold text-[var(--foreground)]">
                    {d.doc_number ? `${d.doc_number}${d.series ? `/${d.series}` : ""}` : "-"}
                    <span className="text-[10px] text-[var(--muted-foreground)] font-normal ml-1">
                      ({d.year})
                    </span>
                  </td>
                  <td className="py-2 px-3 font-sans text-xs text-[var(--muted-foreground)]">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 opacity-60" />
                      <span>{d.doc_date || "-"}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 font-sans text-xs text-[var(--foreground)]">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3 h-3 text-sky-400/70 shrink-0" />
                      <span className="truncate">
                        {[d.destination_name, d.destination_city].filter(Boolean).join(" · ") ||
                          "Sede cliente"}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-sans font-semibold uppercase bg-slate-500/10 text-slate-300 border border-slate-500/20">
                      {d.status || "Emesso"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
