import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Check, Copy, FileText, LoaderCircle } from "lucide-react";
import type { DdtArticleViewRow } from "../services/ddtReadModelsRepository";
import { formatDdtMoney, formatDdtNumber, formatDdtViewDate } from "../services/ddtViewFormatting";
import type { DdtArticleSortField } from "../hooks/useDdtArticlesModel";

type ArticleRow = DdtArticleViewRow & { _searchIndex: string };
type Props = {
  loading: boolean; rows: DdtArticleViewRow[]; filtered: ArticleRow[]; visibleRows: ArticleRow[];
  tableContainerRef: MutableRefObject<HTMLDivElement | null>;
  handleTableKeyDown: (event: React.KeyboardEvent) => void;
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  activeRowId: string | null; setActiveRowId: Dispatch<SetStateAction<string | null>>;
  activeRowElementRef: MutableRefObject<HTMLTableRowElement | null>;
  isKeyboardNavRef: MutableRefObject<boolean>;
  handleSort: (field: DdtArticleSortField) => void;
  renderSortIndicator: (field: DdtArticleSortField) => React.ReactNode;
  setSelectedDdtId: Dispatch<SetStateAction<string | null>>;
  setSelectedArticleForHistory: Dispatch<SetStateAction<DdtArticleViewRow | null>>;
};

