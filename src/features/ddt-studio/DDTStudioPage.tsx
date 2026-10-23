import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { DdtDocument, DdtItem } from "./models/ddt";
import { ddtRepository } from "./services/ddtRepository";
import { clientRepository } from "@/features/clients/services/clientRepository";
import { Product } from "@/features/price-lists/models/product";
import { money, isPositivePrice } from "@/shared/domain/monetaryValue";
import { registerWindowCloseGuard } from "@/shared/stores/useWindowStore";
import { calculateRowAmounts, calculateDdtTotals } from "./utils/ddtCalculations";

import { DDTStudioHeader } from "./components/DDTStudioHeader";
import { DDTStudioSidebar } from "./components/DDTStudioSidebar";
import { DDTClienteCard } from "./components/DDTClienteCard";
import { DDTArticoliTable, DDTArticoliTableHandle } from "./components/DDTArticoliTable";
import { DDTFinancialBar } from "./components/DDTFinancialBar";
import { DDTLogisticaCard } from "./components/DDTLogisticaCard";
import { DDTA4Document } from "./document/DDTA4Document";
import { DDTArticoliSearchModal } from "./components/DDTArticoliSearchModal";
import { DDTPrintCopiesModal } from "./components/DDTPrintCopiesModal";
import {
  exportDdtPdfToDesktop,
  executeDdtPrint,
} from "./utils/ddtExportManager";

export const TOTAL_PRESET_ROWS = 500;

export function makeEmptyDdt(): Partial<DdtDocument> {
  const now = new Date();
  const year = now.getFullYear();
  const todayIso = now.toISOString().split("T")[0];

  return {
    id: crypto.randomUUID(),
    doc_number: null,
    series: "",
    year,
    doc_date: todayIso,
    status: "bozza",
    client_name: "",
    client_address: "",
    client_city: "",
    client_vat: "",
    client_fiscal_code: "",
    client_sdi: "",
    destination_name: "",
    destination_address: "",
    destination_city: "",
    transport_reason: "Vendita",
    payment_method: "RIMESSA DIRETTA",
    order_reference: "",
    account_or_balance: "",
    operator: "",
    goods_appearance: "",
    carriage_terms: "Franco stabilimento",
    packages_count: "",
    weight_kg: "",
    carrier: "",
    pickup_date_time: "",
    internal_notes: "",
    total_taxable: money(0),
    total_vat: money(0),
    total_document: money(0),
  };
}

export function makeEmptyItems(): DdtItem[] {
  const now = new Date().toISOString();
  return Array.from({ length: TOTAL_PRESET_ROWS }, (_, i) => ({
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    updated_by: "system",
    deleted_at: null,
    sync_status: "pending",
    ddt_id: "",
    row_index: i + 1,
    code: "",
    description: "",
    unit: "",
    quantity: "",
    unit_price: money(0),
    discount_pct: "",
    net_amount: money(0),
    vat_rate: "",
    vat_amount: money(0),
    purchase_price: money(0),
  }));
}

