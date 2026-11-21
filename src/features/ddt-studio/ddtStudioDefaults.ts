import type { DdtDocument, DdtItem } from "./models/ddt";
import { money, isPositivePrice } from "@/shared/domain/monetaryValue";
import { calculateRowAmounts } from "./utils/ddtCalculations";
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

export function buildPaddedDdtItems(docId: string, docItems: DdtItem[]): DdtItem[] {
  const blankRowTimestamp = new Date().toISOString();
  const padded: DdtItem[] = Array.from({ length: TOTAL_PRESET_ROWS }, (_, i) => ({
    id: `${docId}-blank-${i + 1}`,
    created_at: blankRowTimestamp,
    updated_at: blankRowTimestamp,
    updated_by: "system",
    deleted_at: null,
    sync_status: "pending",
    ddt_id: docId,
    row_index: i + 1,
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
  }));

  for (const it of docItems || []) {
    const itemWithDefaults: DdtItem = {
      ...it,
      base_price: it.base_price && isPositivePrice(it.base_price) ? it.base_price : it.unit_price,
      base_discount_pct: it.base_discount_pct !== undefined ? it.base_discount_pct : it.discount_pct,
    };
    const targetIdx =
      it.row_index && it.row_index >= 1 && it.row_index <= TOTAL_PRESET_ROWS
        ? it.row_index - 1
        : -1;

    if (
      targetIdx >= 0 &&
      !padded[targetIdx].description?.trim() &&
      !isPositivePrice(padded[targetIdx].unit_price)
    ) {
      padded[targetIdx] = { ...itemWithDefaults, row_index: targetIdx + 1 };
    } else {
      const startSearch = targetIdx >= 0 ? targetIdx : 0;
      let freeIdx = -1;
      for (let i = startSearch; i < TOTAL_PRESET_ROWS; i++) {
        if (!padded[i].description?.trim() && !isPositivePrice(padded[i].unit_price)) {
          freeIdx = i;
          break;
        }
      }
      if (freeIdx === -1) {
        freeIdx = padded.findIndex(
          (slot) => !slot.description?.trim() && !isPositivePrice(slot.unit_price)
        );
      }
      if (freeIdx >= 0) {
        padded[freeIdx] = { ...itemWithDefaults, row_index: freeIdx + 1 };
      }
    }
  }
  return padded;
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
