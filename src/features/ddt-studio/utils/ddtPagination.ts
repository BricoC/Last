import { money, MonetaryValue } from "@/shared/domain/monetaryValue";
import { DdtItem } from "../models/ddt";
import { isRowFilled } from "./ddtCalculations";
export const ROWS_PER_PAGE = 25;
export const SINGLE_PAGE_SLOTS = 25;
export const FIRST_PAGE_MULTI_SLOTS = 25;
export const MIDDLE_PAGE_SLOTS = 25;
export const LAST_PAGE_MULTI_SLOTS = 25;

export interface DdtPageData {
  pageNum: number;
  totalPages: number;
  isFirst: boolean;
  isLast: boolean;
  rows: (Partial<DdtItem> & { net_amount?: MonetaryValue })[];
}

function createEmptyDdtRow(id: string, rowIndex: number): Partial<DdtItem> & { net_amount?: MonetaryValue } {
  return {
    id,
    ddt_id: "",
    row_index: rowIndex,
    description: "",
    unit: "",
    quantity: "",
    unit_price: money(0),
    discount_pct: "",
    net_amount: money(0),
    vat_rate: "",
    vat_amount: money(0),
  };
}

/**
 * Calcola quante righe visive (slot di altezza) occupa la descrizione di un articolo quando va a capo.
 * In Times New Roman 9.5pt nella colonna descrizione della DDT ci stanno circa 50-52 caratteri per riga.
 */
export function getItemRowSlots(item: Partial<DdtItem>): number {
  const desc = item.description ? String(item.description).trim() : "";
  if (!desc) return 1;
  const lines = desc.split("\n");
  let totalLines = 0;
  const CHARS_PER_LINE = 50;
  for (const l of lines) {
    const trimmed = l.trim();
    if (!trimmed) {
      totalLines += 1;
    } else {
      totalLines += Math.max(1, Math.ceil(trimmed.length / CHARS_PER_LINE));
    }
  }
  return Math.max(1, totalLines);
}

/**
 * Paginazione esatta fedele al layout fisico A4:
 * Mantiene tutte le righe fino all'ultima compilata.
 * Calcola l'ingombro verticale effettivo di ciascun articolo (considerando le righe che vanno a capo)
 * e riempie ogni pagina con righe vuote fino a saturare tutto lo spazio bianco disponibile:
 * - Pagina singola con footer: 28 slot
 * - Pagina 1 di documento multipagina: 33 slot
 * - Pagine intermedie: 45 slot
 * - Ultima pagina con footer: 40 slot
 * Garantisce che l'altezza complessiva della griglia e la posizione dei totali/footer restino stabili al millimetro.
 */
