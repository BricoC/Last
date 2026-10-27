import React, { useState } from "react";
import { Truck, SlidersHorizontal, ChevronUp, ChevronDown } from "lucide-react";
import { DdtDocument, DdtItem } from "../models/ddt";
import { calculateDdtTotals } from "../utils/ddtCalculations";

export interface DDTLogisticaCardProps {
  ddt: Partial<DdtDocument>;
  setDdt: React.Dispatch<React.SetStateAction<Partial<DdtDocument>>>;
  items: DdtItem[];
  onOpenSearchModal?: () => void;
}

export const DDTLogisticaCard: React.FC<DDTLogisticaCardProps> = ({
  ddt,
  setDdt,
  items,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Rimane sempre chiusa/compatta di default al cambio o creazione di un DDT
  React.useEffect(() => {
    setIsCollapsed(true);
  }, [ddt.id]);

  const totals = calculateDdtTotals(items);

  // =========================================================================
  // VISTA COMPATTA AI MINIMI TERMINI (MASSIMO SPAZIO ALLA TABELLA ARTICOLI)
  // =========================================================================
  if (isCollapsed) {
    return (
      <div className="bg-[var(--card)] border-t border-[var(--border)] px-4 py-2 shrink-0 flex flex-wrap items-center justify-between gap-3 shadow-xs transition-all">
        {/* Sinistra: Dati di Trasporto & Consegna sintetici */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
            <Truck className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] text-[var(--muted-foreground)]">Porto:</span>
            <span className="text-[var(--foreground)] font-medium">
              {ddt.carriage_terms || "Franco stabilimento"}
            </span>
          </div>

          <div className="h-3.5 w-px bg-[var(--border)]" />

          <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1">
            <span>Aspetto:</span>
            <span className="font-medium text-[var(--foreground)]">
              {ddt.goods_appearance || "A vista"}
            </span>
          </div>

          <div className="h-3.5 w-px bg-[var(--border)]" />

          <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1">
            <span>Colli:</span>
            <span className="font-semibold text-[var(--foreground)] font-mono">
              {ddt.packages_count || "-"}
            </span>
          </div>

          <div className="h-3.5 w-px bg-[var(--border)]" />

          <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1">
            <span>Peso:</span>
            <span className="font-semibold text-[var(--foreground)] font-mono">
              {ddt.weight_kg ? `${ddt.weight_kg} kg` : "-"}
            </span>
          </div>

          <div className="h-3.5 w-px bg-[var(--border)]" />

          <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1">
            <span>Vettore:</span>
            <span className="font-semibold text-[var(--foreground)] truncate max-w-[140px]">
              {ddt.carrier || "Nessuno"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded text-[11px] font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] border border-transparent hover:border-[var(--border)] transition-colors"
            title="Espandi campi trasporto (vettore, colli, peso, note interne)"
          >
            <SlidersHorizontal className="w-3 h-3 text-[var(--primary)]" />
            <span>Dettagli Trasporto</span>
            <ChevronUp className="w-3 h-3 text-[var(--muted-foreground)]" />
          </button>
        </div>

        {/* Destra: Riepilogo Economico compatto in singola riga */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
            <span className="text-[10px] uppercase font-sans font-semibold">Imponibile:</span>
            <span className="font-semibold text-[var(--foreground)]">
              € {totals.totale_imponibile.formatIT(false)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
            <span className="text-[10px] uppercase font-sans font-semibold">IVA:</span>
            <span className="font-semibold text-[var(--foreground)]">
              € {totals.totale_iva.formatIT(false)}
            </span>
          </div>

          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 shadow-xs">
            <span className="text-[10px] uppercase font-sans font-bold text-emerald-300">
              Totale DDT:
            </span>
            <span className="text-sm font-black text-emerald-400 tracking-tight">
              € {totals.totale_documento.formatIT(false)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VISTA ESTESA COMPLETA
  // =========================================================================
  return (
    <div className="bg-[var(--background)] p-3 border-t border-[var(--border)] shrink-0 space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-[var(--card)] hover:bg-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] transition-colors"
          title="Riduci per dare più spazio alla tabella articoli"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          <span>Riduci Logistica & Totali</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* 1. SEZIONE SINISTRA: DATI DI TRASPORTO & CONSEGNA (7 colonne) */}
        <div className="lg:col-span-7 bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)]">
            <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-sky-400" />
              <span>Dati di Trasporto & Consegna</span>
            </span>
          </div>

          <div className="space-y-2 pt-2">
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                  Aspetto Beni
                </label>
                <input
                  type="text"
                  value={ddt.goods_appearance || ""}
                  onChange={(e) => setDdt((p) => ({ ...p, goods_appearance: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                  Porto
                </label>
                <input
                  type="text"
                  value={ddt.carriage_terms || "Franco stabilimento"}
                  onChange={(e) => setDdt((p) => ({ ...p, carriage_terms: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                  Colli
                </label>
                <input
                  type="text"
                  value={ddt.packages_count || ""}
                  onChange={(e) => setDdt((p) => ({ ...p, packages_count: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 text-xs text-center bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                  Peso Kg
                </label>
                <input
                  type="text"
                  value={ddt.weight_kg || ""}
                  onChange={(e) => setDdt((p) => ({ ...p, weight_kg: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 text-xs text-center bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                  Vettore Incaricato
                </label>
                <input
                  type="text"
                  value={ddt.carrier || ""}
                  onChange={(e) => setDdt((p) => ({ ...p, carrier: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--muted-foreground)]">
                  Note Interne / Istruzioni
                </label>
                <input
                  type="text"
                  value={ddt.internal_notes || ""}
                  onChange={(e) => setDdt((p) => ({ ...p, internal_notes: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. SEZIONE DESTRA: RIEPILOGO ECONOMICO (5 colonne) */}
        <div className="lg:col-span-5 bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)]">
            <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
              Riepilogo Economico
            </span>
          </div>

          {/* Dati Economici */}
          <div className="space-y-1.5 py-2 font-mono">
            <div className="flex justify-between items-center text-xs text-[var(--muted-foreground)]">
              <span>Totale Imponibile Netto:</span>
              <span className="text-[var(--foreground)] font-semibold">
                € {totals.totale_imponibile.formatIT(false)}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-[var(--muted-foreground)]">
              <span>Totale I.V.A.:</span>
              <span className="text-[var(--foreground)] font-semibold">
                € {totals.totale_iva.formatIT(false)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-[var(--border)]">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] font-sans">
                Totale Documento (IVA Compresa)
              </span>
              <span className="text-lg font-black text-emerald-400">
                € {totals.totale_documento.formatIT(false)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
