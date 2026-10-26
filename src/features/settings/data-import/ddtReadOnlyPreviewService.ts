import { invoke } from "@tauri-apps/api/core";
import { MonetaryValue } from "@/shared/domain/monetaryValue";

interface LocalDdtKey {
  id: string;
  year: number;
  docNumber: number | null;
  status: string;
  syncStatus: string;
  deletedAt: string | null;
}

interface LocalDdtSnapshot { documents: LocalDdtKey[]; itemIds: string[]; }

interface CloudHeader {
  id: string; anno: number; numero: number; stato: string; data: string | null; cliente: string | null;
  indirizzo: string | null; citta: string | null; pagamento: string | null; destinazione: string | null;
  citta_dest: string | null; nr_vs_ordine: string | null; causale: string | null; porto: string | null;
  aspetto: string | null; colli: string | null; peso_kg: number | string | null; vettore: string | null;
  operatore: string | null; note: string | null; piva: string | null; cod_fiscale: string | null;
  sdi: string | null; telefoni: unknown; created_at: string | null; ultima_modifica: string | null;
  totale_imponibile: number | null; totale_iva: number | null; totale_documento: number | null;
}

interface CloudLine {
  id: string; ddt_id: string | null; riga_nr: number | null; anno: number | null; numero_ddt: number | null;
  descrizione: string | null;
  prezzo: number | null; sconto_pct: number | null; importo: number | null; iva_pct: number | null;
  prezzo_scontato: number | null; prezzo_acquisto: number | null; quantita: number | string | null;
  um: string | null; ricavo: number | null;
}

interface LocalImportHeader {
  id: string; docNumber: number; year: number; series: string; docDate: string; status: string;
  clientName: string; clientAddress: string | null; clientCity: string | null; clientVat: string | null;
  clientFiscalCode: string | null; clientSdi: string | null; clientPhonesJson: string;
  destinationName: string | null; destinationAddress: string | null; destinationCity: string | null;
  transportReason: string; paymentMethod: string | null; orderReference: string | null;
  accountOrBalance: string; operator: string | null; goodsAppearance: string | null; carriageTerms: string;
  packagesCount: string | null; weightKg: string | null; carrier: string | null; internalNotes: string | null;
  totalTaxableSubunits: number; totalVatSubunits: number; totalDocumentSubunits: number;
  createdAt: string; updatedAt: string;
}

interface LocalImportLine {
  id: string; cloudHeaderId: string | null; rowIndex: number; description: string; rowKind: string;
  unit: string; quantity: string; unitPriceSubunits: number; discountPct: string; netAmountSubunits: number;
  vatRate: number; vatAmountSubunits: number; purchasePriceSubunits: number; createdAt: string; updatedAt: string;
}

export interface DdtPreview {
  headers: number; lines: number; states: Record<string, number>;
  directLinks: number; fallbackLinks: number; orphans: number; invalidHeaders: number;
  headerWithoutLines: number;
  alreadyPresentHeaders: number; alreadyPresentLines: number;
  conflicts: Array<{ id: string; year: number; number: number; reason: string; date: string | null; client: string | null; lineCount: number }>;
  orphanRows: Array<{ id: string; year: number | null; number: number | null; rowNumber: number | null; description: string; amount: number; ddtId: string | null }>;
  candidateHeaders: number; candidateLines: number; conflictLines: number; lineIdConflicts: number;
  zeroDiscountPrice: number; zeroRevenue: number; invalidVat: number;
  discountCount: number; minDiscount: number | null; maxDiscount: number | null;
  taxableDiscrepancies: number; maxTaxableDifference: number;
}

const HEADER_FIELDS = "id,anno,numero,stato,data,cliente,indirizzo,citta,pagamento,destinazione,citta_dest,nr_vs_ordine,causale,porto,aspetto,colli,peso_kg,vettore,operatore,note,piva,cod_fiscale,sdi,telefoni,created_at,ultima_modifica,totale_imponibile,totale_iva,totale_documento";
const LINE_FIELDS = "id,ddt_id,riga_nr,anno,numero_ddt,um,quantita,descrizione,prezzo,sconto_pct,importo,iva_pct,prezzo_acquisto,prezzo_scontato,ricavo";
const PAGE_SIZE = 1000;

