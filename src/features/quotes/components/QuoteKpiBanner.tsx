import { Tag, ShoppingCart, CircleDollarSign, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { money } from "@/shared/domain/monetaryValue";
import { calculateQuoteItem, calculateQuoteTotals } from "../utils/quoteCalculations";
import { isQuoteDraftItemActive, type QuoteDraftItem } from "../models/quoteDraft";

export function QuoteKpiBanner({ items, discount, onDiscountChange, alexMode = false }: {
  items: QuoteDraftItem[]; discount: number; onDiscountChange: (value: number) => void; alexMode?: boolean;
}) {
  const computed = items.filter(isQuoteDraftItemActive).flatMap((item) => {
    try {
      return [calculateQuoteItem({ ...item, purchase_price: money(item.purchase_price),
        base_unit_price: item.base_unit_price ? money(item.base_unit_price) : null,
        forced_unit_price: item.forced_unit_price ? money(item.forced_unit_price) : null,
      }, discount)];
    } catch { return []; }
  });
  const totals = calculateQuoteTotals(computed);
  return <section className={`grid grid-cols-1 gap-2 md:grid-cols-2 ${alexMode ? "xl:grid-cols-5" : "xl:grid-cols-4"}`} aria-label="Riepilogo preventivo">
    <div className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
      <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Sconto cliente (H1)</p>
        <div className="mt-1 flex items-center gap-2"><input aria-label="Sconto globale percentuale" type="number" min="0" max="100" step="0.01" value={discount === 0 ? "" : discount}
          onChange={(event) => onDiscountChange(event.target.value === "" ? 0 : Number(event.target.value) || 0)}
          className="w-24 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-right text-sm font-semibold text-[var(--foreground)]" />
          <span className="text-xs text-[var(--muted-foreground)]">% globale</span></div></div>
      <Tag className="h-5 w-5 text-[var(--primary)]" />
    </div>
    <Metric title="Tot. acquisto" value={totals.cost.formatIT2()} note="Costo fornitore" icon={<ShoppingCart className="h-5 w-5 text-[var(--primary)]" />} />
    <Metric title="Totale netto" value={totals.taxable.formatIT2()} note={`${computed.length} ${computed.length === 1 ? "articolo inserito" : "articoli inseriti"}`} icon={<CircleDollarSign className="h-5 w-5 text-[var(--primary)]" />} />
    <Metric title="Ricavo (utile)" value={totals.gross_profit.formatIT2()} note="Netto meno costo acquisto" icon={<TrendingUp className="h-5 w-5 text-[var(--primary)]" />} />
    {alexMode && <Metric title="Ricarico globale" value={totals.markup_pct === null ? "—" : `${totals.markup_pct.toFixed(1)}%`} note="(Netto - costo) / costo" />}
  </section>;
}

function Metric({ title, value, note, icon }: { title: string; value: string; note: string; icon?: ReactNode }) {
  return <div className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
    <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{title}</p>
      <p className="mt-1 text-lg font-bold text-[var(--foreground)]">{value}</p><p className="text-[10px] text-[var(--muted-foreground)]">{note}</p></div>{icon}
  </div>;
}
