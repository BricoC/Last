import { describe, it, expect } from "vitest";
import { money } from "@/shared/domain/monetaryValue";
import {
  calculateRowAmounts,
  calculateDdtTotals,
  paginateDdtRows,
  getOperatorSymbol,
  normalizeOperator,
} from "../ddtCalculations";
import { DdtItem } from "../../models/ddt";
import { formatDdtImageFilename, formatDdtPdfFilename } from "../ddtExportManager";

describe("ddtCalculations (Riproduzione Esatta PDF BricoClass)", () => {
  it("calcola le tre righe del PDF con precisione a 5 decimali", () => {
    // Riga 1: Qta 15, Prezzo 0,15800, IVA 22%
    const r1 = calculateRowAmounts(15, money("0,15800"), 0, 22);
    expect(r1.netAmount.formatIT(false)).toBe("2,37000");
    expect(r1.vatAmount.formatIT(false)).toBe("0,52140");

    // Riga 2: Qta 15, Prezzo 0,03000, IVA 22%
    const r2 = calculateRowAmounts(15, money("0,03000"), 0, 22);
    expect(r2.netAmount.formatIT(false)).toBe("0,45000");
    expect(r2.vatAmount.formatIT(false)).toBe("0,09900");

    // Riga 3: Qta 15, Prezzo 0,01200, IVA 22%
    const r3 = calculateRowAmounts(15, money("0,01200"), 0, 22);
    expect(r3.netAmount.formatIT(false)).toBe("0,18000");
    expect(r3.vatAmount.formatIT(false)).toBe("0,03960");

    // Totali complessivi del documento
    const items: Partial<DdtItem>[] = [
      { quantity: "15", unit_price: money("0,15800"), discount_pct: "0", vat_rate: 22, description: "TASSELLO SX 6" },
      { quantity: "15", unit_price: money("0,03000"), discount_pct: "0", vat_rate: 22, description: "VITE TRUC BR 4X35" },
      { quantity: "15", unit_price: money("0,01200"), discount_pct: "0", vat_rate: 22, description: "RONDELLA ZN D.5X15" },
    ];

    const totals = calculateDdtTotals(items);
    // Totale Imponibile: 2,37000 + 0,45000 + 0,18000 = 3,00000 € (3,0000 € nel PDF)
    expect(totals.totale_imponibile.formatIT(false)).toBe("3,00000");
    // Imposta IVA: 0,52140 + 0,09900 + 0,03960 = 0,66000 € (0,6600 € nel PDF)
    expect(totals.totale_iva.formatIT(false)).toBe("0,66000");
    // Totale Documento: 3,00000 + 0,66000 = 3,66000 € (3,6600 € nel PDF)
    expect(totals.totale_documento.formatIT(false)).toBe("3,66000");
  });

  it("gestisce sconti e formati con virgola italiana", () => {
    // 2 pezzi a 10,50000 con 10% sconto = 18,90000
    const res = calculateRowAmounts("2", "10,50000", "10", "22");
    expect(res.netAmount.formatIT(false)).toBe("18,90000");
  });

  it("mappa correttamente gli operatori e i simboli BricoClass", () => {
    expect(normalizeOperator("sam")).toBe("Samu");
    expect(getOperatorSymbol("Samu")).toBe("c");
    expect(getOperatorSymbol("Alessandro")).toBe("A");
    expect(getOperatorSymbol("Nicola")).toBe("b");
  });

  it("paginazione A4 riempie le righe mancanti per toccare la griglia continua", () => {
    const pages = paginateDdtRows([]);
    expect(pages.length).toBe(1);
    expect(pages[0].rows.length).toBe(25);
    expect(pages[0].isFirst).toBe(true);
    expect(pages[0].isLast).toBe(true);
  });

  it("non applica l'IVA se non specificata (vat_rate vuoto o non impostato)", () => {
    // Se l'utente non inserisce l'IVA, l'IVA deve rimanere a 0 (nessun calcolo automatico al 22%)
    const resUndefined = calculateRowAmounts(2, money("10,00000"), 0, undefined);
    expect(resUndefined.netAmount.formatIT(false)).toBe("20,00000");
    expect(resUndefined.vatAmount.formatIT(false)).toBe("0,00000");

    const resEmpty = calculateRowAmounts(2, money("10,00000"), 0, "");
    expect(resEmpty.netAmount.formatIT(false)).toBe("20,00000");
    expect(resEmpty.vatAmount.formatIT(false)).toBe("0,00000");
  });

  it("gestisce in modo sicuro prezzi come stringhe o numeri senza lanciare eccezioni .isZero", () => {
    // Simulazione di stringa o numero grezzo proveniente dalla griglia
    const rawItems: any[] = [
      { quantity: "2", unit_price: "15,50", discount_pct: "0", vat_rate: "", description: "TEST RIGA" },
      { quantity: "1", unit_price: 20, discount_pct: "0", vat_rate: 22, description: "TEST NUMERO" },
    ];
    const totals = calculateDdtTotals(rawItems);
    expect(totals.totale_imponibile.formatIT(false)).toBe("51,00000");
    expect(totals.totale_iva.formatIT(false)).toBe("4,40000"); // solo la seconda riga ha il 22%
  });

  it("formatta correttamente il nome file dell'immagine PNG per il salvataggio sul Desktop", () => {
    // DDT xxx del xx.xx.xxxx "cliente".png
    const filename = formatDdtImageFilename({
      doc_number: 12,
      doc_date: "2026-10-22",
      client_name: "MARIO ROSSI S.R.L.",
    });
    expect(filename).toBe("DDT 12 del 22.10.2026 MARIO ROSSI S.R.L..png");

    const bozzaFilename = formatDdtImageFilename({
      doc_number: null,
      doc_date: "2026-10-22",
      client_name: "ACME",
    });
    expect(bozzaFilename).toBe("DDT Bozza del 22.10.2026 ACME.png");

    const pdfFilename = formatDdtPdfFilename({
      doc_number: 12,
      doc_date: "2026-10-22",
      client_name: "MARIO ROSSI S.R.L.",
    });
    expect(pdfFilename).toBe("DDT 12 del 22.10.2026 MARIO ROSSI S.R.L..pdf");
  });
});
