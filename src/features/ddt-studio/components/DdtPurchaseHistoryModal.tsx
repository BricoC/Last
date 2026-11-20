import React, { useEffect, useMemo, useState } from "react";
import { History, CheckCircle2, X, CheckSquare, Square } from "lucide-react";
import { PurchasePriceHistoryEntry } from "../services/ddtRepository";
import { MonetaryValue, isPositivePrice, money } from "@/shared/domain/monetaryValue";

function formatEuro5(val: MonetaryValue | number): string {
  const mv = val instanceof MonetaryValue ? val : money(val);
  return `€ ${mv.toNumber().toFixed(5).replace(".", ",")}`;
}

export interface PurchaseHistoryCandidateRow {
  rowKey: string;
  rowIndex: number;
  description: string;
  currentPurchasePrice: MonetaryValue | number | null | undefined;
  history: PurchasePriceHistoryEntry | null;
}

export interface DdtPurchaseHistoryModalProps {
  isOpen: boolean;
  clientName: string;
  rows: PurchaseHistoryCandidateRow[];
  onClose: () => void;
  onConfirm: (selected: Array<{ rowKey: string; purchasePriceSubunits: number }>) => void;
}

function formatItalianDate(isoDate: string): string {
  if (!isoDate) return "—";
  const parts = isoDate.split("T")[0].split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

export const DdtPurchaseHistoryModal: React.FC<DdtPurchaseHistoryModalProps> = ({
  isOpen,
  clientName,
  rows,
  onClose,
  onConfirm,
}) => {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const selectableRows = useMemo(
    () => rows.filter((r) => Boolean(r.history && r.history.purchasePriceSubunits > 0)),
    [rows]
  );

  useEffect(() => {
    if (!isOpen) return;
    // Seleziona di default le righe con storico trovato che non hanno già un prezzo d'acquisto
    const defaults = new Set<string>();
    for (const r of rows) {
      if (r.history && r.history.purchasePriceSubunits > 0 && !isPositivePrice(r.currentPurchasePrice)) {
        defaults.add(r.rowKey);
      }
    }
    setSelectedKeys(defaults);
  }, [isOpen, rows]);

  if (!isOpen) return null;

  const allSelected =
    selectableRows.length > 0 && selectableRows.every((r) => selectedKeys.has(r.rowKey));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(selectableRows.map((r) => r.rowKey)));
    }
  };

  const toggleRow = (rowKey: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const handleConfirm = () => {
    const payload: Array<{ rowKey: string; purchasePriceSubunits: number }> = [];
    for (const r of selectableRows) {
      if (selectedKeys.has(r.rowKey) && r.history) {
        payload.push({
          rowKey: r.rowKey,
          purchasePriceSubunits: r.history.purchasePriceSubunits,
        });
      }
    }
    onConfirm(payload);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-xl border border-amber-500/40 bg-[var(--card)] text-[var(--foreground)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-amber-500/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-amber-100 truncate">
                Prezzi di Acquisto da Storico — {clientName}
              </h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Seleziona le voci per cui desideri inserire il prezzo di acquisto trovato nello storico.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]"
            title="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar selezione */}
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--background)]/60 flex items-center justify-between text-xs shrink-0">
          <button
            type="button"
            onClick={toggleAll}
            disabled={selectableRows.length === 0}
            className="flex items-center gap-1.5 font-semibold text-amber-300 hover:text-amber-200 disabled:opacity-40"
          >
            {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            <span>{allSelected ? "Deseleziona tutte" : "Seleziona tutte le voci trovate"}</span>
          </button>
          <span className="text-[var(--muted-foreground)] font-mono">
            {selectedKeys.size} selezionate · {selectableRows.length} / {rows.length} trovate
          </span>
        </div>

        {/* Tabella */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--card)] border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
              <tr>
                <th className="py-2 px-3 text-center w-10">Sel</th>
                <th className="py-2 px-2 text-center w-12">Riga</th>
                <th className="py-2 px-3 text-left">Descrizione Voce DDT</th>
                <th className="py-2 px-3 text-right">Acq. Attuale</th>
                <th className="py-2 px-3 text-right">Acq. Storico</th>
                <th className="py-2 px-3 text-center">Ultima Data</th>
                <th className="py-2 px-3 text-center">DDT Origine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/60">
              {rows.map((row) => {
                const hasHistory = Boolean(row.history && row.history.purchasePriceSubunits > 0);
                const isSelected = selectedKeys.has(row.rowKey);
                const hasCurrent = isPositivePrice(row.currentPurchasePrice);
                const ddtLabel = row.history
                  ? `DDT #${row.history.series ? `${row.history.series}/` : ""}${row.history.docNumber ?? "—"}/${row.history.year}`
                  : "—";

                return (
                  <tr
                    key={row.rowKey}
                    onClick={() => hasHistory && toggleRow(row.rowKey)}
                    className={`transition-colors ${
                      hasHistory
                        ? isSelected
                          ? "bg-amber-500/10 hover:bg-amber-500/15 cursor-pointer"
                          : "hover:bg-[var(--background)]/60 cursor-pointer"
                        : "opacity-50"
                    }`}
                  >
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!hasHistory}
                        onChange={() => toggleRow(row.rowKey)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-[var(--border)] accent-amber-500 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-[var(--muted-foreground)]">
                      #{row.rowIndex + 1}
                    </td>
                    <td className="py-2 px-3 font-medium text-[var(--foreground)] max-w-xs truncate" title={row.description}>
                      {row.description}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-[var(--muted-foreground)]">
                      {hasCurrent ? formatEuro5(row.currentPurchasePrice ?? 0) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold">
                      {hasHistory && row.history ? (
                        <span className="text-emerald-300">
                          {formatEuro5(MonetaryValue.fromSubunits(row.history.purchasePriceSubunits))}
                        </span>
                      ) : (
                        <span className="text-[var(--muted-foreground)] italic font-normal">Non trovato</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center font-mono text-[var(--foreground)]">
                      {row.history ? formatItalianDate(row.history.docDate) : "—"}
                    </td>
                    <td className="py-2 px-3 text-center font-mono">
                      {row.history ? (
                        <span className="px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] text-sky-300 font-semibold">
                          {ddtLabel}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--background)]/60 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-xs font-semibold text-[var(--foreground)]"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={selectedKeys.size === 0}
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Conferma e Inserisci ({selectedKeys.size})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
