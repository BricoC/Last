import { useCallback, useEffect, useRef, useState } from "react";
import { QuoteKpiBanner } from "./components/QuoteKpiBanner";
import { QuoteStudioHeader } from "./components/QuoteStudioHeader";
import { QuoteClientFields } from "./components/QuoteClientFields";
import { QuoteItemsGrid } from "./components/QuoteItemsGrid";
import { QuoteArchiveSidebar } from "./components/QuoteArchiveSidebar";
import { QuoteTrashModal } from "./components/QuoteTrashModal";
import { QuoteA4Preview } from "./document/QuoteA4Preview";
import { quoteRepository } from "./services/quoteRepository";
import { orderRepository } from "@/features/orders/services/orderRepository";
import { priceListRepository } from "@/features/price-lists/services/priceListRepository";
import { exportQuotePdf, copyQuotePdfToClipboard } from "./utils/quoteExportManager";
import { money } from "@/shared/domain/monetaryValue";
import { registerWindowCloseGuard, registerDirtyCheck, useWindowStore } from "@/shared/stores/useWindowStore";
import { UnsavedChangesModal } from "@/shared/components/ui/UnsavedChangesModal";
import { useFragmentSearch } from "@/shared/hooks/useFragmentSearch";
import type { Quote } from "./models/quote";
import { createEmptyQuoteDraft, createEmptyQuoteItem, formatQuoteCode, isQuoteDraftItemActive, quoteToDraft, toQuoteInput, type QuoteDraft, type QuoteDraftItem } from "./models/quoteDraft";

type QuoteCloseChoice = "save" | "discard" | "cancel";

