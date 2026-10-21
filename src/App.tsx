import { useEffect } from "react";
import { TopNavBar } from "@/shared/components/navigation/TopNavBar";
import { WindowTabBar } from "@/shared/components/navigation/WindowTabBar";
import { DesktopWorkspace } from "@/shared/components/desktop/DesktopWorkspace";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ProductListPage } from "@/features/price-lists/ProductListPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { useThemeStore } from "@/shared/stores/useThemeStore";
import { Card } from "@/shared/components/ui/card";

export function App() {
  const { applyToDom } = useThemeStore();

  useEffect(() => {
    // Applica le variabili CSS del tema Grigio L4 all'avvio dell'applicazione
    applyToDom();
  }, [applyToDom]);

  // Renderer del contenuto delle finestre desktop in base al componentId
  const renderWindowContent = (componentId: string) => {
    switch (componentId) {
      case "dashboard":
        return <DashboardPage />;
      case "price-lists":
        return <ProductListPage />;
      case "settings":
        return <SettingsPage />;
      case "ddt-studio":
        return (
          <div className="p-6 max-w-4xl mx-auto">
            <Card title="Modulo DDT Studio (Pro)" subtitle="Editor A4 Millimetrico">
              <p className="text-sm text-slate-300">
                Modulo predisposto per l'editor DDT vettoriale millimetrico (210mm × 297mm) con stampa a 300 DPI e invio diretto tramite Microsoft Outlook.
              </p>
            </Card>
          </div>
        );
      default:
        return (
          <div className="p-6 max-w-4xl mx-auto">
            <Card title={`Modulo: ${componentId}`} subtitle="Integrazione Desktop Finestra MDI">
              <p className="text-sm text-slate-400">
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
