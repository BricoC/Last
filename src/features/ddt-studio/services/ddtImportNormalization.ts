import { MonetaryValue, money } from "@/shared/domain/monetaryValue";
import { DdtItem, DdtDocument, DdtAccountOrBalance, DdtStatus } from "../models/ddt";
import { calculateDdtTotals, calculateRowAmounts } from "../utils/ddtCalculations";
export interface NormalizedImportedDdt {
  doc: Partial<DdtDocument>;
  items: Partial<DdtItem>[];
  clientPhonesJson: string;
  totalsSubunits: {
    taxable: number;
    vat: number;
    document: number;
  };
  itemSubunits: {
    unitPriceSubunits: number;
    netAmountSubunits: number;
    vatAmountSubunits: number;
    purchasePriceSubunits: number;
    vatRate: number;
  }[];
  updatedAt: string;
  updatedBy: string;
}

/**
 * Normalizza intestazione e righe importate (formato camelCase di LocalImportHeader/Line
 * o snake_case) nei modelli tipizzati di DDT Studio.
 */
export function normalizeImportedDdt(
  importedHeader: any,
  importedLines: any[] = []
): NormalizedImportedDdt {
  const h = importedHeader || {};
  const now = new Date().toISOString();
  const lines =
    Array.isArray(importedLines) && importedLines.length > 0
      ? importedLines
      : Array.isArray(h.items)
        ? h.items
        : [];

  let phones: { id: number | string; nome: string; numero: string }[] = [];
  const rawPhonesJson = h.client_phones_json ?? h.clientPhonesJson;
  if (typeof rawPhonesJson === "string" && rawPhonesJson.trim()) {
    try {
      const parsed = JSON.parse(rawPhonesJson);
      if (Array.isArray(parsed)) phones = parsed;
    } catch {
      phones = [];
    }
  } else if (Array.isArray(h.client_phones ?? h.clientPhones)) {
    phones = h.client_phones ?? h.clientPhones;
  }

  const rawAccount = h.account_or_balance ?? h.accountOrBalance ?? "";
  const accountOrBalance: DdtAccountOrBalance =
    rawAccount === "in_conto" || rawAccount === "a_saldo" ? rawAccount : "";
  const rawStatus = String(h.status || "confermato").toLowerCase();
  const status: DdtStatus =
    rawStatus === "bozza" || rawStatus === "annullato" ? rawStatus : "confermato";

  const rawPackages = h.packages_count ?? h.packagesCount;
  const rawWeight = h.weight_kg ?? h.weightKg;
  const rawDocNumber = h.doc_number ?? h.docNumber;

  const docId = String(h.id || crypto.randomUUID());

  const itemSubunits: NormalizedImportedDdt["itemSubunits"] = [];
  const items: Partial<DdtItem>[] = lines.map((line: any, index: number) => {
    const rowKind: "item" | "note" =
      (line.row_kind ?? line.rowKind) === "note" ? "note" : "item";
    const isNote = rowKind === "note";

    const unitPriceVal =
      line.unit_price instanceof MonetaryValue
        ? line.unit_price
        : MonetaryValue.fromSubunits(
            Math.round(Number(line.unit_price_subunits ?? line.unitPriceSubunits ?? 0))
          );

    const purchaseVal =
      line.purchase_price instanceof MonetaryValue
        ? line.purchase_price
        : MonetaryValue.fromSubunits(
            Math.round(Number(line.purchase_price_subunits ?? line.purchasePriceSubunits ?? 0))
          );

    const rawQty = line.quantity;
    const qtyStr = isNote
      ? ""
      : rawQty !== undefined && rawQty !== null && String(rawQty).trim() !== ""
        ? String(rawQty).trim()
        : "1";

    const rawDisc = line.discount_pct ?? line.discountPct;
    const discStr = isNote
      ? ""
      : rawDisc !== undefined && rawDisc !== null && String(rawDisc).trim() !== ""
        ? String(rawDisc).trim()
        : "0";

    const rawVatRate = line.vat_rate ?? line.vatRate;
    const vatRateNum =
      !isNote && rawVatRate !== undefined && rawVatRate !== null && String(rawVatRate).trim() !== ""
        ? Number(String(rawVatRate).replace(",", ".")) || 0
        : 0;

    const computed = isNote
      ? { netAmount: money(0), vatAmount: money(0) }
      : calculateRowAmounts(qtyStr, unitPriceVal, discStr, vatRateNum);

    const hasExplicitNet =
      line.net_amount_subunits !== undefined ||
      line.netAmountSubunits !== undefined ||
      line.net_amount instanceof MonetaryValue;
    const netAmount = isNote
      ? money(0)
      : line.net_amount instanceof MonetaryValue
        ? line.net_amount
        : hasExplicitNet
          ? MonetaryValue.fromSubunits(
              Math.round(Number(line.net_amount_subunits ?? line.netAmountSubunits ?? 0))
            )
          : computed.netAmount;

    const hasExplicitVat =
      line.vat_amount_subunits !== undefined ||
      line.vatAmountSubunits !== undefined ||
      line.vat_amount instanceof MonetaryValue;
    const vatAmount = isNote
      ? money(0)
      : line.vat_amount instanceof MonetaryValue
        ? line.vat_amount
        : hasExplicitVat
          ? MonetaryValue.fromSubunits(
              Math.round(Number(line.vat_amount_subunits ?? line.vatAmountSubunits ?? 0))
            )
          : computed.vatAmount;

    itemSubunits.push({
      unitPriceSubunits: unitPriceVal.toSubunits(),
      netAmountSubunits: netAmount.toSubunits(),
      vatAmountSubunits: vatAmount.toSubunits(),
      purchasePriceSubunits: purchaseVal.toSubunits(),
      vatRate: vatRateNum,
    });

    return {
      id: String(line.id || crypto.randomUUID()),
      ddt_id: docId,
      row_index: Number(line.row_index ?? line.rowIndex ?? index + 1),
      product_id: (line.product_id ?? line.productId) || undefined,
      code: line.code || undefined,
      description: String(line.description || "").trim(),
      row_kind: rowKind,
      unit: isNote ? "" : String(line.unit || "NR"),
      quantity: qtyStr,
      unit_price: unitPriceVal,
      discount_pct: discStr,
      net_amount: netAmount,
      vat_rate: vatRateNum,
      vat_amount: vatAmount,
      purchase_price: purchaseVal,
    };
  });

  const computedTotals = calculateDdtTotals(items);
  const taxableSubunits = Math.round(
    Number(
      h.total_taxable_subunits ??
        h.totalTaxableSubunits ??
        computedTotals.totale_imponibile.toSubunits()
    )
  );
  const vatSubunits = Math.round(
    Number(
      h.total_vat_subunits ?? h.totalVatSubunits ?? computedTotals.totale_iva.toSubunits()
    )
  );
  const documentSubunits = Math.round(
    Number(
      h.total_document_subunits ??
        h.totalDocumentSubunits ??
        (taxableSubunits + vatSubunits)
    )
  );

  const doc: Partial<DdtDocument> = {
    id: docId,
    doc_number: rawDocNumber === null || rawDocNumber === undefined ? null : Number(rawDocNumber),
    year: Number(h.year || new Date().getFullYear()),
    series: String(h.series || ""),
    doc_date: String(h.doc_date ?? h.docDate ?? now.split("T")[0]),
    status,
    client_id: (h.client_id ?? h.clientId) || undefined,
    client_name: String(h.client_name ?? h.clientName ?? "").trim() || "Cliente",
    client_address: (h.client_address ?? h.clientAddress) || undefined,
    client_city: (h.client_city ?? h.clientCity) || undefined,
    client_vat: (h.client_vat ?? h.clientVat) || undefined,
    client_fiscal_code: (h.client_fiscal_code ?? h.clientFiscalCode) || undefined,
    client_sdi: (h.client_sdi ?? h.clientSdi) || undefined,
    client_phones: phones,
    destination_name: (h.destination_name ?? h.destinationName) || undefined,
    destination_address: (h.destination_address ?? h.destinationAddress) || undefined,
    destination_city: (h.destination_city ?? h.destinationCity) || undefined,
    transport_reason: String((h.transport_reason ?? h.transportReason) || "Vendita"),
    payment_method: (h.payment_method ?? h.paymentMethod) || undefined,
    order_reference: (h.order_reference ?? h.orderReference) || undefined,
    account_or_balance: accountOrBalance,
    operator: h.operator || "",
    goods_appearance: (h.goods_appearance ?? h.goodsAppearance) || undefined,
    carriage_terms: String((h.carriage_terms ?? h.carriageTerms) || "Franco stabilimento"),
    packages_count:
      rawPackages !== null && rawPackages !== undefined && String(rawPackages).trim() !== ""
        ? String(rawPackages)
        : undefined,
    weight_kg:
      rawWeight !== null && rawWeight !== undefined && String(rawWeight).trim() !== ""
        ? String(rawWeight)
        : undefined,
    carrier: h.carrier || undefined,
    pickup_date_time: (h.pickup_date_time ?? h.pickupDateTime) || undefined,
    internal_notes: (h.internal_notes ?? h.internalNotes) || undefined,
    total_taxable: MonetaryValue.fromSubunits(taxableSubunits),
    total_vat: MonetaryValue.fromSubunits(vatSubunits),
    total_document: MonetaryValue.fromSubunits(documentSubunits),
  };

  return {
    doc,
    items,
    clientPhonesJson: JSON.stringify(phones),
    totalsSubunits: {
      taxable: taxableSubunits,
      vat: vatSubunits,
      document: documentSubunits,
    },
    itemSubunits,
    updatedAt: String(h.updated_at ?? h.updatedAt ?? now),
    updatedBy: String(h.updated_by ?? h.updatedBy ?? "conflict-resolver"),
  };
}

