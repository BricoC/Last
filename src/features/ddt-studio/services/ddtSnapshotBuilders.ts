import { CloudHeader, CloudLine, mapHeaderForLocal, mapLineForLocal } from "@/features/settings/data-import/ddtReadOnlyPreviewService";
import type { DdtSnapshot } from "./ddtMergeUtils";
/**
 * Converte una riga SQLite locale (`ddt_documents` + `ddt_items`) in DdtSnapshot normalizzato.
 */
export function buildSnapshotFromLocal(
  doc: {
    doc_number: number | null;
    year: number;
    doc_date: string;
    status: string;
    client_name: string;
    client_address?: string | null;
    client_city?: string | null;
    client_vat?: string | null;
    client_fiscal_code?: string | null;
    client_sdi?: string | null;
    destination_name?: string | null;
    destination_city?: string | null;
    transport_reason?: string | null;
    payment_method?: string | null;
    order_reference?: string | null;
    operator?: string | null;
    goods_appearance?: string | null;
    carriage_terms?: string | null;
    packages_count?: string | null;
    weight_kg?: string | null;
    carrier?: string | null;
    internal_notes?: string | null;
  },
  items: Array<{
    id: string;
    row_index: number;
    code?: string | null;
    description: string;
    row_kind?: string | null;
    unit?: string | null;
    quantity?: string | null;
    unit_price_subunits?: number | null;
    discount_pct?: string | null;
    net_amount_subunits?: number | null;
    vat_rate?: number | null;
    vat_amount_subunits?: number | null;
    purchase_price_subunits?: number | null;
  }>
): DdtSnapshot {
  return {
    header: {
      doc_number: doc.doc_number ?? null,
      year: doc.year,
      doc_date: doc.doc_date || "",
      status: doc.status || "confermato",
      client_name: doc.client_name || "",
      client_address: doc.client_address ?? null,
      client_city: doc.client_city ?? null,
      client_vat: doc.client_vat ?? null,
      client_fiscal_code: doc.client_fiscal_code ?? null,
      client_sdi: doc.client_sdi ?? null,
      destination_name: doc.destination_name ?? null,
      destination_city: doc.destination_city ?? null,
      transport_reason: doc.transport_reason ?? "Vendita",
      payment_method: doc.payment_method ?? null,
      order_reference: doc.order_reference ?? null,
      operator: doc.operator ?? null,
      goods_appearance: doc.goods_appearance ?? null,
      carriage_terms: doc.carriage_terms ?? "Franco stabilimento",
      packages_count: doc.packages_count ?? null,
      weight_kg: doc.weight_kg ?? null,
      carrier: doc.carrier ?? null,
      internal_notes: doc.internal_notes ?? null,
    },
    items: [...items]
      .sort((a, b) => (a.row_index ?? 0) - (b.row_index ?? 0))
      .map((it, idx) => ({
        id: it.id,
        row_index: Number(it.row_index || idx + 1),
        code: it.code ?? null,
        description: it.description || "",
        row_kind: it.row_kind || "item",
        unit: it.unit || "",
        quantity: it.quantity ?? "",
        unit_price_subunits: Number(it.unit_price_subunits || 0),
        discount_pct: it.discount_pct ?? "",
        net_amount_subunits: Number(it.net_amount_subunits || 0),
        vat_rate: Number(it.vat_rate || 0),
        vat_amount_subunits: Number(it.vat_amount_subunits || 0),
        purchase_price_subunits: Number(it.purchase_price_subunits || 0),
      })),
  };
}

/**
 * Converte testata e righe Supabase in DdtSnapshot normalizzato riutilizzando i mapper ufficiali.
 */
export function buildSnapshotFromCloud(header: CloudHeader, lines: CloudLine[]): DdtSnapshot {
  const mappedH = mapHeaderForLocal(header);
  const sortedLines = [...lines].sort((a, b) => Number(a.riga_nr || 0) - Number(b.riga_nr || 0));
  const mappedItems = sortedLines.map((line, idx) => {
    const ml = mapLineForLocal(line, header.id, idx + 1);
    return {
      id: ml.id,
      row_index: ml.rowIndex,
      code: null,
      description: ml.description,
      row_kind: ml.rowKind,
      unit: ml.unit,
      quantity: ml.quantity,
      unit_price_subunits: ml.unitPriceSubunits,
      discount_pct: ml.discountPct,
      net_amount_subunits: ml.netAmountSubunits,
      vat_rate: ml.vatRate,
      vat_amount_subunits: ml.vatAmountSubunits,
      purchase_price_subunits: ml.purchasePriceSubunits,
    };
  });

  return {
    header: {
      doc_number: mappedH.docNumber,
      year: mappedH.year,
      doc_date: mappedH.docDate,
      status: mappedH.status,
      client_name: mappedH.clientName,
      client_address: mappedH.clientAddress,
      client_city: mappedH.clientCity,
      client_vat: mappedH.clientVat,
      client_fiscal_code: mappedH.clientFiscalCode,
      client_sdi: mappedH.clientSdi,
      destination_name: mappedH.destinationName,
      destination_city: mappedH.destinationCity,
      transport_reason: mappedH.transportReason,
      payment_method: mappedH.paymentMethod,
      order_reference: mappedH.orderReference,
      operator: mappedH.operator,
      goods_appearance: mappedH.goodsAppearance,
      carriage_terms: mappedH.carriageTerms,
      packages_count: mappedH.packagesCount,
      weight_kg: mappedH.weightKg,
      carrier: mappedH.carrier,
      internal_notes: mappedH.internalNotes,
    },
    items: mappedItems,
  };
}
