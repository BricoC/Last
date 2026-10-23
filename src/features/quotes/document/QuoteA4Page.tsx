import bricoLogo from "@/assets/logo_brico_class.jpg";
import type { CompanySettings } from "@/features/settings/companySettingsRepository";
import type { QuoteDraft } from "../models/quoteDraft";
import type { PreparedQuoteItem } from "./quotePrintModel";
import type { CalculatedQuoteTotals } from "../utils/quoteCalculations";

export function QuoteA4Page({ draft, company, rows, totals, pageNum, totalPages, isFirst, isLast }: {
  draft: QuoteDraft; company: CompanySettings | null; rows: PreparedQuoteItem[];
  totals: CalculatedQuoteTotals; pageNum: number; totalPages: number; isFirst: boolean; isLast: boolean;
}) {
  const footer = [company?.address, company?.postal_code, company?.city, company?.province,
    company?.phone, company?.email, company?.vat_number && `P.IVA ${company.vat_number}`]
    .filter(Boolean).join(" · ");
  const logo = company?.logo_data_url || bricoLogo;
  const date = formatDate(draft.quote_date);
  return <article className="quote-a4-page relative flex h-[297mm] min-h-[297mm] w-[210mm] flex-col justify-between overflow-hidden bg-white px-[14mm] py-[12mm] text-[11px] leading-tight text-slate-900 shadow-2xl" style={{ boxSizing: "border-box", fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
    <div>
      <header className="mb-3 flex min-h-[25mm] items-start justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center"><img src={logo} alt="Ferramenta Brico Class" className="max-h-[75px] max-w-[300px] object-contain" />
          {company?.business_name && <span className="sr-only">{company.business_name}</span>}</div>
        <div className="flex flex-col items-end text-right">
          <h1 className="mb-1 text-[15px] font-black tracking-wider uppercase">OFFERTA PREVENTIVO</h1>
          <div className="text-[11px] font-semibold text-slate-600">Data: <strong className="text-slate-900">{date}</strong></div>
          <div className="text-[11px] font-semibold text-slate-600">Validità: <strong className="text-slate-900">{draft.validity_days || 30} giorni</strong></div>
          {draft.id && <div className="mt-0.5 font-mono text-[10px] text-slate-400">Rif: #{draft.id}</div>}
        </div>
      </header>

      {isFirst && <section className="mb-3 grid grid-cols-12 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="col-span-7 flex flex-col justify-center border-r border-slate-200 pr-3">
          <span className="mb-0.5 text-[9px] font-black tracking-wider text-slate-500 uppercase">Spettabile Cliente:</span>
          <div className="text-[13px] font-black leading-snug text-slate-900 uppercase">{draft.client_name || "CLIENTE OCCASIONALE"}</div>
          {draft.destination_address && <div className="mt-1 text-[10.5px] font-medium text-slate-600">Destinazione: <span className="font-semibold text-slate-800">{draft.destination_address}</span></div>}
        </div>
        <div className="col-span-5 flex flex-col justify-center pl-1">
          <span className="mb-0.5 text-[9px] font-black tracking-wider text-slate-500 uppercase">Oggetto Offerta:</span>
          <div className="break-words text-[11.5px] font-black leading-snug text-[var(--document-accent)]">{draft.subject || "Offerta Fornitura Materiale"}</div>
          {draft.payment_method && <div className="mt-1 text-[10px] font-medium text-slate-600">Pagamento: <span className="font-bold text-slate-800">{draft.payment_method}</span></div>}
        </div>
      </section>}

      <div className="relative">
        <img src={logo} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 m-auto w-3/4 max-w-[420px] select-none object-contain opacity-[0.045]" />
        <table className="relative z-[1] w-full border-collapse border text-[10.5px]" style={{ borderColor: "var(--document-table-border)" }}>
          <thead><tr className="border-b text-[9px] font-black tracking-wider text-slate-600 uppercase" style={{ backgroundColor: "var(--document-table-header)", borderColor: "var(--document-table-border)" }}>
            <th className="w-[8%] border-r px-2 py-1.5 text-center" style={{ borderColor: "var(--document-table-border)" }}>U.M.</th>
            <th className="w-[9%] border-r px-2 py-1.5 text-center" style={{ borderColor: "var(--document-table-border)" }}>Q.TÀ</th>
            <th className="w-[47%] border-r px-2.5 py-1.5 text-left" style={{ borderColor: "var(--document-table-border)" }}>DESCRIZIONE ARTICOLO / PRESTAZIONE</th>
            <th className="w-[14%] border-r px-2.5 py-1.5 text-right" style={{ borderColor: "var(--document-table-border)" }}>PREZZO UNIT.</th>
            <th className="w-[8%] border-r px-2 py-1.5 text-center" style={{ borderColor: "var(--document-table-border)" }}>SC.%</th>
            <th className="w-[14%] px-2.5 py-1.5 text-right">IMPORTO</th>
          </tr></thead>
          <tbody>{rows.length === 0 ? <tr><td colSpan={6} className="py-6 text-center italic text-slate-400">Nessun articolo inserito nel preventivo.</td></tr> : rows.map(({ item, calculation }, index) => <tr key={item.id || `${item.code}-${index}`} className="border-b" style={{ backgroundColor: index % 2 ? "var(--document-table-stripe)" : "var(--document-background)", borderColor: "var(--document-table-border)" }}>
            <td className="border-r px-2 py-1 text-center font-bold text-slate-700 uppercase" style={{ borderColor: "var(--document-table-border)" }}>{item.unit || "NR"}</td>
            <td className="border-r px-2 py-1 text-center font-bold text-slate-900" style={{ borderColor: "var(--document-table-border)" }}>{item.quantity || "1"}</td>
            <td className="border-r px-2.5 py-1 font-semibold leading-tight text-slate-800" style={{ borderColor: "var(--document-table-border)" }}>{item.description}</td>
            <td className="border-r px-2.5 py-1 text-right font-mono text-slate-700" style={{ borderColor: "var(--document-table-border)" }}>{calculation.effective_unit_price.isZero() ? "" : calculation.effective_unit_price.formatIT(true, 4, 4)}</td>
            <td className="border-r px-2 py-1 text-center font-mono text-slate-600" style={{ borderColor: "var(--document-table-border)" }}>{item.discount_pct ? `${item.discount_pct}%` : ""}</td>
            <td className="px-2.5 py-1 text-right font-mono font-bold text-slate-900">{calculation.net_amount.isZero() ? "" : calculation.net_amount.formatIT(true, 4, 4)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>

    <div>
      {isLast && <section className="mb-3 grid grid-cols-12 gap-3 border-t border-slate-200 pt-3">
        <div className="col-span-7 flex flex-col justify-between pr-2">
          <div><div className="mb-1 text-[10px] font-black tracking-wider text-slate-700 uppercase">Condizioni Generali di Fornitura:</div>
            <ul className="space-y-0.5 text-[9.5px] leading-normal text-slate-600">
              <li>• <strong>Validità Offerta:</strong> {draft.validity_days || 30} giorni dalla presente data.</li>
              {draft.delivery_date && <li>• <strong>Consegna:</strong> {formatDate(draft.delivery_date)}</li>}
              {!draft.delivery_date && draft.delivery_terms && <li>• <strong>Consegna:</strong> {draft.delivery_terms}</li>}
              {draft.payment_method && <li>• <strong>Pagamento:</strong> {draft.payment_method}</li>}
              <li>• I prezzi si intendono al netto di IVA.</li>
            </ul>
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4">
            <span className="text-[8.5px] font-bold tracking-wider text-slate-400 uppercase">Timbro e Firma per Accettazione:</span><div className="w-44 border-b border-slate-400" />
          </div>
        </div>
        <div className="col-span-5 flex flex-col justify-between rounded-lg border border-slate-300 bg-slate-50 p-3">
          <div className="space-y-1.5 text-[10.5px] text-slate-600">
            <div className="flex items-center justify-between"><span>Totale Imponibile Netto:</span><strong className="font-mono text-slate-800">{formatMoney(totals.taxable)}</strong></div>
            <div className="flex items-center justify-between"><span>I.V.A.:</span><span className="font-mono text-slate-700">{formatMoney(totals.vat)}</span></div>
          </div>
          <div className="mt-2 flex items-center justify-between border-t-2 pt-2" style={{ borderColor: "var(--document-total-border)" }}>
            <span className="text-[12px] font-black tracking-wide text-[var(--document-accent)] uppercase">TOTALE OFFERTA:</span><span className="font-mono text-[15px] font-black text-[var(--document-accent)]">{formatMoney(totals.total)}</span>
          </div>
        </div>
      </section>}
      <footer className="flex flex-col items-center border-t border-slate-300 pt-2 text-center">
        <div className="text-[8.5px] tracking-tight text-slate-600 italic" style={{ fontFamily: "'Times New Roman', Times, serif" }}>{footer || "Via di Carraia, 218 - 55061 Carraia - Capannori (LU) Tel. 0583.980126 - Email: Bricoclass@live.it Cod. Univoco: M5UXCR1 - P.IVA e C.F: 01601690462"}</div>
        <div className="mt-0.5 text-[8px] font-semibold text-slate-400">Pagina {pageNum} di {totalPages}</div>
      </footer>
    </div>
  </article>;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatMoney(value: import("@/shared/domain/monetaryValue").MonetaryValue): string {
  return value.formatIT(true, 4, 4);
}