export function QuoteStudioPage({ windowId }: { windowId: string }) {
  const openWindow = useWindowStore((state) => state.openWindow);
  const [draft, setDraft] = useState<QuoteDraft>(createEmptyQuoteDraft);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"calculation" | "customer">("calculation");
  const [alexMode, setAlexMode] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trashCount, setTrashCount] = useState(0);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [closePrompt, setClosePrompt] = useState<((choice: QuoteCloseChoice) => void) | null>(null);
  const savedSignature = useRef<string | null>(null);
  const getQuoteSearchText = useCallback((quote: Quote) => [
    quote.client_name, quote.subject, quote.quote_date, formatQuoteDate(quote.quote_date),
    String(quote.quote_number ?? ""), String(quote.year), quote.status,
    formatQuoteCode(quote.year, quote.quote_number) ?? "",
    quote.quote_number != null ? String(quote.quote_number).padStart(3, "0") : "",
  ], []);
  const filteredQuotes = useFragmentSearch(quotes, archiveSearch, getQuoteSearchText);

  const signature = (value: QuoteDraft) => JSON.stringify(value);
  const isDirty = savedSignature.current !== null && signature(draft) !== savedSignature.current;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    return registerDirtyCheck(windowId, () => isDirtyRef.current);
  }, [windowId]);

  useEffect(() => { savedSignature.current = signature(draft); }, []);

  const refreshQuotes = useCallback(async () => {
    try {
      const [allQuotes, tCount] = await Promise.all([
        quoteRepository.getQuotes(),
        quoteRepository.getTrashCount().catch(() => 0),
      ]);
      setQuotes(allQuotes);
      setTrashCount(tCount);
    } catch (error) {
      console.error("[QuoteStudio] Impossibile caricare l'archivio preventivi", error);
      setMessage(errorMessage(error));
    }
  }, []);
  useEffect(() => { void refreshQuotes(); }, [refreshQuotes]);

  useEffect(() => {
    let active = true;
    Promise.all([
      orderRepository.getSuppliers().catch(() => []),
      priceListRepository.getDistinctGeneralSuppliers().catch(() => []),
    ]).then(([orderSupps, dbSupps]) => {
      if (!active) return;
      const merged = Array.from(
        new Set([
          ...orderSupps.map((s) => s.name?.trim()).filter(Boolean),
          ...dbSupps,
        ])
      ).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
      setSuppliers(merged);
    }).catch((err) => {
      console.warn("[QuoteStudio] Errore caricamento fornitori:", err);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (viewMode !== "customer") return;
    const returnToEditor = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setViewMode("calculation");
    };
    window.addEventListener("keydown", returnToEditor);
    return () => window.removeEventListener("keydown", returnToEditor);
  }, [viewMode]);

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true); setMessage("");
    try {
      const saved = await quoteRepository.saveDraft(toQuoteInput(draft));
      const nextDraft = quoteToDraft(saved);
      setDraft(nextDraft); savedSignature.current = signature(nextDraft);
      setMessage("Preventivo salvato."); await refreshQuotes(); return true;
    } catch (error) { setMessage(errorMessage(error)); return false; }
    finally { setSaving(false); }
  }, [draft, refreshQuotes]);

  const confirmIfDirty = useCallback(async (): Promise<boolean> => {
    if (!isDirtyRef.current) return true;
    const choice = await new Promise<QuoteCloseChoice>((resolve) => setClosePrompt(() => resolve));
    setClosePrompt(null);
    if (choice === "discard") return true;
    if (choice === "save") return await save();
    return false;
  }, [save]);

  useEffect(() => registerWindowCloseGuard(windowId, async () => {
    return await confirmIfDirty();
  }), [windowId, confirmIfDirty]);

  const handleNewQuote = async () => {
    if (!(await confirmIfDirty())) return;
    const next = createEmptyQuoteDraft();
    setDraft(next);
    savedSignature.current = signature(next);
    setViewMode("calculation");
    setMessage("");
  };

  const convertToDdt = async () => {
    setSaving(true); setMessage("");
    try {
      const converted = await quoteRepository.convertToDdt(toQuoteInput(draft));
      const nextDraft = { ...draft, id: converted.quoteId, status: "confermato" as const };
      setDraft(nextDraft);
      savedSignature.current = signature(nextDraft);
      await refreshQuotes();
      openWindow({ id: "ddt-studio", title: "DDT Studio (Pro)", componentId: "ddt-studio" });
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("quote-converted-to-ddt", {
        detail: { ddt: converted.ddt, items: converted.items },
      })), 100);
      setMessage("Preventivo confermato e bozza DDT creata.");
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setSaving(false); }
  };
  const updateGridRow = (index: number, row: QuoteDraftItem) => setDraft((current) => ({
    ...current, items: current.items.map((item, rowIndex) => rowIndex === index ? row : item),
  }));
  const reorderGridRows = (items: QuoteDraftItem[]) => setDraft((current) => ({ ...current, items }));
  const deleteGridRow = (index: number) => setDraft((current) => {
    const next = [...current.items]; next.splice(index, 1); next.push(createEmptyQuoteItem());
    return { ...current, items: next };
  });
  const updateHeader = (updates: Partial<QuoteDraft>) => setDraft((current) => ({ ...current, ...updates }));
  const openQuote = async (quoteId: string) => {
    if (draft.id === quoteId) {
      setShowArchive(false);
      return;
    }
    if (!(await confirmIfDirty())) return;
    try {
      const quote = await quoteRepository.getQuoteById(quoteId);
      if (quote) {
        const next = quoteToDraft(quote);
        setDraft(next);
        savedSignature.current = signature(next);
        setShowArchive(false);
        setMessage("");
      }
    } catch (error) { setMessage(errorMessage(error)); }
  };
  const copyQuote = async (quoteId: string) => {
    if (!(await confirmIfDirty())) return;
    try {
      const copy = await quoteRepository.duplicateQuote(quoteId);
      const next = quoteToDraft(copy);
      setDraft(next);
      savedSignature.current = signature(next);
      setShowArchive(false);
      setMessage("Copia del preventivo creata in bozza.");
      await refreshQuotes();
    } catch (error) { setMessage(errorMessage(error)); }
  };
  const deleteQuote = async (quoteId: string) => {
    try {
      await quoteRepository.softDeleteQuote(quoteId);
      if (draft.id === quoteId) {
        const next = createEmptyQuoteDraft();
        setDraft(next);
        savedSignature.current = signature(next);
      }
      setMessage("Preventivo spostato nel cestino.");
      await refreshQuotes();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };
  const [copyingPdf, setCopyingPdf] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const printPdf = async () => {
    setMessage("");
    try { setMessage(`PDF creato: ${await exportQuotePdf(draft)}`); }
    catch (error) { setMessage(errorMessage(error)); }
  };

  const handleCopyPdf = useCallback(async () => {
    if (copyingPdf) return;
    setCopyingPdf(true);
    setMessage("");
    try {
      await copyQuotePdfToClipboard(draft);
      setCopySuccess(true);
      setMessage("PDF Preventivo copiato negli appunti! Ora puoi incollarlo (Ctrl+V) direttamente in un'email o cartella.");
      setTimeout(() => setCopySuccess(false), 3000);
    } catch (error) {
      console.error("[QuoteStudio] Errore copia PDF preventivo:", error);
      setMessage(`Errore copia PDF: ${errorMessage(error)}`);
    } finally {
      setCopyingPdf(false);
    }
  }, [draft, copyingPdf]);

  useEffect(() => {
    const handleCopyKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const target = e.target as HTMLElement | null;
        const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        const selectedText = window.getSelection()?.toString();
        if (!selectedText && !isInput) {
          e.preventDefault();
          e.stopPropagation();
          void handleCopyPdf();
        }
      }
    };
    window.addEventListener("keydown", handleCopyKeyDown);
    return () => window.removeEventListener("keydown", handleCopyKeyDown);
  }, [handleCopyPdf]);
  const fillRandomRows = () => {
    const emptyRows = draft.items.flatMap((item, index) => isQuoteDraftItemActive(item) ? [] : [index]);
    if (emptyRows.length < 15) {
      setMessage("Non ci sono almeno 15 righe vuote disponibili per i dati di test.");
      return;
    }
    const rowCount = randomInteger(15, Math.min(60, emptyRows.length));
    const nextItems = [...draft.items];
    createRandomQuoteRows(rowCount).forEach((item, index) => { nextItems[emptyRows[index]] = item; });
    setDraft((current) => ({ ...current, items: nextItems }));
    setViewMode("calculation");
    setMessage(`Inserite ${rowCount} righe di test nelle prime righe vuote.`);
  };

  return <div className="relative flex h-full min-h-0 flex-col gap-2 overflow-hidden p-3 text-[var(--foreground)]">
    <QuoteStudioHeader status={draft.status ?? "bozza"} viewMode={viewMode} alexMode={alexMode} saving={saving}
      archiveCount={quotes.length} trashCount={trashCount} quoteDate={draft.quote_date ?? ""}
      quoteCode={formatQuoteCode(draft.year, draft.quote_number)}
      onStatusChange={(status) => updateHeader({ status })} onViewChange={setViewMode}
      onAlexToggle={() => setAlexMode((value) => !value)} onArchive={() => setShowArchive((value) => !value)}
      onOpenTrash={() => setShowTrash(true)}
      onSave={() => void save()} onNew={() => void handleNewQuote()}
      onPdf={() => void printPdf()} onCopyPdf={() => void handleCopyPdf()}
      copyingPdf={copyingPdf} copySuccess={copySuccess}
      onConvert={() => void convertToDdt()} onFillRandomRows={fillRandomRows} />
    <QuoteKpiBanner items={draft.items} discount={draft.global_discount_pct ?? 0} alexMode={alexMode}
      onDiscountChange={(value) => updateHeader({ global_discount_pct: value })} />
    <QuoteClientFields draft={draft} onChange={updateHeader} />
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)]">
      {viewMode === "calculation" && <QuoteItemsGrid
        items={draft.items} alexMode={alexMode} globalDiscount={draft.global_discount_pct ?? 0}
        suppliers={suppliers}
        onUpdateRow={updateGridRow} onReorder={reorderGridRows} onDeleteRow={deleteGridRow} />}
      <QuoteA4Preview draft={draft} inline captureOnly={viewMode !== "customer"} />
    </main>
    <footer className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[10px] text-[var(--muted-foreground)]">
      <span>F1 = Prima riga · Tab / Invio = Spostamento · Canc = Svuota cella · Trascina # per riordinare</span>
      <span>{draft.items.filter(isQuoteDraftItemActive).length} righe compilate su {draft.items.length}</span>
    </footer>
    {message && <div role="status" className="absolute bottom-12 left-4 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs shadow-lg">{message}</div>}
    {showArchive && <QuoteArchiveSidebar quotes={filteredQuotes} search={archiveSearch} trashCount={trashCount} onSearch={setArchiveSearch}
      onClose={() => setShowArchive(false)} onOpen={(id) => void openQuote(id)} onCopy={(id) => void copyQuote(id)} onDelete={(id) => void deleteQuote(id)}
      onOpenTrash={() => { setShowArchive(false); setShowTrash(true); }} />}
    <QuoteTrashModal
      isOpen={showTrash}
      onClose={() => setShowTrash(false)}
      onQuoteRestored={(restored) => {
        setMessage(`Preventivo ${restored.quote_number != null ? formatQuoteCode(restored.year, restored.quote_number) : ""} ripristinato con successo.`);
        void refreshQuotes();
      }}
    />
    <UnsavedChangesModal
      isOpen={Boolean(closePrompt)}
      title="Preventivo con modifiche non salvate"
      message="Attenzione: sono presenti modifiche non salvate in questo preventivo. Se non salvi, le modifiche apportate verranno cancellate definitivamente."
      onCancel={() => closePrompt?.("cancel")}
      onDiscard={() => closePrompt?.("discard")}
      onSave={() => closePrompt?.("save")}
      saveLabel="Salva"
      discardLabel="Non salvare"
      cancelLabel="Annulla"
      isSaving={saving}
    />
  </div>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error) ?? String(error);
}

function formatQuoteDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("it-IT");
}

const SAMPLE_PRODUCTS = [
  "TASSELLO NYLON CON VITE", "VITE TSP BRONZATA", "SILICONE NEUTRO TRASPARENTE",
  "SCHIUMA POLIURETANICA", "DISCO DA TAGLIO PER FERRO", "NASTRO ISOLANTE PVC",
  "PENNELLO PROFESSIONALE", "FLESSOMETRO ANTITAGLIO", "LUCCHETTO CORPO OTTONE",
  "MANIGLIA ALLUMINIO SATINATO", "RACCORDO OTTONE FILETTATO", "GUANTI DA LAVORO",
];
const SAMPLE_SUPPLIERS = ["FERRAMENTA ITALIA", "EDILFORNITURE LUCCA", "COLORI & UTENSILI", "BRICO SUPPLY"];
const SAMPLE_UNITS = ["PZ", "NR", "MT", "CF", "KG", "LT"];
const SAMPLE_AVAILABILITY = ["DISPONIBILE", "SU ORDINAZIONE", "PRONTA CONSEGNA", "IN ARRIVO"];
const SAMPLE_VAT_RATES = [22, 10, 4, 0] as const;

function createRandomQuoteRows(count: number): QuoteDraftItem[] {
  return Array.from({ length: count }, (_, index) => {
    const purchase = money(randomInteger(75, 8500) / 100);
    const markup = randomInteger(15, 85);
    const description = SAMPLE_PRODUCTS[randomInteger(0, SAMPLE_PRODUCTS.length - 1)];
    return {
      ...createEmptyQuoteItem(),
      id: crypto.randomUUID(),
      code: `TEST-${String(randomInteger(10000, 99999))}`,
      supplier: SAMPLE_SUPPLIERS[randomInteger(0, SAMPLE_SUPPLIERS.length - 1)],
      supplier_item_code: `F-${randomInteger(1000, 99999)}`,
      description: `${description} ${randomInteger(6, 120)} MM` ,
      unit: SAMPLE_UNITS[randomInteger(0, SAMPLE_UNITS.length - 1)],
      quantity: String(randomInteger(1, 40)),
      purchase_price: purchase.toCanonicalString(),
      markup_pct: markup,
      base_unit_price: purchase.times(1 + markup / 100).toCanonicalString(),
      forced_unit_price: "",
      discount_pct: randomInteger(1, 20),
      vat_rate: SAMPLE_VAT_RATES[randomInteger(0, SAMPLE_VAT_RATES.length - 1)],
      availability: SAMPLE_AVAILABILITY[randomInteger(0, SAMPLE_AVAILABILITY.length - 1)],
      notes: `Riga generata per test ${index + 1}`,
    };
  });
}

function randomInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
