import { DdtDocument, DdtItem } from "../models/ddt";
import { money, isPositivePrice, MonetaryValue } from "@/shared/domain/monetaryValue";
import { calculateRowAmounts } from "./ddtCalculations";

export interface InsertDdtArticlePayload {
  code?: string;
  description: string;
  unit?: string;
  quantity: string;
  unit_price: number;
  purchase_price?: number;
  vat_rate?: number;
}

export function computeDdtDirtySignature(
  doc: Partial<DdtDocument>,
  rows: DdtItem[],
  discount: string,
  markup: string
): string {
  const activeRows = rows
    .filter(
      (r) =>
        r.description?.trim() ||
        isPositivePrice(r.unit_price) ||
        (r.code && r.code.trim()) ||
        r.quantity?.trim()
    )
    .map((r) => [
      r.row_index,
      r.code || "",
      r.description || "",
      r.unit || "",
      r.quantity || "",
      r.unit_price?.toSubunits?.() ?? 0,
      r.discount_pct || "",
      r.vat_rate ?? "",
      r.purchase_price?.toSubunits?.() ?? 0,
    ]);

  return JSON.stringify({
    id: doc.id,
    doc_number: doc.doc_number,
    series: doc.series,
    year: doc.year,
    doc_date: doc.doc_date,
    status: doc.status,
    client_name: doc.client_name,
    client_address: doc.client_address,
    client_city: doc.client_city,
    client_vat: doc.client_vat,
    client_fiscal_code: doc.client_fiscal_code,
    client_sdi: doc.client_sdi,
    destination_name: doc.destination_name,
    destination_address: doc.destination_address,
    destination_city: doc.destination_city,
    transport_reason: doc.transport_reason,
    payment_method: doc.payment_method,
    order_reference: doc.order_reference,
    account_or_balance: doc.account_or_balance,
    operator: doc.operator,
    goods_appearance: doc.goods_appearance,
    carriage_terms: doc.carriage_terms,
    packages_count: doc.packages_count,
    weight_kg: doc.weight_kg,
    carrier: doc.carrier,
    pickup_date_time: doc.pickup_date_time,
    internal_notes: doc.internal_notes,
    discount,
    markup,
    activeRows,
  });
}

