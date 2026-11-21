import { Search, X } from "lucide-react";
import { requestOpenDdt } from "./services/ddtNavigation";
import { formatDdtMoney } from "./services/ddtViewFormatting";
import { DDTQuickViewModal } from "./components/DDTQuickViewModal";
import { DDTClientArticleHistoryModal } from "./components/DDTClientArticleHistoryModal";
import { useDdtArticlesModel } from "./hooks/useDdtArticlesModel";
import { DdtArticlesTable } from "./components/DdtArticlesTable";
import { DdtArticlesToolbar } from "./components/DdtArticlesToolbar";

export function DDTArticlesPage() {
  const {
    rows, search, setSearch, searchInputRef, tableContainerRef, loading, error,
    selectedDdtId, setSelectedDdtId, selectedArticleForHistory, setSelectedArticleForHistory,
    activeRowId, setActiveRowId, isKeyboardNavRef, activeRowElementRef,
    filterYear2026, setFilterYear2026, selectedMonth, setSelectedMonth, currentYear, previousYears,
    openWindow, load, yearCounts, filtered, totalNetAmount, handleSort, renderSortIndicator,
    handleScroll, visibleRows, handleTableKeyDown, availableClients,
  } = useDdtArticlesModel();

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-[var(--foreground)]">
      {/* Search Input Bar */}
      <label className="flex h-9 w-full shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-xs">
        <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca descrizione, data, mese (es. Settembre), cliente, destinazione o numero DDT… (F4 per cercare)"
          className="w-full bg-transparent outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); searchInputRef.current?.focus(); }}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-0.5 rounded cursor-pointer"
            title="Cancella ricerca"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      <DdtArticlesToolbar
        rowsCount={rows.length} previousYears={previousYears} yearCounts={yearCounts} currentYear={currentYear}
        filteredCount={filtered.length} filterYear={filterYear2026} setFilterYear={setFilterYear2026}
        selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} totalNetAmount={totalNetAmount}
        load={load} loading={loading}
      />

      {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}

      <DdtArticlesTable
        loading={loading} rows={rows} filtered={filtered} visibleRows={visibleRows}
        tableContainerRef={tableContainerRef} handleTableKeyDown={handleTableKeyDown}
        handleScroll={handleScroll} activeRowId={activeRowId} setActiveRowId={setActiveRowId}
        activeRowElementRef={activeRowElementRef} isKeyboardNavRef={isKeyboardNavRef}
        handleSort={handleSort} renderSortIndicator={renderSortIndicator}
        setSelectedDdtId={setSelectedDdtId} setSelectedArticleForHistory={setSelectedArticleForHistory}
      />

      {/* Footer Totali */}
      <div className="flex h-7 shrink-0 items-center justify-end border-t border-[var(--border)] px-2 text-[11px] font-semibold">
        <span>Totale importi visibili: </span>
        <span className="ml-1.5 font-bold text-sky-400">
          {formatDdtMoney(filtered.reduce((sum, row) => sum + row.netAmountSubunits, 0))}
        </span>
      </div>

      {/* Popup Dettaglio DDT con chiusura rapida Esc */}
      <DDTQuickViewModal
        isOpen={selectedDdtId !== null}
        onClose={() => setSelectedDdtId(null)}
        ddtId={selectedDdtId}
        onOpenInStudio={(id) => {
          requestOpenDdt(id);
          openWindow({ id: "ddt-studio", title: "DDT Studio (Pro)", componentId: "ddt-studio" });
        }}
      />

      {/* Popup Storico Articolo per il cliente */}
      {selectedArticleForHistory && (
        <DDTClientArticleHistoryModal
          isOpen={true}
          onClose={() => setSelectedArticleForHistory(null)}
          clientName={selectedArticleForHistory.client}
          articleDescription={selectedArticleForHistory.description}
          availableClients={availableClients}
          onSelectDdt={(otherDdtId) => {
            setSelectedArticleForHistory(null);
            setSelectedDdtId(otherDdtId);
          }}
        />
      )}
    </div>
  );
}

