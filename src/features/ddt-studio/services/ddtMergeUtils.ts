import { parseDdtQuantity } from "../utils/ddtQuantity";
import { MonetaryValue } from "@/shared/domain/monetaryValue";
import { calculateRowAmounts } from "../utils/ddtCalculations";
import {
  CloudHeader,
  CloudLine,
  mapHeaderForLocal,
  mapLineForLocal,
} from "@/features/settings/data-import/ddtReadOnlyPreviewService";

export interface DdtHeaderSnapshot {
  doc_number: number | null;
  year: number;
  doc_date: string;
  status: string;
  client_name: string;
  client_address: string | null;
  client_city: string | null;
  client_vat: string | null;
  client_fiscal_code: string | null;
  client_sdi: string | null;
  destination_name: string | null;
  destination_city: string | null;
  transport_reason: string | null;
  payment_method: string | null;
  order_reference: string | null;
  operator: string | null;
  goods_appearance: string | null;
  carriage_terms: string | null;
  packages_count: string | null;
  weight_kg: string | null;
  carrier: string | null;
  internal_notes: string | null;
}

export interface DdtItemSnapshot {
  id: string;
  row_index: number;
  code: string | null;
  description: string;
  row_kind: string;
  unit: string;
  quantity: string;
  unit_price_subunits: number;
  discount_pct: string;
  net_amount_subunits: number;
  vat_rate: number;
  vat_amount_subunits: number;
  purchase_price_subunits: number;
}

export interface DdtSnapshot {
  header: DdtHeaderSnapshot;
  items: DdtItemSnapshot[];
}

export interface DdtFieldConflict {
  scope: "header" | "item";
  itemId?: string;
  label: string;
  field: string;
  localValue: string;
  remoteValue: string;
}

export interface DdtMergeResult {
  merged: DdtSnapshot;
  totalTaxableSubunits: number;
  totalVatSubunits: number;
  totalDocumentSubunits: number;
  conflicts: DdtFieldConflict[];
  autoMergedChanges: number;
}

const HEADER_FIELDS_TO_MERGE: Array<{
  key: keyof DdtHeaderSnapshot;
  label: string;
  type: "str" | "num";
}> = [
  { key: "doc_date", label: "Data DDT", type: "str" },
  { key: "client_name", label: "Cliente", type: "str" },
  { key: "client_address", label: "Indirizzo cliente", type: "str" },
  { key: "client_city", label: "Città cliente", type: "str" },
  { key: "client_vat", label: "P.IVA", type: "str" },
  { key: "client_fiscal_code", label: "Codice Fiscale", type: "str" },
  { key: "client_sdi", label: "Codice SDI", type: "str" },
  { key: "destination_name", label: "Destinazione", type: "str" },
  { key: "destination_city", label: "Città destinazione", type: "str" },
  { key: "transport_reason", label: "Causale", type: "str" },
  { key: "payment_method", label: "Pagamento", type: "str" },
  { key: "order_reference", label: "Rif. Ordine", type: "str" },
  { key: "operator", label: "Operatore", type: "str" },
  { key: "goods_appearance", label: "Aspetto beni", type: "str" },
  { key: "carriage_terms", label: "Porto", type: "str" },
  { key: "packages_count", label: "Colli", type: "str" },
  { key: "weight_kg", label: "Peso Kg", type: "str" },
  { key: "carrier", label: "Vettore", type: "str" },
  { key: "internal_notes", label: "Note interne", type: "str" },
];

const ITEM_FIELDS_TO_MERGE: Array<{
  key: keyof DdtItemSnapshot;
  label: string;
  type: "str" | "num";
}> = [
  { key: "code", label: "Codice", type: "str" },
  { key: "description", label: "Descrizione", type: "str" },
  { key: "row_kind", label: "Tipo riga", type: "str" },
  { key: "unit", label: "U.M.", type: "str" },
  { key: "quantity", label: "Quantità", type: "str" },
  { key: "unit_price_subunits", label: "Prezzo unitario", type: "num" },
  { key: "discount_pct", label: "Sconto %", type: "str" },
  { key: "vat_rate", label: "Aliquota IVA", type: "num" },
  { key: "purchase_price_subunits", label: "Prezzo acquisto", type: "num" },
];

function normCompare(value: unknown, type: "str" | "num"): string {
  if (type === "num") {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? String(Math.round(n)) : "0";
  }
  return value === null || value === undefined ? "" : String(value).trim();
}

