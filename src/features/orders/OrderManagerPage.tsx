import React, { useState, useEffect, useCallback, useRef } from "react";
import { Supplier } from "./types/order";
import { orderSupabaseService } from "./services/orderSupabaseService";
import { ORDER_GRID_CSS } from "./utils/constants";
import { OrdersActiveTab } from "./components/OrdersActiveTab";
import { OrdersArchiveTab } from "./components/OrdersArchiveTab";
import { SupplierHistoryTab } from "./components/SupplierHistoryTab";
import { OrdersTrashTab } from "./components/OrdersTrashTab";
import { SuppliersTab } from "./components/SuppliersTab";
import { OrderAuditTab } from "./components/OrderAuditTab";
import { OrderGlobalSearchTab } from "./components/OrderGlobalSearchTab";
import { useUserStore } from "@/shared/stores/useUserStore";
import {
  Search,
  X,
  ShoppingCart,
  Cloud,
  CloudOff,
  Clock,
} from "lucide-react";

interface OrderManagerPageProps {
  windowId?: string;
}

export const OrderManagerPage: React.FC<OrderManagerPageProps> = () => {
  const { currentUser } = useUserStore();
  const userName = currentUser?.name || "Operatore";

  const [activeTab, setActiveTab] = useState<number>(0);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [queueCount, setQueueCount] = useState<number>(() => orderSupabaseService.getOfflineQueue().length);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isSearchActive = globalSearchQuery.trim().length > 0;

  // Caricamento fornitori direttamente da Supabase Cloud (con fallback offline)
  const loadSuppliers = useCallback(async () => {
    try {
      const data = await orderSupabaseService.fetchSuppliers();
      setSuppliers(data);
    } catch (err) {
      console.error("[OrderManagerPage] Errore caricamento fornitori:", err);
    }
  }, []);

  // Avvio Realtime WebSocket e monitoraggio connessione / coda offline
  useEffect(() => {
    void loadSuppliers();
    void orderSupabaseService.startRealtime();

    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        void orderSupabaseService.processOfflineQueue();
      }
      setQueueCount(orderSupabaseService.getOfflineQueue().length);
    };

    const handleQueueSynced = (_e: any) => {
      setQueueCount(orderSupabaseService.getOfflineQueue().length);
      void loadSuppliers();
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    window.addEventListener("order_offline_queue_synced", handleQueueSynced);

    // Controlla la coda ogni 10 secondi
    const interval = setInterval(() => {
      setQueueCount(orderSupabaseService.getOfflineQueue().length);
    }, 10000);

    return () => {
      orderSupabaseService.stopRealtime();
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      window.removeEventListener("order_offline_queue_synced", handleQueueSynced);
      clearInterval(interval);
    };
  }, [loadSuppliers]);

  // Gestione tasto Escape per chiudere la ricerca
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSearchActive) {
        setGlobalSearchQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchActive]);

  const tabs = [
    { id: 0, label: "📋 Ordini Attivi", color: "var(--primary)" },
    { id: 1, label: "📜 Storico Fornitore", color: "#a855f7" },
    { id: 2, label: "📦 Archivio", color: "#8b5cf6" },
    { id: 3, label: "🗑️ Cestino", color: "#ef4444" },
    { id: 4, label: "👥 Fornitori", color: "#10b981" },
    { id: 5, label: "⏱️ Storico Backup", color: "#f59e0b" },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[var(--background)] text-[var(--foreground)] overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: ORDER_GRID_CSS }} />

      {/* 1. Header Principale con Titolo e Barra Ricerca Globale */}
      <div className="flex items-center gap-5 px-5 py-2.5 bg-[var(--card)] border-b border-[var(--border)] flex-shrink-0 shadow-xs">
        {/* Titolo e Icona */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[var(--foreground)] flex items-center gap-2">
              <span>Order Manager</span>
            </h1>
            <p className="text-[10px] text-[var(--muted-foreground)] tracking-wide uppercase font-semibold">
              Gestione e Invio Ordini ai Fornitori
            </p>
          </div>
        </div>

        {/* Barra di Ricerca Globale Integrata (Attivi, Storico, Archivio, Fornitori) */}
        <div className="flex-1 max-w-xl relative">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 text-[var(--muted-foreground)] pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="Cerca in tutto (Attivi, Storico, Archivio, Fornitori)... [Esc per chiudere]"
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg pl-9 pr-8 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-all"
            />
            {isSearchActive && (
              <button
                onClick={() => setGlobalSearchQuery("")}
                className="absolute right-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded-md"
                title="Cancella ricerca (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Badge Stato Connessione Cloud / Coda Offline */}
        <div className="flex items-center gap-3 ml-auto text-xs flex-shrink-0">
          {queueCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
              <Clock className="w-3 h-3" />
              <span>{queueCount} in coda offline</span>
            </div>
          )}

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${
              isOnline
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {isOnline ? <Cloud className="w-3 h-3 text-emerald-400" /> : <CloudOff className="w-3 h-3 text-red-400" />}
            <span>{isOnline ? "Cloud Online" : "Modalità Offline"}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Postazione: {userName}</span>
          </div>
        </div>
      </div>

      {/* 2. Visualizzazione Risultati Ricerca Globale SE la ricerca è attiva */}
      {isSearchActive ? (
        <div className="flex-1 overflow-hidden p-2">
          <OrderGlobalSearchTab
            searchQuery={globalSearchQuery}
            suppliers={suppliers}
            currentUser={userName}
            onClearSearch={() => setGlobalSearchQuery("")}
            onRefreshSuppliers={loadSuppliers}
          />
        </div>
      ) : (
        /* 3. Sistema di Navigazione Tab Orizzontale a Bottoni */
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-1 px-5 pt-2 pb-0 bg-[var(--card)] border-b border-[var(--border)] flex-shrink-0 select-none">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-semibold tracking-wide transition-all border-t border-x cursor-pointer ${
                    isActive
                      ? "bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] shadow-xs -mb-[1px] pb-[9px]"
                      : "bg-transparent border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]/50"
                  }`}
                  style={{
                    borderTopColor: isActive ? tab.color : "transparent",
                    borderTopWidth: isActive ? "2px" : "1px",
                  }}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* 4. Area Contenuto del Tab Attivo */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 0 && (
              <OrdersActiveTab
                suppliers={suppliers}
                currentUser={userName}
                onRefreshData={loadSuppliers}
                targetOrderId={targetOrderId}
                clearTargetOrder={() => setTargetOrderId(null)}
              />
            )}
            {activeTab === 1 && (
              <SupplierHistoryTab
                suppliers={suppliers}
                currentUser={userName}
                onNavigateToActive={() => setActiveTab(0)}
              />
            )}
            {activeTab === 2 && (
              <OrdersArchiveTab
                currentUser={userName}
                onRefreshData={loadSuppliers}
                targetOrderId={targetOrderId}
                clearTargetOrder={() => setTargetOrderId(null)}
              />
            )}
            {activeTab === 3 && (
              <OrdersTrashTab
                currentUser={userName}
                onRefreshData={loadSuppliers}
                targetOrderId={targetOrderId}
                clearTargetOrder={() => setTargetOrderId(null)}
              />
            )}
            {activeTab === 4 && (
              <SuppliersTab
                suppliers={suppliers}
                currentUser={userName}
                onRefreshSuppliers={loadSuppliers}
              />
            )}
            {activeTab === 5 && (
              <OrderAuditTab />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