export function makeTest48Items(): DdtItem[] {
  const sampleDescriptions = [
    { code: "VTE430", desc: "VITE TSP BRONZATA 4X30 (100 PZ)", um: "CF", q: "5", p: "3.50000", v: "22" },
    { code: "TSX6", desc: "TASSELLO NYLON SX 6 CON VITE (100 PZ)", um: "CF", q: "2", p: "8.20000", v: "22" },
    { code: "SILTR", desc: "SILICONE TRASPARENTE ACETICO 280 ML", um: "PZ", q: "12", p: "4.10000", v: "22" },
    { code: "SCHPOL", desc: "SCHIUMA POLIURETANICA MANUALE 750 ML", um: "PZ", q: "6", p: "6.90000", v: "22" },
    { code: "DISC115", desc: "DISCO DA TAGLIO FERRO 115X1.0 MM", um: "PZ", q: "25", p: "1.20000", v: "22" },
    { code: "NASTIS", desc: "NASTRO ISOLANTE NERO 25M X 19MM", um: "RT", q: "10", p: "1.50000", v: "22" },
    { code: "PENN40", desc: "PENNELLO PIATTO TRIPLE SETOLA 40 MM", um: "PZ", q: "4", p: "2.80000", v: "22" },
    { code: "CARTA80", desc: "CARTA VETRATA ABRASIVA GRANA 80 (50M)", um: "RT", q: "1", p: "24.50000", v: "22" },
    { code: "MANRST", desc: "MANIGLIA ALLUMINIO BRONZATO ROSETTA", um: "CP", q: "8", p: "14.00000", v: "22" },
    { code: "LUCCH50", desc: "LUCCHETTO OTTONE ARCO LUNGO 50 MM", um: "PZ", q: "3", p: "11.50000", v: "22" },
    { code: "METRO5", desc: "FLESSOMETRO PROFESSIONALE 5 METRI", um: "PZ", q: "2", p: "7.90000", v: "22" },
    { code: "CUTTER18", desc: "CUTTER PROFESSIONALE LAMA 18 MM", um: "PZ", q: "5", p: "3.20000", v: "22" },
  ];

  const fullList = makeEmptyItems();
  for (let i = 0; i < 48; i++) {
    const s = sampleDescriptions[i % sampleDescriptions.length];
    const qty = String(parseInt(s.q, 10) + (i % 3));
    const pr = money(s.p);
    const disc = i % 4 === 0 ? "10" : "";
    const { netAmount, vatAmount } = calculateRowAmounts(qty, pr, disc, s.v);
    fullList[i] = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: "system",
      deleted_at: null,
      sync_status: "pending",
      ddt_id: "",
      row_index: i + 1,
      code: `${s.code}-${String(i + 1).padStart(2, "0")}`,
      description: `${s.desc} - Serie ${i + 1}`,
      unit: s.um,
      quantity: qty,
      unit_price: pr,
      base_price: pr,
      discount_pct: disc,
      base_discount_pct: disc,
      net_amount: netAmount,
      vat_rate: s.v,
      vat_amount: vatAmount,
      purchase_price: pr.times(0.6),
    };
  }
  return fullList;
}

export function makeTestDdt(): Partial<DdtDocument> {
  const base = makeEmptyDdt();
  return {
    ...base,
    doc_number: 2729,
    doc_date: "2026-10-22",
    status: "confermato",
    client_name: "FERRAMENTA E COLORI ROSSI S.R.L.",
    client_address: "VIA DELLE INDUSTRIE 45",
    client_city: "55049 VIAREGGIO LU",
    client_vat: "01847290461",
    client_fiscal_code: "01847290461",
    destination_name: "CANTIERE NAVALE BARSANTI",
    destination_address: "VIA COPPINO 12",
    destination_city: "55049 VIAREGGIO LU",
    transport_reason: "Vendita",
    payment_method: "RIMESSA DIRETTA 30 GG",
    operator: "Samu",
    goods_appearance: "A vista",
    carriage_terms: "Porto franco",
    packages_count: "5",
    weight_kg: "48.50",
    carrier: "CORRIERE ESPRESSO BARTOLINI",
    pickup_date_time: "22/10/2026 14:30",
    internal_notes: "CONSEGNA ENTRO LE ORE 12:00 - CONTROLLARE INTEGRITA COLLI",
  };
}

type DdtCloseChoice = "emit" | "draft" | "discard" | "cancel";

