import React from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Search,
  X,
  RefreshCw,
  LoaderCircle,
  CloudDownload,
  Eye,
  EyeOff,
  Upload,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
import {
  formatInvoiceEuro,
  ImportNotificationState,
  InvoiceSummaryTotals,
} from "../utils/invoiceViewUtils";

export interface ElectronicInvoicesToolbarProps {
  activeTab: "items" | "invoices";
  onChangeTab: (tab: "items" | "invoices") => void;
  itemsTotalCount: number;
  invoicesTotalCount: number;
  search: string;
  onChangeSearch: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  selectedYear: number | null;
  onChangeYear: (year: number | null) => void;
  availableYears: number[];
  showExtendedColumns: boolean;
  onToggleExtendedColumns: () => void;
  onlyWithPrice: boolean;
  onChangeOnlyWithPrice: (checked: boolean) => void;
  summaryTotals: InvoiceSummaryTotals;
  loading: boolean;
  isSyncing: boolean;
  syncProgress: { msg: string; pct: number };
  isImporting: boolean;
  importProgress: { msg: string; pct: number };
  importNotification: ImportNotificationState | null;
  onDismissImportNotification: () => void;
  error: string;
  onTriggerImportXml: () => void;
  onSyncCloud: () => void;
  onReload: () => void;
}

