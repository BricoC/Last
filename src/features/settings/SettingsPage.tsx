import React, { useState } from "react";
import { useThemeStore, ACCENT_COLORS, ThemePresetId } from "@/shared/stores/useThemeStore";
import { Palette, Sliders, Mail, Database, Shield, Lock, Save, RotateCcw, Check } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export const SettingsPage: React.FC = () => {
  const { theme, setPreset, setBrightness, setAccentColor, resetTheme } = useThemeStore();
  const [activeNav, setActiveNav] = useState("theme");
  const [editEnabled, setEditEnabled] = useState(true);

  const presets: { id: ThemePresetId; name: string; desc: string; colors: string[] }[] = [
    {
      id: "blu-notte",
      name: "Blu Notte (Default)",
      desc: "Sfondo navy classico con accenti blu cobalto",
      colors: ["#0f172a", "#1e293b", "#3b82f6", "#10b981"],
    },
    {
      id: "grigio",
      name: "Grigio",
      desc: "Tonalità neutre ed equilibrate con luminosità regolabile",
      colors: ["#22242a", "#2c3038", "#3b82f6", "#ef4444"],
    },
    {
      id: "nero-oled",
      name: "Nero Assoluto (OLED)",
      desc: "Nero puro al 100% per il massimo contrasto e riposo visivo",
      colors: ["#0a0a0a", "#141414", "#3b82f6", "#10b981"],
    },
    {
      id: "smeraldo",
      name: "Verde Smeraldo Notte",
      desc: "Toni verdi scuri e profondi, rilassanti e distintivi",
      colors: ["#0d1b17", "#142621", "#10b981", "#3b82f6"],
    },
    {
      id: "viola",
      name: "Viola Ametista Notturno",
      desc: "Atmosfera tech moderna con accenti ametista e indaco",
      colors: ["#171224", "#221b35", "#a855f7", "#10b981"],
    },
  ];

  const brightnessLevels = [
    { level: 1, label: "L1 (Scuro Profondo)" },
    { level: 2, label: "L2 (Grafite Medio)" },
    { level: 3, label: "L3 (Standard)" },
    { level: 4, label: "L4 (Titanio Chiaro — Consigliato)" },
    { level: 5, label: "L5 (Massima Luminosità)" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header Impostazioni */}
      <div className="flex items-center justify-between pb-4 border-b border-[#363a46]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Impostazioni</h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestione parametri di sistema, macro email, database e temi
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setEditEnabled(!editEnabled)}
            className={cn(
              "flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
              editEnabled ? "bg-red-600 text-white" : "bg-slate-700 text-slate-300"
            )}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{editEnabled ? "MODIFICHE ABILITATE" : "MODIFICHE BLOCCATE"}</span>
          </button>
          <button
            type="button"
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded-md bg-white text-slate-900 font-semibold text-xs hover:bg-slate-200 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salva</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar Impostazioni */}
        <div className="space-y-1">
          {[
            { id: "theme", label: "Aspetto & Temi", icon: <Palette className="w-4 h-4" /> },
            { id: "general", label: "Parametri Generali", icon: <Sliders className="w-4 h-4" /> },
            { id: "email", label: "Configurazione Email", icon: <Mail className="w-4 h-4" /> },
            { id: "database", label: "Cloud & Database", icon: <Database className="w-4 h-4" /> },
            { id: "security", label: "Sicurezza & Permessi", icon: <Shield className="w-4 h-4" /> },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={cn(
                "w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left",
                activeNav === item.id
                  ? "bg-[#2c3038] text-white border border-[var(--primary)] font-semibold"
                  : "text-slate-400 hover:bg-[#252830] hover:text-slate-200"
              )}
            >
              <span className={activeNav === item.id ? "text-[var(--primary)]" : "text-slate-500"}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Contenuto Principale: Aspetto & Temi */}
        <div className="md:col-span-3 space-y-6">
          {/* Box Schemi di Colore Predefiniti */}
          <div className="bg-[#2c3038] border border-[#3e4350] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Schemi di Colore Predefiniti</h3>
                <p className="text-xs text-slate-400">Scegli l'atmosfera visiva dell'intera applicazione</p>
              </div>
              <button
                type="button"
                onClick={resetTheme}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#202329] border border-[#3e4350] text-xs text-slate-300 hover:text-white"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Ripristina Default</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {presets.map((p) => {
                const isActive = theme.preset === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setPreset(p.id)}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer transition-all",
                      isActive
                        ? "bg-[#252830] border-[var(--primary)] ring-1 ring-[var(--primary)]"
                        : "bg-[#22242a] border-[#3e4350] hover:border-slate-500"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-white">{p.name}</span>
                      {isActive && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-600/30 text-blue-300 border border-blue-500/40">
                          ATTIVO
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight mb-2.5">{p.desc}</p>
                    <div className="flex space-x-1.5">
                      {p.colors.map((c, i) => (
                        <span
                          key={i}
                          className="w-4 h-4 rounded-full border border-black/30"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Regolazione Luminosità Grigio */}
          {theme.preset === "grigio" && (
            <div className="bg-[#2c3038] border border-[#3e4350] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Livello Luminosità — Grigio</h3>
                  <p className="text-xs text-slate-400">Regola la chiarezza delle superfici di lavoro</p>
                </div>
                <span className="text-xs text-blue-400 font-medium">
                  {brightnessLevels.find((b) => b.level === theme.brightnessLevel)?.label}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {brightnessLevels.map((b) => (
                  <button
                    key={b.level}
                    type="button"
                    onClick={() => setBrightness(b.level)}
                    className={cn(
                      "py-2 px-1 rounded-lg border text-center text-xs font-medium transition-all flex flex-col items-center justify-center space-y-1",
                      theme.brightnessLevel === b.level
                        ? "bg-[#252830] border-[var(--primary)] text-white shadow-sm"
                        : "bg-[#22242a] border-[#3e4350] text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <span>L{b.level}</span>
                    {theme.brightnessLevel === b.level && <Check className="w-3 h-3 text-blue-400" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Colore Primario & Accento Brand */}
          <div className="bg-[#2c3038] border border-[#3e4350] rounded-xl p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Colore Primario & Accento Brand</h3>
              <p className="text-xs text-slate-400">
                Definisce pulsanti primari, focus, badge attivi e bordi di selezione
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {ACCENT_COLORS.map((acc) => {
                const isSelected = theme.primaryColor === acc.color;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setAccentColor(acc.color)}
                    className={cn(
                      "flex items-center space-x-2 p-2 rounded-lg border transition-all text-left",
                      isSelected
                        ? "bg-[#252830] border-[var(--primary)] text-white"
                        : "bg-[#22242a] border-[#3e4350] text-slate-300 hover:border-slate-500"
                    )}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20"
                      style={{ backgroundColor: acc.color }}
                    />
                    <span className="text-xs truncate">{acc.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