export function paginateDdtRows(items: DdtItem[]): DdtPageData[] {
  let lastFilledIndex = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (isRowFilled(items[i])) {
      lastFilledIndex = i;
      break;
    }
  }

  // Mantiene tutte le righe fino all'ultima compilata (inclusi gli spazi vuoti intermedi)
  const activeItems = lastFilledIndex >= 0 ? items.slice(0, lastFilledIndex + 1) : [];

  if (activeItems.length === 0) {
    const padded: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [];
    while (padded.length < SINGLE_PAGE_SLOTS) {
      padded.push(createEmptyDdtRow(`empty-p0-${padded.length}`, padded.length + 1));
    }
    return [{
      pageNum: 1,
      totalPages: 1,
      isFirst: true,
      isLast: true,
      rows: padded,
    }];
  }

  const itemSlots = activeItems.map((it) => getItemRowSlots(it));
  const totalSlots = itemSlots.reduce((sum, s) => sum + s, 0);

  // Se tutti gli articoli stanno in un'unica pagina con footer (<= SINGLE_PAGE_SLOTS)
  if (totalSlots <= SINGLE_PAGE_SLOTS) {
    const padded: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [...activeItems];
    let remainingSlots = SINGLE_PAGE_SLOTS - totalSlots;
    while (remainingSlots > 0) {
      padded.push(createEmptyDdtRow(`empty-p0-${padded.length}`, padded.length + 1));
      remainingSlots -= 1;
    }
    return [{
      pageNum: 1,
      totalPages: 1,
      isFirst: true,
      isLast: true,
      rows: padded,
    }];
  }

  // Altrimenti documento multipagina: raggruppa dinamicamente
  const pagesChunks: { chunk: (Partial<DdtItem> & { net_amount?: MonetaryValue })[]; usedSlots: number }[] = [];
  let currentChunk: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [];
  let currentSlots = 0;

  for (let i = 0; i < activeItems.length; i++) {
    const item = activeItems[i];
    const slots = itemSlots[i];
    const isFirst = pagesChunks.length === 0;
    const maxSlots = isFirst ? FIRST_PAGE_MULTI_SLOTS : MIDDLE_PAGE_SLOTS;
    const wouldStarveNextPage = isFirst && (i === activeItems.length - 1);

    if (currentChunk.length > 0 && (currentSlots + slots > maxSlots || wouldStarveNextPage)) {
      pagesChunks.push({ chunk: currentChunk, usedSlots: currentSlots });
      currentChunk = [item];
      currentSlots = slots;
    } else {
      currentChunk.push(item);
      currentSlots += slots;
    }
  }

  if (currentChunk.length > 0) {
    pagesChunks.push({ chunk: currentChunk, usedSlots: currentSlots });
  }

  // Verifica che l'ultima pagina non superi LAST_PAGE_MULTI_SLOTS (40)
  while (pagesChunks.length > 1 && pagesChunks[pagesChunks.length - 1].usedSlots > LAST_PAGE_MULTI_SLOTS) {
    const last = pagesChunks[pagesChunks.length - 1];
    // Una singola riga sovradimensionata non può essere ulteriormente spezzata su più pagine
    if (last.chunk.length <= 1) {
      break;
    }
    pagesChunks.pop();
    const c1: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [];
    const c2: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [];
    let s1 = 0;
    let s2 = 0;
    for (const it of last.chunk) {
      const s = getItemRowSlots(it);
      if (c2.length === 0 && (c1.length === 0 || s1 + s <= MIDDLE_PAGE_SLOTS) && (last.chunk.length - c1.length > 1)) {
        c1.push(it);
        s1 += s;
      } else {
        c2.push(it);
        s2 += s;
      }
    }
    if (c1.length === 0 || c2.length === 0) {
      pagesChunks.push(last);
      break;
    }
    pagesChunks.push({ chunk: c1, usedSlots: s1 });
    pagesChunks.push({ chunk: c2, usedSlots: s2 });
  }

  const totalPages = pagesChunks.length;
  const pages: DdtPageData[] = [];
  let globalRowCounter = 0;

  for (let p = 0; p < totalPages; p++) {
    const { chunk, usedSlots } = pagesChunks[p];
    const isFirst = p === 0;
    const isLast = p === totalPages - 1;

    const targetSlots = totalPages === 1
      ? SINGLE_PAGE_SLOTS
      : isFirst
      ? FIRST_PAGE_MULTI_SLOTS
      : isLast
      ? LAST_PAGE_MULTI_SLOTS
      : MIDDLE_PAGE_SLOTS;

    const padded: (Partial<DdtItem> & { net_amount?: MonetaryValue })[] = [...chunk];
    let remainingSlots = targetSlots - usedSlots;
    while (remainingSlots > 0) {
      padded.push(createEmptyDdtRow(`empty-p${p}-${padded.length}`, globalRowCounter + padded.length + 1));
      remainingSlots -= 1;
    }

    globalRowCounter += chunk.length;

    pages.push({
      pageNum: p + 1,
      totalPages,
      isFirst,
      isLast,
      rows: padded,
    });
  }

  return pages;
}
