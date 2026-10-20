import { useEffect } from "react";
import { TabBar } from "@/shared/components/tabs/TabBar";
import { SplitPaneContainer } from "@/shared/components/tabs/SplitPaneContainer";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { useThemeStore } from "@/shared/stores/useThemeStore";
import { Card } from "@/shared/components/ui/card";

export function App() {
  const { applyToDom } = useThemeStore();

  useEffect(() => {
    // Applica le variabili CSS del tema all'avvio dell'applicazione
    applyToDom();
  }, [applyToDom]);

  // Renderer del contenuto della scheda in base all'id
  const renderTabContent = (tabId: string) => {
    switch (tabId) {
      case "dashboard":
        return <DashboardPage />;
      case "price-lists":
        return (
          <div className="p-6">
            <Card title="Modulo Listino Generale">
              <p className="text-sm text-slate-300">
                Modulo predisposto per Glide Data Grid (griglia interattiva Excel-like).
              </p>
            </Card>
          </div>
        );
      case "ddt-studio":
        return (
          <div className="p-6">
            <Card title="Modulo DDT Studio (Pro)">
              <p className="text-sm text-slate-300">
                Modulo predisposto per l'editor DDT con anteprima A4 vettoriale millimetrica BricoClass.
              </p>
            </Card>
          </div>
        );
      default:
        return (
          <div className="p-6">
            <Card title={`Scheda: ${tabId}`}>
              <p className="text-sm text-slate-400">
                Contenuto per la scheda selezionata. Puoi affiancarla cliccando su "Affianca" in alto a destra.
              </p>
            </Card>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Barra superiore delle schede stile browser con supporto Split */}
      <TabBar />

      {/* Area principale con supporto affiancamento a due finestre */}
      <SplitPaneContainer renderContent={renderTabContent} />
    </div>
  );
}

export default App;
