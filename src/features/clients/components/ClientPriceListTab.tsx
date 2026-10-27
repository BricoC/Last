import React, { useState, useEffect, useMemo } from "react";
import { Plus, X, Search, Tag, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { clientRepository } from "../services/clientRepository";

interface PriceListArticle {
  id: number;
  listino: string;
  codice_articolo: string;
  descrizione: string;
  prezzo_fattura: number;
  prezzo_acquisto: number;
  ricarico: number;
  note: string | null;
}

interface ClientPriceListTabProps {
  selectedPriceLists: string[];
  allAvailablePriceLists: string[];
  onChangePriceLists: (newLists: string[]) => void;
  onOpenArticleHistory?: () => void;
}

export const ClientPriceListTab: React.FC<ClientPriceListTabProps> = ({
  selectedPriceLists,
  allAvailablePriceLists,
  onChangePriceLists,
  onOpenArticleHistory,
}) => {
  const [selectorSearch, setSelectorSearch] = useState("");
  const [articleSearch, setArticleSearch] = useState("");
  const [articles, setArticles] = useState<PriceListArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [isAddingList, setIsAddingList] = useState(false);

  // Carica gli articoli dei listini selezionati
  useEffect(() => {
    let active = true;
    if (selectedPriceLists.length === 0) {
      setArticles([]);
      return;
    }

    setLoadingArticles(true);
    void clientRepository
      .getPriceListArticles(selectedPriceLists)
      .then((data) => {
        if (active) {
          setArticles(data);
          setLoadingArticles(false);
        }
      })
      .catch((err) => {
        console.error("Errore caricamento articoli listino:", err);
        if (active) setLoadingArticles(false);
      });

    return () => {
      active = false;
    };
  }, [selectedPriceLists]);

  // Filtra i listini disponibili per l'aggiunta escludendo quelli già selezionati
  const filteredAvailable = useMemo(() => {
    const q = selectorSearch.trim().toUpperCase();

    // Escludiamo listini già selezionati e il segnaposto vuoto 'LIST_'
    const unselected = allAvailablePriceLists
      .filter((p) => !selectedPriceLists.includes(p))
      .filter((p) => p.trim() !== "LIST_");

    // Ordiniamo: prima tutti i listini reali dei clienti, in fondo i 'Modulo vuoto'
    const sorted = [...unselected].sort((a, b) => {
      const aIsPlaceholder = a.includes("Modulo vuoto");
      const bIsPlaceholder = b.includes("Modulo vuoto");
      if (aIsPlaceholder && !bIsPlaceholder) return 1;
      if (!aIsPlaceholder && bIsPlaceholder) return -1;
      return a.localeCompare(b, "it", { sensitivity: "base" });
    });

    if (!q) return sorted;
    return sorted.filter((p) => p.toUpperCase().includes(q));
  }, [allAvailablePriceLists, selectedPriceLists, selectorSearch]);

  // Filtra gli articoli del listino in visualizzazione
  const filteredArticles = useMemo(() => {
    const q = articleSearch.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) =>
        a.codice_articolo.toLowerCase().includes(q) ||
        a.descrizione.toLowerCase().includes(q) ||
        (a.note && a.note.toLowerCase().includes(q))
    );
  }, [articles, articleSearch]);

  const handleAddList = (listino: string) => {
    if (!selectedPriceLists.includes(listino)) {
      onChangePriceLists([...selectedPriceLists, listino]);
    }
    setSelectorSearch("");
    setIsAddingList(false);
  };

  const handleRemoveList = (listino: string) => {
    onChangePriceLists(selectedPriceLists.filter((l) => l !== listino));
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* 1. SEZIONE LISTINI COLLEGATI */}
      <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--card)]/50 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                Listini Prezzi Associati al Cliente
              </h3>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              I prezzi e sconti di questi listini verranno applicati in automatico nella creazione DDT e Preventivi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenArticleHistory && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenArticleHistory}
                className="h-8 text-xs font-semibold text-sky-400 border-sky-500/30 hover:bg-sky-500/10"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Storico Venduto DDT
              </Button>
            )}

            {!isAddingList && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setIsAddingList(true)}
                className="h-8 text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Associa Listino
              </Button>
            )}
          </div>
        </div>

        {/* Badge listini selezionati */}
        <div className="flex flex-wrap items-center gap-2 min-h-[36px] p-2 rounded-md bg-[var(--background)] border border-[var(--border)]">
          {selectedPriceLists.length === 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] italic">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              Nessun listino personalizzato associato (verrà usato il Listino Generale predefinito).
            </div>
          ) : (
            selectedPriceLists.map((list) => (
              <span
                key={list}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-xs"
              >
                <Tag className="w-3 h-3 text-emerald-400" />
                <span>{list}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveList(list)}
                  className="p-0.5 rounded hover:bg-emerald-500/20 text-emerald-400 hover:text-white transition-colors"
                  title={`Rimuovi associazione ${list}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>

        {/* Selettore popup a tendina per aggiungere listino */}
        {isAddingList && (
          <div className="p-3 rounded-md bg-[var(--background)] border border-[var(--primary)] shadow-lg space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--foreground)]">
                Cerca tra i 117 listini disponibili nel database:
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAddingList(false)}
                className="h-6 w-6 p-0"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
              <input
                type="text"
                autoFocus
                placeholder="Digita nome o codice listino (es. CARMA, TREVI, BARSELLA)..."
                value={selectorSearch}
                onChange={(e) => setSelectorSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setIsAddingList(false);
                  }
                }}
                className="w-full h-8 pl-8 pr-3 text-xs rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 divide-y divide-[var(--border)]/40 pr-1">
              {filteredAvailable.length === 0 ? (
                <div className="p-3 text-center text-xs text-[var(--muted-foreground)]">
                  Nessun listino corrispondente a &ldquo;{selectorSearch}&rdquo;.
                </div>
              ) : (
                filteredAvailable.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleAddList(item)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-left rounded hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] transition-colors group"
                  >
                    <span className="font-semibold">{item}</span>
                    <span className="text-[11px] text-[var(--muted-foreground)] group-hover:text-[var(--primary)]">
                      + Associa a questo cliente
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. ANTEPRIMA ARTICOLI E PREZZI SPECIALI */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-[var(--border)] bg-[var(--card)]/50 overflow-hidden">
        {/* Header tabella articoli */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--foreground)]">
              Articoli a Listino Dedicato ({filteredArticles.length} di {articles.length})
            </span>
            {loadingArticles && (
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
            )}
          </div>

          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
            <input
              type="text"
              placeholder="Cerca per codice o descrizione..."
              value={articleSearch}
              onChange={(e) => setArticleSearch(e.target.value)}
              className="w-full h-7 pl-8 pr-3 text-xs rounded border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
          </div>
        </div>

        {/* Tabella con scorrimento */}
        <div className="flex-1 overflow-y-auto">
          {selectedPriceLists.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center p-6 text-[var(--muted-foreground)] space-y-2">
              <Tag className="w-8 h-8 opacity-30 text-emerald-400" />
              <p className="text-xs">Associa almeno un listino per consultare gli articoli e i prezzi dedicati.</p>
            </div>
          ) : loadingArticles ? (
            <div className="flex items-center justify-center h-48 text-xs text-[var(--muted-foreground)]">
              Caricamento articoli da {selectedPriceLists.join(", ")}...
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-[var(--muted-foreground)]">
              Nessun articolo trovato per questa ricerca.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[var(--background)] border-b border-[var(--border)] select-none text-[var(--muted-foreground)] font-semibold">
                <tr>
                  <th className="py-2 px-3 w-32">Codice</th>
                  <th className="py-2 px-3">Descrizione</th>
                  <th className="py-2 px-3 w-28">Listino</th>
                  <th className="py-2 px-3 w-24 text-right">Prezzo Vendita</th>
                  <th className="py-2 px-3 w-24 text-right">Prezzo Acquisto</th>
                  <th className="py-2 px-3 w-20 text-right">Ricarico %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40 font-mono text-[11px]">
                {filteredArticles.map((art) => (
                  <tr
                    key={art.id}
                    className="hover:bg-[var(--background)]/80 transition-colors"
                  >
                    <td className="py-1.5 px-3 font-bold text-[var(--foreground)]">
                      {art.codice_articolo || "-"}
                    </td>
                    <td className="py-1.5 px-3 font-sans text-xs text-[var(--foreground)]">
                      {art.descrizione || "-"}
                      {art.note && (
                        <span className="block text-[10px] text-[var(--muted-foreground)] italic font-sans">
                          {art.note}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 font-sans text-[10px] text-emerald-400 font-semibold truncate max-w-[110px]">
                      {art.listino}
                    </td>
                    <td className="py-1.5 px-3 text-right font-bold text-emerald-400">
                      {art.prezzo_fattura.toLocaleString("it-IT", {
                        style: "currency",
                        currency: "EUR",
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-1.5 px-3 text-right text-[var(--muted-foreground)]">
                      {art.prezzo_acquisto > 0
                        ? art.prezzo_acquisto.toLocaleString("it-IT", {
                            style: "currency",
                            currency: "EUR",
                            minimumFractionDigits: 2,
                          })
                        : "-"}
                    </td>
                    <td className="py-1.5 px-3 text-right text-sky-400 font-semibold">
                      {art.ricarico > 0 ? `${art.ricarico.toFixed(1)}%` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
