import React, { useState, useEffect } from "react";
import { Eye, EyeOff, Search, Plus, UserCheck, Percent, TrendingUp } from "lucide-react";
import { DdtTotals, DdtDocument } from "../models/ddt";
import { OPERATORI, normalizeOperator } from "../utils/ddtCalculations";

export interface DDTFinancialBarProps {
  ddt: Partial<DdtDocument>;
  setDdt: React.Dispatch<React.SetStateAction<Partial<DdtDocument>>>;
  totals: DdtTotals;
  showMargini: boolean;
  setShowMargini: (show: boolean | ((prev: boolean) => boolean)) => void;
  onOpenSearchModal: () => void;
  onOpenAlexModal?: () => void;
  globalDiscount: string;
  onChangeGlobalDiscount: (discountStr: string) => void;
  globalMarkup: string;
  onChangeGlobalMarkup: (markupStr: string) => void;
  onClearTableFocus?: () => void;
}

export const DDTFinancialBar: React.FC<DDTFinancialBarProps> = ({
  ddt,
  setDdt,
  totals,
  showMargini,
  setShowMargini,
  onOpenSearchModal,
  onOpenAlexModal,
  globalDiscount,
  onChangeGlobalDiscount,
  globalMarkup,
  onChangeGlobalMarkup,
  onClearTableFocus,
}) => {
  const [localDiscount, setLocalDiscount] = useState(globalDiscount);
  const [localMarkup, setLocalMarkup] = useState(globalMarkup);

  useEffect(() => {
    setLocalDiscount(globalDiscount);
  }, [globalDiscount]);

  useEffect(() => {
    setLocalMarkup(globalMarkup);
  }, [globalMarkup]);

  const isBozza = ddt.status === "bozza" || ddt.doc_number === null;
  const ricavoPositive = (totals.totale_ricavo?.toNumber() ?? 0) >= 0;

  return (
    <div className="shrink-0 bg-[#1e2026] border-t border-b border-[#2d3139] px-3 py-2 flex flex-wrap items-center justify-between gap-3 select-none">
      {/* SINISTRA: 4 Box Finanziari Colorati (esattamente come in foto!) + Tasto Alex */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#16181d] border border-[#2d3139] rounded-lg shadow-inner">
          {/* 1. Prezzo Acquisto Totale (Giallo/Ambra) */}
          <div className="px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 flex flex-col items-center min-w-[105px]">
            <span className="text-[9.5px] font-black uppercase tracking-wider text-amber-400">
              Tot. Acquisto
            </span>
            <span className="text-xs font-black font-mono text-amber-300">
              {totals.totale_acquisto ? `€ ${totals.totale_acquisto.formatIT(false)}` : "0,0000 €"}
            </span>
          </div>

          {/* 2. Prezzo Totale Netto (Sky Blue / Ciano) */}
          <div className="px-3 py-1 rounded-md bg-sky-500/10 border border-sky-500/30 flex flex-col items-center min-w-[105px]">
            <span className="text-[9.5px] font-black uppercase tracking-wider text-sky-400">
              Totale Netto
            </span>
            <span className="text-xs font-black font-mono text-sky-300">
              € {totals.totale_imponibile.formatIT(false)}
            </span>
          </div>

          {/* 3. Ricavo / Utile (Verde Smeraldo) */}
          <div
            className={`px-3 py-1 rounded-md border flex flex-col items-center min-w-[105px] ${
              ricavoPositive
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            <span className="text-[9.5px] font-black uppercase tracking-wider text-zinc-300">
              Ricavo (Utile)
            </span>
            <span
              className={`text-xs font-black font-mono ${
                ricavoPositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {totals.totale_ricavo ? `€ ${totals.totale_ricavo.formatIT(false)}` : "0,0000 €"}
            </span>
          </div>

          {/* 4. Ricarico % (Viola / Purple) */}
          <div className="px-3 py-1 rounded-md bg-purple-500/10 border border-purple-500/30 flex flex-col items-center min-w-[85px]">
            <span className="text-[9.5px] font-black uppercase tracking-wider text-purple-400">
              Ricarico %
            </span>
            <span className="text-xs font-black font-mono text-purple-300">
              {totals.ricarico_percentuale !== undefined
                ? `${totals.ricarico_percentuale > 0 ? "+" : ""}${totals.ricarico_percentuale.toLocaleString("it-IT", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 3,
                  })}%`
                : "—"}
            </span>
          </div>
        </div>

        {/* Tasto + Alex (Pill Gradiente Viola / Rosa esattamente identico alla foto!) */}
        <button
          type="button"
          onClick={onOpenAlexModal || onOpenSearchModal}
          className="flex items-center space-x-1.5 text-xs px-3.5 py-2 rounded-lg bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-extrabold shadow-md shadow-purple-900/30 active:scale-95 transition-all cursor-default border border-purple-400/40"
          title="Apri Ricerca Alex (Listino Generale, Clienti, Storico Prezzi DDT)"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span className="tracking-wide">Alex</span>
        </button>
      </div>

      {/* CENTRO: Sezione Sconto Globale & Maggiorazione Prezzi % (Immediate, senza tasto Applica) */}
      <div className="flex flex-wrap items-center gap-2.5 bg-[#16181d] border border-[#2d3139] px-2.5 py-1 rounded-lg">
        {/* 1. Sconto Righe (%) */}
        <div className="flex flex-col items-start">
          <label className="text-[9px] font-bold uppercase tracking-wider text-purple-400 mb-0.5 flex items-center space-x-1">
            <Percent className="w-2.5 h-2.5" />
            <span>Sconto Righe</span>
          </label>
          <div className="flex items-center space-x-1 bg-[#272a33] border border-[#3b404d] focus-within:border-purple-500 rounded px-1.5 py-0.5 transition-colors">
            <input
              type="text"
              value={localDiscount}
              onMouseDown={() => onClearTableFocus?.()}
              onFocus={() => onClearTableFocus?.()}
              onChange={(e) => {
                const val = e.target.value;
                setLocalDiscount(val);
                onChangeGlobalDiscount(val);
              }}
              placeholder="Es. 10+3"
              className="w-20 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 font-mono outline-none text-center font-bold"
              title="Scrivi lo sconto (es. 10 o 10+3): applicazione immediata a tutte le voci, vecchie e nuove"
            />
          </div>
        </div>

        {/* Separatore verticale */}
        <div className="h-6 w-px bg-[#2d3139]" />

        {/* 2. Maggiorazione Prezzi (%) */}
        <div className="flex flex-col items-start">
          <label className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mb-0.5 flex items-center space-x-1">
            <TrendingUp className="w-2.5 h-2.5" />
            <span>Maggiorazione %</span>
          </label>
          <div className="flex items-center space-x-1 bg-[#272a33] border border-[#3b404d] focus-within:border-emerald-500 rounded px-1.5 py-0.5 transition-colors">
            <input
              type="text"
              value={localMarkup}
              onMouseDown={() => onClearTableFocus?.()}
              onFocus={() => onClearTableFocus?.()}
              onChange={(e) => {
                const val = e.target.value;
                setLocalMarkup(val);
                onChangeGlobalMarkup(val);
              }}
              placeholder="Es. 10"
              className="w-16 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 font-mono outline-none text-center font-bold"
              title="Aumenta tutti i prezzi del tot % (immediato). Rimuovi il valore per ripristinare i prezzi originali."
            />
          </div>
        </div>
      </div>

      {/* DESTRA: Cerca Articoli (F3), Visualizza Margini, Operatore & Stato */}
      <div className="flex items-center space-x-3">
        {/* Cerca Articoli F4 */}
        <div className="flex flex-col items-start">
          <label className="text-[9.5px] font-bold uppercase text-zinc-400 mb-0.5">
            Listino / Storico
          </label>
          <button
            type="button"
            onClick={onOpenSearchModal}
            className="flex items-center space-x-1.5 text-xs px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-sm transition-colors cursor-default"
            title="Mostra / Nascondi pannello cerca articoli (F4)"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Cerca Articoli (F4)</span>
          </button>
        </div>

        {/* Visualizza Margini */}
        <div className="flex flex-col items-start">
          <label className="text-[9.5px] font-bold uppercase text-zinc-400 mb-0.5">
            Visualizza
          </label>
          <button
            type="button"
            onClick={() => setShowMargini((p) => !p)}
            className={`flex items-center space-x-1.5 text-xs px-2.5 py-1 rounded-lg border font-semibold transition-colors cursor-default ${
              showMargini
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                : "bg-[#272a33] border-[#3b404d] text-zinc-400 hover:text-white"
            }`}
          >
            {showMargini ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Margini</span>
          </button>
        </div>

        {/* Operatore */}
        <div className="flex flex-col items-start">
          <label className="text-[9.5px] font-bold uppercase text-zinc-400 mb-0.5">
            Operatore
          </label>
          <div className="flex items-center space-x-1 bg-[#272a33] border border-[#3b404d] rounded-lg px-2 py-0.5 text-xs">
            <UserCheck className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={normalizeOperator(ddt.operator)}
              onChange={(e) => setDdt((p) => ({ ...p, operator: e.target.value }))}
              className="bg-transparent text-zinc-200 outline-none font-semibold text-xs cursor-default"
            >
              <option value="" className="bg-[#272a33]">
                — Vuoto —
              </option>
              {OPERATORI.map((op) => (
                <option key={op} value={op} className="bg-[#272a33]">
                  {op}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stato Documento */}
        <div className="flex flex-col items-start">
          <label className="text-[9.5px] font-bold uppercase text-zinc-400 mb-0.5">
            Stato
          </label>
          <div
            className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
              isBozza
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
            }`}
          >
            {isBozza ? "Bozza" : "Confermato"}
          </div>
        </div>
      </div>
    </div>
  );
};
