import React from "react";
import { Card } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { useTabStore } from "@/shared/stores/useTabStore";
import { useThemeStore } from "@/shared/stores/useThemeStore";
import { LayoutGrid, CheckCircle2, ShieldCheck, Database, Layers } from "lucide-react";

export const DashboardPage: React.FC = () => {
  const { openTab } = useTabStore();
  const { theme, setTheme } = useThemeStore();

  const colorOptions = [
    { name: "Blu Classico", color: "#3b82f6" },
    { name: "Smeraldo Moderno", color: "#10b981" },
    { name: "Viola Tech", color: "#8b5cf6" },
    { name: "Arancio Brico", color: "#f97316" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header di Benvenuto */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Last — Fondamenta Gestionale
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Architettura offline-first verificata con Tauri v2, Zustand, Tailwind e Theme Engine.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openTab({
                id: "price-lists",
                title: "Listino Generale",
                componentId: "price-lists",
              })
            }
          >
            Apri Listino
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              openTab({
                id: "ddt-studio",
                title: "DDT Studio",
                componentId: "ddt-studio",
              })
            }
          >
            Nuovo DDT
          </Button>
        </div>
      </div>

      {/* Grid delle caratteristiche architetturali */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Database & Sync" subtitle="Pattern Outbox & SQLite">
          <div className="flex items-center space-x-3 text-sm text-[var(--muted-foreground)] mb-3">
            <Database className="w-5 h-5 text-emerald-400" />
            <span>SQLite locale + Supabase Cloud</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Ogni record possiede timestamp UTC <code className="text-blue-400">updated_at</code> e soft-delete per allineamento indistruttibile.
          </p>
        </Card>

        <Card title="Design System" subtitle="Theme Engine Dinamico">
          <div className="flex items-center space-x-3 text-sm text-[var(--muted-foreground)] mb-3">
            <Layers className="w-5 h-5 text-blue-400" />
            <span>Token CSS e shadcn/ui</span>
          </div>
          <div className="space-y-2">
            <span className="text-xs text-slate-400">Cambia colore primario al volo:</span>
            <div className="flex space-x-2">
              {colorOptions.map((opt) => (
                <button
                  key={opt.color}
                  type="button"
                  onClick={() => setTheme({ primaryColor: opt.color })}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer"
                  style={{
                    backgroundColor: opt.color,
                    borderColor: theme.primaryColor === opt.color ? "#ffffff" : "transparent",
                  }}
                  title={opt.name}
                />
              ))}
            </div>
          </div>
        </Card>

        <Card title="Schede & Split View" subtitle="Produttività Multi-Finestra">
          <div className="flex items-center space-x-3 text-sm text-[var(--muted-foreground)] mb-3">
            <LayoutGrid className="w-5 h-5 text-amber-400" />
            <span>Navigazione Chrome-like</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Supporto per affiancare due schede con divisorio regolabile col mouse per consultare listini mentre crei un DDT.
          </p>
        </Card>
      </div>

      {/* Box di verifica iniziale */}
      <Card title="Stato Fondamenta Tecniche">
        <div className="space-y-2 text-sm">
          <div className="flex items-center space-x-2 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-slate-200">TypeScript configurato in Strict Mode</span>
          </div>
          <div className="flex items-center space-x-2 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-slate-200">Zustand Store per Tab e Theme Engine attivo</span>
          </div>
          <div className="flex items-center space-x-2 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-slate-200">Tauri v2 shell pronta per il runtime desktop</span>
          </div>
          <div className="flex items-center space-x-2 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-slate-200">Registro centrale componenti e hook inizializzato</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
