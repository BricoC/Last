import React from "react";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import {
  ShoppingCart,
  TrendingUp,
  FileText,
  Clock,
  Tag,
  FileSpreadsheet,
  Calendar,
  Cloud,
  AlertCircle,
  Zap,
} from "lucide-react";

export const DashboardPage: React.FC = () => {
  const { openWindow } = useWindowStore();

  const recentDocs = [
    { num: "#2728", client: "GINESI RAFFAELLO", date: "20/10" },
    { num: "#2727", client: "FALEGNAMERIA BAISELLA", date: "20/10" },
    { num: "#2726", client: "EUROVAST", date: "20/10" },
  ];

  const topClients = [
    { rank: "#1", name: "CARTIERE CARRARA", pct: "38.3%", amount: "€125.491,20" },
    { rank: "#2", name: "MO.VI", pct: "9.8%", amount: "€32.119,60" },
    { rank: "#3", name: "EUROVAST", pct: "8.7%", amount: "€28.685,32" },
    { rank: "#4", name: "TREVITECH", pct: "7.8%", amount: "€25.522,83" },
    { rank: "#5", name: "WEPA ITALIA", pct: "5.4%", amount: "€17.745,16" },
  ];

  return (
    <div className="p-5 space-y-4 max-w-7xl mx-auto select-none">
      {/* 1. Barra di Stato & Notifiche (come in foto 1) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#2c3038] border border-[#3e4350] text-xs text-slate-300 font-medium">
          <Calendar className="w-3.5 h-3.5 text-blue-400" />
          <span>21 ottobre 2026</span>
        </div>

        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#2c3038] border border-[#3e4350] text-xs text-slate-300 font-medium">
          <Cloud className="w-3.5 h-3.5 text-cyan-400" />
          <span>Cloud Sync: <strong className="text-white ml-1">3 da allineare</strong></span>
        </div>

        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#3b2a1a] border border-[#784315] text-xs text-amber-300 font-semibold">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          <span>Ri.Ba: 31/10/2026</span>
          <span className="px-1.5 py-0.5 rounded bg-amber-600/40 text-[10px] text-amber-200">NON PAGATA</span>
        </div>

        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#192f2c] border border-[#1f584f] text-xs text-teal-300 font-medium">
          <Zap className="w-3.5 h-3.5 text-teal-400" />
          <span>Import all'Avvio:</span>
          <span className="text-teal-200 font-bold">ATTIVO</span>
        </div>

        <div className="ml-auto flex items-center space-x-2">
          <button
            type="button"
            onClick={() =>
              openWindow({
                id: "price-lists",
                title: "Listino Generale",
                componentId: "price-lists",
              })
            }
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#2c3038] border border-[#3e4350] text-xs text-slate-200 hover:text-white hover:bg-[#353a44] transition-colors"
          >
            <Tag className="w-3.5 h-3.5 text-emerald-400" />
            <span>Apri Listino</span>
          </button>
          <button
            type="button"
            onClick={() =>
              openWindow({
                id: "ddt-studio",
                title: "DDT Studio",
                componentId: "ddt-studio",
              })
            }
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold hover:bg-blue-600 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Nuovo DDT</span>
          </button>
        </div>
      </div>

      {/* 2. Quattro Card Metriche KPI Principali */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* VENDITE */}
        <div className="bg-[#2c3038] border border-[#3e4350] rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">VENDITE</span>
              <div className="text-xl font-extrabold text-white mt-1">19.460,21 €</div>
              <span className="text-[10px] text-slate-400">MESE CORRENTE</span>
            </div>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#3e4350] flex items-center justify-between">
            <span className="text-xs font-bold text-blue-400">327.963,72 €</span>
            <span className="text-[10px] text-slate-400 uppercase">TOTALE ANNO</span>
          </div>
        </div>

        {/* UTILE */}
        <div className="bg-[#2c3038] border border-[#3e4350] rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">UTILE</span>
              <div className="text-xl font-extrabold text-white mt-1">9.631,18 €</div>
              <span className="text-[10px] text-emerald-400 font-semibold">MARGINE MESE: 97.33%</span>
            </div>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#3e4350] flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400">154.781,92 €</span>
            <span className="text-[10px] text-slate-400 uppercase">MARGINE ANNO: 89.31%</span>
          </div>
        </div>

        {/* DOCUMENTI */}
        <div className="bg-[#2c3038] border border-[#3e4350] rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">DOCUMENTI</span>
              <div className="text-2xl font-extrabold text-white mt-1">2.728</div>
              <span className="text-[10px] text-slate-400">CREATI QUEST'ANNO</span>
            </div>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#3e4350] flex items-center justify-between text-[11px] text-slate-400">
            <span>DDT, Preventivi e Note</span>
          </div>
        </div>

        {/* ULTIME ATTIVITÀ */}
        <div className="bg-[#2c3038] border border-[#3e4350] rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center space-x-1.5 mb-2 text-slate-400 text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>DOCUMENTI RECENTI</span>
          </div>
          <div className="space-y-1.5">
            {recentDocs.map((doc) => (
              <div
                key={doc.num}
                className="flex items-center justify-between px-2 py-1 rounded bg-[#22242a] text-xs"
              >
                <div className="flex items-center space-x-1.5 truncate">
                  <span className="text-blue-400 font-bold">{doc.num}</span>
                  <span className="text-slate-300 truncate max-w-[110px]">{doc.client}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-medium">{doc.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Sezione Grafici e Classifica Clienti */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Grafico Andamento Mensile */}
        <div className="md:col-span-2 bg-[#2c3038] border border-[#3e4350] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Andamento Mensile (Vendite vs Costi)
              </h3>
              <p className="text-[11px] text-slate-400">Trend storico a confronto su base annuale</p>
            </div>
            <div className="flex items-center space-x-3 text-[11px]">
              <span className="flex items-center space-x-1 text-blue-400">
                <span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" />
                <span>Vendite</span>
              </span>
              <span className="flex items-center space-x-1 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
                <span>Margine</span>
              </span>
              <span className="flex items-center space-x-1 text-amber-400">
                <span className="w-2 h-0.5 bg-amber-400 inline-block" />
                <span>Media</span>
              </span>
            </div>
          </div>

          {/* Bar Chart simulato fedele allo screenshot */}
          <div className="h-44 flex items-end justify-between space-x-2 pt-6 px-2">
            {[
              { m: "Gen", h1: 45, h2: 30 },
              { m: "Feb", h1: 55, h2: 35 },
              { m: "Mar", h1: 80, h2: 50 },
              { m: "Apr", h1: 50, h2: 35 },
              { m: "Mag", h1: 75, h2: 48 },
              { m: "Giu", h1: 65, h2: 42 },
              { m: "Lug", h1: 68, h2: 44 },
              { m: "Ago", h1: 30, h2: 20 },
              { m: "Set", h1: 62, h2: 40 },
              { m: "Ott", h1: 50, h2: 32 },
              { m: "Nov", h1: 20, h2: 15 },
              { m: "Dic", h1: 15, h2: 10 },
            ].map((col) => (
              <div key={col.m} className="flex-1 flex flex-col items-center h-full justify-end group">
                <div className="w-full flex items-end justify-center space-x-1 h-32">
                  <div
                    style={{ height: `${col.h1}%` }}
                    className="w-1/2 bg-blue-500/80 group-hover:bg-blue-400 rounded-t transition-all"
                  />
                  <div
                    style={{ height: `${col.h2}%` }}
                    className="w-1/2 bg-emerald-500/80 group-hover:bg-emerald-400 rounded-t transition-all"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1">{col.m}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fatturato Clienti 2026 */}
        <div className="bg-[#2c3038] border border-[#3e4350] rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-[#3e4350]">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Fatturato Clienti 2026
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-600/30 text-blue-300 font-semibold">
                TOP 5
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {topClients.map((c) => (
                <div key={c.rank} className="flex items-center justify-between text-xs py-1">
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-slate-500 font-semibold text-[10px]">{c.rank}</span>
                      <span className="text-slate-200 font-medium truncate max-w-[130px]">{c.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 ml-4">{c.pct} del totale</span>
                  </div>
                  <span className="text-xs font-bold text-white">{c.amount}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-[#3e4350] flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Analisi Annuale</span>
            <span className="text-xs font-extrabold text-blue-400">€327.964</span>
          </div>
        </div>
      </div>
    </div>
  );
};
