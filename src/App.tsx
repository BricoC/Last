import { SUPABASE_SESSION_UPDATED, getSupabaseSessionEmail, restoreSupabaseSession } from "@/shared/services/supabaseSession";
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
import { OrNumbersPage } from "@/features/or-numbers/OrNumbersPage";
import { OrNumbersRepository } from "@/features/or-numbers/services/orNumbersRepository";
import { OffersPage } from "@/features/offers/OffersPage";
import { NotesPage } from "@/features/notes/NotesPage";
import { notesSyncService } from "@/features/notes/services/notesSyncService";
import { offersSyncService } from "@/features/offers/services/offersSyncService";
import { orderSupabaseService } from "@/features/orders/services/orderSupabaseService";
import { priceListSyncService } from "@/features/price-lists/services/priceListSyncService";
import { electronicInvoicesService } from "@/features/invoices/services/electronicInvoicesService";
import { QuoteSyncService } from "@/features/quotes/services/quoteSyncService";
import { SupplierPriceListPage } from "@/features/supplier-price-lists/SupplierPriceListPage";
import { ManualCloudImportPage } from "@/features/manual-cloud-import/ManualCloudImportPage";
import { useThemeStore } from "@/shared/stores/useThemeStore";
import { useUserStore } from "@/shared/stores/useUserStore";
import { Card } from "@/shared/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { hasAnyUnsavedChanges, runAllWindowCloseGuards } from "@/shared/stores/useWindowStore";
import { isPageAllowedForUser } from "@/shared/services/appUserService";
import { UserPasswordModal } from "@/shared/components/ui/UserPasswordModal";
import { DdtBatchExportRunner } from "@/features/ddt-studio/components/DdtBatchExportRunner";
import { AppUpdaterRunner } from "@/shared/components/updater/AppUpdaterRunner";
import { UpdateReadyModal } from "@/shared/components/updater/UpdateReadyModal";
import { IllidanCinematicOverlay } from "@/shared/easter-eggs/IllidanCinematicOverlay";
import { EasterEggVaultModal } from "@/shared/easter-eggs/EasterEggVaultModal";
import { MgsCodecOverlay } from "@/shared/easter-eggs/MgsCodecOverlay";
import { StreetFighterOverlay } from "@/shared/easter-eggs/StreetFighterOverlay";
import { Ff9MoguoOverlay } from "@/shared/easter-eggs/Ff9MoguoOverlay";
import { NierAutomataOverlay } from "@/shared/easter-eggs/NierAutomataOverlay";
import { SuperMarioOverlay } from "@/shared/easter-eggs/SuperMarioOverlay";
import { MetalSlugOverlay } from "@/shared/easter-eggs/MetalSlugOverlay";
import { Ff7VictoryOverlay } from "@/shared/easter-eggs/Ff7VictoryOverlay";
import { MgsAlertOverlay } from "@/shared/easter-eggs/MgsAlertOverlay";
import { useEasterEggStore } from "@/shared/easter-eggs/useEasterEggStore";

import { ddtIncrementalSyncService } from "@/features/ddt-studio/services/ddtIncrementalSyncService";
import { clientSyncService } from "@/features/clients/services/clientSyncService";
import { checkAndExecuteDailyBackup } from "@/features/settings/services/backupService";

