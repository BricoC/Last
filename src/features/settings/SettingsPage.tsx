import { SupabaseConnectionFields } from "./data-import/SupabaseConnectionFields";
import React, { useState } from "react";
import { useThemeStore, ThemePresetId } from "@/shared/stores/useThemeStore";
import { Palette, Sliders, Mail, Database, Shield, Lock, Save, RotateCcw, Check, Building2, Users, HardDrive } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { CompanySettingsPanel } from "./CompanySettingsPanel";
import { EmailSettingsPanel } from "./EmailSettingsPanel";
import { DatabaseQuerySettingsPanel } from "./DatabaseQuerySettingsPanel";
import { BackupSettingsPanel } from "./BackupSettingsPanel";

import { UserManagementPanel } from "./UserManagementPanel";

export const SettingsPage: React.FC = () => {
  const { theme, setPreset, setBrightness, resetTheme } = useThemeStore();
  const [activeNav, setActiveNav] = useState("users");
  const [editEnabled, setEditEnabled] = useState(true);
  const [autoSaveMinutes, setAutoSaveMinutes] = useState<number>(() => {
    const saved = localStorage.getItem("price_list_autosave_minutes");
    return saved ? Math.max(1, parseInt(saved, 10)) : 30;
  });

  const presets: { id: ThemePresetId; name: string; desc: string; colors: string[] }[] = [
    {
      id: "grigio",
      name: "Grigio",
      desc: "Tonalità neutre ed equilibrate con luminosità regolabile da L1 a L5",
      colors: ["#22242a", "#2c3038", "#3b82f6"],
    },
    {
      id: "nero-oled",
      name: "Nero Assoluto (OLED)",
      desc: "Nero puro al 100% per il massimo contrasto e riposo visivo",
      colors: ["#000000", "#111111", "#3b82f6"],
    },
    {
      id: "avorio",
      name: "Bianco Avorio",
      desc: "Tonalità chiara, calda ed elegante per ambienti ben illuminati",
      colors: ["#f7f6f2", "#ffffff", "#2563eb"],
    },
  ];

  // Etichette dinamiche per i 5 livelli in base al tema attivo
  const getBrightnessLevels = () => {
    if (theme.preset === "avorio") {
      return [
        { level: 1, label: "L1 (Bianco Puro)" },
        { level: 2, label: "L2 (Avorio Luminoso)" },
        { level: 3, label: "L3 (Avorio Caldo — Consigliato)" },
        { level: 4, label: "L4 (Avorio Sabbia)" },
        { level: 5, label: "L5 (Avorio Titanio)" },
      ];
    }
    if (theme.preset === "nero-oled") {
      return [
        { level: 1, label: "L1 (Nero Assoluto 100%)" },
        { level: 2, label: "L2 (Carbone Scuro)" },
        { level: 3, label: "L3 (Grafite Notte)" },
        { level: 4, label: "L4 (Ossidiana)" },
        { level: 5, label: "L5 (Ardesia Scuro)" },
      ];
    }
    return [
      { level: 1, label: "L1 (Scuro Profondo)" },
      { level: 2, label: "L2 (Grafite Medio)" },
      { level: 3, label: "L3 (Standard)" },
      { level: 4, label: "L4 (Titanio Chiaro — Consigliato)" },
      { level: 5, label: "L5 (Massima Luminosità)" },
    ];
  };

  const brightnessLevels = getBrightnessLevels();

  return (
    <div className="w-full min-h-full flex flex-col p-6 space-y-6 select-none text-[var(--foreground)]">
      {/* Header Impostazioni */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border)] shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Impostazioni</h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Gestione parametri di sistema, macro email, database e temi
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setEditEnabled(!editEnabled)}
            className={cn(
              "flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer",
              editEnabled ? "bg-red-600 text-white" : "bg-slate-700 text-slate-300"
            )}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{editEnabled ? "MODIFICHE ABILITATE" : "MODIFICHE BLOCCATE"}</span>
          </button>
          <button
            type="button"
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded-md bg-[var(--primary)] text-white font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salva</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">
        {/* Sidebar Impostazioni */}
        <div className="w-full md:w-56 shrink-0 space-y-1">
          {[
            { id: "users", label: "Utenti & Postazioni", icon: <Users className="w-4 h-4" /> },
            { id: "theme", label: "Aspetto & Temi", icon: <Palette className="w-4 h-4" /> },
            { id: "company", label: "Dati aziendali", icon: <Building2 className="w-4 h-4" /> },
            { id: "general", label: "Parametri Generali", icon: <Sliders className="w-4 h-4" /> },
            { id: "email", label: "Configurazione Email", icon: <Mail className="w-4 h-4" /> },
            { id: "backup", label: "Backup & Ripristino", icon: <HardDrive className="w-4 h-4" /> },
            { id: "database", label: "Cloud & Database", icon: <Database className="w-4 h-4" /> },
            { id: "security", label: "Sicurezza & Permessi", icon: <Shield className="w-4 h-4" /> },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={cn(
                "w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer",
                activeNav === item.id
                  ? "bg-[var(--card)] text-[var(--foreground)] border border-[var(--primary)] font-semibold shadow-sm"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"
              )}
            >
              <span className={activeNav === item.id ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Contenuto Principale: Utenti / Aspetto & Temi / Database / Parametri Generali / Dati Aziendali */}
        {activeNav === "users" || activeNav === "security" ? (
          <div className="flex-1 min-w-0">
            <UserManagementPanel />
          </div>
        ) : activeNav === "company" ? (
          <div className="flex-1 min-w-0">
            <CompanySettingsPanel />
          </div>
        ) : activeNav === "email" ? (
          <div className="flex-1 min-w-0">
            <EmailSettingsPanel />
          </div>
        ) : activeNav === "backup" ? (
          <div className="flex-1 min-w-0">
            <BackupSettingsPanel />
          </div>
        ) : activeNav === "database" ? (
          <div className="flex-1 min-w-0 space-y-4">
            <SupabaseConnectionFields />
            <DatabaseQuerySettingsPanel />
          </div>
        ) : activeNav === "general" ? (
          <div className="flex-1 min-w-0 space-y-4">
            {/* Impostazioni Auto-Salvataggio Listini Prezzi */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Auto-Salvataggio Listino Generale</h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Frequenza del salvataggio automatico silenzioso in background dopo la prima modifica effettuata.
                </p>
              </div>
              <div className="flex items-center space-x-3 pt-1">
                <label className="text-xs font-medium text-[var(--foreground)]">
                  Intervallo di salvataggio (minuti):
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={autoSaveMinutes}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 30));
                    setAutoSaveMinutes(val);
                    localStorage.setItem("price_list_autosave_minutes", String(val));
                  }}
                  className="w-20 px-2.5 py-1 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md font-mono text-[var(--foreground)] focus:border-[var(--primary)] outline-none"
                />
                <span className="text-xs text-[var(--muted-foreground)]">minuti (predefinito: 30 minuti)</span>
              </div>
            </div>
            <DatabaseQuerySettingsPanel />
          </div>
        ) : (
          <div className="flex-1 min-w-0 space-y-6">
          {/* Box Schemi di Colore Predefiniti */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Schemi di Colore Predefiniti</h3>
                <p className="text-xs text-[var(--muted-foreground)]">Scegli l'atmosfera visiva dell'intera applicazione</p>
              </div>
              <button
                type="button"
                onClick={resetTheme}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] hover:border-[var(--primary)] cursor-default"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Ripristina Default</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {presets.map((p) => {
                const isActive = theme.preset === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setPreset(p.id)}
                    className={cn(
                      "p-3.5 rounded-lg border cursor-default transition-all flex flex-col justify-between",
                      isActive
                        ? "bg-[var(--background)] border-[var(--primary)] ring-2 ring-[var(--primary)]/30 shadow-md"
                        : "bg-[var(--background)]/60 border-[var(--border)] hover:border-[var(--primary)]"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[var(--foreground)]">{p.name}</span>
                        {isActive && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-600/30 text-[var(--primary)] border border-blue-500/40">
                            ATTIVO
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--muted-foreground)] leading-tight mb-3">{p.desc}</p>
                    </div>
                    <div className="flex space-x-1.5 pt-2 border-t border-[var(--border)]">
                      {p.colors.map((c, i) => (
                        <span
                          key={i}
                          className="w-4 h-4 rounded-full border border-black/20"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Regolazione 5 Livelli di Luminosità (attivo per TUTTI i temi - Punto 5) */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  Livello Luminosità — {theme.presetName}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">Regola la chiarezza delle superfici di lavoro</p>
              </div>
              <span className="text-xs text-[var(--primary)] font-medium">
                {brightnessLevels.find((b) => b.level === theme.brightnessLevel)?.label || `Livello ${theme.brightnessLevel}`}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {brightnessLevels.map((b) => (
                <button
                  key={b.level}
                  type="button"
                  onClick={() => setBrightness(b.level)}
                  className={cn(
                    "py-2 px-1 rounded-lg border text-center text-xs font-medium transition-all flex flex-col items-center justify-center space-y-1 cursor-default",
                    theme.brightnessLevel === b.level
                      ? "bg-[var(--background)] border-[var(--primary)] text-[var(--foreground)] shadow-sm font-semibold ring-1 ring-[var(--primary)]"
                      : "bg-[var(--background)]/60 border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  )}
                >
                  <span>L{b.level}</span>
                  {theme.brightnessLevel === b.level && <Check className="w-3 h-3 text-[var(--primary)]" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
