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

export function tokenizeSearch(query: string): string[] {
  return normalizeSearch(query).split(/\s+/).filter(Boolean);
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
  return terms.every((term) => fields.some((field) => field.includes(term)));
}

