import { useMemo } from "react";

export function useFragmentSearch<T>(
  items: readonly T[],
  query: string,
  getSearchText: (item: T) => string | readonly (string | null | undefined)[]
): T[] {
  return useMemo(() => {
    if (!query.trim()) return [...items];
    return items.filter((item) => matchesFragmentSearch(getSearchText(item), query));
  }, [items, query, getSearchText]);
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function stripPunctuation(value: string): string {
  return value.replace(/[.\-_']/g, "");
}

export function tokenizeSearch(query: string): string[] {
  return normalizeSearch(query).split(/\s+/).filter(Boolean);
}

/** Matches a token against target text, supporting both literal and punctuation-agnostic match (e.g. "cam" or "camm" matches "c.a.m.m.") */
export function matchesSearchToken(target: string, token: string): boolean {
  if (target.includes(token)) return true;
  const cleanToken = stripPunctuation(token);
  if (!cleanToken) return false;

  // Se l'utente ha inserito esplicitamente punteggiatura (es. "200.01"),
  // NON dobbiamo fare match con sequenze prive di punteggiatura (es. "4240200012" o "020001553").
  // Il match tollerante deve valere solo se anche il target conteneva punteggiatura (es. "c-a-m-m" vs "c.a.m.m.").
  const tokenHasPunctuation = token !== cleanToken;
  if (tokenHasPunctuation) {
    const cleanTarget = stripPunctuation(target);
    const targetHasPunctuation = target !== cleanTarget;
    return targetHasPunctuation && cleanTarget.includes(cleanToken);
  }

  const cleanTarget = stripPunctuation(target);
  return cleanTarget.includes(cleanToken);
}

export function matchesFragmentSearch(
  searchableText: string | readonly (string | null | undefined)[],
  query: string
): boolean {
  const terms = tokenizeSearch(query);
  if (!terms.length) return true;
  const fields = (Array.isArray(searchableText) ? searchableText : [searchableText])
    .filter((value): value is string => typeof value === "string")
    .map(normalizeSearch);
  return terms.every((term) => fields.some((field) => matchesSearchToken(field, term)));
}