function formatForConflict(value: unknown, key: string): string {
  if (value === null || value === undefined || String(value).trim() === "") return "(vuoto)";
  if (key === "unit_price_subunits" || key === "purchase_price_subunits") {
    return `€ ${(Number(value) / 100000).toFixed(2)}`;
  }
  return String(value);
}

function recomputeItemAmounts(item: DdtItemSnapshot): DdtItemSnapshot {
  const isNote =
    item.row_kind === "note" ||
    (Boolean(item.description.trim()) &&
      item.unit_price_subunits === 0 &&
      item.purchase_price_subunits === 0 &&
      (!item.code || !item.code.trim()) &&
      ((parseDdtQuantity(item.quantity) ?? 0) <= 0));

  if (isNote) {
    return {
      ...item,
      row_kind: "note",
      unit: "",
      quantity: "",
      unit_price_subunits: 0,
      discount_pct: "",
      net_amount_subunits: 0,
      vat_rate: 0,
      vat_amount_subunits: 0,
      purchase_price_subunits: 0,
    };
  }

  const rawQty = (item.quantity ?? "").trim();
  const unitMoney = MonetaryValue.fromSubunits(item.unit_price_subunits || 0);
  const { netAmount: net, vatAmount: vat } = calculateRowAmounts(
    rawQty === "" ? "1" : rawQty,
    unitMoney,
    item.discount_pct,
    item.vat_rate
  );

  return {
    ...item,
    row_kind: "item",
    net_amount_subunits: net.toSubunits(),
    vat_amount_subunits: vat.toSubunits(),
  };
}

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

function itemsEqual(a: DdtItemSnapshot, b: DdtItemSnapshot): boolean {
  return ITEM_FIELDS_TO_MERGE.every(
    ({ key, type }) => normCompare(a[key], type) === normCompare(b[key], type)
  );
}

/**
 * Esegue il 3-way merge campo-per-campo e riga-per-riga tra:
 * - `base`: ultima versione condivisa nota prima delle modifiche locali
 * - `local`: modifiche correnti su questo PC
 * - `remote`: stato attuale presente su Supabase (modificato da un'altra postazione)
 */