export function getIgnoredDdtGaps(year: number): Set<number> {
  try {
    const raw = localStorage.getItem(`ddt_ignored_gaps_${year}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.map(Number).filter((n) => n > 0))
      : new Set();
  } catch {
    return new Set();
  }
}

export function addIgnoredDdtGaps(year: number, nums: number[]): void {
  const current = getIgnoredDdtGaps(year);
  nums.forEach((n) => current.add(n));
  try {
    localStorage.setItem(`ddt_ignored_gaps_${year}`, JSON.stringify(Array.from(current)));
  } catch {
    // ignore storage errors
  }
}

export function buildClientUpsertPayloadFromDdt(
  source: Partial<DdtDocument>,
  clientId: string | undefined,
  projectUrl: string | null
) {
  return {
    id: clientId,
    business_name: source.client_name!.trim(),
    address: source.client_address || undefined,
    city: source.client_city || undefined,
    vat_number: source.client_vat || undefined,
    fiscal_code: source.client_fiscal_code || undefined,
    sdi_code: source.client_sdi || undefined,
    payment_method: source.payment_method || undefined,
    destination_name: source.destination_name || undefined,
    destination_address: source.destination_address || undefined,
    destination_city: source.destination_city || undefined,
    phones: source.client_phones || [],
    project_url: projectUrl,
  };
}

export function applyPurchaseHistoryPrices(
  items: DdtItem[],
  selected: Array<{ rowKey: string; purchasePriceSubunits: number }>
): DdtItem[] {
  const byKey = new Map(selected.map((s) => [s.rowKey, s.purchasePriceSubunits]));
  return items.map((row, idx) => {
    const key = row.id || `row-${idx}`;
    const subunits = byKey.get(key);
    if (!subunits || subunits <= 0) return row;
    return {
      ...row,
      purchase_price: MonetaryValue.fromSubunits(subunits),
    };
  });
}

export function insertArticleIntoDdtItems(
  prev: DdtItem[],
  article: InsertDdtArticlePayload,
  searchQuery: string,
  globalMarkup: string,
  globalDiscount: string
): { nextItems: DdtItem[]; insertedIdx: number } {
  const copy = [...prev];
  const isUnfilledRow = (row: DdtItem) => {
    if (!row.description || !row.description.trim()) return true;
    if (searchQuery && row.description.trim().toUpperCase() === searchQuery.trim().toUpperCase()) {
      return true;
    }
    return false;
  };

  let targetIdx = copy.findIndex(isUnfilledRow);
  if (targetIdx === -1) targetIdx = copy.length - 1;

  const price = money(article.unit_price || 0);
  const purchasePrice = money(article.purchase_price ?? 0);
  const q = String(article.quantity || "1").trim() || "1";

  let effectivePrice = price;
  const markupClean = globalMarkup.trim().replace("%", "").replace(",", ".");
  const markupNum = parseFloat(markupClean);
  if (!isNaN(markupNum) && markupNum !== 0) {
    effectivePrice = price.plus(price.times(markupNum).dividedBy(100));
  }

  const disc = globalDiscount.trim();
  const rawVat = article.vat_rate;
  const vat =
    isPositivePrice(effectivePrice) &&
    rawVat !== undefined &&
    rawVat !== null &&
    String(rawVat).trim() !== "" &&
    Number(rawVat) !== 0
      ? rawVat
      : "";
  const { netAmount, vatAmount } = calculateRowAmounts(q, effectivePrice, disc, vat);

  const determinedUnit =
    article.unit && article.unit.trim() ? article.unit.trim() : "NR.";

  copy[targetIdx] = {
    ...copy[targetIdx],
    row_kind: "item",
    code: article.code || "",
    description: (article.description || "").toUpperCase(),
    unit: determinedUnit,
    quantity: q,
    unit_price: effectivePrice,
    base_price: price,
    discount_pct: disc,
    base_discount_pct: "",
    net_amount: netAmount,
    vat_rate: vat,
    vat_amount: vatAmount,
    purchase_price: purchasePrice,
  };

  return { nextItems: copy, insertedIdx: targetIdx };
}

export function applyGlobalDiscountToDdtItems(
  prev: DdtItem[],
  rawDiscount: string
): DdtItem[] {
  const cleanDisc = rawDiscount.trim();

  if (cleanDisc === "") {
    return prev.map((item) => {
      if (!item.description?.trim() && !isPositivePrice(item.unit_price)) {
        return item;
      }
      const restoredDisc =
        item.base_discount_pct !== undefined
          ? item.base_discount_pct
          : item.discount_pct || "";
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
    });
  }

  return prev.map((item) => {
    if (!item.description?.trim() && !isPositivePrice(item.unit_price)) {
      return item;
    }
    const originalBase =
      item.base_discount_pct !== undefined
        ? item.base_discount_pct
        : item.discount_pct || "";
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
  });
}

// Restituisce null se l'utente sta digitando un valore parziale (es. "+", "-") così da non alterare i prezzi
export function applyGlobalMarkupToDdtItems(
  prev: DdtItem[],
  rawMarkup: string
): DdtItem[] | null {
  const trimmed = rawMarkup.trim();

  if (trimmed === "") {
    return prev.map((item) => {
      if (!item.description?.trim() && !isPositivePrice(item.unit_price) && !item.base_price) {
        return item;
      }
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
    });
  }

  const clean = trimmed.replace("%", "").replace(",", ".");
  const num = parseFloat(clean);
  if (isNaN(num)) {
    return null;
  }

  const multiplier = 1 + num / 100;
  return prev.map((item) => {
    if (!item.description?.trim() && !isPositivePrice(item.unit_price) && !item.base_price) {
      return item;
    }
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
  });
}

export function formatDdtIdentifier(doc: Pick<DdtDocument, "doc_number" | "series">): string {
  if (doc.doc_number === null) return "Bozza";
  return `${doc.series ? `${doc.series}/` : ""}${doc.doc_number}`;
}

export function getDdtErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error) ?? String(error);
}
