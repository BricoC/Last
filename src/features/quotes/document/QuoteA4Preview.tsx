import { useEffect, useMemo, useState } from "react";
import { getCompanySettings, type CompanySettings } from "@/features/settings/companySettingsRepository";
import type { QuoteDraft } from "../models/quoteDraft";
import { QuoteA4Page } from "./QuoteA4Page";
import { prepareQuoteForPrint } from "./quotePrintModel";

const FIRST_PAGE_ROWS = 18;
const FOLLOWING_PAGE_ROWS = 24;

export function QuoteA4Preview({ draft, inline = false, captureOnly = false }: {
  draft: QuoteDraft; inline?: boolean; captureOnly?: boolean;
}) {
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const prepared = useMemo(() => prepareQuoteForPrint(draft), [draft]);
  const pages = useMemo(() => paginate(prepared.rows), [prepared.rows]);

  useEffect(() => {
    let active = true;
    getCompanySettings().then((value) => { if (active) setCompany(value); })
      .catch(() => { if (active) setCompany(null); })
      .finally(() => { if (active) setSettingsLoaded(true); });
    return () => { active = false; };
  }, []);

  const wrapperClass = captureOnly
    ? "quote-preview-scroll fixed -left-[10000px] top-0 z-[80] w-[210mm] overflow-visible bg-[var(--document-background)] p-0 pointer-events-none"
    : inline
      ? "quote-preview-scroll min-h-0 flex-1 overflow-auto bg-[var(--background)] p-4"
      : "quote-preview-scroll fixed inset-0 z-[100] overflow-auto bg-[var(--background)]/95 p-4";

  return <div className={wrapperClass} aria-hidden={captureOnly}>
    {!captureOnly && <div className="mx-auto mb-3 w-fit rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-bold text-[var(--foreground)] quote-no-print">
      Anteprima Cliente • Foglio A4 ({pages.length} {pages.length === 1 ? "pagina" : "pagine"})
    </div>}
    <div id="quote-print-root" data-ready={settingsLoaded ? "true" : "false"} className="flex flex-col items-center gap-6">
      {pages.map((rows, index) => <QuoteA4Page key={`quote-page-${index + 1}`} draft={draft} company={company} rows={rows} totals={prepared.totals}
        pageNum={index + 1} totalPages={pages.length} isFirst={index === 0} isLast={index === pages.length - 1} />)}
    </div>
    <style>{`@media print { @page { size:A4; margin:0; } body * { visibility:hidden !important; } #quote-print-root, #quote-print-root * { visibility:visible !important; } #quote-print-root { position:absolute; inset:0; } .quote-a4-page { break-after:page; box-shadow:none !important; } .quote-a4-page:last-child { break-after:auto; } }`}</style>
  </div>;
}

function paginate<T>(rows: T[]): T[][] {
  const first = rows.slice(0, FIRST_PAGE_ROWS);
  const pages = [first];
  for (let offset = FIRST_PAGE_ROWS; offset < rows.length; offset += FOLLOWING_PAGE_ROWS) {
    pages.push(rows.slice(offset, offset + FOLLOWING_PAGE_ROWS));
  }
  return pages;
}
