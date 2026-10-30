import React, { useState, useEffect, useCallback, useRef } from "react";
import { Supplier } from "./types/order";
import { orderRepository } from "./services/orderRepository";
import { orderSyncService } from "./services/orderSyncService";
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
  const [isSyncing, setIsSyncing] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isSearchActive = globalSearchQuery.trim().length > 0;

  // Caricamento fornitori
  const loadSuppliers = useCallback(async () => {
    try {
      const data = await orderRepository.getSuppliers();
      setSuppliers(data);
    } catch (err) {
      console.error("[OrderManagerPage] Errore caricamento fornitori:", err);
    }
  }, []);

  // Sync automatico all'avvio e attivazione Realtime Supabase
  useEffect(() => {
    void loadSuppliers();
    setIsSyncing(true);
    void orderSyncService
      .fullSync()
      .then(() => loadSuppliers())
      .finally(() => setIsSyncing(false));

    void orderSyncService.startRealtime();

    return () => {
      orderSyncService.stopRealtime();
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
    { id: 1, label: "🛍️ Storico Fornitore", color: "#a855f7" },
    { id: 2, label: "📦 Archivio", color: "#8b5cf6" },
    { id: 3, label: "🗑️ Cestino", color: "#ef4444" },
    { id: 4, label: "🏢 Fornitori", color: "#10b981" },
    { id: 5, label: "🕰️ Storico Backup", color: "#f59e0b" },
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
              {isSyncing && (
                <span className="flex items-center gap-1 text-[10px] font-normal text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 animate-pulse">
                  <Cloud className="w-3 h-3" />
                  Sync Supabase...
                </span>
              )}
            </h1>
            <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider font-semibold">
              Gestione e Invio Ordini ai Fornitori
            </p>
          </div>
        </div>

        {/* Barra di Ricerca Globale Multi-Parola */}
        <div className="flex items-center gap-2 w-96 flex-shrink-0 relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--muted-foreground)] pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Cerca in tutto (Attivi, Storico, Archivio, Fornitori)..."
            value={globalSearchQuery}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--primary)] font-medium shadow-inner transition-all"
          />
          {isSearchActive && (
            <button
              onClick={() => setGlobalSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xs font-bold"
              title="Azzera ricerca (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Badge Postazione */}
        <div className="ml-auto flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span className="px-2.5 py-1 rounded-md bg-[var(--background)] border border-[var(--border)] font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Postazione: <strong className="text-[var(--foreground)]">{userName}</strong>
          </span>
        </div>
      </div>

      {/* 2. Tab Bar */}
      <div className="flex items-center bg-[var(--card)] border-b border-[var(--border)] flex-shrink-0 px-2 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isCurrent = !isSearchActive && activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setGlobalSearchQuery("");
                setActiveTab(tab.id);
              }}
              style={{
                borderBottomColor: isCurrent ? tab.color : "transparent",
                color: isCurrent ? "var(--foreground)" : "var(--muted-foreground)",
              }}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                isCurrent ? "bg-[var(--background)]" : "hover:text-[var(--foreground)]"
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}

        {isSearchActive && (
          <div className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-yellow-400 border-b-2 border-yellow-400 bg-[var(--background)]">
            <Search className="w-3.5 h-3.5" />
            <span>Risultati Ricerca</span>
            <button
              onClick={() => setGlobalSearchQuery("")}
              className="ml-1 p-0.5 hover:text-white rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Contenuto Tab */}
      <div className="flex-1 w-full h-full overflow-hidden relative">
        {isSearchActive ? (
          <OrderGlobalSearchTab
            searchQuery={globalSearchQuery}
            suppliers={suppliers}
            currentUser={userName}
            onClearSearch={() => setGlobalSearchQuery("")}
            onRefreshSuppliers={loadSuppliers}
          />
        ) : (
          <>
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
            {activeTab === 5 && <OrderAuditTab />}
          </>
        )}
      </div>
    </div>
  );
};