async function readPage<T>(url: URL, table: string, fields: string, anonKey: string, offset: number): Promise<{ rows: T[]; total: number }> {
  const pageUrl = new URL(`/rest/v1/${table}`, url.origin);
  pageUrl.searchParams.set("select", fields);
  pageUrl.searchParams.set("order", "id.asc");
  pageUrl.searchParams.set("limit", String(PAGE_SIZE));
  pageUrl.searchParams.set("offset", String(offset));
  const response = await fetch(pageUrl, {
    method: "GET",
    headers: { apikey: anonKey, Prefer: "count=exact" },
  });
  if (!response.ok) throw new Error(`Lettura della tabella ${table} non riuscita (HTTP ${response.status}).`);
  const range = response.headers.get("content-range")?.split("/").pop();
  const total = range && range !== "*" ? Number(range) : NaN;
  if (!Number.isFinite(total)) throw new Error(`Conteggio della tabella ${table} non disponibile.`);
  return { rows: await response.json() as T[], total };
}

async function readAll<T>(baseUrl: string, anonKey: string, table: string, fields: string): Promise<T[]> {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:") throw new Error("La connessione Supabase deve usare HTTPS.");
  const first = await readPage<T>(base, table, fields, anonKey, 0);
  const pages = Math.ceil(first.total / PAGE_SIZE);
  const rows = first.rows;
  for (let start = 1; start < pages; start += 4) {
    const offsets = Array.from({ length: Math.min(4, pages - start) }, (_, index) => (start + index) * PAGE_SIZE);
    const batch = await Promise.all(offsets.map((offset) => readPage<T>(base, table, fields, anonKey, offset)));
    batch.forEach((page) => rows.push(...page.rows));
  }
  if (rows.length !== first.total) throw new Error(`Lettura incompleta della tabella ${table}: riprova la preview.`);
  return rows;
}

const documentKey = (year: number, number: number) => `${year}:${number}`;
const validAmount = (value: number | null | undefined): number => Number(value ?? 0);
const subunits = (value: number | string | null | undefined) => MonetaryValue.parse(value == null ? 0 : String(value)).toSubunits();

function mapHeaderForLocal(header: CloudHeader): LocalImportHeader {
  const now = new Date().toISOString();
  const sourcePhones = Array.isArray(header.telefoni) ? header.telefoni : [];
  const clientPhones = sourcePhones.map((entry, index) => {
    const phone = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return { id: String(phone.id ?? index), nome: String(phone.nome ?? phone.name ?? ""), numero: String(phone.numero ?? phone.number ?? "") };
  }).filter((phone) => phone.numero.trim());
  return {
    id: header.id, docNumber: Number(header.numero), year: Number(header.anno), series: "",
    docDate: header.data || `${header.anno}-01-01`, status: (header.stato || "").toLowerCase() === "confermato" ? "confermato" : "bozza",
    clientName: header.cliente?.trim() || "Cliente", clientAddress: header.indirizzo || null, clientCity: header.citta || null,
    clientVat: header.piva || null, clientFiscalCode: header.cod_fiscale || null, clientSdi: header.sdi || null,
    clientPhonesJson: JSON.stringify(clientPhones), destinationName: header.destinazione || null,
    destinationAddress: null, destinationCity: header.citta_dest || null,
    transportReason: header.causale || "Vendita", paymentMethod: header.pagamento || null,
    orderReference: header.nr_vs_ordine || null, accountOrBalance: "", operator: header.operatore || null,
    goodsAppearance: header.aspetto || null, carriageTerms: header.porto || "Franco stabilimento",
    packagesCount: header.colli || null, weightKg: header.peso_kg === null ? null : String(header.peso_kg),
    carrier: header.vettore || null, internalNotes: header.note || null,
    totalTaxableSubunits: subunits(header.totale_imponibile), totalVatSubunits: subunits(header.totale_iva),
    totalDocumentSubunits: subunits(header.totale_documento), createdAt: header.created_at || now,
    updatedAt: header.ultima_modifica || header.created_at || now,
  };
}

