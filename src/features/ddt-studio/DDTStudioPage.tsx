import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { DdtDocument, DdtItem } from "./models/ddt";
import { ddtRepository } from "./services/ddtRepository";
import { clientRepository } from "@/features/clients/services/clientRepository";
import { Product } from "@/features/price-lists/models/product";
import { money, isPositivePrice } from "@/shared/domain/monetaryValue";
import { calculateRowAmounts, calculateDdtTotals } from "./utils/ddtCalculations";

import { DDTStudioHeader } from "./components/DDTStudioHeader";
import { DDTStudioSidebar } from "./components/DDTStudioSidebar";
import { DDTClienteCard } from "./components/DDTClienteCard";
import { DDTArticoliTable } from "./components/DDTArticoliTable";
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
  return Array.from({ length: TOTAL_PRESET_ROWS }, (_, i) => ({
    id: crypto.randomUUID(),
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
      ddt_id: "",
      row_index: i + 1,
      code: `${s.code}-${String(i + 1).padStart(2, "0")}`,
      description: `${s.desc} - Serie ${i + 1}`,
      unit: s.um,
      quantity: qty,
      unit_price: pr,
      discount_pct: disc,
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

export const DDTStudioPage: React.FC = () => {
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

  // Stato DDT Corrente
  const [ddt, setDdt] = useState<Partial<DdtDocument>>(makeEmptyDdt());
  const [items, setItems] = useState<DdtItem[]>(makeEmptyItems());

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

  // Carica un DDT esistente selezionato dalla sidebar
  const handleSelectDdt = async (id: string) => {
    try {
      const fullDoc = await ddtRepository.getDdtById(id);
      if (!fullDoc) return;

      setDdt(fullDoc);

      // Riempi sempre fino a 500 righe esatte
      const existing = fullDoc.items || [];
      const padded = [...existing];
      while (padded.length < TOTAL_PRESET_ROWS) {
        padded.push({
          id: crypto.randomUUID(),
          ddt_id: fullDoc.id,
          row_index: padded.length + 1,
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
        });
      }
      setItems(padded);
      showToast(`DDT #${fullDoc.doc_number || "Bozza"} caricato`);
    } catch (e) {
      console.error("Errore apertura DDT:", e);
    }
  };

  // Nuovo DDT vuoto
  const handleNewDdt = () => {
    setDdt(makeEmptyDdt());
    setItems(makeEmptyItems());
    showToast("Nuova Bozza DDT creata");
  };

  // Salva Bozza
  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const saved = await ddtRepository.saveDraft(ddt, items);
      setDdt(saved);
      await loadRecentDdts();
      showToast("Bozza salvata con successo");
    } catch (e) {
      console.error("Errore salvataggio bozza:", e);
      showToast("Errore durante il salvataggio della bozza");
    } finally {
      setIsSaving(false);
    }
  };

  // Salva e Conferma DDT (Emissione con numero progressivo)
  const handleEmitDdt = async () => {
    if (!ddt.client_name?.trim()) {
      showToast("Attenzione: Inserisci il nome del cliente prima di salvare il DDT!");
      return;
    }

    setIsSaving(true);
    try {
      const saved = await ddtRepository.emitDdt(ddt, items);
      setDdt(saved);
      await loadRecentDdts();
      showToast(`DDT emesso con successo! Numero assegnato: #${saved.doc_number}`);
    } catch (e) {
      console.error("Errore emissione DDT:", e);
      showToast("Errore durante l'emissione del DDT");
    } finally {
      setIsSaving(false);
    }
  };

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
      const { netAmount, vatAmount } = calculateRowAmounts(q, price, 0, prod.vat_rate);

      copy[targetIdx] = {
        ...copy[targetIdx],
        product_id: prod.id,
        code: prod.code,
        description: prod.description.toUpperCase(),
        unit: prod.unit || "NR",
        quantity: q,
        unit_price: price,
        discount_pct: "",
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

  const totals = calculateDdtTotals(items);

  return (
    <div className="flex flex-col h-full w-full bg-[#181a20] overflow-hidden">
      {/* Toast Notifica */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-[var(--primary)] text-white px-4 py-2 rounded-lg shadow-2xl text-xs font-semibold z-50 flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse"></span>
          <span>{toastMessage}</span>
        </div>
      )}

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
                  items={items}
                  setItems={setItems}
                  showMargini={showMargini}
                  onOpenSearchModal={() => setIsSearchModalOpen(true)}
                />
              </div>

              {/* Barra Finanziaria Colorata (Tot. Acquisto, Totale Netto, Ricavo, Ricarico % + Alex + Margini Toggle) */}
              <DDTFinancialBar
                ddt={ddt}
                setDdt={setDdt}
                totals={totals}
                showMargini={showMargini}
                setShowMargini={setShowMargini}
                onOpenSearchModal={() => setIsSearchModalOpen(true)}
                onOpenAlexModal={() => setIsSearchModalOpen(true)}
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
