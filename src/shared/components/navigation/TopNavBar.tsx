import React, { useEffect, useRef, useState } from "react";
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
  StickyNote,
  Settings as SettingsIcon,
  Columns2,
  Rows2,
  Grid2X2,
  Layers,
  Minimize2,
  User,
  Cloud,
  Loader2,
  UploadCloud,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { useAppUpdaterStore } from "@/shared/stores/useAppUpdaterStore";
import {
  cloudSyncStatusService,
  CloudSyncStatusInfo,
} from "@/shared/services/cloudSyncStatusService";
import { CloudSyncHoverPopover } from "./CloudSyncHoverPopover";

export interface NavModule {
  id: string;
  title: string;
  componentId: string;
  icon: React.ReactNode;
}

export const ALL_TOPBAR_NAV_MODULES: NavModule[] = [
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
  { id: "notes", title: "Note", componentId: "notes", icon: <StickyNote className="w-3.5 h-3.5" /> },
];

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

  const {
    currentVersion,
    status: updaterStatus,
    newVersion: updaterNewVersion,
    openModal: openUpdaterModal,
  } = useAppUpdaterStore();

  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);
  const [dragOverModuleId, setDragOverModuleId] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [gapWarning, setGapWarning] = useState<string | null>(null);
  const [showGapAlert, setShowGapAlert] = useState(false);
  const [isPopoverHovered, setIsPopoverHovered] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatusInfo | null>(null);
  const [isCheckingCloudStatus, setIsCheckingCloudStatus] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    const stored = localStorage.getItem("last_supabase_sync_timestamp");
    if (stored) {
      const d = new Date(stored);
      if (!isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    }
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  const fetchCloudStatus = async (force = false) => {
    setIsCheckingCloudStatus(true);
    try {
      const s = await cloudSyncStatusService.getStatus(force);
      setCloudStatus(s);
      if (s.localLastSyncDate) {
        const d = s.localLastSyncDate;
        setLastSyncTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
      }
    } finally {
      setIsCheckingCloudStatus(false);
    }
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsPopoverHovered(true);
    void fetchCloudStatus(false);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsPopoverHovered(false);
    }, 250);
  };

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await cloudSyncStatusService.executeFullSync();
      const now = new Date();
      setLastSyncTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      if (res.ddtResult.unresolvedGaps && res.ddtResult.unresolvedGaps.length > 0) {
        const text = res.ddtResult.unresolvedGaps
          .map((g) => `Anno ${g.year}: DDT mancanti [${g.missingNumbers.join(", ")}]`)
          .join(" | ");
        setGapWarning(text);
      } else {
        setGapWarning(null);
      }
      await fetchCloudStatus(true);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    void fetchCloudStatus(false);
    const onSyncStatusUpdated = () => void fetchCloudStatus(true);
    window.addEventListener("cloud-sync-status-updated", onSyncStatusUpdated);
    return () => window.removeEventListener("cloud-sync-status-updated", onSyncStatusUpdated);
  }, []);

  useEffect(() => {
    const onGapDetected = (e: Event) => {
      const customEvent = e as CustomEvent<{ unresolvedGaps: { year: number; missingNumbers: number[] }[] }>;
      const gaps = customEvent.detail?.unresolvedGaps;
      if (gaps && gaps.length > 0) {
        const text = gaps
          .map((g) => `Anno ${g.year}: DDT mancanti [${g.missingNumbers.join(", ")}]`)
          .join(" | ");
        setGapWarning(text);
      }
    };
    window.addEventListener("ddt-numbering-gap-detected", onGapDetected);
    return () => window.removeEventListener("ddt-numbering-gap-detected", onGapDetected);
  }, []);

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

  const modules = ALL_TOPBAR_NAV_MODULES;

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

          {/* Pulsante Provvisorio Transitorio Migrazione Listini (Solo Admin) */}
          {currentUser?.is_admin && (
            <button
              type="button"
              onClick={() =>
                openWindow({
                  id: "manual-cloud-import",
                  title: "Migrazione Listini",
                  componentId: "manual-cloud-import",
                })
              }
              title="Migrazione Listini Clienti da locale a Supabase (Solo Admin)"
              className={cn(
                "h-7 px-2.5 rounded-md flex items-center space-x-1.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 select-none cursor-pointer border",
                activeWindowId === "manual-cloud-import"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm font-semibold"
                  : "bg-amber-500/10 text-amber-400/90 border-amber-500/30 hover:bg-amber-500/20 hover:text-amber-300"
              )}
            >
              <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
              <span>Migrazione Listini</span>
            </button>
          )}
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

        {/* Indicatore Aggiornamento Scaricato e Pronto (Stile Windows Update) */}
        {updaterStatus === "ready" && (
          <button
            type="button"
            onClick={openUpdaterModal}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-600/90 text-white shadow-sm cursor-pointer hover:bg-emerald-500 transition-all"
            title="Aggiornamento scaricato! Verrà applicato al prossimo riavvio (oppure clicca per dettagli)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>v{updaterNewVersion || "..."} pronta (prossimo avvio)</span>
          </button>
        )}

        {/* Versione del programma (basta il numero) prima del tasto Cloud */}
        {currentVersion && (
          <span
            className="text-[11px] font-mono font-medium text-[var(--muted-foreground)] opacity-70 px-1 py-0.5 select-none"
            title={`Versione installata: ${currentVersion}`}
          >
            {currentVersion}
          </span>
        )}

        {/* Indicatore e Pulsante Cloud Sync Supabase con Hover Popover */}
        <div
          className="relative flex items-center"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className={cn(
              "flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer",
              isSyncing
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 animate-pulse"
                : gapWarning
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                : cloudStatus?.hasPendingRemoteChanges
                ? "bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30"
                : lastSyncTime
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                : "bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
            title="Sincronizzazione Cloud Supabase (Passa sopra con il mouse per visualizzare data ultimo scaricamento e stato effettivo del Cloud)"
          >
            {isSyncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : gapWarning ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            ) : cloudStatus?.hasPendingRemoteChanges ? (
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                <Cloud className="w-3.5 h-3.5 text-amber-400" />
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              </span>
            ) : (
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>
              {isSyncing
                ? "Sync in corso..."
                : cloudStatus?.hasPendingRemoteChanges
                ? "Cloud: Nuovi dati!"
                : lastSyncTime
                ? `Cloud: ${lastSyncTime}`
                : "Cloud Sync"}
            </span>
          </button>

          {/* Hover Popover: Dettaglio ultimo scaricamento locale vs effettivo aggiornamento Supabase */}
          {isPopoverHovered && (
            <CloudSyncHoverPopover
              status={cloudStatus}
              isLoading={isCheckingCloudStatus}
              isSyncing={isSyncing}
              onRefreshStatus={() => void fetchCloudStatus(true)}
              onExecuteSync={() => void handleManualSync()}
            />
          )}

          {/* Badge Avviso Buchi Numerazione DDT se rilevati */}
          {gapWarning && (
            <button
              type="button"
              onClick={() => setShowGapAlert((prev) => !prev)}
              className="ml-1.5 p-1 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 transition-colors flex items-center gap-1 text-[11px] font-bold cursor-pointer"
              title="Attenzione: rilevati buchi nella numerazione sequenziale dei DDT!"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Buchi DDT</span>
            </button>
          )}

          {/* Popover Dettaglio Buchi */}
          {showGapAlert && gapWarning && (
            <div className="absolute right-0 top-9 z-50 w-80 p-3 bg-slate-900 border border-rose-500/60 shadow-2xl rounded-lg text-slate-100 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-rose-500/30 mb-2">
                <span className="font-bold text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  Salto di Numerazione DDT
                </span>
                <button
                  type="button"
                  onClick={() => setShowGapAlert(false)}
                  className="text-slate-400 hover:text-white text-xs font-bold"
                >
                  ✕
                </button>
              </div>
              <p className="text-slate-300 mb-2">
                I seguenti numeri DDT non risultano registrati né in locale né sul cloud:
              </p>
              <div className="p-2 bg-slate-950/80 rounded border border-rose-500/30 font-mono text-[11px] text-rose-300 break-words mb-2">
                {gapWarning}
              </div>
              <p className="text-[11px] text-slate-400 italic">
                Verifica che i DDT non siano rimasti salvati solo in bozza o offline.
              </p>
            </div>
          )}
        </div>

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
  );
};