/**
 * Converte un DDT importato (camelCase o snake_case) nel payload snake_case atteso da `save_ddt_transaction`.
 */
export function buildDdtSavePayloadFromImported(
  importedHeader: any,
  importedLines: any[] = []
) {
  const norm = normalizeImportedDdt(importedHeader, importedLines);
  const { doc, items, itemSubunits, totalsSubunits } = norm;

  return {
    id: doc.id!,
    doc_number: doc.doc_number ?? null,
    year: doc.year!,
    series: doc.series || "",
    doc_date: doc.doc_date!,
    status: doc.status || "confermato",
    is_emission: false,
    updated_at: norm.updatedAt,
    updated_by: norm.updatedBy,
    client_id: doc.client_id || null,
    client_name: doc.client_name || "Cliente",
    client_address: doc.client_address || null,
    client_city: doc.client_city || null,
    client_vat: doc.client_vat || null,
    client_fiscal_code: doc.client_fiscal_code || null,
    client_sdi: doc.client_sdi || null,
    client_phones_json: norm.clientPhonesJson,
    destination_name: doc.destination_name || null,
    destination_address: doc.destination_address || null,
    destination_city: doc.destination_city || null,
    transport_reason: doc.transport_reason || "Vendita",
    payment_method: doc.payment_method || null,
    order_reference: doc.order_reference || null,
    account_or_balance: doc.account_or_balance || "",
    operator: doc.operator || null,
    goods_appearance: doc.goods_appearance || null,
    carriage_terms: doc.carriage_terms || "Franco stabilimento",
    packages_count: doc.packages_count || null,
    weight_kg: doc.weight_kg || null,
    carrier: doc.carrier || null,
    pickup_date_time: doc.pickup_date_time || null,
    internal_notes: doc.internal_notes || null,
    total_taxable_subunits: totalsSubunits.taxable,
    total_vat_subunits: totalsSubunits.vat,
    total_document_subunits: totalsSubunits.document,
    items: items.map((it, idx) => ({
      id: it.id!,
      row_index: it.row_index ?? idx + 1,
      row_kind: it.row_kind || "item",
      product_id: it.product_id || null,
      code: it.code || null,
      description: it.description || "",
      unit: it.unit ?? "",
      quantity: it.quantity ?? "",
      unit_price_subunits: itemSubunits[idx].unitPriceSubunits,
      discount_pct: it.discount_pct ?? "",
      net_amount_subunits: itemSubunits[idx].netAmountSubunits,
      vat_rate: itemSubunits[idx].vatRate,
      vat_amount_subunits: itemSubunits[idx].vatAmountSubunits,
      purchase_price_subunits: itemSubunits[idx].purchasePriceSubunits,
    })),
  };
}