export const DDTStudioPage: React.FC<{ windowId: string }> = ({ windowId }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<"editor" | "a4">("editor");
  const [showMargini, setShowMargini] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchSidebar, setSearchSidebar] = useState("");
  const [recentDdts, setRecentDdts] = useState<DdtDocument[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrintCopiesModalOpen, setIsPrintCopiesModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [closePrompt, setClosePrompt] = useState<((choice: DdtCloseChoice) => void) | null>(null);
  const savedSignature = React.useRef<string | null>(null);

  // Stato DDT Corrente
  const [ddt, setDdt] = useState<Partial<DdtDocument>>(makeEmptyDdt());
  const [items, setItems] = useState<DdtItem[]>(makeEmptyItems());

  // Input Finanziari Immediati (Sconto Righe e Maggiorazione %)
  const [globalDiscount, setGlobalDiscount] = useState("");
  const [globalMarkup, setGlobalMarkup] = useState("");

  const signature = (doc: Partial<DdtDocument>, rows: DdtItem[], discount: string, markup: string) =>
    JSON.stringify({ doc, rows, discount, markup });
  const isDirty = savedSignature.current !== null
    && signature(ddt, items, globalDiscount, globalMarkup) !== savedSignature.current;

  useEffect(() => {
    savedSignature.current = signature(ddt, items, globalDiscount, globalMarkup);
  }, []);

  // Riferimento per controllo imperativo tabella (es. pulizia focus cella)
  const tableRef = React.useRef<DDTArticoliTableHandle>(null);

  const handleClearTableFocus = useCallback(() => {
    tableRef.current?.clearFocusedCell();
  }, []);

  // Modale ricerca articoli F3
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Caricamento lista DDT recenti da SQLite
  const loadRecentDdts = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const list = await ddtRepository.getRecentDdts(selectedYear, searchSidebar);
      setRecentDdts(list);
    } catch (e) {
      console.error("Errore caricamento lista DDT:", e);
    } finally {
      setIsLoadingList(false);
    }
  }, [selectedYear, searchSidebar]);

  useEffect(() => {
    loadRecentDdts();
  }, [loadRecentDdts]);

  useEffect(() => {
    const handleQuoteConversion = (event: Event) => {
      const detail = (event as CustomEvent<{ ddt: Partial<DdtDocument>; items: DdtItem[] }>).detail;
      if (!detail?.ddt?.id) return;
      const blanks = makeEmptyItems();
      const padded = [...detail.items, ...blanks.slice(detail.items.length)].map((item) => ({
        ...item, ddt_id: detail.ddt.id!,
      }));
      setDdt(detail.ddt);
      setItems(padded);
      setGlobalDiscount("");
      setGlobalMarkup("");
      setShowMargini(false);
      setActiveView("editor");
      showToast("Preventivo convertito in bozza DDT");
    };
    window.addEventListener("quote-converted-to-ddt", handleQuoteConversion);
    return () => window.removeEventListener("quote-converted-to-ddt", handleQuoteConversion);
  }, []);

  // Carica un DDT esistente selezionato dalla sidebar
  const handleSelectDdt = async (id: string) => {
    try {
      const fullDoc = await ddtRepository.getDdtById(id);
      if (!fullDoc) return;

      setDdt(fullDoc);

      // Riempi sempre fino a 500 righe esatte
      const existing: DdtItem[] = (fullDoc.items || []).map((it) => ({
        ...it,
        base_price: it.base_price && isPositivePrice(it.base_price) ? it.base_price : it.unit_price,
        base_discount_pct: it.base_discount_pct !== undefined ? it.base_discount_pct : it.discount_pct,
      }));
      const padded: DdtItem[] = [...existing];
      while (padded.length < TOTAL_PRESET_ROWS) {
        padded.push({
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: "system",
          deleted_at: null,
          sync_status: "pending",
          ddt_id: fullDoc.id,
          row_index: padded.length + 1,
          code: "",
          description: "",
          unit: "",
          quantity: "",
          unit_price: money(0),
          base_price: money(0),
          discount_pct: "",
          net_amount: money(0),
          vat_rate: "",
          vat_amount: money(0),
          purchase_price: money(0),
        });
      }
      setGlobalDiscount("");
      setGlobalMarkup("");
      setItems(padded);
      savedSignature.current = signature(fullDoc, padded, "", "");
      const identifier = fullDoc.doc_number === null
        ? "Bozza"
        : `${fullDoc.series ? `${fullDoc.series}/` : ""}${fullDoc.doc_number}`;
      showToast(`DDT #${identifier} caricato`);
    } catch (e) {
      console.error("Errore apertura DDT:", e);
    }
  };

  // Nuovo DDT vuoto
  const handleNewDdt = () => {
    const nextDdt = makeEmptyDdt();
    const nextItems = makeEmptyItems();
    setDdt(nextDdt);
    setItems(nextItems);
    setGlobalDiscount("");
    setGlobalMarkup("");
    savedSignature.current = signature(nextDdt, nextItems, "", "");
    showToast("Nuova Bozza DDT creata");
  };

  // Salva Bozza
  const handleSaveDraft = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const saved = await ddtRepository.saveDraft(ddt, items);
      setDdt(saved);
      savedSignature.current = signature(saved, items, globalDiscount, globalMarkup);
      await loadRecentDdts();
      showToast("Bozza salvata con successo");
      return true;
    } catch (e) {
      console.error("Errore salvataggio bozza:", e);
      showToast(`Errore salvataggio bozza: ${getErrorMessage(e)}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Salva e Conferma DDT (Emissione con numero progressivo)
  const handleEmitDdt = async (): Promise<boolean> => {
    if (!ddt.client_name?.trim()) {
      showToast("Attenzione: Inserisci il nome del cliente prima di salvare il DDT!");
      return false;
    }

    setIsSaving(true);
    try {
      const saved = await ddtRepository.emitDdt(ddt, items);
      setDdt(saved);
      savedSignature.current = signature(saved, items, globalDiscount, globalMarkup);
      await loadRecentDdts();
      const identifier = `${saved.series ? `${saved.series}/` : ""}${saved.doc_number}`;
      showToast(`DDT emesso con successo! Numero assegnato: #${identifier}`);
      return true;
    } catch (e) {
      console.error("Errore emissione DDT:", e);
      showToast(`Errore emissione DDT: ${getErrorMessage(e)}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => registerWindowCloseGuard(windowId, async () => {
    if (!isDirty) return true;
    const choice = await new Promise<DdtCloseChoice>((resolve) => setClosePrompt(() => resolve));
    setClosePrompt(null);
    if (choice === "discard") return true;
    if (choice === "draft") return handleSaveDraft();
    if (choice === "emit") return handleEmitDdt();
    return false;
  }), [windowId, isDirty, handleSaveDraft, handleEmitDdt]);

  // Duplica DDT
  const handleDuplicateDdt = async () => {
    if (!ddt.id) return;
    setIsSaving(true);
    try {
      const dup = await ddtRepository.duplicateDdt(ddt.id);
      setDdt(dup);
      await handleSelectDdt(dup.id);
      await loadRecentDdts();
      showToast("DDT duplicato come nuova bozza non numerata");
    } catch (e) {
      console.error("Errore duplicazione:", e);
      showToast("Errore durante la duplicazione del DDT");
    } finally {
      setIsSaving(false);
    }
  };

  // Elimina DDT
  const handleDeleteDdt = async () => {
    if (!ddt.id) return;
    if (!confirm("Sei sicuro di voler eliminare questo DDT?")) return;

    try {
      await ddtRepository.deleteDdt(ddt.id);
      handleNewDdt();
      await loadRecentDdts();
      showToast("DDT eliminato");
    } catch (e) {
      console.error("Errore eliminazione:", e);
    }
  };

  // Salva cliente in anagrafica SQLite
  const handleSaveClientToDb = async () => {
    if (!ddt.client_name?.trim()) {
      showToast("Nessun cliente da salvare");
      return;
    }

    try {
      await clientRepository.createOrUpdateClient({
        business_name: ddt.client_name,
        address: ddt.client_address,
        city: ddt.client_city,
        vat_number: ddt.client_vat,
        fiscal_code: ddt.client_fiscal_code,
        sdi_code: ddt.client_sdi,
        payment_method: ddt.payment_method,
        destination_name: ddt.destination_name,
        destination_address: ddt.destination_address,
        destination_city: ddt.destination_city,
        phones: ddt.client_phones || [],
      });
      showToast(`Cliente '${ddt.client_name}' salvato in anagrafica SQLite`);
    } catch (e) {
      console.error("Errore salvataggio cliente:", e);
    }
  };

  // Inserimento articolo selezionato da modale ricerca F3
  const handleSelectProductFromModal = (prod: Product, quantityStr: string) => {
    setItems((prev) => {
      const copy = [...prev];
      let targetIdx = copy.findIndex(
        (it) => !it.description?.trim().length && !isPositivePrice(it.unit_price)
      );
      if (targetIdx === -1) targetIdx = 0;

      const price = money(prod.sale_price_cents / 100);
      const purchasePrice = money(prod.purchase_price_cents / 100);
      const q = quantityStr || "1";

      let effectivePrice = price;
      const markupClean = globalMarkup.trim().replace("%", "").replace(",", ".");
      const markupNum = parseFloat(markupClean);
      if (!isNaN(markupNum) && markupNum !== 0) {
        effectivePrice = price.times(1 + markupNum / 100);
      }
      const disc = globalDiscount.trim();
      const { netAmount, vatAmount } = calculateRowAmounts(q, effectivePrice, disc, prod.vat_rate);

      copy[targetIdx] = {
        ...copy[targetIdx],
        product_id: prod.id,
        code: prod.code,
        description: prod.description.toUpperCase(),
        unit: prod.unit || "NR",
        quantity: q,
        unit_price: effectivePrice,
        base_price: price,
        discount_pct: disc,
        base_discount_pct: "",
        net_amount: netAmount,
        vat_rate: prod.vat_rate,
        vat_amount: vatAmount,
        purchase_price: purchasePrice,
      };

      return copy;
    });

    showToast(`Inserito: ${prod.description}`);
  };

  // Stampa diretta con popup numero copie e lato singolo (Simplex)
  const handleConfirmPrint = async (copies: number) => {
    setIsPrintCopiesModalOpen(false);
    setIsPrinting(true);
    showToast(`Invio stampa di ${copies} ${copies === 1 ? "copia" : "copie"} in corso...`);
    try {
      await executeDdtPrint(copies);
      showToast(`Stampa inviata alla stampante predefinita (${copies} ${copies === 1 ? "copia" : "copie"})`);
    } catch (e: any) {
      console.error("Errore stampa:", e);
      showToast(`Errore durante la stampa: ${e?.message || e}`);
    } finally {
      setIsPrinting(false);
    }
  };

  // Salva PDF multipagina del DDT direttamente sul Desktop (ad altissima fedeltà)
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    showToast("Generazione PDF multipagina del DDT in corso...");
    try {
      const { filename } = await exportDdtPdfToDesktop(ddt);
      showToast(`PDF salvato sul Desktop: ${filename}`);
    } catch (e: any) {
      console.error("Errore salvataggio PDF:", e);
      showToast(`Errore salvataggio PDF: ${e?.message || e}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Popola 48 righe ed esporta direttamente sul Desktop il PDF
  const handleGenerateTest48 = async () => {
    const testDoc = makeTestDdt();
    const testItems = makeTest48Items();
    setDdt(testDoc);
    setItems(testItems);
    setActiveView("a4");
    showToast("Compilate 48 righe! Esportazione PDF in corso...");

    // Breve pausa per consentire al DOM di renderizzare le 2 pagine A4
    setTimeout(async () => {
      try {
        setIsExportingPdf(true);
        const pdfRes = await exportDdtPdfToDesktop(testDoc);
        showToast(`PDF salvato su Desktop: ${pdfRes.filename}`);
      } catch (err: any) {
        console.error("Errore salvataggio test:", err);
        showToast(`Errore salvataggio test: ${err?.message || err}`);
      } finally {
        setIsExportingPdf(false);
      }
    }, 500);
  };

  // Modifica istantanea sconto globale (singolo o a cascata es. 10+3) retroattiva su tutte le righe (vecchie e nuove)
  // Preserva lo sconto base originario di ogni riga e lo ripristina quando la casella viene svuotata ("torna come prima")
  const handleChangeGlobalDiscount = (val: string) => {
    setGlobalDiscount(val);
    const cleanDisc = val.trim();

    React.startTransition(() => {
      // Se l'utente svuota o cancella il valore, ripristina lo sconto che c'era prima per ogni singola riga
      if (cleanDisc === "") {
        setItems((prev) =>
          prev.map((item) => {
            const restoredDisc =
              item.base_discount_pct !== undefined ? item.base_discount_pct : (item.discount_pct || "");
            const hasPrice = isPositivePrice(item.unit_price);
            const { netAmount, vatAmount } = calculateRowAmounts(
              item.quantity || (hasPrice ? "1" : ""),
              item.unit_price,
              restoredDisc,
              item.vat_rate
            );
            return {
              ...item,
              discount_pct: restoredDisc,
              base_discount_pct: undefined,
              net_amount: netAmount,
              vat_amount: vatAmount,
            };
          })
        );
        return;
      }

      // Applica il nuovo sconto preservando lo sconto originale prima dell'inizio della sovrascrittura
      setItems((prev) =>
        prev.map((item) => {
          const originalBase =
            item.base_discount_pct !== undefined ? item.base_discount_pct : (item.discount_pct || "");
          const hasPrice = isPositivePrice(item.unit_price);
          const { netAmount, vatAmount } = calculateRowAmounts(
            item.quantity || (hasPrice ? "1" : ""),
            item.unit_price,
            cleanDisc,
            item.vat_rate
          );
          return {
            ...item,
            base_discount_pct: originalBase,
            discount_pct: cleanDisc,
            net_amount: netAmount,
            vat_amount: vatAmount,
          };
        })
      );
    });
  };

  // Modifica istantanea maggiorazione % su tutti i prezzi della DDT (con ripristino istantaneo se cancellato)
  const handleChangeGlobalMarkup = (val: string) => {
    setGlobalMarkup(val);
    const trimmed = val.trim();

    React.startTransition(() => {
      // Se l'utente svuota o cancella l'input: ripristina all'istante i prezzi base ("torna come prima")
      if (trimmed === "") {
        setItems((prev) =>
          prev.map((item) => {
            if (item.base_price && isPositivePrice(item.base_price)) {
              const restoredPrice = item.base_price;
              const { netAmount, vatAmount } = calculateRowAmounts(
                item.quantity || "1",
                restoredPrice,
                item.discount_pct,
                item.vat_rate
              );
              return {
                ...item,
                unit_price: restoredPrice,
                net_amount: netAmount,
                vat_amount: vatAmount,
              };
            }
            return item;
          })
        );
        return;
      }

      const clean = trimmed.replace("%", "").replace(",", ".");
      const num = parseFloat(clean);
      if (isNaN(num)) {
        // Sta digitando un carattere parziale (es. "+", "-"): attendiamo senza alterare i prezzi
        return;
      }

      // Applica moltiplicatore istantaneo rispetto al prezzo base originale
      const multiplier = 1 + num / 100;
      setItems((prev) =>
        prev.map((item) => {
          const base =
            item.base_price && isPositivePrice(item.base_price)
              ? item.base_price
              : isPositivePrice(item.unit_price)
              ? item.unit_price
              : null;

          if (base) {
            const newPrice = base.times(multiplier);
            const { netAmount, vatAmount } = calculateRowAmounts(
              item.quantity || "1",
              newPrice,
              item.discount_pct,
              item.vat_rate
            );
            return {
              ...item,
              base_price: base,
              unit_price: newPrice,
              net_amount: netAmount,
              vat_amount: vatAmount,
            };
          }
          return item;
        })
      );
    });
  };

  const totals = calculateDdtTotals(items);

  return (
    <div
      className="flex flex-col h-full w-full bg-[#181a20] overflow-hidden"
      onMouseDownCapture={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (!target.closest("input, textarea, select, [contenteditable='true']")) return;
        if (target.closest(".ddt-items-grid")) return;
        tableRef.current?.clearFocusedCell();
      }}
    >
      {/* Toast Notifica */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-[var(--primary)] text-white px-4 py-2 rounded-lg shadow-2xl text-xs font-semibold z-50 flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {closePrompt && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="ddt-close-title" className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--foreground)] shadow-2xl">
          <h2 id="ddt-close-title" className="text-base font-semibold">DDT con modifiche non salvate</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Scegli come conservare il lavoro prima di chiudere.</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => closePrompt("cancel")} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Annulla</button>
            <button type="button" onClick={() => closePrompt("discard")} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">Chiudi senza salvare</button>
            <button type="button" disabled={isSaving} onClick={() => closePrompt("draft")} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50">Salva in bozze</button>
            <button type="button" disabled={isSaving} onClick={() => closePrompt("emit")} className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50">Emetti DDT</button>
          </div>
        </section>
      </div>}

      {/* Header Operativo DDT Studio */}
      <DDTStudioHeader
        ddt={ddt}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activeView={activeView}
        setActiveView={setActiveView}
        onNewDdt={handleNewDdt}
        onSaveDraft={handleSaveDraft}
        onEmitDdt={handleEmitDdt}
        onOpenPrintModal={() => setIsPrintCopiesModalOpen(true)}
        onExportPdf={handleExportPdf}
        onGenerateTest48={handleGenerateTest48}
        onDuplicateDdt={handleDuplicateDdt}
        onDeleteDdt={handleDeleteDdt}
        isSaving={isSaving}
        isExportingPdf={isExportingPdf}
        isPrinting={isPrinting}
      />

      {/* Corpo Principale: Sidebar Riducibile / Espandibile + Area Lavoro */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Archivio DDT (Compatta a 50px se chiusa, Completa se aperta) */}
        <DDTStudioSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          ddtList={recentDdts}
          currentDdtId={ddt.id}
          onSelectDdt={handleSelectDdt}
          onNewDdt={handleNewDdt}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          search={searchSidebar}
          setSearch={setSearchSidebar}
          isLoading={isLoadingList}
        />

        {/* Area di Lavoro */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#181a20]">
          {activeView === "editor" ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Card Cliente & Testata */}
              <div className="shrink-0">
                <DDTClienteCard
                  ddt={ddt}
                  setDdt={setDdt}
                  onSaveClientToDb={handleSaveClientToDb}
                />
              </div>

              {/* Tabella Articoli (Excel-Like con 500 righe e bianco/grigio alternato) */}
              <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
                <DDTArticoliTable
                  ref={tableRef}
                  items={items}
                  setItems={setItems}
                  showMargini={showMargini}
                  globalDiscount={globalDiscount}
                  globalMarkup={globalMarkup}
                  onOpenSearchModal={() => setIsSearchModalOpen(true)}
                />
              </div>

              {/* Barra Finanziaria Colorata (Tot. Acquisto, Totale Netto, Ricavo, Ricarico % + Alex + Sconto & Maggiorazione) */}
              <DDTFinancialBar
                ddt={ddt}
                setDdt={setDdt}
                totals={totals}
                showMargini={showMargini}
                setShowMargini={setShowMargini}
                onOpenSearchModal={() => setIsSearchModalOpen(true)}
                onOpenAlexModal={() => setIsSearchModalOpen(true)}
                globalDiscount={globalDiscount}
                onChangeGlobalDiscount={handleChangeGlobalDiscount}
                globalMarkup={globalMarkup}
                onChangeGlobalMarkup={handleChangeGlobalMarkup}
                onClearTableFocus={handleClearTableFocus}
              />

              {/* Card Logistica e Riepilogo Economico */}
              <div className="shrink-0">
                <DDTLogisticaCard
                  ddt={ddt}
                  setDdt={setDdt}
                  items={items}
                  onOpenSearchModal={() => setIsSearchModalOpen(true)}
                />
              </div>
            </div>
          ) : (
            /* Vista Foglio A4 Millimetrico (Sfondo scuro di contrasto, identico a Foto 4) */
            <div className="flex-1 overflow-y-auto bg-[#18181b] p-6 flex justify-center">
              <DDTA4Document ddt={ddt} items={items} />
            </div>
          )}
        </div>
      </div>

      {/* Modale Ricerca Articoli (F3) */}
      <DDTArticoliSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectProduct={handleSelectProductFromModal}
      />

      {/* Modale Numero Copie Stampa */}
      <DDTPrintCopiesModal
        isOpen={isPrintCopiesModalOpen}
        onClose={() => setIsPrintCopiesModalOpen(false)}
        onConfirm={handleConfirmPrint}
        isPrinting={isPrinting}
      />

      {/* Portale Dedicato alla Stampa & Esportazione Immagine (In coordinate stabili offscreen) */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            id="ddt-print-portal"
            style={{
              position: "fixed",
              left: "-99999px",
              top: 0,
              width: "210mm",
              opacity: 1,
              pointerEvents: "none",
              zIndex: -99999,
            }}
          >
            <DDTA4Document ddt={ddt} items={items} isPrintOnly={true} />
          </div>,
          document.body
        )}
    </div>
  );
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error) ?? String(error);
}