function mapLineForLocal(line: CloudLine, cloudHeaderId: string | null, fallbackRowIndex: number): LocalImportLine {
  const price = validAmount(line.prezzo);
  const amount = validAmount(line.importo);
  const quantity = line.quantita === null ? "" : String(line.quantita);
  const isNote = Boolean(line.descrizione?.trim()) && price === 0 && amount === 0
    && validAmount(line.prezzo_acquisto) === 0 && validAmount(line.iva_pct) === 0
    && validAmount(line.sconto_pct) === 0 && !quantity.trim() && !line.um?.trim();
  const createdAt = new Date().toISOString();
  const vatRate = isNote ? 0 : validAmount(line.iva_pct);
  const netAmountSubunits = isNote ? 0 : subunits(line.importo);
  return {
    id: line.id, cloudHeaderId, rowIndex: Number(line.riga_nr ?? fallbackRowIndex),
    description: line.descrizione || "", rowKind: isNote ? "note" : "item",
    unit: isNote ? "" : line.um || "NR", quantity: isNote ? "" : quantity || "1",
    unitPriceSubunits: isNote ? 0 : subunits(line.prezzo),
    discountPct: isNote ? "" : String(validAmount(line.sconto_pct) * 100),
    netAmountSubunits,
    vatRate: Math.round(vatRate), vatAmountSubunits: isNote ? 0 : Math.round(netAmountSubunits * vatRate / 100),
    purchasePriceSubunits: isNote ? 0 : subunits(line.prezzo_acquisto),
    createdAt, updatedAt: createdAt,
  };
}

export interface DdtImportResult {
  importedHeaders: number; importedLines: number; alreadyPresent: number; conflicts: number;
  duplicateCloudHeaders: number; orphanLines: number; lineIdConflicts: number; backupPath: string | null;
}

export async function importAllReadableSupabaseDdts(projectUrl: string, anonKey: string): Promise<DdtImportResult> {
  const normalizedUrl = projectUrl.trim().replace(/\/$/, "");
  if (!normalizedUrl || !anonKey.trim()) throw new Error("Inserisci URL e chiave anon per leggere Supabase.");
  if (anonKey.startsWith("sb_secret_") || anonKey.toLowerCase().includes("service_role")) {
    throw new Error("L’importazione accetta solo la chiave anon/pubblica.");
  }
  const [headers, lines] = await Promise.all([
    readAll<CloudHeader>(normalizedUrl, anonKey.trim(), "ddt", HEADER_FIELDS),
    readAll<CloudLine>(normalizedUrl, anonKey.trim(), "ddt_righe", LINE_FIELDS),
  ]);
  const byId = new Map(headers.map((header) => [header.id, header]));
  const byNumber = new Map<string, CloudHeader[]>();
  headers.forEach((header) => {
    if (Number.isFinite(Number(header.anno)) && Number.isFinite(Number(header.numero))) {
      const key = documentKey(Number(header.anno), Number(header.numero));
      byNumber.set(key, [...(byNumber.get(key) ?? []), header]);
    }
  });
  const importedHeaders = headers.filter((header) => Boolean(header.id)
    && Number.isFinite(Number(header.anno)) && Number.isFinite(Number(header.numero)) && Boolean(header.data))
    .map(mapHeaderForLocal);
  const rowSequences = new Map<string, number>();
  const mappedLines = lines.map((line) => {
    let header = line.ddt_id ? byId.get(line.ddt_id) : undefined;
    if (!header && !line.ddt_id && line.anno !== null && line.numero_ddt !== null) {
      const matches = byNumber.get(documentKey(Number(line.anno), Number(line.numero_ddt))) ?? [];
      if (matches.length === 1) header = matches[0];
    }
    const headerId = header?.id ?? null;
    const fallbackRowIndex = headerId ? (rowSequences.get(headerId) ?? 0) + 1 : 0;
    if (headerId) rowSequences.set(headerId, fallbackRowIndex);
    return mapLineForLocal(line, headerId, fallbackRowIndex);
  });
  return invoke<DdtImportResult>("import_supabase_ddt_into_local", { payload: { headers: importedHeaders, lines: mappedLines } });
}

