import type { DdtListSortField } from "../hooks/useDdtListModel";
import type { DdtListViewRow } from "../services/ddtReadModelsRepository";

type Props = {
  handleSort: (field: DdtListSortField) => void;
  renderSortIndicator: (field: DdtListSortField) => React.ReactNode;
  filtered: DdtListViewRow[];
  selectedIds: Set<string>;
  handleToggleSelectAll: () => void;
};

export function DdtListTableHeader({ handleSort, renderSortIndicator, filtered, selectedIds, handleToggleSelectAll }: Props) {
 return (
            <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
              <tr>
                <th className="px-2.5 py-2 text-center w-9">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size >= filtered.length}
                    onChange={handleToggleSelectAll}
                    className="rounded border-[var(--border)] cursor-pointer accent-blue-500"
                    title={selectedIds.size >= filtered.length ? "Deseleziona tutti" : "Seleziona tutti i DDT filtrati"}
                  />
                </th>
                <th
                  onClick={() => handleSort("date")}
                  className="px-3 py-2 text-left w-36 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">DATA {renderSortIndicator("date")}</span>
                </th>
                <th
                  onClick={() => handleSort("docNumber")}
                  className="px-3 py-2 text-left w-28 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">DDT {renderSortIndicator("docNumber")}</span>
                </th>
                <th
                  onClick={() => handleSort("client")}
                  className="px-3 py-2 text-left w-48 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">CLIENTE {renderSortIndicator("client")}</span>
                </th>
                <th
                  onClick={() => handleSort("destination")}
                  className="px-3 py-2 text-left cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">DESTINAZIONE {renderSortIndicator("destination")}</span>
                </th>
                <th
                  onClick={() => handleSort("taxableSubunits")}
                  className="px-3 py-2 text-right w-32 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    TOTALE IMPONIBILE {renderSortIndicator("taxableSubunits")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("purchaseSubunits")}
                  className="px-3 py-2 text-right w-32 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    PREZZO ACQUISTO {renderSortIndicator("purchaseSubunits")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("revenueSubunits")}
                  className="px-3 py-2 text-right w-28 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    RICAVO {renderSortIndicator("revenueSubunits")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("markupPercent")}
                  className="px-3 py-2 text-right w-24 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    RICARICO % {renderSortIndicator("markupPercent")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("discountPercent")}
                  className="px-2 py-2 text-center w-20 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-center">
                    SCONTO % {renderSortIndicator("discountPercent")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("operator")}
                  className="px-3 py-2 text-center w-24 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-center">
                    OPERATORE {renderSortIndicator("operator")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("reason")}
                  className="px-3 py-2 text-left w-32 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">CAUSALE {renderSortIndicator("reason")}</span>
                </th>
                <th
                  onClick={() => handleSort("orderReference")}
                  className="px-3 py-2 text-left w-36 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">ORDINE {renderSortIndicator("orderReference")}</span>
                </th>
                <th
                  onClick={() => handleSort("payment")}
                  className="px-3 py-2 text-left w-40 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">PAGAMENTO {renderSortIndicator("payment")}</span>
                </th>
              </tr>
            </thead>
 );
}
