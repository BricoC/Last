import { SUPABASE_SESSION_UPDATED, getSupabaseSessionEmail, restoreSupabaseSession } from "@/shared/services/supabaseSession";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { TopNavBar } from "@/shared/components/navigation/TopNavBar";
import { WindowTabBar } from "@/shared/components/navigation/WindowTabBar";
import { DesktopWorkspace } from "@/shared/components/desktop/DesktopWorkspace";
import { useThemeStore } from "@/shared/stores/useThemeStore";
import { useUserStore } from "@/shared/stores/useUserStore";
import { Card } from "@/shared/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { hasAnyUnsavedChanges, runAllWindowCloseGuards } from "@/shared/stores/useWindowStore";
import { isPageAllowedForUser } from "@/shared/services/appUserService";
import { UserPasswordModal } from "@/shared/components/ui/UserPasswordModal";
import { AppUpdaterRunner } from "@/shared/components/updater/AppUpdaterRunner";
import { UpdateReadyModal } from "@/shared/components/updater/UpdateReadyModal";
import { useDdtBatchExportStore } from "@/features/ddt-studio/stores/useDdtBatchExportStore";
import { useEasterEggStore } from "@/shared/easter-eggs/useEasterEggStore";


const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ProductListPage = lazy(() => import("@/features/price-lists/ProductListPage").then((module) => ({ default: module.ProductListPage })));
const CustomerPriceListPage = lazy(() => import("@/features/price-lists/CustomerPriceListPage").then((module) => ({ default: module.CustomerPriceListPage })));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const DDTStudioPage = lazy(() => import("@/features/ddt-studio/DDTStudioPage").then((module) => ({ default: module.DDTStudioPage })));
const DDTListPage = lazy(() => import("@/features/ddt-studio/DDTListPage").then((module) => ({ default: module.DDTListPage })));
const DDTArticlesPage = lazy(() => import("@/features/ddt-studio/DDTArticlesPage").then((module) => ({ default: module.DDTArticlesPage })));
const ClientListPage = lazy(() => import("@/features/clients/ClientListPage").then((module) => ({ default: module.ClientListPage })));
const QuoteStudioPage = lazy(() => import("@/features/quotes/QuoteStudioPage").then((module) => ({ default: module.QuoteStudioPage })));
const ElectronicInvoicesPage = lazy(() => import("@/features/invoices/ElectronicInvoicesPage").then((module) => ({ default: module.ElectronicInvoicesPage })));
const OrderManagerPage = lazy(() => import("@/features/orders/OrderManagerPage").then((module) => ({ default: module.OrderManagerPage })));
const OrNumbersPage = lazy(() => import("@/features/or-numbers/OrNumbersPage").then((module) => ({ default: module.OrNumbersPage })));
const OffersPage = lazy(() => import("@/features/offers/OffersPage").then((module) => ({ default: module.OffersPage })));
const NotesPage = lazy(() => import("@/features/notes/NotesPage").then((module) => ({ default: module.NotesPage })));
const SupplierPriceListPage = lazy(() => import("@/features/supplier-price-lists/SupplierPriceListPage").then((module) => ({ default: module.SupplierPriceListPage })));
const ManualCloudImportPage = lazy(() => import("@/features/manual-cloud-import/ManualCloudImportPage").then((module) => ({ default: module.ManualCloudImportPage })));
const OneDriveListiniImportPage = lazy(() => import("@/features/onedrive-listini-import/OneDriveListiniImportPage").then((module) => ({ default: module.OneDriveListiniImportPage })));
const DdtBatchExportRunner = lazy(() => import("@/features/ddt-studio/components/DdtBatchExportRunner").then((module) => ({ default: module.DdtBatchExportRunner })));
const IllidanCinematicOverlay = lazy(() => import("@/shared/easter-eggs/IllidanCinematicOverlay").then((module) => ({ default: module.IllidanCinematicOverlay })));
const EasterEggVaultModal = lazy(() => import("@/shared/easter-eggs/EasterEggVaultModal").then((module) => ({ default: module.EasterEggVaultModal })));
const MgsCodecOverlay = lazy(() => import("@/shared/easter-eggs/MgsCodecOverlay").then((module) => ({ default: module.MgsCodecOverlay })));
const StreetFighterOverlay = lazy(() => import("@/shared/easter-eggs/StreetFighterOverlay").then((module) => ({ default: module.StreetFighterOverlay })));
const Ff9MoguoOverlay = lazy(() => import("@/shared/easter-eggs/Ff9MoguoOverlay").then((module) => ({ default: module.Ff9MoguoOverlay })));
const NierAutomataOverlay = lazy(() => import("@/shared/easter-eggs/NierAutomataOverlay").then((module) => ({ default: module.NierAutomataOverlay })));
const SuperMarioOverlay = lazy(() => import("@/shared/easter-eggs/SuperMarioOverlay").then((module) => ({ default: module.SuperMarioOverlay })));
const MetalSlugOverlay = lazy(() => import("@/shared/easter-eggs/MetalSlugOverlay").then((module) => ({ default: module.MetalSlugOverlay })));
const Ff7VictoryOverlay = lazy(() => import("@/shared/easter-eggs/Ff7VictoryOverlay").then((module) => ({ default: module.Ff7VictoryOverlay })));
const MgsAlertOverlay = lazy(() => import("@/shared/easter-eggs/MgsAlertOverlay").then((module) => ({ default: module.MgsAlertOverlay })));

