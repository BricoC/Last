import { useEffect } from "react";
import { TopNavBar } from "@/shared/components/navigation/TopNavBar";
import { WindowTabBar } from "@/shared/components/navigation/WindowTabBar";
import { DesktopWorkspace } from "@/shared/components/desktop/DesktopWorkspace";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ProductListPage } from "@/features/price-lists/ProductListPage";
import { CustomerPriceListPage } from "@/features/price-lists/CustomerPriceListPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { DDTStudioPage } from "@/features/ddt-studio/DDTStudioPage";
import { DDTListPage } from "@/features/ddt-studio/DDTListPage";
import { DDTArticlesPage } from "@/features/ddt-studio/DDTArticlesPage";
import { ClientListPage } from "@/features/clients/ClientListPage";
import { QuoteStudioPage } from "@/features/quotes/QuoteStudioPage";
import { ElectronicInvoicesPage } from "@/features/invoices/ElectronicInvoicesPage";
import { OrderManagerPage } from "@/features/orders/OrderManagerPage";
import { useThemeStore } from "@/shared/stores/useThemeStore";
import { useUserStore } from "@/shared/stores/useUserStore";
import { Card } from "@/shared/components/ui/card";
import { ShieldAlert } from "lucide-react";

import { ddtIncrementalSyncService } from "@/features/ddt-studio/services/ddtIncrementalSyncService";

export function App() {
  const { applyToDom } = useThemeStore();
  const { currentUser } = useUserStore();

  useEffect(() => {
    // Applica le variabili CSS del tema Grigio L4 all'avvio dell'applicazione
    applyToDom();
  }, [applyToDom]);

  useEffect(() => {
    // Sincronizzazione incrementale automatica all'avvio da Supabase (scarica SOLO i nuovi DDT)
    void ddtIncrementalSyncService.syncNewDdtsFromSupabase().catch((err) => {
      console.warn("[App] Sync incrementale all'avvio non riuscita:", err);
    });
  }, []);

  // Renderer del contenuto delle finestre desktop in base al componentId
  const renderWindowContent = (componentId: string, windowId: string) => {
    switch (componentId) {
      case "dashboard":
        return <DashboardPage />;
      case "orders":
        return <OrderManagerPage windowId={windowId} />;
      case "price-lists":
        return <ProductListPage />;
      case "settings":
        if (currentUser && !currentUser.can_access_settings) {
          return (
            <div className="p-8 max-w-xl mx-auto flex flex-col items-center justify-center text-center space-y-4 select-none">
              <div className="p-4 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">
                <ShieldAlert className="w-10 h-10" />
              </div>
              <h2 className="text-lg font-bold text-[var(--foreground)]">Accesso Riservato</h2>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                L'utente o la postazione attiva (<strong className="text-white">{currentUser.name}</strong>) non dispone dei privilegi per accedere o modificare le Impostazioni di sistema.
              </p>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Per sbloccare l'accesso, seleziona una postazione autorizzata (es. Amministratore) dalla barra superiore o richiedi l'abilitazione dei permessi.
              </p>
            </div>
          );
        }
        return <SettingsPage />;
      case "ddt-studio":
        return <DDTStudioPage windowId={windowId} />;
      case "ddt-list":
        return <DDTListPage />;
      case "ddt-articles":
        return <DDTArticlesPage />;
      case "client-lists":
        return <CustomerPriceListPage />;
      case "clients":
        return <ClientListPage />;
      case "quotes":
        return <QuoteStudioPage windowId={windowId} />;
      case "invoices":
        return <ElectronicInvoicesPage />;
      default:
        return (
          <div className="p-6 max-w-4xl mx-auto">
            <Card title={`Modulo: ${componentId}`} subtitle="Integrazione Desktop Finestra MDI">
              <p className="text-sm text-[var(--muted-foreground)] mt-2">
                Questa finestra è gestita liberamente sul desktop: puoi trascinarla, ridimensionarla, affiancarla o ingrandirla a tutto schermo.
              </p>
            </Card>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* 1. Barra Superiore Moduli di Navigazione Globale (esattamente come in foto) */}
      <TopNavBar />

      {/* 2. Barra Schede Aperte con Frecce di Scorrimento (senza scrollbar native) */}
      <WindowTabBar />

      {/* 3. Area Desktop MDI con supporto Finestre Flottanti, Ridimensionabili e Massimizzabili */}
      <DesktopWorkspace renderContent={renderWindowContent} />
    </div>
  );
}

export default App;
