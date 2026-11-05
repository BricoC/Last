import React, { useEffect, useState } from "react";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { useUserStore } from "@/shared/stores/useUserStore";
import { isPageAllowedForUser, DEFAULT_TOPBAR_ORDER } from "@/shared/services/appUserService";
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
  ClipboardList,
  Users,
  Settings as SettingsIcon,
  Columns2,
  Rows2,
  Grid2X2,
  Layers,
  Minimize2,
  User,
  Cloud,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { ddtIncrementalSyncService } from "@/features/ddt-studio/services/ddtIncrementalSyncService";
import { TopbarOrderModal } from "./TopbarOrderModal";

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

  const {
    users,
    currentUser,
    loadUsers,
    requestSwitchUser,
    updateCurrentUserTopbarOrder,
  } = useUserStore();

  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);
  const [dragOverModuleId, setDragOverModuleId] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await ddtIncrementalSyncService.syncNewDdtsFromSupabase();
      const now = new Date();
      setLastSyncTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const onDdtUpdated = () => {
      const now = new Date();
      setLastSyncTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    };
    window.addEventListener("ddt-data-updated", onDdtUpdated);
    return () => window.removeEventListener("ddt-data-updated", onDdtUpdated);
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

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
    { id: "offers", title: "Offerte", componentId: "offers", icon: <ClipboardList className="w-3.5 h-3.5" /> },
    { id: "clients", title: "Clienti", componentId: "clients", icon: <Users className="w-3.5 h-3.5" /> },
  ];

  const userOrder =
    currentUser?.topbar_order && currentUser.topbar_order.length > 0
      ? currentUser.topbar_order
      : DEFAULT_TOPBAR_ORDER;

  const visibleModules = [...modules]
    .filter((mod) => isPageAllowedForUser(currentUser, mod.id))
    .sort((a, b) => {
      const idxA = userOrder.indexOf(a.id);
      const idxB = userOrder.indexOf(b.id);
      const posA = idxA === -1 ? 999 : idxA;
      const posB = idxB === -1 ? 999 : idxB;
      return posA - posB;
    });

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedModuleId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverModuleId !== id) {
      setDragOverModuleId(id);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = draggedModuleId || e.dataTransfer.getData("text/plain");
    setDraggedModuleId(null);
    setDragOverModuleId(null);

    if (!sourceId || sourceId === targetId) return;

    const visibleIds = visibleModules.map((m) => m.id);
    const fromIdx = visibleIds.indexOf(sourceId);
    const toIdx = visibleIds.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const newVisibleIds = [...visibleIds];
    const [moved] = newVisibleIds.splice(fromIdx, 1);
    newVisibleIds.splice(toIdx, 0, moved);

    // Mantieni eventuali moduli non visibili nell'ordine generale
    const fullOrder = [...newVisibleIds];
    for (const id of userOrder) {
      if (!fullOrder.includes(id)) {
        fullOrder.push(id);
      }
    }
    for (const m of modules) {
      if (!fullOrder.includes(m.id)) {
        fullOrder.push(m.id);
      }
    }

    await updateCurrentUserTopbarOrder(fullOrder);
  };

  return (
    <>
      <header className="h-11 bg-[var(--card)] border-b border-[var(--border)] px-2 flex items-center justify-between select-none text-[var(--foreground)] transition-colors gap-2">
        {/* Lista Moduli Navigazione Primaria (con scrollbar e supporto rotellina del mouse) */}
        <div
          onWheel={(e) => {
            if (e.deltaY !== 0) {
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
          className="flex-1 min-w-0 flex items-center space-x-1 overflow-x-auto py-1"
        >
          {visibleModules.map((mod) => {
            const isActive = activeWindowId === mod.id;
            const isDragging = draggedModuleId === mod.id;
            const isOver = dragOverModuleId === mod.id;

            return (
              <button
                key={mod.id}
                type="button"
                draggable
                onDragStart={(e) => handleDragStart(e, mod.id)}
                onDragOver={(e) => handleDragOver(e, mod.id)}
                onDragLeave={() => setDragOverModuleId(null)}
                onDrop={(e) => void handleDrop(e, mod.id)}
                onDragEnd={() => {
                  setDraggedModuleId(null);
                  setDragOverModuleId(null);
                }}
                onClick={() =>
                  openWindow({
                    id: mod.id,
                    title: mod.title,
                    componentId: mod.componentId,
                  })
                }
                title={`${mod.title} (Trascina per riordinare)`}
                className={cn(
                  "h-7 px-2.5 rounded-md flex items-center space-x-1.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 select-none cursor-pointer",
                  isActive
                    ? "bg-[var(--background)] text-[var(--foreground)] border border-[var(--primary)] shadow-sm font-semibold"
                    : "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)]",
                  isDragging && "opacity-40 border-dashed border-[var(--primary)]",
                  isOver && "border-l-2 border-l-[var(--primary)] bg-[var(--primary)]/10 scale-105"
                )}
              >
                <span className={cn(isActive ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]")}>
                  {mod.icon}
                </span>
                <span>{mod.title}</span>
              </button>
            );
          })}

          {/* Pulsante rapido per personalizzare l'ordine finestre con popup / frecce */}
          <button
            type="button"
            onClick={() => setIsOrderModalOpen(true)}
            title="Personalizza l'ordine delle finestre nella barra"
            className="h-7 px-2 rounded-md flex items-center space-x-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors shrink-0 cursor-pointer border border-transparent hover:border-[var(--border)]"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="text-[11px] hidden xl:inline font-medium">Ordina</span>
          </button>
        </div>

      {/* Sezione Destra: Strumenti Desktop Finestre + Impostazioni */}
      <div className="flex items-center space-x-2 pl-2 shrink-0">
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

        {/* Indicatore e Pulsante Cloud Sync Supabase */}
        <button
          type="button"
          onClick={handleManualSync}
          disabled={isSyncing}
          className={cn(
            "flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer",
            isSyncing
              ? "bg-amber-500/15 border-amber-500/40 text-amber-300 animate-pulse"
              : lastSyncTime
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
              : "bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          )}
          title="Sincronizzazione Cloud Supabase (Clicca per verificare nuovi DDT ora)"
        >
          {isSyncing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
          ) : (
            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span>{isSyncing ? "Sync in corso..." : lastSyncTime ? `Cloud: ${lastSyncTime}` : "Cloud Sync"}</span>
        </button>

        {/* Indicatore e Selettore Rapido Utente / Postazione PC */}
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-[var(--background)] border border-[var(--border)] text-xs">
          <User className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
          <select
            value={currentUser?.id || ""}
            onChange={(e) => void requestSwitchUser(e.target.value)}
            className="bg-transparent text-xs font-semibold text-[var(--foreground)] outline-none cursor-pointer border-none p-0 pr-1 max-w-[130px] truncate"
            title="Postazione / Utente attivo su questo computer"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id} className="bg-[var(--card)] text-[var(--foreground)]">
                {u.name}
              </option>
            ))}
          </select>
        </div>

        {/* Pulsante Impostazioni (visibile solo se l'utente ha il permesso) */}
        {isPageAllowedForUser(currentUser, "settings") && (
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
        )}
      </div>
    </header>

    <TopbarOrderModal
      isOpen={isOrderModalOpen}
      onClose={() => setIsOrderModalOpen(false)}
      modules={visibleModules}
      currentOrder={userOrder}
      onSaveOrder={async (newOrder) => {
        // Preserva i moduli non presenti nella lista visibile
        const full = [...newOrder];
        for (const id of userOrder) {
          if (!full.includes(id)) full.push(id);
        }
        for (const m of modules) {
          if (!full.includes(m.id)) full.push(m.id);
        }
        await updateCurrentUserTopbarOrder(full);
      }}
    />
  </>
  );
};