function renderLazyPage(page: ReactNode) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--muted-foreground)]" role="status">Caricamento modulo…</div>}>
      {page}
    </Suspense>
  );
}

export function App() {
  const { applyToDom } = useThemeStore();
  const {
    isIllidanPlaying,
    isVaultOpen,
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
  const ddtBatchExportActive = useDdtBatchExportStore((state) => Boolean(
    state.isExporting || state.isModalOpen || state.batchRenderDoc || state.successMsg || state.errorMsg
  ));
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
    let disposed = false;
    let realtimeSubscribed = false;
    let unsubscribeRealtime: (() => void) | undefined;

    const ensureRealtimeSubscription = () => {
      if (realtimeSubscribed || !getSupabaseSessionEmail()) return;
      realtimeSubscribed = true;
      void import("@/features/ddt-studio/services/ddtIncrementalSyncService")
        .then(({ ddtIncrementalSyncService }) => {
          if (disposed) return;
          if (!getSupabaseSessionEmail()) {
            realtimeSubscribed = false;
            return;
          }
          unsubscribeRealtime = ddtIncrementalSyncService.subscribeRealtime();
        })
        .catch((error) => {
          realtimeSubscribed = false;
          console.warn("[App] Sottoscrizione Realtime DDT non riuscita:", error);
        });
    };

    const triggerDdtSync = (includePreviousYear: boolean, checkModifiedRecent: boolean, force = false) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const now = Date.now();
      if (!force && now - lastQuickSyncMs < 30_000) return;
      lastQuickSyncMs = now;
      void import("@/features/ddt-studio/services/ddtIncrementalSyncService")
        .then(({ ddtIncrementalSyncService }) => ddtIncrementalSyncService
          .syncNewDdtsFromSupabase({ includePreviousYear, checkModifiedRecent }))
        .catch((err) => {
          console.warn("[App] Sync DDT non riuscita:", err);
        });
      void import("@/features/price-lists/services/priceListSyncService").then(({ priceListSyncService }) =>
        priceListSyncService.syncIncrementalGeneralFromSupabase()).catch(() => {});
      void import("@/features/price-lists/services/priceListSyncService").then(({ priceListSyncService }) =>
        priceListSyncService.syncIncrementalClientiFromSupabase()).catch(() => {});
      void import("@/features/offers/services/offersSyncService").then(({ offersSyncService }) =>
        offersSyncService.sync()).catch(() => {});
    };

    const retryPendingCloudWrites = () => {
      const tasks = [
        import("@/features/clients/services/clientSyncService").then(({ clientSyncService }) =>
          clientSyncService.syncPendingClientsToSupabase()),
        import("@/features/notes/services/notesSyncService").then(({ notesSyncService }) =>
          notesSyncService.retryPendingDeletions()),
        import("@/features/orders/services/orderSupabaseService").then(({ orderSupabaseService }) =>
          orderSupabaseService.processOfflineQueue()),
        import("@/features/offers/services/offersSyncService").then(({ offersSyncService }) =>
          offersSyncService.retryPendingChanges()),
        import("@/features/price-lists/services/priceListSyncService").then(({ priceListSyncService }) =>
          priceListSyncService.retryPendingChanges()),
        import("@/features/invoices/services/electronicInvoicesService").then(({ electronicInvoicesService }) =>
          electronicInvoicesService.retryPendingUploads()),
        import("@/features/quotes/services/quoteSyncService").then(({ QuoteSyncService }) =>
          QuoteSyncService.retryPendingChanges()),
        import("@/features/or-numbers/services/orNumbersRepository").then(({ OrNumbersRepository }) =>
          OrNumbersRepository.retryPendingLogs()),
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
      ensureRealtimeSubscription();
      triggerDdtSync(true, true, true);
      if (typeof navigator === "undefined" || navigator.onLine) {
        retryPendingCloudWrites();
      }
    };

    runStartupSync();
    if (!getSupabaseSessionEmail()) {
      void restoreSupabaseSession();
    }
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
        void import("@/features/orders/services/orderSupabaseService")
          .then(({ orderSupabaseService }) => orderSupabaseService.processOfflineQueue())
          .catch(console.warn);
      }
    }, 15_000);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", runQuickSync);

    return () => {
      disposed = true;
      clearInterval(interval);
      clearInterval(ordersRetry);
      window.removeEventListener(SUPABASE_SESSION_UPDATED, onSessionUpdated);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", runQuickSync);
      unsubscribeRealtime?.();
    };
  }, []);

  // Controllo ed esecuzione silenziosa del backup giornaliero automatico quando l'utente è autenticato
  useEffect(() => {
    if (!currentUser?.name) return;
    const userName = currentUser.name;
    let running = false;
    let checkedDay = "";
    const check = async () => {
      const day = new Date().toDateString();
      if (running || checkedDay === day) return;
      running = true;
      try {
        const { checkAndExecuteDailyBackup } = await import("@/features/settings/services/backupService");
        const result = await checkAndExecuteDailyBackup(userName);
        if (result.ran || result.skippedMultiUser) checkedDay = day;
      } catch (err) {
        console.warn("[App] Backup giornaliero automatico non riuscito:", err);
      } finally {
        running = false;
      }
    };
    void check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
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
            event.preventDefault();
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
        return renderLazyPage(<DashboardPage />);
      case "orders":
        return renderLazyPage(<OrderManagerPage windowId={windowId} />);
      case "price-lists":
        return renderLazyPage(<ProductListPage windowId={windowId} />);
      case "settings":
        return renderLazyPage(<SettingsPage />);
      case "ddt-studio":
        return renderLazyPage(<DDTStudioPage windowId={windowId} />);
      case "ddt-list":
        return renderLazyPage(<DDTListPage />);
      case "ddt-articles":
        return renderLazyPage(<DDTArticlesPage />);
      case "client-lists":
        return renderLazyPage(<CustomerPriceListPage windowId={windowId} />);
      case "clients":
        return renderLazyPage(<ClientListPage />);
      case "quotes":
        return renderLazyPage(<QuoteStudioPage windowId={windowId} />);
      case "invoices":
        return renderLazyPage(<ElectronicInvoicesPage />);
      case "or-numbers":
        return renderLazyPage(<OrNumbersPage windowId={windowId} />);
      case "offers":
        return renderLazyPage(<OffersPage windowId={windowId} />);
      case "notes":
        return renderLazyPage(<NotesPage windowId={windowId} />);
      case "supplier-price-lists":
        return renderLazyPage(<SupplierPriceListPage />);
      case "manual-cloud-import":
        return currentUser?.is_admin ? renderLazyPage(<ManualCloudImportPage />) : null;
      case "onedrive-listini-import":
        return currentUser?.is_admin ? renderLazyPage(<OneDriveListiniImportPage />) : null;
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
      {ddtBatchExportActive && (
        <Suspense fallback={null}>
          <DdtBatchExportRunner />
        </Suspense>
      )}

      {/* Runner Controllo & Download Aggiornamenti Automatici + Modale Riavvio */}
      <AppUpdaterRunner />
      <UpdateReadyModal />

      {/* Easter Egg Vault, Illidan Cinematic Overlay, MGS Codec & Street Fighter */}
      {isIllidanPlaying && <Suspense fallback={null}><IllidanCinematicOverlay /></Suspense>}
      {isVaultOpen && <Suspense fallback={null}><EasterEggVaultModal /></Suspense>}
      {isMgsCodecOpen && <Suspense fallback={null}><MgsCodecOverlay isOpen frequency={activeCodecFreq} onClose={closeMgsCodec} /></Suspense>}
      {streetFighterMove && <Suspense fallback={null}><StreetFighterOverlay move={streetFighterMove} onClose={closeStreetFighter} /></Suspense>}
      {isFf9MoguoActive && <Suspense fallback={null}><Ff9MoguoOverlay isActive stage={ff9MoguoStage} onClose={closeFf9Moguo} /></Suspense>}
      {isNierActive && <Suspense fallback={null}><NierAutomataOverlay isActive onClose={closeNier} /></Suspense>}
      {isMarioActive && <Suspense fallback={null}><SuperMarioOverlay isActive onClose={closeMario} /></Suspense>}
      {isMetalSlugActive && <Suspense fallback={null}><MetalSlugOverlay isActive onClose={closeMetalSlug} /></Suspense>}
      {isFf7Active && <Suspense fallback={null}><Ff7VictoryOverlay isActive onClose={closeFf7} /></Suspense>}
      {isMgsAlertActive && <Suspense fallback={null}><MgsAlertOverlay isActive onStop={stopMgsAlert} /></Suspense>}
    </div>
  );
}

export default App;
