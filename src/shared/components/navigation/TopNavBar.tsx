import { SupabaseStationLogin } from "@/shared/components/SupabaseStationLogin";
import { SUPABASE_SESSION_UPDATED, getSupabaseSessionEmail, subscribeSupabaseSession } from "@/shared/services/supabaseSession";
import React, { useEffect, useSyncExternalStore, useRef, useState, useMemo } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { useUserStore } from "@/shared/stores/useUserStore";
import { useEasterEggStore } from "@/shared/easter-eggs/useEasterEggStore";
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
  ChevronLeft,
  ChevronRight,
  User,
  Cloud,
  Loader2,
  UploadCloud,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  X,
  Truck,
  Database,
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
  { id: "ddt-studio", title: "DDT Studio", componentId: "ddt-studio", icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
  { id: "orders", title: "Order Manager", componentId: "orders", icon: <ShoppingCart className="w-3.5 h-3.5" /> },
  { id: "price-lists", title: "Listino Generale", componentId: "price-lists", icon: <Tag className="w-3.5 h-3.5" /> },
  { id: "client-lists", title: "Listini Clienti", componentId: "client-lists", icon: <UserCheck className="w-3.5 h-3.5" /> },
  { id: "quotes", title: "Preventivi", componentId: "quotes", icon: <Calculator className="w-3.5 h-3.5" /> },
  { id: "offers", title: "Offerte", componentId: "offers", icon: <ClipboardList className="w-3.5 h-3.5" /> },
  { id: "or-numbers", title: "OR Numbers", componentId: "or-numbers", icon: <Hash className="w-3.5 h-3.5" /> },
  { id: "ddt-list", title: "DDT List", componentId: "ddt-list", icon: <FileText className="w-3.5 h-3.5" /> },
  { id: "ddt-articles", title: "DDT Articoli", componentId: "ddt-articles", icon: <ListChecks className="w-3.5 h-3.5" /> },
  { id: "invoices", title: "Fatture Elettroniche", componentId: "invoices", icon: <Receipt className="w-3.5 h-3.5" /> },
  { id: "clients", title: "Clienti", componentId: "clients", icon: <Users className="w-3.5 h-3.5" /> },
  { id: "supplier-price-lists", title: "Listini Fornitori", componentId: "supplier-price-lists", icon: <Truck className="w-3.5 h-3.5" /> },
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

  // Easter Egg Super Mario Bros (Click ripetuti su Dashboard)
  const { isMarioActive, triggerMario, hitMarioBlock } = useEasterEggStore();
  const dashboardClicksRef = useRef(0);
  const dashboardClickTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleDashboardClick = () => {
    // Se Mario è già attivo: ogni click successivo colpisce il blocco per le monete (fino a 7 volte)!
    if (isMarioActive) {
      hitMarioBlock();
      return;
    }

    if (dashboardClickTimerRef.current) {
      clearTimeout(dashboardClickTimerRef.current);
    }
    dashboardClicksRef.current += 1;
    if (dashboardClicksRef.current >= 9) {
      dashboardClicksRef.current = 0;
      triggerMario();
    } else {
      dashboardClickTimerRef.current = setTimeout(() => {
        dashboardClicksRef.current = 0;
      }, 2500);
    }
  };

  const {
    currentVersion,
    status: updaterStatus,
    newVersion: updaterNewVersion,
    releaseDate: updaterReleaseDate,
    releaseNotes: updaterReleaseNotes,
    downloadProgress: updaterDownloadProgress,
    restartApp,
  } = useAppUpdaterStore();

  const [isUpdatePopoverOpen, setIsUpdatePopoverOpen] = useState(false);
  const updateHoverTimeoutRef = useRef<number | null>(null);

  const handleUpdateMouseEnter = () => {
    if (updateHoverTimeoutRef.current) {
      window.clearTimeout(updateHoverTimeoutRef.current);
      updateHoverTimeoutRef.current = null;
    }
    setIsUpdatePopoverOpen(true);
  };

  const handleUpdateMouseLeave = () => {
    updateHoverTimeoutRef.current = window.setTimeout(() => {
      setIsUpdatePopoverOpen(false);
    }, 250);
  };

  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);
  const [dragOverModuleId, setDragOverModuleId] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [gapWarning, setGapWarning] = useState<string | null>(null);
  const [showGapAlert, setShowGapAlert] = useState(false);
  const sessionEmail = useSyncExternalStore(subscribeSupabaseSession, getSupabaseSessionEmail);
  const [showCloudLogin, setShowCloudLogin] = useState(false);
  const [missingCloudTables, setMissingCloudTables] = useState<string[]>([]);
  const [showSchemaAlert, setShowSchemaAlert] = useState(false);
  const [isPopoverHovered, setIsPopoverHovered] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatusInfo | null>(null);
  const [isCheckingCloudStatus, setIsCheckingCloudStatus] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);
  const lastAutoSyncAtRef = useRef<number>(0);
  const autoSyncTimerRef = useRef<number | null>(null);
  const autoSyncPausedRef = useRef<boolean>(false);
  const isSyncingRef = useRef<boolean>(false);

  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    const stored = localStorage.getItem("last_supabase_sync_timestamp");
    if (stored) {
      const d = new Date(stored);
      if (!isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    }
    return null;
  });

  const fetchCloudStatus = async (force = false) => {
    setIsCheckingCloudStatus(true);
    try {
      const s = await cloudSyncStatusService.getStatus(force);
      setCloudStatus(s);
      if (s.localLastSyncDate) {
        const d = s.localLastSyncDate;
        setLastSyncTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
      } else {
        setLastSyncTime(null);
      }

      // Auto-sync silenzioso a basso consumo (Supabase Free):
      // aggiorna automaticamente in background solo quando ci sono dati pendenti, con cooldown 120s.
      // Se dopo un auto-sync restano ancora dati pendenti non inviabili, mette in pausa l'auto-retry
      // per evitare loop continui finché non arriva una nuova modifica o un click manuale.
      const now = Date.now();
      const activeSessionEmail = getSupabaseSessionEmail();
      if (autoSyncTimerRef.current !== null) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
      const hasPending = Boolean(s.hasPendingRemoteChanges || s.hasPendingLocalChanges);
      if (!hasPending) {
        autoSyncPausedRef.current = false;
      } else if (s.canAutoSync && activeSessionEmail && !autoSyncPausedRef.current) {
        const wait = Math.max(0, 120_000 - (now - lastAutoSyncAtRef.current));
        if (wait || isSyncingRef.current) {
          autoSyncTimerRef.current = window.setTimeout(() => void fetchCloudStatus(true), Math.max(2000, wait));
        } else {
          lastAutoSyncAtRef.current = now;
          void handleManualSync(true);
        }
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

  const handleManualSync = async (isAuto = false) => {
    if (isSyncingRef.current) return;
    if (!isAuto) autoSyncPausedRef.current = false;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const res = await cloudSyncStatusService.executeFullSync();
      if (res.ddtResult.unresolvedGaps && res.ddtResult.unresolvedGaps.length > 0) {
        const text = res.ddtResult.unresolvedGaps
          .map((g) => `Anno ${g.year}: DDT mancanti [${g.missingNumbers.join(", ")}]`)
          .join(" | ");
        setGapWarning(text);
      } else {
        setGapWarning(null);
      }
      if (isAuto) {
        // Evita loop infiniti di auto-sync se un record resta pendente dopo il tentativo automatico
        autoSyncPausedRef.current = true;
      }
    } catch (error) {
      if (isAuto) autoSyncPausedRef.current = true;
      console.warn("[TopNavBar] Sincronizzazione cloud:", error);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
    await fetchCloudStatus(true);
  };

  useEffect(() => {
    void fetchCloudStatus(false);
    const onSyncStatusUpdated = () => void fetchCloudStatus(true);
    const onReconnectOrEdit = () => {
      autoSyncPausedRef.current = false;
      void fetchCloudStatus(true);
    };
    window.addEventListener("cloud-sync-status-updated", onSyncStatusUpdated);
    window.addEventListener("online", onReconnectOrEdit);
    const onSessionUpdated = () => {
      setShowCloudLogin(false);
      onReconnectOrEdit();
    };
    window.addEventListener(SUPABASE_SESSION_UPDATED, onSessionUpdated);
    return () => {
      window.removeEventListener("cloud-sync-status-updated", onSyncStatusUpdated);
      window.removeEventListener("online", onReconnectOrEdit);
      window.removeEventListener(SUPABASE_SESSION_UPDATED, onSessionUpdated);
      if (autoSyncTimerRef.current !== null) window.clearTimeout(autoSyncTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const checkCloudSchema = async () => {
      if (!isTauri()) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        const cfg = await invoke<{ config: { projectUrl: string; anonKey: string } | null }>(
          "load_supabase_config"
        ).catch(() => null);
        if (!active || !cfg?.config?.projectUrl || !cfg?.config?.anonKey) return;
        const { checkSupabaseSchemaInitialized } = await import("@/features/settings/data-import/supabaseSchemaSql");
        const result = await checkSupabaseSchemaInitialized(
          cfg.config.projectUrl,
          cfg.config.anonKey
        );
        if (!active) return;
        if (result.status === "missing_tables") {
          setMissingCloudTables(result.missingTables);
          setShowSchemaAlert(true);
        } else if (result.status === "ok") {
          setMissingCloudTables([]);
          setShowSchemaAlert(false);
        }
      } catch {
        // Ignora errori imprevisti di rete: avviso solo su assenza reale delle tabelle
      }
    };

    void checkCloudSchema();
    const onSchemaTrigger = () => void checkCloudSchema();
    window.addEventListener("supabase-config-updated", onSchemaTrigger);
    window.addEventListener(SUPABASE_SESSION_UPDATED, onSchemaTrigger);
    window.addEventListener("online", onSchemaTrigger);
    return () => {
      active = false;
      window.removeEventListener("supabase-config-updated", onSchemaTrigger);
      window.removeEventListener(SUPABASE_SESSION_UPDATED, onSchemaTrigger);
      window.removeEventListener("online", onSchemaTrigger);
    };
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
      const stored = localStorage.getItem("last_supabase_sync_timestamp");
      if (stored) {
        const d = new Date(stored);
        if (!isNaN(d.getTime())) {
          setLastSyncTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
        }
      }
    };
    window.addEventListener("ddt-data-updated", onDdtUpdated);
    return () => window.removeEventListener("ddt-data-updated", onDdtUpdated);
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const modules = ALL_TOPBAR_NAV_MODULES;

  const topbarScrollRef = useRef<HTMLDivElement>(null);

  const scrollTopbar = (direction: "left" | "right") => {
    if (topbarScrollRef.current) {
      topbarScrollRef.current.scrollBy({
        left: direction === "left" ? -220 : 220,
        behavior: "smooth",
      });
    }
  };

  const userOrder =
    currentUser?.topbar_order && currentUser.topbar_order.length > 0
      ? currentUser.topbar_order
      : DEFAULT_TOPBAR_ORDER;

  // Garantisce che per qualsiasi utente abilitato a ddt-studio, il pulsante appaia sempre ben visibile subito dopo dashboard
  const effectiveOrder = useMemo(() => {
    const list = [...userOrder];
    const ddtIdx = list.indexOf("ddt-studio");
    if (ddtIdx > 2) {
      list.splice(ddtIdx, 1);
      const dashIdx = list.indexOf("dashboard");
      list.splice(dashIdx !== -1 ? dashIdx + 1 : 1, 0, "ddt-studio");
    } else if (ddtIdx === -1) {
      const dashIdx = list.indexOf("dashboard");
      list.splice(dashIdx !== -1 ? dashIdx + 1 : 1, 0, "ddt-studio");
    }
    return list;
  }, [userOrder]);

  const visibleModules = [...modules]
    .filter((mod) => isPageAllowedForUser(currentUser, mod.id))
    .sort((a, b) => {
      const idxA = effectiveOrder.indexOf(a.id);
      const idxB = effectiveOrder.indexOf(b.id);
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
    <header className="h-11 bg-[var(--card)] border-b border-[var(--border)] px-1.5 flex items-center justify-between select-none text-[var(--foreground)] transition-colors gap-1.5">
      {/* Freccia Scorrimento Sinistra */}
      <button
        type="button"
        onClick={() => scrollTopbar("left")}
        className="h-7 w-5 flex items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors shrink-0 cursor-pointer"
        title="Scorri barra verso sinistra"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      {/* Lista Moduli Navigazione Primaria (con scrollbar e supporto rotellina del mouse) */}
      <div
        ref={topbarScrollRef}
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
        className="flex-1 min-w-0 flex items-center space-x-1 overflow-x-auto no-scrollbar py-1"
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
                onClick={() => {
                  if (mod.id === "dashboard") {
                    handleDashboardClick();
                  }
                  openWindow({
                    id: mod.id,
                    title: mod.title,
                    componentId: mod.componentId,
                  });
                }}
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

          {/* Pulsante Provvisorio Importazione Listini OneDrive (Solo Admin - Sola Lettura) */}
          {currentUser?.is_admin && (
            <button
              type="button"
              onClick={() =>
                openWindow({
                  id: "onedrive-listini-import",
                  title: "Importa Listini",
                  componentId: "onedrive-listini-import",
                })
              }
              title="Importa nuove voci dai Listini OneDrive in sola lettura (Solo Admin)"
              className={cn(
                "h-7 px-2.5 rounded-md flex items-center space-x-1.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 select-none cursor-pointer border",
                activeWindowId === "onedrive-listini-import"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-sm font-semibold"
                  : "bg-emerald-500/10 text-emerald-400/90 border-emerald-500/30 hover:bg-emerald-500/20 hover:text-emerald-300"
              )}
            >
              <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
              <span>Importa Listini</span>
            </button>
          )}
        </div>

      {/* Freccia Scorrimento Destra */}
      <button
        type="button"
        onClick={() => scrollTopbar("right")}
        className="h-7 w-5 flex items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] transition-colors shrink-0 cursor-pointer"
        title="Scorri barra verso destra"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

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

        {/* Versione del programma e Popover Aggiornamento su Hover */}
        <div
          className="relative flex items-center"
          onMouseEnter={handleUpdateMouseEnter}
          onMouseLeave={handleUpdateMouseLeave}
        >
          {currentVersion && (
            updaterStatus === "ready" ? (
              <button
                type="button"
                onClick={() => setIsUpdatePopoverOpen((prev) => !prev)}
                className="px-2 py-0.5 rounded-md font-mono font-bold text-[11px] bg-sky-500/20 border border-sky-400 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.35)] hover:bg-sky-500/30 transition-all cursor-pointer select-none"
                title={`Versione ${currentVersion} - Nuova versione pronta per l'installazione (passa sopra con il mouse per dettagli)`}
              >
                {currentVersion}
              </button>
            ) : updaterStatus === "downloading" ? (
              <span
                className="px-2 py-0.5 rounded-md font-mono text-[11px] text-sky-300 bg-sky-950/40 border border-sky-800/60 select-none flex items-center gap-1.5"
                title={`Scaricamento aggiornamento v${updaterNewVersion || "..."} in background: ${updaterDownloadProgress}%`}
              >
                <span>{currentVersion}</span>
                <span className="text-[10px] text-sky-400/80 font-sans">({updaterDownloadProgress}%)</span>
              </span>
            ) : (
              <span
                className="text-[11px] font-mono font-medium text-[var(--muted-foreground)] opacity-70 px-1 py-0.5 select-none"
                title={`Versione installata: ${currentVersion}`}
              >
                {currentVersion}
              </span>
            )
          )}

          {/* Popover su Hover quando l'aggiornamento è pronto */}
          {updaterStatus === "ready" && isUpdatePopoverOpen && (
            <div
              className="absolute right-0 top-full mt-2 z-50 w-84 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xl text-[var(--foreground)] animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md"
            >
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[var(--border)]/60">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-300 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Nuova Versione Disponibile</h4>
                    <span className="text-[10px] text-sky-300 font-mono font-semibold">
                      Pronta per l'installazione
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUpdatePopoverOpen(false)}
                  className="text-[var(--muted-foreground)] hover:text-white p-0.5 rounded cursor-pointer transition-colors"
                  title="Chiudi avviso"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Informazioni sulle versioni e data rilascio */}
              <div className="py-3 space-y-2.5">
                <div className="p-2.5 rounded-lg bg-[var(--background)]/80 border border-[var(--border)] flex items-center justify-between font-mono text-xs">
                  <div>
                    <span className="text-[9.5px] uppercase text-[var(--muted-foreground)] block font-sans">Attuale</span>
                    <span className="font-semibold text-zinc-300">v{currentVersion}</span>
                  </div>
                  <div className="text-sky-400 px-1 font-sans">→</div>
                  <div>
                    <span className="text-[9.5px] uppercase text-sky-400 block font-bold font-sans">Nuova versione</span>
                    <span className="font-extrabold text-sky-200">v{updaterNewVersion || "..."}</span>
                  </div>
                  {updaterReleaseDate && (
                    <div className="text-right pl-2 border-l border-[var(--border)]/60 font-sans">
                      <span className="text-[9.5px] uppercase text-[var(--muted-foreground)] block">Rilasciata</span>
                      <span className="text-[11px] text-zinc-300 font-medium">
                        {new Date(updaterReleaseDate).toLocaleDateString("it-IT")}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-2.5 rounded-lg bg-sky-950/30 border border-sky-800/40 text-[11px] text-sky-200/90 leading-relaxed">
                  💡 È disponibile la versione <strong>v{updaterNewVersion}</strong>{updaterReleaseDate ? ` del ${new Date(updaterReleaseDate).toLocaleDateString("it-IT")}` : ""}. Il pacchetto è già pronto.
                  <span className="block mt-1 font-medium text-amber-200/90">
                    Non verrà installato automaticamente: puoi scegliere tu se e quando aggiornare.
                  </span>
                </div>

                {updaterReleaseNotes && (
                  <div className="p-2 rounded-lg bg-zinc-950/40 border border-[var(--border)]/60 text-[11px] text-zinc-300 max-h-24 overflow-y-auto font-sans leading-relaxed">
                    <span className="text-[9.5px] uppercase font-bold text-[var(--muted-foreground)] block mb-0.5">
                      Note di rilascio:
                    </span>
                    <div className="whitespace-pre-wrap">{updaterReleaseNotes}</div>
                  </div>
                )}
              </div>

              <div className="pt-2.5 border-t border-[var(--border)]/60 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsUpdatePopoverOpen(false)}
                  className="px-2.5 py-1.5 rounded-md text-[11px] text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--background)] transition-colors cursor-pointer"
                >
                  Più tardi
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsUpdatePopoverOpen(false);
                    void restartApp();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-md transition-all cursor-pointer active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Installa e Riavvia Ora</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Indicatore e Pulsante Cloud Sync Supabase con Hover Popover */}
        <div
          className="relative flex items-center"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <button
            type="button"
            onClick={sessionEmail ? () => void handleManualSync(false) : () => setShowCloudLogin((open) => !open)}
            aria-expanded={sessionEmail ? undefined : showCloudLogin}
            disabled={isSyncing}
            className={cn(
              "flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer",
              isSyncing
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                : gapWarning
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                : cloudStatus?.error || cloudStatus?.hasPendingRemoteChanges || cloudStatus?.hasPendingLocalChanges
                ? "bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30"
                : lastSyncTime
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                : "bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
            title="Sincronizzazione Cloud Supabase (Passa sopra con il mouse per visualizzare data ultimo scaricamento e stato effettivo del Cloud)"
          >
            {isSyncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : gapWarning || cloudStatus?.error ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            ) : cloudStatus?.hasPendingRemoteChanges || cloudStatus?.hasPendingLocalChanges ? (
              <Cloud className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>
              {!sessionEmail
                ? "Accedi al Cloud"
                : isSyncing
                ? "Sync in corso..."
                : cloudStatus?.error
                ? "Cloud: verifica incompleta"
                : cloudStatus?.hasPendingRemoteChanges
                ? "Cloud: Nuovi dati!"
                : cloudStatus?.hasPendingLocalChanges
                ? "Cloud: Dati da inviare"
                : lastSyncTime
                ? `Cloud: ${lastSyncTime}`
                : "Cloud Sync"}
            </span>
          </button>

          {/* Hover Popover: Dettaglio ultimo scaricamento locale vs effettivo aggiornamento Supabase */}
          {showCloudLogin && !sessionEmail && (
            <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-lg">
              <SupabaseStationLogin />
            </div>
          )}
          {sessionEmail && isPopoverHovered && (
            <CloudSyncHoverPopover
              status={cloudStatus}
              isLoading={isCheckingCloudStatus}
              isSyncing={isSyncing}
              onRefreshStatus={() => void fetchCloudStatus(true)}
              onExecuteSync={() => void handleManualSync()}
            />
          )}

          {/* Badge & Popup Assenza Tabelle Database Online su Supabase */}
          {missingCloudTables.length > 0 && (
            <div className="relative flex items-center mr-1.5">
              <button
                type="button"
                onClick={() => setShowSchemaAlert((prev) => !prev)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500/30 transition-colors text-[11px] font-bold cursor-pointer animate-pulse"
                title="Tabelle database mancanti su Supabase: clicca per istruzioni"
              >
                <Database className="w-3.5 h-3.5 text-rose-400" />
                <span>DB Cloud assente</span>
              </button>

              {showSchemaAlert && (
                <div className="absolute right-0 top-9 z-50 w-96 p-3.5 bg-slate-900 border border-rose-500/60 shadow-2xl rounded-lg text-slate-100 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-rose-500/30 mb-2">
                    <span className="font-bold text-rose-400 flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-rose-400" />
                      Database online non inizializzato
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSchemaAlert(false)}
                      className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-slate-200 leading-relaxed mb-2">
                    Il programma è collegato a Supabase, ma le tabelle necessarie non esistono su questo Cloud (
                    <span className="font-mono text-rose-300">{missingCloudTables.join(", ")}</span>).
                  </p>
                  <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
                    L&apos;amministratore deve accedere a <strong>Impostazioni → Cloud &amp; Database</strong>, cliccare su{" "}
                    <strong>Copia SQL</strong> ed eseguire lo script nel SQL Editor di Supabase.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    {isPageAllowedForUser(currentUser, "settings") && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowSchemaAlert(false);
                          openWindow({
                            id: "settings",
                            title: "Impostazioni",
                            componentId: "settings",
                          });
                          setTimeout(() => {
                            window.dispatchEvent(
                              new CustomEvent("open-settings-tab", { detail: "database" })
                            );
                          }, 50);
                        }}
                        className="px-2.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] transition-colors cursor-pointer"
                      >
                        Apri Impostazioni (Copia SQL)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSchemaAlert(false)}
                      className="px-2.5 py-1.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition-colors cursor-pointer"
                    >
                      Chiudi
                    </button>
                  </div>
                </div>
              )}
            </div>
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
            title="Impostazioni"
            onClick={() =>
              openWindow({
                id: "settings",
                title: "Impostazioni",
                componentId: "settings",
              })
            }
            className={cn(
              "h-7 w-7 rounded-md flex items-center justify-center transition-colors cursor-pointer",
              activeWindowId === "settings"
                ? "bg-[var(--background)] text-[var(--foreground)] border border-[var(--primary)] shadow-sm font-semibold"
                : "text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
            )}
          >
            <SettingsIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          </button>
        )}
      </div>
    </header>
  );
};
