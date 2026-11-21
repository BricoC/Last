import { LoaderCircle, FileText } from "lucide-react";
import { formatDdtMoney, formatDdtNumber, formatDdtPercent, formatDdtViewDate } from "./services/ddtViewFormatting";
import { useDdtListModel } from "./hooks/useDdtListModel";
import { DdtListToolbar } from "./components/DdtListToolbar";
import { DdtListSearchBar } from "./components/DdtListSearchBar";
import { DdtListBottomPanel } from "./components/DdtListBottomPanel";
import { DdtListTableHeader } from "./components/DdtListTableHeader";

export function DDTListPage() {
  const {
    rows, search, setSearch, searchInputRef, tableContainerRef, loading, error,
    selectedDdtId, setSelectedDdtId, selectedIds, setSelectedIds, activeRowId, setActiveRowId, isKeyboardNavRef,
    activeRowElementRef, isEmailModalOpen, setIsEmailModalOpen, filterYear2026, setFilterYear2026,
    selectedMonth, setSelectedMonth, currentYear, previousYears, handleToggleSelectAll,
    handleToggleRow, load, yearCounts, filtered, sorted, handleSort, renderSortIndicator, handleScroll,
    visibleRows, handleTableKeyDown, currentQuickDdtIndex, hasPrevQuickDdt, hasNextQuickDdt,
    handlePrevQuickDdt, handleNextQuickDdt, totals, markupPercent,
  } = useDdtListModel();

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-[var(--foreground)]">
      <DdtListSearchBar search={search} setSearch={setSearch} searchInputRef={searchInputRef} />

      <DdtListToolbar
        rows={rows} filtered={filtered} previousYears={previousYears} yearCounts={yearCounts} currentYear={currentYear}
        filterYear2026={filterYear2026} setFilterYear2026={setFilterYear2026} selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth} totals={totals} markupPercent={markupPercent} selectedIds={selectedIds}
        setSelectedIds={setSelectedIds} setIsEmailModalOpen={setIsEmailModalOpen} load={load} loading={loading}
      />

      {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}

      {/* Tabella con stile dei popup (colorata, pulita e reattiva) */}
      {loading && rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />Caricamento DDT…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-md bg-[var(--card)]">
          Nessun DDT trovato per i filtri selezionati.
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
            <DdtListTableHeader handleSort={handleSort} renderSortIndicator={renderSortIndicator} filtered={filtered} selectedIds={selectedIds} handleToggleSelectAll={handleToggleSelectAll} />
            <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11.5px]">
              {visibleRows.map((row) => {
                const isPositiveRev = row.revenueSubunits > 0;
                const isNegativeRev = row.revenueSubunits < 0;
                const isSelected = selectedIds.has(row.id);
                const isRowActive = activeRowId === row.id;
                const isHighlighted = isRowActive || isSelected;

                return (
                  <tr
                    key={row.id}
                    ref={isRowActive ? activeRowElementRef : null}
                    onMouseDown={() => {
                      isKeyboardNavRef.current = false;
                      setActiveRowId(row.id);
                    }}
                    className={`group cursor-default ${
                      isHighlighted
                        ? "bg-[#1e5b87] text-white font-medium"
                        : "hover:bg-[var(--background)]/60"
                    }`}
                  >
                    {/* CHECKBOX */}
                    <td className="px-2.5 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleRow(row.id)}
                        className="rounded border-[var(--border)] cursor-pointer accent-sky-200"
                      />
                    </td>

                    {/* DATA */}
                    <td className={`px-3 py-2 font-sans font-medium whitespace-nowrap ${
                      isHighlighted ? "text-white" : "text-[var(--foreground)]"
                    }`}>
                      {formatDdtViewDate(row.date)}
                    </td>

                    {/* DDT (Link al popup) */}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDdtId(row.id);
                        }}
                        className={`font-bold hover:underline inline-flex items-center gap-1.5 cursor-pointer ${
                          isHighlighted ? "text-sky-200 hover:text-white" : "text-[var(--primary)]"
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
                        isHighlighted ? "text-white" : "text-[var(--foreground)]"
                      }`}
                      title={row.client}
                    >
                      {row.client}
                    </td>

                    {/* DESTINAZIONE */}
                    <td
                      className={`px-3 py-2 font-sans truncate max-w-[220px] ${
                        isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                      title={row.destination}
                    >
                      {row.destination || "—"}
                    </td>

                    {/* TOTALE IMPONIBILE */}
                    <td className={`px-3 py-2 text-right font-bold ${
                      isHighlighted ? "text-white" : "text-[var(--foreground)]"
                    }`}>
                      {formatDdtMoney(row.taxableSubunits)}
                    </td>

                    {/* PREZZO ACQUISTO */}
                    <td className={`px-3 py-2 text-right ${
                      isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                    }`}>
                      {formatDdtMoney(row.purchaseSubunits)}
                    </td>

                    {/* RICAVO */}
                    <td
                      className={`px-3 py-2 text-right font-semibold ${
                        isPositiveRev
                          ? (isHighlighted ? "text-emerald-300 font-bold" : "text-emerald-400")
                          : isNegativeRev
                          ? (isHighlighted ? "text-rose-300 font-bold" : "text-rose-400")
                          : (isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]")
                      }`}
                    >
                      {formatDdtMoney(row.revenueSubunits)}
                    </td>

                    {/* RICARICO % */}
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        isPositiveRev
                          ? (isHighlighted ? "text-emerald-300 font-bold" : "text-emerald-400")
                          : isNegativeRev
                          ? (isHighlighted ? "text-rose-300 font-bold" : "text-rose-400")
                          : (isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]")
                      }`}
                    >
                      {formatDdtPercent(row.markupPercent)}
                    </td>

                    {/* SCONTO % */}
                    <td
                      className={`px-2 py-2 text-center font-medium ${
                        row.discountPercent && row.discountPercent > 0
                          ? (isHighlighted ? "text-amber-200 font-bold" : "text-amber-400")
                          : (isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]")
                      }`}
                    >
                      {formatDdtPercent(row.discountPercent)}
                    </td>

                    {/* OPERATORE */}
                    <td className={`px-3 py-2 text-center font-sans ${
                      isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                    }`}>
                      {row.operator || "—"}
                    </td>

                    {/* CAUSALE */}
                    <td
                      className={`px-3 py-2 text-left font-sans truncate max-w-[140px] ${
                        isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                      title={row.reason}
                    >
                      {row.reason || "—"}
                    </td>

                    {/* ORDINE */}
                    <td
                      className={`px-3 py-2 text-left font-sans truncate max-w-[160px] ${
                        isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                      title={row.orderReference}
                    >
                      {row.orderReference || "—"}
                    </td>

                    {/* PAGAMENTO */}
                    <td
                      className={`px-3 py-2 text-left font-sans truncate max-w-[180px] ${
                        isHighlighted ? "text-sky-100" : "text-[var(--muted-foreground)]"
                      }`}
                      title={row.payment}
                    >
                      {row.payment || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleRows.length < filtered.length && (
            <div className="p-3 text-center text-xs text-[var(--muted-foreground)] bg-[var(--background)]/40 border-t border-[var(--border)]/30">
              Visualizzati {visibleRows.length} di {filtered.length} DDT. Scorri verso il basso per caricarne altri.
            </div>
          )}
        </div>
      )}

      <DdtListBottomPanel
        selectedDdtId={selectedDdtId} setSelectedDdtId={setSelectedDdtId} totals={totals}
        handlePrevQuickDdt={handlePrevQuickDdt} handleNextQuickDdt={handleNextQuickDdt}
        hasPrevQuickDdt={hasPrevQuickDdt} hasNextQuickDdt={hasNextQuickDdt}
        currentQuickDdtIndex={currentQuickDdtIndex} sortedCount={sorted.length}
        isEmailModalOpen={isEmailModalOpen} setIsEmailModalOpen={setIsEmailModalOpen} selectedIds={selectedIds}
      />
    </div>
  );
}

