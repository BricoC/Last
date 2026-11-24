import React from "react";
import { Maximize2, Users } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { ClientTurnoverRow } from "../services/dashboardService";
import { DEFAULT_DASHBOARD_YEARS, formatDashboardEur } from "../utils/dashboardViewUtils";

export interface DashboardClientMatrixCardProps {
  availableYears?: number[];
  filteredClients: ClientTurnoverRow[];
  clientSearch: string;
  onChangeClientSearch: (value: string) => void;
  clientSortField: "total" | number;
  onChangeClientSortField: (field: "total" | number) => void;
  clientYearTotals: Record<number, number>;
  grandTotalTurnover: number;
  onExpandModal: () => void;
  onSelectClient: (clientName: string) => void;
}

export const DashboardClientMatrixCard: React.FC<DashboardClientMatrixCardProps> = ({
  availableYears,
  filteredClients,
  clientSearch,
  onChangeClientSearch,
  clientSortField,
  onChangeClientSortField,
  clientYearTotals,
  grandTotalTurnover,
  onExpandModal,
  onSelectClient,
}) => {
  const yearsList = availableYears || DEFAULT_DASHBOARD_YEARS;

  return (
    <div className="col-span-7 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 overflow-hidden shadow-xs">
      {/* Header Quadrante 3 */}
      <div className="flex items-center justify-between shrink-0 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            Fatturato Clienti per Anno
          </span>
          <span className="text-[10px] text-[var(--muted-foreground)]">
            ({filteredClients.length} clienti)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Cerca cliente compatto */}
          <div className="relative">
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => onChangeClientSearch(e.target.value)}
              placeholder="Filtra cliente..."
              className="w-32 bg-[var(--background)] border border-[var(--border)] rounded px-2 py-0.5 text-[10px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
            />
          </div>

          {/* Tasto Espandi Matrice a Schermo Intero */}
          <button
            type="button"
            onClick={onExpandModal}
            className="text-[10px] font-semibold bg-[var(--background)] hover:bg-[var(--primary)] hover:text-white border border-[var(--border)] px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer"
            title="Espandi Matrice Clienti a tutto schermo (Esc per chiudere)"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Espandi Tutti</span>
          </button>
        </div>
      </div>

      {/* Tabella Matrice Clienti compatta con Scroll orizzontale e verticale (colonne sticky) */}
      <div className="flex-1 min-h-0 overflow-auto border border-[var(--border)] rounded-lg bg-[var(--background)]/30">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-[var(--card)] text-[10px] uppercase font-bold text-[var(--muted-foreground)] border-b border-[var(--border)] z-20">
            <tr>
              <th className="p-2 align-bottom sticky left-0 bg-[var(--card)] z-30 min-w-[140px] shadow-[2px_0_4px_-1px_rgba(0,0,0,0.5)]">
                <div className="font-extrabold text-[var(--foreground)]">Cliente</div>
                <div className="text-[9px] font-sans font-bold text-[var(--muted-foreground)] mt-0.5 lowercase tracking-normal">
                  totale:
                </div>
              </th>
              {yearsList.map((yr) => (
                <th
                  key={yr}
                  onClick={() => onChangeClientSortField(yr)}
                  className={cn(
                    "p-2 text-right cursor-pointer hover:text-white transition-colors align-bottom min-w-[85px]",
                    clientSortField === yr && "text-[var(--primary)]"
                  )}
                >
                  <div className={cn("font-extrabold", clientSortField === yr && "underline")}>
                    {yr}
                  </div>
                  <div className="text-[10px] font-mono font-bold text-white avorio-ink mt-0.5 tracking-normal">
                    {formatDashboardEur(clientYearTotals[yr] || 0)}
                  </div>
                </th>
              ))}
              <th
                onClick={() => onChangeClientSortField("total")}
                className={cn(
                  "p-2 text-right cursor-pointer hover:text-white avorio-ink-hover transition-colors align-bottom sticky right-0 bg-[var(--card)] z-30 min-w-[95px] shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.5)]",
                  clientSortField === "total" && "text-[var(--primary)]"
                )}
              >
                <div className={cn("font-extrabold", clientSortField === "total" && "underline")}>
                  Totale
                </div>
                <div className="text-[10px] font-mono font-bold text-white avorio-ink mt-0.5 tracking-normal">
                  {formatDashboardEur(grandTotalTurnover)}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11px]">
            {filteredClients.map((cli) => (
              <tr
                key={cli.clientName}
                onClick={() => onSelectClient(cli.clientName)}
                className="hover:bg-[var(--card)]/80 transition-colors cursor-pointer group"
                title={`Clicca per vedere il resoconto articoli di ${cli.clientName}`}
              >
                <td className="p-2 font-sans font-semibold text-[var(--foreground)] truncate max-w-[160px] group-hover:text-[var(--primary)] sticky left-0 bg-[var(--card)] group-hover:bg-[#1a202c] avorio-sticky-cell z-10 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.5)]">
                  {cli.clientName}
                </td>
                {yearsList.map((yr) => {
                  const val = cli.turnoverByYear[yr] || 0;
                  return (
                    <td key={yr} className="p-2 text-right text-[var(--muted-foreground)] min-w-[85px]">
                      {val > 0 ? formatDashboardEur(val) : "-"}
                    </td>
                  );
                })}
                <td className="p-2 text-right font-bold text-white avorio-ink sticky right-0 bg-[var(--card)] group-hover:bg-[#1a202c] avorio-sticky-cell z-10 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.5)] min-w-[95px]">
                  {formatDashboardEur(cli.totalTurnover)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