export function App() {
  const { applyToDom } = useThemeStore();
  const {
    isMgsCodecOpen,
    activeCodecFreq,
    closeMgsCodec,
    streetFighterMove,
    closeStreetFighter,
    isFf9MoguoActive,
    ff9MoguoStage,
    closeFf9Moguo,
    isNierActive,
    closeNier,
    isMarioActive,
    closeMario,
    isMetalSlugActive,
    closeMetalSlug,
    isFf7Active,
    closeFf7,
    isMgsAlertActive,
    stopMgsAlert,
  } = useEasterEggStore();
  const {
    currentUser,
    users,
    loadError,
    loadUsers,
    pendingPasswordSwitch,
    cancelPasswordSwitch,
    confirmPasswordSwitch,
    requestSwitchUser,
  } = useUserStore();

  useEffect(() => {
    // Applica le variabili CSS del tema Grigio L4 all'avvio dell'applicazione
    applyToDom();
  }, [applyToDom]);

  useEffect(() => {
    // Sincronizzazione bidirezionale DDT all'avvio, Realtime Supabase (<1s), polling leggero di sicurezza (2 min) e sync su online/focus con throttle
    let lastQuickSyncMs = 0;

    const triggerDdtSync = (includePreviousYear: boolean, checkModifiedRecent: boolean, force = false) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const now = Date.now();
      if (!force && now - lastQuickSyncMs < 30_000) return;
      lastQuickSyncMs = now;
      void ddtIncrementalSyncService
        .syncNewDdtsFromSupabase({ includePreviousYear, checkModifiedRecent })
        .catch((err) => {
          console.warn("[App] Sync DDT non riuscita:", err);
        });
      void priceListSyncService.syncIncrementalGeneralFromSupabase().catch(() => {});
      void priceListSyncService.syncIncrementalClientiFromSupabase().catch(() => {});
      void offersSyncService.sync().catch(() => {});
    };

    const retryPendingCloudWrites = () => {
      const tasks = [
        clientSyncService.syncPendingClientsToSupabase(), notesSyncService.retryPendingDeletions(),
        orderSupabaseService.processOfflineQueue(), offersSyncService.retryPendingChanges(),
        priceListSyncService.retryPendingChanges(), electronicInvoicesService.retryPendingUploads(),
        QuoteSyncService.retryPendingChanges(),
        OrNumbersRepository.retryPendingLogs(),
      ];
      for (const task of tasks) void task.catch((error) => console.warn("[App] Operazione cloud in sospeso:", error));
    };

    const runQuickSync = () => {
      if (!getSupabaseSessionEmail() || (typeof navigator !== "undefined" && !navigator.onLine)) return;
      triggerDdtSync(false, true, false);
      retryPendingCloudWrites();
    };
    const runStartupSync = () => {
      if (!getSupabaseSessionEmail()) return;
      triggerDdtSync(true, true, true);
      if (typeof navigator === "undefined" || navigator.onLine) {
        retryPendingCloudWrites();
      }
    };

    runStartupSync();
    if (!getSupabaseSessionEmail()) {
      void restoreSupabaseSession();
    }
    const unsubscribeRealtime = ddtIncrementalSyncService.subscribeRealtime();

    const onOnline = () => {
      if (!getSupabaseSessionEmail()) {
        void restoreSupabaseSession();
      } else {
        runQuickSync();
      }
    };
    const onSessionUpdated = () => {
      runStartupSync();
    };
    window.addEventListener(SUPABASE_SESSION_UPDATED, onSessionUpdated);
    const interval = setInterval(runQuickSync, 120_000);
    const ordersRetry = setInterval(() => {
      if (getSupabaseSessionEmail() && navigator.onLine) {
        void orderSupabaseService.processOfflineQueue().catch(console.warn);
      }
    }, 15_000);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", runQuickSync);

    return () => {
      clearInterval(interval);
      clearInterval(ordersRetry);
      window.removeEventListener(SUPABASE_SESSION_UPDATED, onSessionUpdated);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", runQuickSync);
      unsubscribeRealtime();
    };
  }, []);

  // Controllo ed esecuzione silenziosa del backup giornaliero automatico quando l'utente è autenticato
  useEffect(() => {
    if (currentUser?.name) {
      void checkAndExecuteDailyBackup(currentUser.name).catch((err) => {
        console.warn("[App] Backup giornaliero automatico non riuscito:", err);
      });
    }
  }, [currentUser?.name]);

  // Blocco di sicurezza chiusura browser/tab in caso di modifiche non salvate
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasAnyUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Blocco di sicurezza chiusura applicazione Desktop (Tauri)
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => {
        return getCurrentWindow().onCloseRequested(async (event) => {
          if (!hasAnyUnsavedChanges()) {
            return;
          }
          try {
            const allowed = await runAllWindowCloseGuards();
            if (!allowed) {
              event.preventDefault();
            }
          } catch (e) {
            console.warn("[App] Errore verifica modifiche non salvate in chiusura:", e);
          }
        });
      })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((err) => {
        console.warn("[App] Registrazione onCloseRequested non riuscita:", err);
      });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Renderer del contenuto delle finestre desktop in base al componentId
  const renderWindowContent = (componentId: string, windowId: string) => {
    if (!currentUser) {
      return null;
    }
    if (!isPageAllowedForUser(currentUser, componentId)) {
      return (
        <div className="p-8 max-w-xl mx-auto flex flex-col items-center justify-center text-center space-y-4 select-none">
          <div className="p-4 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">
            <ShieldAlert className="w-10 h-10" />
          </div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">Accesso Riservato</h2>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
            L'utente o la postazione attiva (<strong className="text-white">{currentUser.name}</strong>) non dispone dei privilegi per accedere alla schermata selezionata.
          </p>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Per abilitare la visualizzazione di questa pagina per questa postazione, accedi con un account Admin e abilita il modulo in Impostazioni &rarr; Utenti e Postazioni.
          </p>
        </div>
      );
    }

    switch (componentId) {
      case "dashboard":
        return <DashboardPage />;
      case "orders":
        return <OrderManagerPage windowId={windowId} />;
      case "price-lists":
        return <ProductListPage windowId={windowId} />;
      case "settings":
        return <SettingsPage />;
      case "ddt-studio":
        return <DDTStudioPage windowId={windowId} />;
      case "ddt-list":
        return <DDTListPage />;
      case "ddt-articles":
        return <DDTArticlesPage />;
      case "client-lists":
        return <CustomerPriceListPage windowId={windowId} />;
      case "clients":
        return <ClientListPage />;
      case "quotes":
        return <QuoteStudioPage windowId={windowId} />;
      case "invoices":
        return <ElectronicInvoicesPage />;
      case "or-numbers":
        return <OrNumbersPage windowId={windowId} />;
      case "offers":
        return <OffersPage windowId={windowId} />;
      case "notes":
        return <NotesPage windowId={windowId} />;
      case "supplier-price-lists":
        return <SupplierPriceListPage />;
      case "manual-cloud-import":
        return currentUser?.is_admin ? <ManualCloudImportPage /> : null;
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

      {/* Blocco esplicito se la lettura utenti SQLite fallisce (nessun fallback ad Admin) */}
      {loadError && !currentUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-[var(--card)] p-6 text-[var(--foreground)] shadow-2xl">
            <h2 className="text-base font-bold text-red-400">Errore lettura utenti locali</h2>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Impossibile verificare i profili locali dal database. L&apos;accesso resta bloccato per sicurezza.
            </p>
            <p className="mt-2 rounded bg-[var(--background)] p-2 font-mono text-[11px] text-red-300">
              {loadError}
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void loadUsers()}
                className="rounded bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-[var(--primary-foreground)] cursor-pointer"
              >
                Riprova
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale / Schermata Password Utente (Sblocco all'avvio / F5 e Cambio Utente) */}
      <UserPasswordModal
        isOpen={Boolean(pendingPasswordSwitch)}
        targetUser={pendingPasswordSwitch}
        isStartupLock={!currentUser && Boolean(pendingPasswordSwitch)}
        availableUsers={users}
        onSelectUser={(userId) => void requestSwitchUser(userId)}
        onCancel={cancelPasswordSwitch}
        onConfirm={confirmPasswordSwitch}
      />

      {/* Runner Esportazione Report DDT in Background & Floating Widget */}
      <DdtBatchExportRunner />

      {/* Runner Controllo & Download Aggiornamenti Automatici + Modale Riavvio */}
      <AppUpdaterRunner />
      <UpdateReadyModal />

      {/* Easter Egg Vault, Illidan Cinematic Overlay, MGS Codec & Street Fighter */}
      <IllidanCinematicOverlay />
      <EasterEggVaultModal />
      <MgsCodecOverlay
        isOpen={isMgsCodecOpen}
        frequency={activeCodecFreq}
        onClose={closeMgsCodec}
      />
      <StreetFighterOverlay
        move={streetFighterMove}
        onClose={closeStreetFighter}
      />
      <Ff9MoguoOverlay
        isActive={isFf9MoguoActive}
        stage={ff9MoguoStage}
        onClose={closeFf9Moguo}
      />
      <NierAutomataOverlay
        isActive={isNierActive}
        onClose={closeNier}
      />
      <SuperMarioOverlay
        isActive={isMarioActive}
        onClose={closeMario}
      />
      <MetalSlugOverlay
        isActive={isMetalSlugActive}
        onClose={closeMetalSlug}
      />
      <Ff7VictoryOverlay
        isActive={isFf7Active}
        onClose={closeFf7}
      />
      <MgsAlertOverlay
        isActive={isMgsAlertActive}
        onStop={stopMgsAlert}
      />
    </div>
  );
}

export default App;