export function DdtArticlesTable(props: Props) {
  const {
    loading, rows, filtered, visibleRows, tableContainerRef, handleTableKeyDown, handleScroll,
    activeRowId, setActiveRowId, activeRowElementRef, isKeyboardNavRef, handleSort,
    renderSortIndicator, setSelectedDdtId, setSelectedArticleForHistory,
  } = props;
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  const handleCopyDescription = (e: React.MouseEvent, rowId: string, description: string) => {
    e.stopPropagation();
    const text = (description || "").trim();
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedRowId(rowId);
      window.setTimeout(() => {
        setCopiedRowId((prev) => (prev === rowId ? null : prev));
      }, 1500);
    }).catch(() => {});
  };

  return (
    <>
      {/* Tabella con stile dei popup (colorata, pulita e reattiva) */}
      {loading && rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />Caricamento righe…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-md bg-[var(--card)]">
          Nessuna voce trovata per i filtri selezionati.
        </div>
      ) : (
        <div
          ref={tableContainerRef}
          tabIndex={0}
          onKeyDown={handleTableKeyDown}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-auto border border-[var(--border)] rounded-md bg-[var(--card)] outline-none"
        >
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
              <tr>
                <th
                  onClick={() => handleSort("date")}
                  className="px-3 py-2 text-left w-36 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">DATA {renderSortIndicator("date")}</span>
                </th>
                <th
                  onClick={() => handleSort("docNumber")}
                  className="px-3 py-2 text-left w-24 cursor-pointer select-none hover:text-white transition-colors group"
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
                  className="px-3 py-2 text-left w-48 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">DESTINAZIONE {renderSortIndicator("destination")}</span>
                </th>
                <th
                  onClick={() => handleSort("unit")}
                  className="px-2 py-2 text-center w-14 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-center w-full">UM {renderSortIndicator("unit")}</span>
                </th>
                <th
                  onClick={() => handleSort("quantity")}
                  className="px-3 py-2 text-right w-20 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-end w-full">QUANTITÀ {renderSortIndicator("quantity")}</span>
                </th>
                <th
                  onClick={() => handleSort("description")}
                  className="px-3 py-2 text-left cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center">DESCRIZIONE {renderSortIndicator("description")}</span>
                </th>
                <th
                  onClick={() => handleSort("unitPriceSubunits")}
                  className="px-3 py-2 text-right w-28 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-end w-full">PREZZO UNIT. {renderSortIndicator("unitPriceSubunits")}</span>
                </th>
                <th
                  onClick={() => handleSort("discountPercent")}
                  className="px-2 py-2 text-center w-20 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-center w-full">SCONTO {renderSortIndicator("discountPercent")}</span>
                </th>
                <th
                  onClick={() => handleSort("netAmountSubunits")}
                  className="px-3 py-2 text-right w-28 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-end w-full">IMPORTO {renderSortIndicator("netAmountSubunits")}</span>
                </th>
                <th
                  onClick={() => handleSort("vatRate")}
                  className="px-2 py-2 text-center w-16 cursor-pointer select-none hover:text-white transition-colors group"
                >
                  <span className="inline-flex items-center justify-center w-full">IVA {renderSortIndicator("vatRate")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
              {visibleRows.map((row) => {
                const informational = row.rowKind === "note";
                const isActive = activeRowId === row.id;

                return (
                  <tr
                    key={row.id}
                    ref={isActive ? activeRowElementRef : null}
                    onMouseDown={() => {
                      isKeyboardNavRef.current = false;
                      setActiveRowId(row.id);
                    }}
                    className={`group cursor-default ${
                      isActive
                        ? "bg-[#1e5b87] text-white font-medium"
                        : "hover:bg-[var(--background)]/60"
                    }`}
                  >
                    {/* DATA */}
                    <td className={`px-3 py-2 font-sans font-medium whitespace-nowrap ${
                      isActive ? "text-white" : "text-[var(--foreground)]"
                    }`}>
                      {formatDdtViewDate(row.date)}
                    </td>

                    {/* DDT (Link al popup del DDT) */}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDdtId(row.ddtId);
                        }}
                        className={`font-bold hover:underline inline-flex items-center gap-1.5 cursor-pointer ${
                          isActive ? "text-sky-200 hover:text-white" : "text-[var(--primary)]"
                        }`}
                        title={`Apri dettaglio DDT ${formatDdtNumber(row.docNumber, row.series)}`}
                      >
                        <FileText className="h-3 w-3" />
                        <span>{formatDdtNumber(row.docNumber, row.series)}</span>
                      </button>
                    </td>

                    {/* CLIENTE */}
                    <td
                      className={`px-3 py-2 font-sans font-medium truncate max-w-[200px] ${
                        isActive ? "text-white" : "text-[var(--foreground)]"
                      }`}
                      title={row.client}
                    >
                      {row.client}
                    </td>

                    {/* DESTINAZIONE */}
                    <td
                      className={`px-3 py-2 font-sans truncate max-w-[200px] ${
                        isActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                      title={row.destination}
                    >
                      {row.destination || "—"}
                    </td>

                    {/* UM */}
                    <td className={`px-2 py-2 text-center uppercase ${
                      isActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
                    }`}>
                      {informational ? "" : (row.unit || "NR")}
                    </td>

                    {/* QUANTITÀ */}
                    <td className={`px-3 py-2 text-right font-bold ${
                      isActive ? "text-white" : "text-[var(--foreground)]"
                    }`}>
                      {informational ? "" : row.quantity}
                    </td>

                    {/* DESCRIZIONE (Link al popup storico articolo del cliente + Copia rapida) */}
                    <td className="px-3 py-2 font-sans">
                      <div className="flex items-center justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedArticleForHistory(row);
                          }}
                          className={`group/desc text-left min-w-0 flex-1 cursor-pointer inline-flex items-center justify-between gap-2 ${
                            isActive ? "text-white" : "hover:text-[var(--primary)]"
                          }`}
                          title="Clicca per aprire lo storico acquisti di questo articolo"
                        >
                          <span className={`truncate group-hover/desc:underline font-semibold select-text ${
                            isActive ? "text-white" : "text-[var(--foreground)]"
                          }`}>
                            {row.description}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-sans shrink-0 font-semibold ${
                            isActive
                              ? "bg-white/20 text-white opacity-90 group-hover/desc:opacity-100"
                              : "opacity-0 group-hover:opacity-100 bg-[var(--primary)]/20 text-[var(--primary)]"
                          }`}>
                            Storico ↗
                          </span>
                        </button>
                        {row.description?.trim() && (
                          <button
                            type="button"
                            onClick={(e) => handleCopyDescription(e, row.id, row.description)}
                            className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-sans font-semibold transition-colors cursor-pointer ${
                              copiedRowId === row.id
                                ? "bg-emerald-500/25 text-emerald-300 opacity-100"
                                : isActive
                                ? "bg-white/15 text-white hover:bg-white/25 opacity-90 hover:opacity-100"
                                : "opacity-0 group-hover:opacity-100 bg-[var(--background)]/80 text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]/60"
                            }`}
                            title="Copia descrizione negli appunti"
                          >
                            {copiedRowId === row.id ? (
                              <>
                                <Check className="h-3 w-3" />
                                <span>Copiato</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copia</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* PREZZO UNIT. */}
                    <td className={`px-3 py-2 text-right ${
                      isActive ? "text-sky-100 font-medium" : "text-[var(--muted-foreground)]"
                    }`}>
                      {informational ? "" : (row.unitPriceSubunits > 0 ? formatDdtMoney(row.unitPriceSubunits) : "—")}
                    </td>

                    {/* SCONTO */}
                    <td
                      className={`px-2 py-2 text-center font-medium ${
                        row.discountPercent && row.discountPercent !== "0"
                          ? (isActive ? "text-amber-200 font-bold" : "text-amber-400")
                          : (isActive ? "text-sky-100" : "text-[var(--muted-foreground)]")
                      }`}
                    >
                      {informational ? "" : (row.discountPercent ? `${row.discountPercent}%` : "—")}
                    </td>

                    {/* IMPORTO */}
                    <td className={`px-3 py-2 text-right font-bold ${
                      isActive ? "text-sky-200" : "text-sky-400"
                    }`}>
                      {informational ? "" : formatDdtMoney(row.netAmountSubunits)}
                    </td>

                    {/* IVA */}
                    <td className={`px-2 py-2 text-center ${
                      isActive ? "text-sky-100" : "text-[var(--muted-foreground)]"
                    }`}>
                      {informational || row.vatRate === 0 ? "—" : `${row.vatRate}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleRows.length < filtered.length && (
            <div className="p-3 text-center text-xs text-[var(--muted-foreground)] bg-[var(--background)]/40 border-t border-[var(--border)]/30">
              Visualizzati {visibleRows.length} di {filtered.length} articoli. Scorri verso il basso per caricarne altri.
            </div>
          )}
        </div>
      )}
    </>
  );
}
