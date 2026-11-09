import { useState, useEffect, useCallback } from "react";

export interface ColumnDefinition {
  id: string;
  label: string;
  defaultVisible: boolean;
  category: "anagrafica" | "costi" | "ricarichi";
}

export const ALL_GENERAL_COLUMNS: ColumnDefinition[] = [
  { id: "history", label: "Storico Modifiche", defaultVisible: true, category: "anagrafica" },
  { id: "invoices", label: "Fatture Elettroniche (Cerca Prezzi)", defaultVisible: true, category: "anagrafica" },
  { id: "actions", label: "Cestino (Elimina Riga)", defaultVisible: true, category: "anagrafica" },
  { id: "cat", label: "Categoria", defaultVisible: true, category: "anagrafica" },
  { id: "fornitore", label: "Fornitore", defaultVisible: true, category: "anagrafica" },
  { id: "codice_articolo", label: "Codice Articolo", defaultVisible: true, category: "anagrafica" },
  { id: "data_ref", label: "Data Ref.", defaultVisible: true, category: "anagrafica" },
  { id: "descrizione", label: "Descrizione", defaultVisible: true, category: "anagrafica" },
  { id: "um", label: "U.M.", defaultVisible: true, category: "anagrafica" },
  { id: "perc_pub", label: "% Pubblico", defaultVisible: true, category: "ricarichi" },
  { id: "prezzo_pubblico", label: "Prezzo Pubblico (€)", defaultVisible: true, category: "ricarichi" },
  { id: "perc_prof", label: "% Professionista", defaultVisible: true, category: "ricarichi" },
  { id: "prezzo_profess", label: "Prezzo Profess (€)", defaultVisible: true, category: "ricarichi" },
  { id: "perc_fatt", label: "% Fattura", defaultVisible: true, category: "ricarichi" },
  { id: "prezzo_fattura", label: "Prezzo Fattura (€)", defaultVisible: true, category: "ricarichi" },
  { id: "prezzo_acquisto", label: "Acquisto Base (€)", defaultVisible: true, category: "costi" },
  { id: "perc_iva", label: "Aliquota IVA (%)", defaultVisible: true, category: "ricarichi" },
  { id: "aumento", label: "Aumento (%)", defaultVisible: true, category: "costi" },
  { id: "maga", label: "Magazzino (%)", defaultVisible: true, category: "costi" },
  { id: "costo_maggiorato", label: "Acquisto Maggiorato (€)", defaultVisible: true, category: "costi" },
];

export function useColumnVisibility(userId?: string) {
  const storageKey = `general_columns_${userId || "default"}`;

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    const defaults: Record<string, boolean> = {};
    for (const col of ALL_GENERAL_COLUMNS) {
      defaults[col.id] = col.defaultVisible;
    }
    return defaults;
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setVisibleColumns(JSON.parse(saved));
      } else {
        const defaults: Record<string, boolean> = {};
        for (const col of ALL_GENERAL_COLUMNS) {
          defaults[col.id] = col.defaultVisible;
        }
        setVisibleColumns(defaults);
      }
    } catch {}
  }, [storageKey]);

  const toggleColumn = useCallback(
    (colId: string) => {
      setVisibleColumns((prev) => {
        const next = { ...prev, [colId]: !prev[colId] };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [storageKey]
  );

  const resetDefaultColumns = useCallback(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of ALL_GENERAL_COLUMNS) {
      defaults[col.id] = col.defaultVisible;
    }
    setVisibleColumns(defaults);
    try {
      localStorage.setItem(storageKey, JSON.stringify(defaults));
    } catch {}
  }, [storageKey]);

  const isVisible = useCallback(
    (colId: string) => {
      return visibleColumns[colId] !== false;
    },
    [visibleColumns]
  );

  return {
    columns: ALL_GENERAL_COLUMNS,
    visibleColumns,
    isVisible,
    toggleColumn,
    resetDefaultColumns,
  };
}

export const ALL_CLIENT_COLUMNS: ColumnDefinition[] = [
  { id: "actions", label: "Cestino (Elimina Riga)", defaultVisible: true, category: "anagrafica" },
  { id: "cliente", label: "Cliente", defaultVisible: true, category: "anagrafica" },
  { id: "fornitore", label: "Fornitore", defaultVisible: true, category: "anagrafica" },
  { id: "codice_articolo", label: "Codice Articolo", defaultVisible: true, category: "anagrafica" },
  { id: "data_ref", label: "Data", defaultVisible: true, category: "anagrafica" },
  { id: "descrizione", label: "Descrizione", defaultVisible: true, category: "anagrafica" },
  { id: "prezzo_fattura", label: "Prezzo Vendita (€)", defaultVisible: true, category: "ricarichi" },
  { id: "perc_acquisto", label: "% Acquisto", defaultVisible: true, category: "ricarichi" },
  { id: "acquisto_eur", label: "Acquisto (€)", defaultVisible: true, category: "costi" },
  { id: "data_acquisto", label: "Data Acquisto", defaultVisible: true, category: "costi" },
  { id: "acquisto_old", label: "Acquisto OLD", defaultVisible: true, category: "costi" },
  { id: "ricarico", label: "Ricarico (%) OLD", defaultVisible: false, category: "ricarichi" },
  { id: "note", label: "Note", defaultVisible: true, category: "anagrafica" },
  { id: "note1", label: "Note 1", defaultVisible: false, category: "anagrafica" },
  { id: "note2", label: "Note 2", defaultVisible: false, category: "anagrafica" },
];

export function useClientColumnVisibility(userId?: string) {
  const storageKey = `client_columns_${userId || "default"}`;

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    const defaults: Record<string, boolean> = {};
    for (const col of ALL_CLIENT_COLUMNS) {
      defaults[col.id] = col.defaultVisible;
    }
    return defaults;
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setVisibleColumns(JSON.parse(saved));
      } else {
        const defaults: Record<string, boolean> = {};
        for (const col of ALL_CLIENT_COLUMNS) {
          defaults[col.id] = col.defaultVisible;
        }
        setVisibleColumns(defaults);
      }
    } catch {}
  }, [storageKey]);

  const toggleColumn = useCallback(
    (colId: string) => {
      setVisibleColumns((prev) => {
        const next = { ...prev, [colId]: !prev[colId] };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [storageKey]
  );

  const resetDefaultColumns = useCallback(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of ALL_CLIENT_COLUMNS) {
      defaults[col.id] = col.defaultVisible;
    }
    setVisibleColumns(defaults);
    try {
      localStorage.setItem(storageKey, JSON.stringify(defaults));
    } catch {}
  }, [storageKey]);

  const isVisible = useCallback(
    (colId: string) => {
      return visibleColumns[colId] !== false;
    },
    [visibleColumns]
  );

  return {
    columns: ALL_CLIENT_COLUMNS,
    visibleColumns,
    isVisible,
    toggleColumn,
    resetDefaultColumns,
  };
}

