import { recomputeItemAmounts } from "./ddtSnapshotItemMath";

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
