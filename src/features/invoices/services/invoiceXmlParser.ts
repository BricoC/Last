import { SupplierInvoice, SupplierInvoiceItem } from "./electronicInvoicesService";

export interface ParsedInvoiceResult {
  invoice: SupplierInvoice;
  items: Omit<SupplierInvoiceItem, "id" | "invoice_id">[];
}

function getTagText(parent: Element | null, tagName: string): string {
  if (!parent) return "";
  // Case-insensitive / namespace-agnostic search
  const children = parent.getElementsByTagName("*");
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    const local = el.localName || el.nodeName.split(":").pop() || "";
    if (local.toLowerCase() === tagName.toLowerCase()) {
      return el.textContent?.trim() || "";
    }
  }
  return "";
}

function parseNum(val: string | null | undefined, defaultVal = 0): number {
  if (!val) return defaultVal;
  const cleaned = val.replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? defaultVal : num;
}

/**
 * Parsa un file XML di Fattura Elettronica (FPR12 / FPA12 standard Agenzia delle Entrate)
 */
export function parseInvoiceXml(xmlContent: string, fileName: string): ParsedInvoiceResult {
  let cleanXml = (xmlContent || "").replace(/^\uFEFF/, "").trim();
  const startIdx = cleanXml.indexOf("<");
  const endIdx = cleanXml.lastIndexOf(">");
  if (startIdx >= 0 && endIdx > startIdx) {
    cleanXml = cleanXml.slice(startIdx, endIdx + 1);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanXml, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(`XML non valido (${fileName}): ${parseError.textContent?.slice(0, 100)}`);
  }

  // 1. Fornitore / Cedente
  const allElements = doc.getElementsByTagName("*");
  let cedenteEl: Element | null = null;
  let bodyEl: Element | null = null;

  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const name = (el.localName || el.nodeName.split(":").pop() || "").toLowerCase();
    if (name === "cedenteprestatore") {
      cedenteEl = el;
    } else if (name === "fatturaelettronicabody") {
      bodyEl = el;
    }
  }

  let supplierName = "";
  let vatNumber = "";
  let fiscalCode = "";

  if (cedenteEl) {
    supplierName = getTagText(cedenteEl, "Denominazione");
    if (!supplierName) {
      const nome = getTagText(cedenteEl, "Nome");
      const cognome = getTagText(cedenteEl, "Cognome");
      supplierName = `${nome} ${cognome}`.trim();
    }
    vatNumber = getTagText(cedenteEl, "IdCodice");
    fiscalCode = getTagText(cedenteEl, "CodiceFiscale");
  }

  if (!supplierName) {
    supplierName = "FORNITORE SCONOSCIUTO";
  }

  // 2. Dati Generali Documento
  let docNumber = "S/N";
  let docDate = new Date().toISOString().slice(0, 10);
  let year = new Date().getFullYear();
  let totalDocAmount = 0;
  let notes = "";

  if (bodyEl) {
    const num = getTagText(bodyEl, "Numero");
    if (num) docNumber = num;
    const date = getTagText(bodyEl, "Data");
    if (date) {
      docDate = date;
      const y = parseInt(date.slice(0, 4), 10);
      if (!isNaN(y)) year = y;
    }
    const tot = getTagText(bodyEl, "ImportoTotaleDocumento");
    if (tot) totalDocAmount = parseNum(tot);

    const causale = getTagText(bodyEl, "Causale");
    if (causale) notes = causale;
  }

  // 3. Pagamento e Scadenze
  let paymentMethod = "";
  let dueDate: string | undefined = undefined;
  let iban = "";
  let bankName = "";

  if (bodyEl) {
    const modPag = getTagText(bodyEl, "ModalitaPagamento");
    if (modPag) paymentMethod = modPag;
    const scad = getTagText(bodyEl, "DataScadenzaPagamento");
    if (scad) dueDate = scad;
    const ib = getTagText(bodyEl, "IBAN");
    if (ib) iban = ib;
    const ist = getTagText(bodyEl, "IstitutoFinanziario");
    if (ist) bankName = ist;
  }

  // 4. Totali Riepilogo IVA
  let taxableTotal = 0;
  let vatTotal = 0;

  if (bodyEl) {
    const allBodyEls = bodyEl.getElementsByTagName("*");
    for (let i = 0; i < allBodyEls.length; i++) {
      const el = allBodyEls[i];
      const name = (el.localName || el.nodeName.split(":").pop() || "").toLowerCase();
      if (name === "datiriepilogo") {
        taxableTotal += parseNum(getTagText(el, "ImponibileImporto"));
        vatTotal += parseNum(getTagText(el, "Imposta"));
      }
    }
  }

  if (totalDocAmount === 0) {
    totalDocAmount = Math.round((taxableTotal + vatTotal) * 100) / 100;
  }

  const invoice: SupplierInvoice = {
    supplier_name: supplierName,
    vat_number: vatNumber || undefined,
    fiscal_code: fiscalCode || undefined,
    doc_number: docNumber,
    doc_date: docDate,
    year: year,
    total_amount: Math.round(totalDocAmount * 100) / 100,
    taxable_amount: Math.round(taxableTotal * 100) / 100,
    vat_amount: Math.round(vatTotal * 100) / 100,
    payment_method: paymentMethod || undefined,
    due_date: dueDate,
    iban: iban || undefined,
    bank_name: bankName || undefined,
    file_name: fileName,
    notes: notes || undefined,
  };

  // 5. Linee Articolo (DettaglioLinee)
  const items: Omit<SupplierInvoiceItem, "id" | "invoice_id">[] = [];

  if (bodyEl) {
    const allBodyEls = bodyEl.getElementsByTagName("*");
    for (let i = 0; i < allBodyEls.length; i++) {
      const lineEl = allBodyEls[i];
      const name = (lineEl.localName || lineEl.nodeName.split(":").pop() || "").toLowerCase();
      if (name === "dettagliolinee") {
        const lineNum = parseInt(getTagText(lineEl, "NumeroLinea"), 10) || items.length + 1;
        const desc = getTagText(lineEl, "Descrizione");

        // Codice Articolo
        const codices: string[] = [];
        const lineChildren = lineEl.getElementsByTagName("*");
        for (let j = 0; j < lineChildren.length; j++) {
          const c = lineChildren[j];
          const cName = (c.localName || c.nodeName.split(":").pop() || "").toLowerCase();
          if (cName === "codicearticolo") {
            const val = getTagText(c, "CodiceValore");
            if (val) codices.push(val);
          }
        }
        const articleCode = codices.length > 0 ? codices.join(" / ") : undefined;

        if (!desc && !articleCode) continue;

        const qty = parseNum(getTagText(lineEl, "Quantita"), 1);
        const unit = getTagText(lineEl, "UnitaMisura") || undefined;
        const unitPrice = parseNum(getTagText(lineEl, "PrezzoUnitario"), 0);

        // Sconti fino a 3 livelli
        const discounts: number[] = [0, 0, 0];
        let discIdx = 0;
        for (let j = 0; j < lineChildren.length; j++) {
          const sm = lineChildren[j];
          const smName = (sm.localName || sm.nodeName.split(":").pop() || "").toLowerCase();
          if (smName === "scontomaggiorazione") {
            const pct = parseNum(getTagText(sm, "Percentuale"), 0);
            if (discIdx < 3) {
              discounts[discIdx] = pct;
              discIdx++;
            }
          }
        }

        // Calcolo prezzo netto scontato
        let discountedPrice = unitPrice;
        for (const d of discounts) {
          if (d > 0) {
            discountedPrice = discountedPrice * (1 - d / 100);
          }
        }
        discountedPrice = Math.round(discountedPrice * 10000) / 10000;

        let totalPrice = parseNum(getTagText(lineEl, "PrezzoTotale"), 0);
        if (totalPrice === 0) {
          totalPrice = Math.round(discountedPrice * qty * 100) / 100;
        }

        const vatRate = parseNum(getTagText(lineEl, "AliquotaIVA"), 22);

        items.push({
          supplier_name: supplierName,
          doc_number: docNumber,
          doc_date: docDate,
          year: year,
          line_number: lineNum,
          article_code: articleCode,
          description: desc,
          quantity: qty,
          unit: unit,
          unit_price: unitPrice,
          discount_1: discounts[0],
          discount_2: discounts[1],
          discount_3: discounts[2],
          discounted_price: discountedPrice,
          total_price: totalPrice,
          vat_rate: vatRate,
        });
      }
    }
  }

  return { invoice, items };
}
