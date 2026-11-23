import { SupplierInvoice, SupplierInvoiceItem } from "./electronicInvoicesService";

export interface ParsedInvoiceResult {
  invoice: SupplierInvoice;
  items: Omit<SupplierInvoiceItem, "id" | "invoice_id">[];
}

const PKCS7_DATA_OID = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01];

function readBerLength(bytes: Uint8Array, pos: number): { length: number | null; nextPos: number } {
  if (pos >= bytes.length) return { length: 0, nextPos: pos };
  const first = bytes[pos];
  if ((first & 0x80) === 0) {
    return { length: first, nextPos: pos + 1 };
  }
  const numBytes = first & 0x7f;
  if (numBytes === 0) {
    return { length: null, nextPos: pos + 1 };
  }
  if (numBytes > 4) {
    return { length: 0, nextPos: bytes.length };
  }
  let len = 0;
  for (let i = 0; i < numBytes && pos + 1 + i < bytes.length; i++) {
    len = len * 256 + bytes[pos + 1 + i];
  }
  return { length: len, nextPos: pos + 1 + numBytes };
}

const MAX_BER_RECURSION_DEPTH = 32;

function collectOctetStringChunks(
  bytes: Uint8Array,
  start: number,
  limit: number,
  chunks: Uint8Array[],
  depth = 0
): number {
  if (depth > MAX_BER_RECURSION_DEPTH) {
    return limit;
  }
  let pos = start;
  while (pos < limit) {
    // End-of-contents (0x00 0x00) per lunghezza indefinita BER
    if (bytes[pos] === 0x00 && pos + 1 < limit && bytes[pos + 1] === 0x00) {
      return pos + 2;
    }
    const tag = bytes[pos++];
    const { length, nextPos } = readBerLength(bytes, pos);
    pos = nextPos;
    const subLimit = length === null ? limit : Math.min(limit, pos + length);

    if (tag === 0x04) {
      chunks.push(bytes.subarray(pos, subLimit));
      pos = subLimit;
    } else if (tag === 0x24 || (tag & 0x20) !== 0) {
      pos = collectOctetStringChunks(bytes, pos, subLimit, chunks, depth + 1);
    } else {
      break;
    }

    if (length !== null) {
      break;
    }
  }
  return pos;
}

/**
 * Estrae i byte del contenuto incapsulato (`eContent`) da una busta PKCS#7 / CMS DER o BER (`.p7m`).
 */