export function mergeDdtSnapshots(
  base: DdtSnapshot,
  local: DdtSnapshot,
  localDeletedItemIds: Set<string>,
  remote: DdtSnapshot
): DdtMergeResult {
  const conflicts: DdtFieldConflict[] = [];
  let autoMergedChanges = 0;

  // 1. Merge testata campo per campo
  const mergedHeader: DdtHeaderSnapshot = { ...local.header };
  for (const { key, label, type } of HEADER_FIELDS_TO_MERGE) {
    const bVal = normCompare(base.header[key], type);
    const lVal = normCompare(local.header[key], type);
    const rVal = normCompare(remote.header[key], type);

    const localChanged = lVal !== bVal;
    const remoteChanged = rVal !== bVal;

    if (!localChanged && remoteChanged) {
      (mergedHeader as unknown as Record<string, unknown>)[key] = remote.header[key];
      autoMergedChanges++;
    } else if (localChanged && remoteChanged && lVal !== rVal) {
      conflicts.push({
        scope: "header",
        label,
        field: String(key),
        localValue: formatForConflict(local.header[key], String(key)),
        remoteValue: formatForConflict(remote.header[key], String(key)),
      });
    }
  }

  // 2. Merge righe per UUID stabile `id`
  const baseMap = new Map(base.items.map((it) => [it.id, it]));
  const localMap = new Map(local.items.map((it) => [it.id, it]));
  const remoteMap = new Map(remote.items.map((it) => [it.id, it]));

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const pushOrdered = (items: DdtItemSnapshot[]) => {
    for (const it of items) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        orderedIds.push(it.id);
      }
    }
  };
  pushOrdered(local.items);
  pushOrdered(remote.items);

  const mergedItems: DdtItemSnapshot[] = [];

  for (const id of orderedIds) {
    const bIt = baseMap.get(id);
    const lIt = localMap.get(id);
    const rIt = remoteMap.get(id);

    // Aggiunta da questo PC
    if (!bIt && lIt && !rIt) {
      mergedItems.push(recomputeItemAmounts(lIt));
      continue;
    }

    // Aggiunta dall'altro PC su Supabase
    if (!bIt && !lIt && rIt) {
      mergedItems.push(recomputeItemAmounts(rIt));
      autoMergedChanges++;
      continue;
    }

    // Eliminata in locale
    if (bIt && !lIt && localDeletedItemIds.has(id)) {
      if (!rIt) continue; // eliminata da entrambi o già assente
      if (itemsEqual(bIt, rIt)) {
        // Rimossa in locale e non toccata dall'altro PC -> resta eliminata
        continue;
      }
      // L'altro PC ha modificato una riga che questo PC ha tolto: non perdiamo i dati e segnaliamo conflitto
      conflicts.push({
        scope: "item",
        itemId: id,
        label: rIt.description || bIt.description || "Riga DDT",
        field: "deleted_vs_modified",
        localValue: "(rimossa in locale)",
        remoteValue: `modificata (€ ${(rIt.unit_price_subunits / 100000).toFixed(2)})`,
      });
      mergedItems.push(recomputeItemAmounts(rIt));
      continue;
    }

    // Assente in locale senza soft-delete esplicito: conserva la riga remota per sicurezza
    if (bIt && !lIt && !localDeletedItemIds.has(id) && rIt) {
      mergedItems.push(recomputeItemAmounts(rIt));
      autoMergedChanges++;
      continue;
    }

    // Eliminata dall'altro PC su Supabase (assente in remote)
    if (bIt && lIt && !rIt) {
      if (itemsEqual(bIt, lIt)) {
        // In locale non era stata toccata -> accetta rimozione dall'altro PC
        autoMergedChanges++;
        continue;
      }
      // In locale è stata modificata mentre l'altro PC la eliminava: conserva la riga e segnala conflitto
      conflicts.push({
        scope: "item",
        itemId: id,
        label: lIt.description || bIt.description || "Riga DDT",
        field: "modified_vs_deleted",
        localValue: `modificata (€ ${(lIt.unit_price_subunits / 100000).toFixed(2)})`,
        remoteValue: "(rimossa dall'altra postazione)",
      });
      mergedItems.push(recomputeItemAmounts(lIt));
      continue;
    }

    // Presente su entrambi (o aggiunta con stesso ID su entrambi i lati)
    if (lIt && rIt) {
      const mergedItem: DdtItemSnapshot = { ...lIt };
      let itemModifiedFromRemote = false;

      for (const { key, label, type } of ITEM_FIELDS_TO_MERGE) {
        const bVal = bIt ? normCompare(bIt[key], type) : "";
        const lVal = normCompare(lIt[key], type);
        const rVal = normCompare(rIt[key], type);

        const localChanged = bIt ? lVal !== bVal : lVal !== "";
        const remoteChanged = bIt ? rVal !== bVal : rVal !== "";

        if (!bIt && lVal === rVal) continue;

        if (!localChanged && remoteChanged) {
          (mergedItem as unknown as Record<string, unknown>)[key] = rIt[key];
          itemModifiedFromRemote = true;
        } else if (localChanged && remoteChanged && lVal !== rVal) {
          // Eccezione compatibile: se base era empty, considera cambiamento reale di entrambi
          conflicts.push({
            scope: "item",
            itemId: id,
            label: `${mergedItem.description || rIt.description || "Riga"} — ${label}`,
            field: String(key),
            localValue: formatForConflict(lIt[key], String(key)),
            remoteValue: formatForConflict(rIt[key], String(key)),
          });
        }
      }

      if (itemModifiedFromRemote) autoMergedChanges++;
      mergedItems.push(recomputeItemAmounts(mergedItem));
    }
  }

  // Riordina per row_index preservando l'ordine relativo
  const reindexedItems = mergedItems
    .sort((a, b) => a.row_index - b.row_index)
    .map((it, idx) => ({ ...it, row_index: idx + 1 }));

  let totalTaxableSubunits = 0;
  let totalVatSubunits = 0;
  for (const it of reindexedItems) {
    totalTaxableSubunits += it.net_amount_subunits;
    totalVatSubunits += it.vat_amount_subunits;
  }

  return {
    merged: {
      header: mergedHeader,
      items: reindexedItems,
    },
    totalTaxableSubunits,
    totalVatSubunits,
    totalDocumentSubunits: totalTaxableSubunits + totalVatSubunits,
    conflicts,
    autoMergedChanges,
  };
}