export async function createDdtReadOnlyPreview(projectUrl: string, anonKey: string): Promise<DdtPreview> {
  const normalizedUrl = projectUrl.trim().replace(/\/$/, "");
  if (!normalizedUrl || !anonKey.trim()) throw new Error("Inserisci e salva URL e chiave anon prima dell’analisi.");
  if (anonKey.startsWith("sb_secret_") || anonKey.toLowerCase().includes("service_role")) {
    throw new Error("La preview accetta solo la chiave anon/pubblica.");
  }

  const [headers, lines, local] = await Promise.all([
    readAll<CloudHeader>(normalizedUrl, anonKey.trim(), "ddt", HEADER_FIELDS),
    readAll<CloudLine>(normalizedUrl, anonKey.trim(), "ddt_righe", LINE_FIELDS),
    invoke<LocalDdtSnapshot>("load_local_ddt_preview_keys"),
  ]);
  const localDocuments = local.documents;
  const localLineIds = new Set(local.itemIds);
  const byId = new Map(headers.map((header) => [header.id, header]));
  const byNumber = new Map<string, CloudHeader[]>();
  const localId = new Map(localDocuments.map((entry) => [entry.id, entry]));
  const localNumber = new Map<string, LocalDdtKey[]>();
  const states: Record<string, number> = {};
  const conflicts: DdtPreview["conflicts"] = [];
  const conflictedIds = new Set<string>();
  const alreadyPresentIds = new Set<string>();
  let alreadyPresentHeaders = 0;
  let invalidHeaders = 0;
  localDocuments.forEach((entry) => {
    if (entry.docNumber === null) return;
    const key = documentKey(entry.year, entry.docNumber);
    localNumber.set(key, [...(localNumber.get(key) ?? []), entry]);
  });

  headers.forEach((header) => {
    states[header.stato || "(vuoto)"] = (states[header.stato || "(vuoto)"] ?? 0) + 1;
    if (!header.id || !Number.isFinite(Number(header.anno)) || !Number.isFinite(Number(header.numero))) { invalidHeaders++; return; }
    const key = documentKey(Number(header.anno), Number(header.numero));
    byNumber.set(key, [...(byNumber.get(key) ?? []), header]);
    const idMatch = localId.get(header.id);
    const numberMatch = localNumber.get(key)?.find((entry) => !entry.deletedAt);
    if (idMatch && !idMatch.deletedAt && idMatch.year === Number(header.anno)
      && idMatch.docNumber === Number(header.numero) && idMatch.syncStatus === "synced") {
      alreadyPresentIds.add(header.id);
      alreadyPresentHeaders++;
    } else if (idMatch || numberMatch) {
      const localMatch = idMatch ?? numberMatch!;
      conflictedIds.add(header.id);
      const reason = localMatch.deletedAt ? "record locale cancellato" : localMatch.syncStatus === "pending" ? "record locale pendente" : "numero già presente in SQLite";
      conflicts.push({ id: header.id, year: Number(header.anno), number: Number(header.numero), reason, date: header.data, client: header.cliente, lineCount: 0 });
    }
  });
  byNumber.forEach((matches, key) => {
    if (matches.length < 2) return;
    matches.forEach((header) => {
      if (conflictedIds.has(header.id)) return;
      conflictedIds.add(header.id);
      conflicts.push({ id: header.id, year: Number(header.anno), number: Number(header.numero), reason: "chiave anno/numero duplicata su Supabase", date: header.data, client: header.cliente, lineCount: 0 });
    });
    // Keep duplicate keys out of fallback matching because the association is ambiguous.
    byNumber.set(key, matches);
  });
  const lineCounts = new Map<string, number>();
  const sums = new Map<string, number>();
  const conflictLineCounts = new Map<string, number>();
  const orphanRows: DdtPreview["orphanRows"] = [];
  let directLinks = 0; let fallbackLinks = 0; let orphans = 0; let conflictLines = 0; let candidateLines = 0; let lineIdConflicts = 0;
  let alreadyPresentLines = 0;
  let zeroDiscountPrice = 0; let zeroRevenue = 0; let invalidVat = 0;
  let discountCount = 0; let minDiscount = Number.POSITIVE_INFINITY; let maxDiscount = 0;
  lines.forEach((line) => {
    const lineIdConflict = localLineIds.has(line.id);
    let header = line.ddt_id ? byId.get(line.ddt_id) : undefined;
    if (header) directLinks++;
    else if (!line.ddt_id && line.anno !== null && line.numero_ddt !== null) {
      const matches = byNumber.get(documentKey(Number(line.anno), Number(line.numero_ddt))) ?? [];
      if (matches.length === 1) { header = matches[0]; fallbackLinks++; }
    }
    if (!header) {
      orphans++;
      orphanRows.push({ id: line.id, year: line.anno, number: line.numero_ddt, rowNumber: line.riga_nr, description: line.descrizione ?? "(senza descrizione)", amount: validAmount(line.importo), ddtId: line.ddt_id });
      return;
    }
    if (alreadyPresentIds.has(header.id)) { alreadyPresentLines++; return; }
    if (lineIdConflict) lineIdConflicts++;
    if (conflictedIds.has(header.id)) {
      conflictLines++;
      conflictLineCounts.set(header.id, (conflictLineCounts.get(header.id) ?? 0) + 1);
      return;
    }
    if (!Number.isFinite(Number(header.anno)) || !Number.isFinite(Number(header.numero))) {
      orphans++;
      orphanRows.push({ id: line.id, year: line.anno, number: line.numero_ddt, rowNumber: line.riga_nr, description: line.descrizione ?? "(senza descrizione)", amount: validAmount(line.importo), ddtId: line.ddt_id });
      return;
    }
    if (lineIdConflict) return;
    candidateLines++;
    lineCounts.set(header.id, (lineCounts.get(header.id) ?? 0) + 1);
    sums.set(header.id, (sums.get(header.id) ?? 0) + validAmount(line.importo));
    if (validAmount(line.prezzo_scontato) === 0 && validAmount(line.prezzo) !== 0 && validAmount(line.importo) !== 0) zeroDiscountPrice++;
    if (validAmount(line.ricavo) === 0) zeroRevenue++;
    if (line.iva_pct !== null && (Number(line.iva_pct) < 0 || Number(line.iva_pct) > 100)) invalidVat++;
    const discount = Number(line.sconto_pct ?? 0);
    if (discount > 0) { discountCount++; minDiscount = Math.min(minDiscount, discount); maxDiscount = Math.max(maxDiscount, discount); }
  });

  let taxableDiscrepancies = 0; let maxTaxableDifference = 0;
  const candidates = headers.filter((header) => !conflictedIds.has(header.id) && !alreadyPresentIds.has(header.id)
    && Number.isFinite(Number(header.anno)) && Number.isFinite(Number(header.numero)) && Boolean(header.id));
  candidates.forEach((header) => {
    const total = header.totale_imponibile;
    if (total === null || !lineCounts.has(header.id)) return;
    const difference = Math.abs(validAmount(total) - (sums.get(header.id) ?? 0));
    if (difference > 0.01) { taxableDiscrepancies++; maxTaxableDifference = Math.max(maxTaxableDifference, difference); }
  });
  conflicts.forEach((conflict) => { conflict.lineCount = conflictLineCounts.get(conflict.id) ?? 0; });
  return {
    headers: headers.length, lines: lines.length, states, directLinks, fallbackLinks, orphans, invalidHeaders,
    headerWithoutLines: candidates.filter((header) => !lineCounts.has(header.id)).length,
    alreadyPresentHeaders, alreadyPresentLines,
    conflicts, orphanRows, candidateHeaders: candidates.length,
    candidateLines, conflictLines, lineIdConflicts,
    zeroDiscountPrice, zeroRevenue, invalidVat, discountCount,
    minDiscount: Number.isFinite(minDiscount) ? minDiscount : null, maxDiscount: discountCount ? maxDiscount : null,
    taxableDiscrepancies, maxTaxableDifference,
  };
}
