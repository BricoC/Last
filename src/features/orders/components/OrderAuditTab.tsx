import React, { useState, useEffect, useMemo, useCallback } from "react";
import { OrderAuditLog } from "@/features/orders/types/order";
import { orderRepository } from "@/features/orders/services/orderRepository";
import { Trash2, RefreshCw, Search, ArrowRight, User } from "lucide-react";

export const OrderAuditTab: React.FC = () => {
  const [logs, setLogs] = useState<OrderAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await orderRepository.getAuditLogs(300);
      setLogs(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  // Calcola le differenze tra vecchio e nuovo oggetto
  const computeDiffs = (oldData?: Record<string, any> | null, newData?: Record<string, any> | null) => {
    if (!oldData && !newData) return [];
    const ignored = new Set(["created_at", "updated_at", "id", "highlights"]);
    const diffs: Array<{ field: string; oldVal: string; newVal: string }> = [];

    const allKeys = new Set([
      ...Object.keys(oldData || {}),
      ...Object.keys(newData || {}),
    ]);

    for (const key of allKeys) {
      if (ignored.has(key)) continue;
      const vOld = oldData?.[key];
      const vNew = newData?.[key];
      if (JSON.stringify(vOld) !== JSON.stringify(vNew)) {
        diffs.push({
          field: key,
          oldVal: vOld !== undefined && vOld !== null && vOld !== "" ? String(vOld) : "(vuoto)",
          newVal: vNew !== undefined && vNew !== null && vNew !== "" ? String(vNew) : "(vuoto)",
        });
      }
    }

    return diffs;
  };

  const filteredLogs = useMemo(() => {
    if (!searchText.trim()) return logs;
    const q = searchText.toLowerCase().trim();
    return logs.filter(
      (l) =>
        (l.summary && l.summary.toLowerCase().includes(q)) ||
        (l.user_name && l.user_name.toLowerCase().includes(q)) ||
        l.operation_type.toLowerCase().includes(q)
    );
  }, [logs, searchText]);

  const toggleSelectLog = (id: string) => {
    setSelectedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedLogs.size === 0) return;
    if (window.confirm(`Eliminare ${selectedLogs.size} record di log?`)) {
      await orderRepository.clearAuditLogs(Array.from(selectedLogs));
      setSelectedLogs(new Set());
      void loadLogs();
    }
  };

  return (
    <div className="flex flex-col h-full w-full select-none text-[var(--foreground)] bg-[var(--background)]">
      {/* Toolbar */}
      <div className="px-5 py-3 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--muted-foreground)] pointer-events-none" />
            <input
              type="text"
              placeholder="Cerca per operatore, tipo o articolo..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-72 pl-8 pr-3 py-1.5 text-xs bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--primary)] font-medium"
            />
          </div>

          {selectedLogs.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-500 cursor-pointer shadow-xs transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Elimina Selezionati ({selectedLogs.size})</span>
            </button>
          )}

          <button
            onClick={loadLogs}
            className="p-1.5 rounded-md bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
            title="Ricarica log"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <span className="text-xs text-[var(--muted-foreground)]">
          Visualizzati gli ultimi <strong>{filteredLogs.length}</strong> eventi registrati
        </span>
      </div>

      {/* Lista Log */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {loading ? (
          <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
            Caricamento storico modifiche...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
            Nessuna operazione registrata.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isSelected = selectedLogs.has(log.id);
            const diffs = computeDiffs(log.old_data, log.new_data);

            const opColor =
              log.operation_type === "INSERT"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : log.operation_type === "DELETE"
                ? "bg-red-500/10 text-red-400 border-red-500/30"
                : "bg-blue-500/10 text-blue-400 border-blue-500/30";

            return (
              <div
                key={log.id}
                onClick={() => toggleSelectLog(log.id)}
                className={`bg-[var(--card)] border rounded-lg p-3 text-xs transition-all cursor-pointer ${
                  isSelected
                    ? "border-[var(--primary)] bg-[var(--accent)]/10"
                    : "border-[var(--border)] hover:border-[var(--border)]/80"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${opColor}`}
                    >
                      {log.operation_type}
                    </span>
                    <span className="font-bold text-[var(--foreground)]">
                      {log.summary || `Operazione su ${log.table_name}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {log.user_name || "Operatore"}
                    </span>
                    <span>
                      {new Date(log.operation_date).toLocaleString("it-IT")}
                    </span>
                  </div>
                </div>

                {/* Diff visivo */}
                {diffs.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-[var(--border)] space-y-1">
                    {diffs.map((d) => (
                      <div
                        key={d.field}
                        className="flex items-center gap-2 text-[11px] font-mono"
                      >
                        <span className="text-[var(--muted-foreground)] font-semibold min-w-28">
                          {d.field}:
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 line-through">
                          {d.oldVal}
                        </span>
                        <ArrowRight className="w-3 h-3 text-[var(--muted-foreground)]" />
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                          {d.newVal}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
