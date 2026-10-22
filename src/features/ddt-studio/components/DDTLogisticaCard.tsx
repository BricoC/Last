import React from "react";
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
  const totals = calculateDdtTotals(items);

  return (
    <div className="bg-[var(--background)] p-3 border-t border-[var(--border)] shrink-0">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* 1. SEZIONE SINISTRA: DATI DI TRASPORTO & CONSEGNA (7 colonne) */}
        <div className="lg:col-span-7 bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)]">
            <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
              Dati di Trasporto & Consegna
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
