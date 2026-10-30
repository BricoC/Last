import React from "react";
import { CheckCircle2, Clock, AlertCircle, Mail, Edit3, Plus, ExternalLink } from "lucide-react";
import { OrRow, getOrStatus } from "../types/orNumbers";
import { cn } from "@/shared/utils/cn";

interface OrTableProps {
  title: string;
  type: "CARRARA" | "WEPA";
  rows: OrRow[];
  selectedIds: Set<string>;
  onToggleSelectRow: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpenDdt: (id: string) => void;
  onOpenInStudio?: (id: string) => void;
  onAssignOr: (row: OrRow) => void;
  onSendCarraraRed?: () => void;
  onSendCarraraYellow?: () => void;
  onSendWepaMulti?: () => void;
  onSendSelected: () => void;
  onSendSingle: (row: OrRow) => void;
  isSendingEmail: boolean;
}

export const OrTable: React.FC<OrTableProps> = ({
  title,
  type,
  rows,
  selectedIds,
  onToggleSelectRow,
  onToggleSelectAll,
  onOpenDdt,
  onOpenInStudio,
  onAssignOr,
  onSendCarraraRed,
  onSendCarraraYellow,
  onSendWepaMulti,
  onSendSelected,
  onSendSingle,
  isSendingEmail,
}) => {
  const redCount = rows.filter((r) => getOrStatus(r) === "red").length;
  const yellowCount = rows.filter((r) => getOrStatus(r) === "yellow").length;
  const greenCount = rows.filter((r) => getOrStatus(r) === "green").length;

  const currentTableSelectedCount = rows.filter((r) => selectedIds.has(r.id)).length;
  const isAllSelected = rows.length > 0 && currentTableSelectedCount === rows.length;

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "—";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
      {/* Table Header Compatto */}
      <div className="px-3 py-1.5 bg-[var(--background)]/80 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xs font-black uppercase tracking-wider text-[var(--foreground)]">
            {title}
          </h2>
          <div className="flex items-center gap-1 text-[10px] font-semibold">
            <span
              className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1"
              title="DDT nuovi senza richiesta OR inviata"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {redCount} Rossi
            </span>
            <span
              className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1"
              title="DDT con richiesta inviata, in attesa di OR"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {yellowCount} Gialli
            </span>
            <span
              className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"
              title="DDT con numero ordine assegnato"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {greenCount} Conclusi
            </span>
          </div>
        </div>

        {/* Action Buttons Compatti */}
        <div className="flex items-center gap-1">
          {type === "CARRARA" ? (
            <>
              <button
                type="button"
                onClick={onSendCarraraRed}
                disabled={isSendingEmail || redCount === 0}
                className="px-2 py-0.5 text-[11px] font-bold rounded border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/25 active:bg-red-500/35 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                title="Invia email cumulativa con tutti i DDT Rossi (nuovi)"
              >
                <Mail className="w-3 h-3 text-red-400" />
                <span>Carrara Rossi ({redCount})</span>
              </button>
              <button
                type="button"
                onClick={onSendCarraraYellow}
                disabled={isSendingEmail || yellowCount === 0}
                className="px-2 py-0.5 text-[11px] font-bold rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/25 active:bg-amber-500/35 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                title="Invia sollecito cumulativo con tutti i DDT Gialli (in attesa)"
              >
                <Clock className="w-3 h-3 text-amber-400" />
                <span>Carrara Gialli ({yellowCount})</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onSendWepaMulti}
              disabled={isSendingEmail || redCount === 0}
              className="px-2 py-0.5 text-[11px] font-bold rounded border border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/25 active:bg-purple-500/35 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
              title="Invia email con separazione automatica Salanetti / Ralletta"
            >
              <Mail className="w-3 h-3 text-purple-400" />
              <span>Wepa Multi ({redCount})</span>
            </button>
          )}

          {/* Invia selezionati */}
          <button
            type="button"
            onClick={onSendSelected}
            disabled={isSendingEmail || currentTableSelectedCount === 0}
            className={cn(
              "px-2 py-0.5 text-[11px] font-bold rounded border transition-colors flex items-center gap-1 cursor-pointer",
              currentTableSelectedCount > 0
                ? "border-blue-500/50 bg-blue-600 text-white hover:bg-blue-500"
                : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] opacity-40 cursor-not-allowed"
            )}
            title="Invia email con i soli DDT con spunta selezionata"
          >
            <Mail className="w-3 h-3" />
            <span>Invia ({currentTableSelectedCount})</span>
          </button>
        </div>
      </div>

      {/* Table Content Ultra Compatto */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--background)] border-b border-[var(--border)] uppercase text-[10px] font-bold text-[var(--muted-foreground)] tracking-wider">
            <tr>
              <th className="py-1 px-1.5 w-7 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={onToggleSelectAll}
                  disabled={rows.length === 0}
                  className="rounded border-[var(--border)] text-blue-600 focus:ring-0 cursor-pointer scale-90"
                  title="Seleziona tutti i DDT di questa tabella"
                />
              </th>
              <th className="py-1 px-1.5 w-18 text-center text-[10px]">Data</th>
              <th className="py-1 px-1.5 w-16 text-center text-[10px]">DDT</th>
              <th className="py-1 px-2 text-[10px]">Destinazione</th>
              <th className="py-1 px-1.5 text-center w-36 text-[10px]">Data richiesta OR</th>
              <th className="py-1 px-2 text-[10px]">Ordine</th>
              <th className="py-1 px-1 w-14 text-center text-[10px]">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/30 font-normal">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="py-8 text-center text-xs text-[var(--muted-foreground)]"
                >
                  Nessun DDT trovato per {title} nel mese selezionato.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const status = getOrStatus(row);
                const isChecked = selectedIds.has(row.id);

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "h-[25px] hover:bg-[var(--accent)]/10 transition-colors group",
                      isChecked && "bg-blue-500/10"
                    )}
                  >
                    {/* Checkbox */}
                    <td className="py-0.5 px-1.5 text-center leading-none">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleSelectRow(row.id)}
                        className="rounded border-[var(--border)] text-blue-600 focus:ring-0 cursor-pointer scale-90"
                      />
                    </td>

                    {/* Data */}
                    <td className="py-0.5 px-1.5 text-center font-mono text-[11px] text-[var(--foreground)] whitespace-nowrap leading-none">
                      {formatDateDisplay(row.date)}
                    </td>

                    {/* DDT Badge */}
                    <td className="py-0.5 px-1.5 text-center leading-none">
                      <button
                        type="button"
                        onClick={() => onOpenDdt(row.id)}
                        className={cn(
                          "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-mono text-[11px] font-bold cursor-pointer transition-transform hover:scale-105 active:scale-95 leading-none",
                          status === "green" &&
                            "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/25",
                          status === "yellow" &&
                            "bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25",
                          status === "red" &&
                            "bg-red-500/15 text-red-400 border border-red-500/40 hover:bg-red-500/25"
                        )}
                        title={`DDT ${row.docNumber ?? "Bozza"} (Clicca per aprire in DDT Studio)`}
                      >
                        {status === "green" ? (
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                        ) : status === "yellow" ? (
                          <Clock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-2.5 h-2.5 text-red-400 shrink-0" />
                        )}
                        <span>{row.docNumber ?? "Bozza"}</span>
                      </button>
                    </td>

                    {/* Destinazione */}
                    <td className="py-0.5 px-2 font-medium text-[var(--foreground)] text-[11px] leading-tight">
                      <span
                        className="truncate block max-w-[180px]"
                        title={row.destination}
                      >
                        {row.destination}
                      </span>
                    </td>

                    {/* Data richiesta OR (log) */}
                    <td className="py-0.5 px-1.5 text-center text-[10px] font-mono text-[var(--muted-foreground)] whitespace-nowrap leading-none">
                      {row.statusLog ? (
                        <span className="px-1.5 py-0.2 rounded bg-[var(--background)] border border-[var(--border)] text-[10px]">
                          {row.statusLog}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Ordine (OR) */}
                    <td className="py-0.5 px-2 text-[11px] leading-none">
                      {row.orderReference ? (
                        <div
                          onClick={() => onAssignOr(row)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold cursor-pointer hover:bg-emerald-500/20 transition-colors leading-none"
                          title="Clicca per modificare il numero ordine o lo sconto"
                        >
                          <span className="font-mono">{row.orderReference}</span>
                          <Edit3 className="w-2.5 h-2.5 text-emerald-400/70 shrink-0" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAssignOr(row)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--background)] hover:bg-blue-600 hover:text-white border border-[var(--border)] text-[10px] font-medium text-[var(--muted-foreground)] transition-colors cursor-pointer leading-none"
                        >
                          <Plus className="w-2.5 h-2.5 text-blue-400" />
                          <span>+ Assegna</span>
                        </button>
                      )}
                    </td>

                    {/* Azioni singole */}
                    <td className="py-0.5 px-1 text-center leading-none">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onSendSingle(row)}
                          disabled={isSendingEmail}
                          className="p-1 rounded text-[var(--muted-foreground)] hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
                          title="Invia questo singolo DDT via email (Outlook)"
                        >
                          <Mail className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenInStudio ? onOpenInStudio(row.id) : onOpenDdt(row.id)}
                          className="p-1 rounded text-[var(--muted-foreground)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                          title="Apri DDT completo in DDT Studio"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
