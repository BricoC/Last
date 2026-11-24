import React from "react";
import { Users, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { ClientTurnoverRow } from "../services/dashboardService";
import { DEFAULT_DASHBOARD_YEARS, formatDashboardEur } from "../utils/dashboardViewUtils";

export interface DashboardClientMatrixModalProps {
  availableYears?: number[];
  filteredClients: ClientTurnoverRow[];
  clientSearch: string;
  onChangeClientSearch: (value: string) => void;
  clientSortField: "total" | number;
  onChangeClientSortField: (field: "total" | number) => void;
  clientYearTotals: Record<number, number>;
  grandTotalTurnover: number;
  onClose: () => void;
  onSelectClient: (clientName: string) => void;
}

export const DashboardClientMatrixModal: React.FC<DashboardClientMatrixModalProps> = ({
  availableYears,
  filteredClients,
  clientSearch,
  onChangeClientSearch,
  clientSortField,
  onChangeClientSortField,
  clientYearTotals,
  grandTotalTurnover,
  onClose,
  onSelectClient,
}) => {
  const yearsList = availableYears || DEFAULT_DASHBOARD_YEARS;

  return (
    <div
      data-avorio-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-3 backdrop-blur-xs select-none"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-[98vw] h-[95vh] rounded-2xl border border-[var(--border)] bg-[var(--card)] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]/70 shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-white">
                Matrice Completa Fatturato per Cliente
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Confronto dettagliato di tutti i clienti attivi per ciascun anno (scorrimento orizzontale per gli anni con cliente e totale bloccati)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => onChangeClientSearch(e.target.value)}
              placeholder="Cerca cliente..."
              className="bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-1 text-xs text-white outline-none focus:border-[var(--primary)] w-60"
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--border)] transition-colors cursor-pointer"
              title="Chiudi (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: Tabella completa scrollabile sia orizzontalmente che verticalmente */}
        <div className="flex-1 overflow-auto p-3">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--card)] text-xs uppercase font-bold text-[var(--muted-foreground)] border-b border-[var(--border)] z-20">
              <tr>
                <th className="p-3 align-bottom sticky left-0 bg-[var(--card)] z-30 min-w-[200px] shadow-[2px_0_5px_-1px_rgba(0,0,0,0.5)]">
                  <div className="font-extrabold text-[var(--foreground)]">Cliente</div>
                  <div className="text-[10px] font-sans font-bold text-[var(--muted-foreground)] mt-0.5 lowercase tracking-normal">
                    totale annuo:
                  </div>
                </th>
                {yearsList.map((yr) => (
                  <th
                    key={yr}
                    onClick={() => onChangeClientSortField(yr)}
                    className={cn(
                      "p-3 text-right cursor-pointer hover:text-white transition-colors align-bottom min-w-[105px]",
                      clientSortField === yr && "text-[var(--primary)]"
                    )}
                  >
                    <div className={cn("font-extrabold", clientSortField === yr && "underline")}>
                      Anno {yr}
                    </div>
                    <div className="text-xs font-mono font-bold text-white mt-0.5 tracking-normal">
                      {formatDashboardEur(clientYearTotals[yr] || 0)}
                    </div>
                  </th>
                ))}
                <th
                  onClick={() => onChangeClientSortField("total")}
                  className={cn(
                    "p-3 text-right cursor-pointer hover:text-white transition-colors align-bottom sticky right-0 bg-[var(--card)] z-30 min-w-[130px] shadow-[-2px_0_5px_-1px_rgba(0,0,0,0.5)]",
                    clientSortField === "total" && "text-[var(--primary)]"
                  )}
                >
                  <div className={cn("font-extrabold", clientSortField === "total" && "underline")}>
                    Totale Complessivo
                  </div>
                  <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5 tracking-normal">
                    {formatDashboardEur(grandTotalTurnover)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/40 font-mono text-xs">
              {filteredClients.map((cli) => (
                <tr
                  key={cli.clientName}
                  onClick={() => onSelectClient(cli.clientName)}
                  className="hover:bg-[var(--background)]/80 transition-colors cursor-pointer group"
                >
                  <td className="p-3 font-sans font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] sticky left-0 bg-[var(--card)] group-hover:bg-[#1a202c] z-10 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.5)] truncate max-w-[280px]">
                    {cli.clientName}
                  </td>
                  {yearsList.map((yr) => {
                    const val = cli.turnoverByYear[yr] || 0;
                    return (
                      <td key={yr} className="p-3 text-right text-[var(--muted-foreground)] min-w-[105px]">
                        {val > 0 ? formatDashboardEur(val) : "-"}
                      </td>
                    );
                  })}
                  <td className="p-3 text-right font-bold text-emerald-400 sticky right-0 bg-[var(--card)] group-hover:bg-[#1a202c] z-10 shadow-[-2px_0_5px_-1px_rgba(0,0,0,0.5)] min-w-[130px]">
                    {formatDashboardEur(cli.totalTurnover)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--background)]/60 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Totale: {filteredClients.length} clienti registrati</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-white hover:border-[var(--primary)] text-xs font-semibold cursor-pointer"
          >
            Chiudi (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
