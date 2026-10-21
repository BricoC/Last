import React from "react";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import {
  LayoutGrid,
  ShoppingCart,
  Tag,
  Hash,
  FileText,
  ListChecks,
  UserCheck,
  Receipt,
  FileSpreadsheet,
  Calculator,
  Users,
  Settings as SettingsIcon,
  Columns2,
  Rows2,
  Grid2X2,
  Layers,
  Minimize2,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";

export interface NavModule {
  id: string;
  title: string;
  componentId: string;
  icon: React.ReactNode;
}

export const TopNavBar: React.FC = () => {
  const {
    openWindow,
    activeWindowId,
    tileSideBySide,
    tileHorizontal,
    tileGrid,
    cascadeWindows,
    toggleShowDesktop,
    areAllWindowsMinimized,
  } = useWindowStore();

  const modules: NavModule[] = [
    { id: "dashboard", title: "Dashboard", componentId: "dashboard", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
    { id: "orders", title: "Order Manager", componentId: "orders", icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    { id: "price-lists", title: "Listino Generale", componentId: "price-lists", icon: <Tag className="w-3.5 h-3.5" /> },
    { id: "or-numbers", title: "OR Numbers", componentId: "or-numbers", icon: <Hash className="w-3.5 h-3.5" /> },
    { id: "ddt-list", title: "DDT List", componentId: "ddt-list", icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "ddt-articles", title: "DDT Articoli", componentId: "ddt-articles", icon: <ListChecks className="w-3.5 h-3.5" /> },
    { id: "client-lists", title: "Listini Clienti", componentId: "client-lists", icon: <UserCheck className="w-3.5 h-3.5" /> },
    { id: "invoices", title: "Fatture Elettroniche", componentId: "invoices", icon: <Receipt className="w-3.5 h-3.5" /> },
    { id: "ddt-studio", title: "DDT Studio (Pro)", componentId: "ddt-studio", icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
    { id: "quotes", title: "Preventivi", componentId: "quotes", icon: <Calculator className="w-3.5 h-3.5" /> },
    { id: "clients", title: "Clienti", componentId: "clients", icon: <Users className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="h-10 bg-[var(--card)] border-b border-[var(--border)] px-2 flex items-center justify-between select-none text-[var(--foreground)] transition-colors">
      {/* Lista Moduli Navigazione Primaria (con scroll orizzontale senza barra brutta) */}
      <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-1">
        {modules.map((mod) => {
          const isActive = activeWindowId === mod.id;
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() =>
                openWindow({
                  id: mod.id,
                  title: mod.title,
                  componentId: mod.componentId,
                })
              }
              className={cn(
                "h-7 px-2.5 rounded-md flex items-center space-x-1.5 text-xs font-medium transition-all whitespace-nowrap cursor-default",
                isActive
                  ? "bg-[var(--background)] text-[var(--foreground)] border border-[var(--primary)] shadow-sm font-semibold"
                  : "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
              )}
            >
              <span className={cn(isActive ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]")}>
                {mod.icon}
              </span>
              <span>{mod.title}</span>
            </button>
          );
        })}
      </div>

      {/* Sezione Destra: Strumenti Desktop Finestre + Impostazioni */}
      <div className="flex items-center space-x-2 pl-2">
        {/* Strumenti Rapidi Disposizione Finestre Desktop */}
        <div className="hidden lg:flex items-center space-x-1 border-r border-[var(--border)] pr-2">
          <button
            type="button"
            onClick={tileSideBySide}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors cursor-default"
            title="Affianca finestre verticalmente (50 / 50)"
          >
            <Columns2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={tileHorizontal}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors cursor-default"
            title="Affianca finestre orizzontalmente (50 / 50)"
          >
            <Rows2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={tileGrid}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors cursor-default"
            title="Griglia 4 finestre"
          >
            <Grid2X2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={cascadeWindows}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors cursor-default"
            title="Disponi a cascata"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          {/* Tasto Mostra Desktop / Ripristina finestre (in stile pulsante angolo di Windows - punto 4) */}
          <button
            type="button"
            onClick={toggleShowDesktop}
            className={cn(
              "p-1 rounded transition-colors cursor-default",
              areAllWindowsMinimized()
                ? "bg-blue-600/30 text-[var(--primary)] border border-blue-500/40"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]"
            )}
            title={
              areAllWindowsMinimized()
                ? "Ripristina finestre aperte"
                : "Mostra Desktop (Minimizza tutte le finestre)"
            }
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Pulsante Impostazioni */}
        <button
          type="button"
          onClick={() =>
            openWindow({
              id: "settings",
              title: "Impostazioni",
              componentId: "settings",
            })
          }
          className={cn(
            "h-7 px-2.5 rounded-md flex items-center space-x-1.5 text-xs font-medium transition-colors cursor-default",
            activeWindowId === "settings"
              ? "bg-[var(--background)] text-[var(--foreground)] border border-[var(--primary)] shadow-sm font-semibold"
              : "text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          )}
        >
          <SettingsIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          <span>Settings</span>
        </button>
      </div>
    </header>
  );
};