export const ElectronicInvoicesToolbar: React.FC<ElectronicInvoicesToolbarProps> = ({
  activeTab,
  onChangeTab,
  itemsTotalCount,
  invoicesTotalCount,
  search,
  onChangeSearch,
  searchInputRef,
  selectedYear,
  onChangeYear,
  availableYears,
  showExtendedColumns,
  onToggleExtendedColumns,
  onlyWithPrice,
  onChangeOnlyWithPrice,
  summaryTotals,
  loading,
  isSyncing,
  syncProgress,
  isImporting,
  importProgress,
  importNotification,
  onDismissImportNotification,
  error,
  onTriggerImportXml,
  onSyncCloud,
  onReload,
}) => {
  return (
    <>
      {/* ─── 1. BARRA DI RICERCA (STESSO IDENTICO STILE DI DDT ARTICOLI) ─── */}
      <label className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-xs text-[var(--foreground)]">
        <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(e) => onChangeSearch(e.target.value)}
          placeholder={
            activeTab === "items"
              ? "Cerca fornitore, codice articolo, descrizione, numero documento o anno... (F4 per cercare)"
              : "Cerca fornitore, numero fattura, IBAN, note... (F4 per cercare)"
          }
          className="w-full bg-transparent outline-none text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              onChangeSearch("");
              searchInputRef.current?.focus();
            }}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-0.5 rounded cursor-pointer"
            title="Cancella ricerca"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {/* ─── 2. TOOLBAR / HEADER (STESSO IDENTICO STILE DI DDT ARTICOLI) ─── */}
      <div className="flex h-7 shrink-0 items-center justify-between gap-3 px-1 text-xs">
        {/* Titolo, Tabs e Filtri */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <h1 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
              {activeTab === "items" ? "Fatture Elettroniche (Articoli)" : "Fatture Fornitori"}
            </h1>
            <span className="text-[var(--muted-foreground)] text-[11px] font-normal">
              ({(activeTab === "items" ? itemsTotalCount : invoicesTotalCount).toLocaleString("it-IT")} totali)
            </span>
          </div>

          {/* Switch Vista Schede */}
          <div className="flex items-center bg-[var(--card)] border border-[var(--border)] rounded p-0.5">
            <button
              type="button"
              onClick={() => onChangeTab("items")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                activeTab === "items"
                  ? "bg-[var(--primary)] text-white font-semibold"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Articoli & Prezzi
            </button>
            <button
              type="button"
              onClick={() => onChangeTab("invoices")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                activeTab === "invoices"
                  ? "bg-[var(--primary)] text-white font-semibold"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Fatture ({invoicesTotalCount})
            </button>
          </div>

          {/* Menù a tendina Selezione Anno */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <label htmlFor="year-select" className="text-[var(--muted-foreground)] font-semibold shrink-0">
              Anno:
            </label>
            <select
              id="year-select"
              value={selectedYear === null ? "ALL" : String(selectedYear)}
              onChange={(e) => {
                const val = e.target.value;
                onChangeYear(val === "ALL" ? null : parseInt(val, 10));
              }}
              className="h-6 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-0 text-[11px] font-medium text-[var(--foreground)] outline-none cursor-pointer hover:border-[var(--primary)] transition-colors"
            >
              <option value="ALL">Tutti gli anni</option>
              {availableYears.map((yr) => (
                <option key={yr} value={String(yr)}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Switch Colonne Estese */}
          {activeTab === "items" && (
            <button
              type="button"
              onClick={onToggleExtendedColumns}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                showExtendedColumns
                  ? "border-lime-500/50 bg-lime-500/10 text-lime-400"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
              title="Mostra/Nascondi UM, Quantità, Listino e Sconti"
            >
              {showExtendedColumns ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>Show</span>
            </button>
          )}

          {/* Filtro Solo con Prezzo */}
          {activeTab === "items" && (
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer">
              <input
                type="checkbox"
                checked={onlyWithPrice}
                onChange={(e) => onChangeOnlyWithPrice(e.target.checked)}
                className="rounded border-[var(--border)] bg-[var(--card)] text-[var(--primary)] cursor-pointer"
              />
              <span>Solo con prezzo</span>
            </label>
          )}
        </div>

        {/* Info Destra: Totali Elementi Filtrati + Pulsante Importa XML + Pulsante Sync + Refresh */}
        <div className="flex items-center gap-2">
          {/* Badge Riepilogo: N. Elementi - Imponibile - IVA - Totale Documento */}
          <div className="flex items-center gap-2 px-2.5 py-0.5 rounded border border-[var(--border)] bg-[var(--card)] text-[11px] whitespace-nowrap shadow-xs">
            <div className="flex items-center gap-1">
              <span className="text-[var(--muted-foreground)]">Elementi:</span>
              <span className="font-bold text-[var(--foreground)]">
                {summaryTotals.count.toLocaleString("it-IT")}
              </span>
            </div>
            <span className="text-[var(--border)] select-none">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[var(--muted-foreground)]">Imponibile:</span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatInvoiceEuro(summaryTotals.taxable)}
              </span>
            </div>
            <span className="text-[var(--border)] select-none">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[var(--muted-foreground)]">IVA:</span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatInvoiceEuro(summaryTotals.vat)}
              </span>
            </div>
            <span className="text-[var(--border)] select-none">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[var(--muted-foreground)]">Totale:</span>
              <span className="font-bold text-[var(--primary)]">
                {formatInvoiceEuro(summaryTotals.total)}
              </span>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            variant="primary"
            className="h-6 px-2.5 text-[11px] gap-1.5 cursor-pointer bg-[var(--primary)] text-white hover:opacity-90 font-medium shadow-xs"
            onClick={onTriggerImportXml}
            disabled={isImporting || isSyncing}
            title="Importa file XML di fatture elettroniche (o trascina i file qui)"
          >
            <Upload className={`h-3 w-3 ${isImporting ? "animate-bounce" : ""}`} />
            <span>{isImporting ? "Importando..." : "Importa XML"}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-[11px] gap-1.5 cursor-pointer"
            onClick={onSyncCloud}
            disabled={isSyncing || isImporting}
            title="Scarica e allinea con Supabase Cloud"
          >
            <CloudDownload className={`h-3 w-3 ${isSyncing ? "animate-bounce" : ""}`} />
            <span>{isSyncing ? "Sync..." : "Sincronizza Cloud"}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-6 px-2 cursor-pointer"
            onClick={onReload}
            disabled={loading || isImporting || isSyncing}
            title="Ricarica elenco"
          >
            {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* NOTIFICA ERRORE O SYNC */}
      {error && (
        <p role="alert" className="text-xs text-[var(--destructive)] px-1">
          {error}
        </p>
      )}

      {isSyncing && (
        <div className="flex items-center justify-between p-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--primary)]">
          <span>{syncProgress.msg}</span>
          <span className="font-bold">{syncProgress.pct}%</span>
        </div>
      )}

      {/* PROGRESSO IMPORTAZIONE XML */}
      {isImporting && (
        <div className="flex items-center justify-between p-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--primary)]">
          <div className="flex items-center gap-2">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span>{importProgress.msg}</span>
          </div>
          <span className="font-bold">{importProgress.pct}%</span>
        </div>
      )}

      {/* BANNER NOTIFICA RISULTATO IMPORTAZIONE */}
      {importNotification && (
        <div
          className={`flex items-center justify-between p-2 rounded-md border text-xs ${
            importNotification.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : importNotification.type === "warning"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
              : "border-rose-500/40 bg-rose-500/10 text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {importNotification.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {importNotification.type === "warning" && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {importNotification.type === "error" && <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{importNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={onDismissImportNotification}
            className="p-1 hover:opacity-80 rounded cursor-pointer ml-2"
            title="Chiudi notifica"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