export function extractPkcs7ContentBytes(bytes: Uint8Array): Uint8Array | null {
  let oidEnd = -1;
  outer: for (let i = 0; i <= bytes.length - PKCS7_DATA_OID.length; i++) {
    for (let j = 0; j < PKCS7_DATA_OID.length; j++) {
      if (bytes[i + j] !== PKCS7_DATA_OID[j]) continue outer;
    }
    oidEnd = i + PKCS7_DATA_OID.length;
    break;
  }

  if (oidEnd === -1 || oidEnd >= bytes.length || bytes[oidEnd] !== 0xa0) {
    return null;
  }

  const outerLen = readBerLength(bytes, oidEnd + 1);
  const outerLimit =
    outerLen.length === null ? bytes.length : Math.min(bytes.length, outerLen.nextPos + outerLen.length);

  const chunks: Uint8Array[] = [];
  collectOctetStringChunks(bytes, outerLen.nextPos, outerLimit, chunks);
  if (chunks.length === 0) return null;

  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function tryDecodeBase64ToBytes(text: string): Uint8Array | null {
  const compact = text.replace(/\s+/g, "");
  if (!compact || compact.includes("<") || compact.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return null;
  try {
    const bin = atob(compact);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

function decodeXmlBytes(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const declaresLatin = /encoding\s*=\s*["']\s*(iso-8859-1|windows-1252)/i.test(utf8.slice(0, 200));
  if (declaresLatin || utf8.includes("\uFFFD")) {
    return new TextDecoder("windows-1252").decode(bytes);
  }
  return utf8;
}

function sliceCleanXml(rawText: string): string {
  const clean = rawText.replace(/^\uFEFF/, "").trim();
  const xmlStart = clean.search(/<\?xml\b|<([a-zA-Z0-9_-]+:)?FatturaElettronica\b/i);
  const startIdx = xmlStart >= 0 ? xmlStart : clean.indexOf("<");
  if (startIdx < 0) return clean;

  const closeMatch = clean.slice(startIdx).match(/<\/([a-zA-Z0-9_-]+:)?FatturaElettronica\s*>/gi);
  if (closeMatch && closeMatch.length > 0) {
    const lastTag = closeMatch[closeMatch.length - 1];
    const lastIdx = clean.lastIndexOf(lastTag);
    if (lastIdx >= startIdx) {
      return clean.slice(startIdx, lastIdx + lastTag.length);
    }
  }

  const endIdx = clean.lastIndexOf(">");
  return endIdx > startIdx ? clean.slice(startIdx, endIdx + 1) : clean.slice(startIdx);
}

/**
 * Decodifica testo XML o file firmato `.p7m` (DER, BER chunked o Base64) restituendo XML pulito.
 */
export function extractInvoiceXmlText(input: string | ArrayBuffer | Uint8Array, fileName: string): string {
  if (typeof input === "string") {
    const base64Bytes = tryDecodeBase64ToBytes(input);
    if (base64Bytes) {
      const inner = extractPkcs7ContentBytes(base64Bytes);
      return sliceCleanXml(decodeXmlBytes(inner ?? base64Bytes));
    }
    return sliceCleanXml(input);
  }

  const rawBytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const isP7m = fileName.toLowerCase().endsWith(".p7m") || rawBytes[0] === 0x30;
  if (isP7m) {
    if (rawBytes[0] === 0x30) {
      const inner = extractPkcs7ContentBytes(rawBytes);
      if (inner) return sliceCleanXml(decodeXmlBytes(inner));
    } else {
      const asAscii = new TextDecoder("ascii", { fatal: false }).decode(rawBytes);
      const base64Bytes = tryDecodeBase64ToBytes(asAscii);
      if (base64Bytes) {
        const inner = extractPkcs7ContentBytes(base64Bytes);
        return sliceCleanXml(decodeXmlBytes(inner ?? base64Bytes));
      }
    }
  }
  return sliceCleanXml(decodeXmlBytes(rawBytes));
}

function getTagText(parent: Element | null, tagName: string): string {
  if (!parent) return "";
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
  if (val === null || val === undefined || val.trim() === "") return defaultVal;
  const cleaned = val.replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? defaultVal : num;
}

function parseBodyElement(
  bodyEl: Element | null,
  supplierName: string,
  vatNumber: string,
  fiscalCode: string,
  fileName: string
): ParsedInvoiceResult {
  let docNumber = "S/N";
  let docDate = new Date().toISOString().slice(0, 10);
  let year = new Date().getFullYear();
  let totalDocAmount = 0;
  let hasTotalDocTag = false;
  let notes = "";

  let paymentMethod = "";
  let dueDate: string | undefined = undefined;
  let iban = "";
  let bankName = "";

  let taxableTotal = 0;
  let vatTotal = 0;

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
    if (tot !== "") {
      hasTotalDocTag = true;
      totalDocAmount = parseNum(tot, 0);
    }

    const causale = getTagText(bodyEl, "Causale");
    if (causale) notes = causale;

    const modPag = getTagText(bodyEl, "ModalitaPagamento");
    if (modPag) paymentMethod = modPag;
    const scad = getTagText(bodyEl, "DataScadenzaPagamento");
    if (scad) dueDate = scad;
    const ib = getTagText(bodyEl, "IBAN");
    if (ib) iban = ib;
    const ist = getTagText(bodyEl, "IstitutoFinanziario");
    if (ist) bankName = ist;

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

  if (!hasTotalDocTag) {
    totalDocAmount = Math.round((taxableTotal + vatTotal) * 100) / 100;
  }

  const invoice: SupplierInvoice = {
    supplier_name: supplierName,
    vat_number: vatNumber || undefined,
    fiscal_code: fiscalCode || undefined,
    doc_number: docNumber,
    doc_date: docDate,
    year,
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

  const items: Omit<SupplierInvoiceItem, "id" | "invoice_id">[] = [];
  if (bodyEl) {
    const allBodyEls = bodyEl.getElementsByTagName("*");
    for (let i = 0; i < allBodyEls.length; i++) {
      const lineEl = allBodyEls[i];
      const name = (lineEl.localName || lineEl.nodeName.split(":").pop() || "").toLowerCase();
      if (name !== "dettagliolinee") continue;

      const lineNum = parseInt(getTagText(lineEl, "NumeroLinea"), 10) || items.length + 1;
      const desc = getTagText(lineEl, "Descrizione");

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

      const rawQty = getTagText(lineEl, "Quantita");
      const qty = rawQty !== "" ? parseNum(rawQty, 1) : 1;
      const unit = getTagText(lineEl, "UnitaMisura") || undefined;
      const unitPrice = parseNum(getTagText(lineEl, "PrezzoUnitario"), 0);

      // Gestione ScontoMaggiorazione (Tipo SC = sconto, MG = maggiorazione; Percentuale o Importo)
      const discounts: number[] = [0, 0, 0];
      let discIdx = 0;
      let discountedPrice = unitPrice;
      for (let j = 0; j < lineChildren.length; j++) {
        const sm = lineChildren[j];
        const smName = (sm.localName || sm.nodeName.split(":").pop() || "").toLowerCase();
        if (smName !== "scontomaggiorazione") continue;

        const tipo = (getTagText(sm, "Tipo") || "SC").trim().toUpperCase();
        const isSurcharge = tipo === "MG";
        const sign = isSurcharge ? -1 : 1;
        const pctStr = getTagText(sm, "Percentuale");
        const impStr = getTagText(sm, "Importo");

        if (pctStr !== "") {
          const pct = parseNum(pctStr, 0);
          discountedPrice = isSurcharge
            ? discountedPrice * (1 + pct / 100)
            : discountedPrice * (1 - pct / 100);
          if (discIdx < 3) {
            discounts[discIdx] = sign * pct;
            discIdx++;
          }
        } else if (impStr !== "") {
          const imp = parseNum(impStr, 0);
          discountedPrice = isSurcharge
            ? discountedPrice + imp
            : Math.max(0, discountedPrice - imp);
          if (discIdx < 3 && unitPrice > 0) {
            discounts[discIdx] = Math.round(((sign * imp) / unitPrice) * 10000) / 100;
            discIdx++;
          }
        }
      }
      discountedPrice = Math.round(discountedPrice * 10000) / 10000;

      const rawPrezzoTotale = getTagText(lineEl, "PrezzoTotale");
      const totalPrice = rawPrezzoTotale !== ""
        ? parseNum(rawPrezzoTotale, 0)
        : Math.round(discountedPrice * qty * 100) / 100;

      const rawVatRate = getTagText(lineEl, "AliquotaIVA");
      const vatRate = rawVatRate !== "" ? parseNum(rawVatRate, 0) : 0;

      items.push({
        supplier_name: supplierName,
        doc_number: docNumber,
        doc_date: docDate,
        year,
        line_number: lineNum,
        article_code: articleCode,
        description: desc,
        quantity: qty,
        unit,
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

  return { invoice, items };
}

/**
 * Parsa tutte le fatture contenute in un file XML / `.p7m` di Fattura Elettronica (inclusi lotti multi-body).
 */
export function parseInvoiceXmlAll(
  input: string | ArrayBuffer | Uint8Array,
  fileName: string
): ParsedInvoiceResult[] {
  const cleanXml = extractInvoiceXmlText(input, fileName);
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanXml, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(`XML non valido (${fileName}): ${parseError.textContent?.slice(0, 100)}`);
  }

  const allElements = doc.getElementsByTagName("*");
  let cedenteEl: Element | null = null;
  const bodyEls: Element[] = [];

  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const name = (el.localName || el.nodeName.split(":").pop() || "").toLowerCase();
    if (name === "cedenteprestatore") {
      cedenteEl = el;
    } else if (name === "fatturaelettronicabody") {
      bodyEls.push(el);
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
    const vatCountry = getTagText(cedenteEl, "IdPaese").trim().toUpperCase();
    if (vatNumber && vatCountry && vatCountry !== "IT" &&
        !vatNumber.toUpperCase().startsWith(vatCountry)) vatNumber = vatCountry + vatNumber;
    fiscalCode = getTagText(cedenteEl, "CodiceFiscale");
  }

  if (!supplierName) {
    supplierName = "FORNITORE SCONOSCIUTO";
  }

  if (bodyEls.length === 0) {
    return [parseBodyElement(null, supplierName, vatNumber, fiscalCode, fileName)];
  }

  return bodyEls.map((bodyEl) =>
    parseBodyElement(bodyEl, supplierName, vatNumber, fiscalCode, fileName)
  );
}

/**
 * Parsa un file XML di Fattura Elettronica (FPR12 / FPA12 standard Agenzia delle Entrate).
 */
export function parseInvoiceXml(
  xmlContent: string | ArrayBuffer | Uint8Array,
  fileName: string
): ParsedInvoiceResult {
  return parseInvoiceXmlAll(xmlContent, fileName)[0];
}
