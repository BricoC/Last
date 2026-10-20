# 📋 Report Architetturale Completo — NoManV1

> **Scopo di questo documento:** Fornire una panoramica completa e dettagliata del progetto NoManV1 per servire come contesto di partenza per un nuovo agente AI che deve continuare/ricostruire il progetto.

---

## 1. IDENTITÀ DEL PROGETTO

**NoManV1** è un **gestionale desktop per negozio** (specificamente per un'attività commerciale di tipo "BricoClass") costruito come applicazione **Tauri v1** (Rust + React). Si occupa della gestione quotidiana dell'attività commerciale: DDT (Documenti di Trasporto), listini prezzi, clienti, ordini fornitori, fatture elettroniche, preventivi, note aziendali e integrazione email via Outlook.

**L'applicazione è pensata per girare esclusivamente su Windows**, dato il forte accoppiamento con PowerShell e l'automazione COM di Microsoft Outlook.

---

## 2. STACK TECNOLOGICO

### 2.1 Frontend (React + Vite)
| Tecnologia | Versione | Ruolo |
|---|---|---|
| **React** | 18.2 | Framework UI |
| **Vite** | 4.4 | Bundler/Dev Server |
| **React Router DOM** | 6.20 | Routing (client-side) |
| **Redux Toolkit** | 2.0 | State management globale |
| **TailwindCSS** | 3.3 | CSS utility-first |
| **MUI (Material UI)** | 9.4 | Icone (`@mui/icons-material`) |
| **Emotion** | 11.14 | CSS-in-JS per MUI |
| **AG Grid** | 31.3 | Tabelle dati ad alte performance |
| **AG Charts** | 9.0 | Grafici (dashboard) |
| **Framer Motion** | 12.24 | Animazioni e transizioni |
| **Day.js** | 1.11 | Manipolazione date |
| **PapaParse** | 5.4 | Parsing CSV |
| **xlsx (SheetJS)** | 0.18 | Lettura/scrittura file Excel |
| **jsPDF** | 3.0 | Generazione PDF lato client |
| **html2canvas** | 1.4 | Screenshot DOM → Canvas (per PDF) |
| **DOMPurify** | 3.2 | Sanitizzazione HTML |
| **xml-js** | 1.6 | Parsing XML fatture elettroniche |
| **Axios** | 1.6 | HTTP client (usato limitatamente) |
| **react-pdf** | 7.6 | Visualizzazione PDF inline |

### 2.2 Backend Desktop (Tauri v1 / Rust)
| Tecnologia | Versione | Ruolo |
|---|---|---|
| **Tauri** | 1.6 | Framework desktop (window management, FS, shell, dialog) |
| **tauri-build** | 1.5 | Build system |
| **serde / serde_json** | 1.0 | Serializzazione JSON in Rust |

### 2.3 Cloud / Database
| Tecnologia | Ruolo |
|---|---|
| **Supabase** (PostgreSQL + PostgREST) | Database cloud, sync bidirezionale |
| **LocalStorage** | Persistenza rapida preferenze utente |
| **File JSON su disco** (`%APPDATA%\noManV1\Database\`) | Database locale primario |
| **File Excel/CSV** (sola lettura, OneDrive) | Sorgente dati aziendale (import) |

### 2.4 Linguaggi presenti nel progetto
| Linguaggio | Dove | Volume |
|---|---|---|
| **JavaScript (JSX)** | `src/` — 147 file `.jsx` | ~1383 KB |
| **JavaScript (JS)** | `src/` — 67 file `.js` | ~577 KB |
| **CSS** | `src/` — 3 file `.css` | ~11 KB |
| **Rust** | `src-tauri/src/main.rs` | 1 file, ~22 KB |
| **PowerShell** (embedded in Rust) | Inline nel `main.rs` | ~15 script PS incorporati |
| **SQL** | Schema definition inline in JS | 1 file, ~6 KB |

**Totale codebase front-end: ~217 file sorgente, ~1971 KB (~2 MB di codice)**

---

## 3. ARCHITETTURA DELL'APPLICAZIONE

### 3.1 Diagramma ad alto livello

```
┌─────────────────────────────────────────────────────────────────┐
│                      TAURI v1 (Rust Shell)                      │
│  ┌──────────────────┐  ┌────────────────────────────────────┐   │
│  │    main.rs        │  │  Tauri Allowlist:                  │   │
│  │  - Email Outlook  │  │  fs:all, shell:all, http:all,      │   │
│  │  - PowerShell IPC │  │  dialog:all, window:all, path:all  │   │
│  └──────────────────┘  └────────────────────────────────────┘   │
│                               ▲ invoke()                        │
├───────────────────────────────┼──────────────────────────────────┤
│                       React 18 + Vite                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ Sidebar  │  │ TabBar   │  │ Pages    │  │ Redux Store    │  │
│  │ (nav)    │  │ (tabs)   │  │ (views)  │  │ (14 slices)    │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │
│                                    ▼                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Services Layer                          │    │
│  │  - ddtStorageManager     - listiniStorageManager         │    │
│  │  - cloudBulkSyncService  - cloudPullSyncService          │    │
│  │  - cloudSyncDiffService  - dataReimportService           │    │
│  │  - fattureStorageManager - noteStorageManager            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                    ▼                       ▼                    │
│  ┌──────────────────────┐  ┌────────────────────────────────┐   │
│  │ File System locale   │  │ Supabase Cloud                 │   │
│  │ %APPDATA%\noManV1\   │  │ (PostgreSQL + PostgREST)       │   │
│  │ JSON files           │  │ 13 tabelle                     │   │
│  └──────────────────────┘  └────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Pattern architetturale

L'app segue un pattern **ibrido** tra:
- **Feature-based folders** (Redux slices in `features/`)
- **Component-based organization** (componenti UI in `components/`)
- **Service layer** per la persistenza (`services/`)

**Non è un'architettura clean/hexagonal**: i componenti accedono direttamente ai servizi di storage e al file system Tauri, e la logica di business è spesso mescolata con la logica di presentazione.

### 3.3 Flusso di navigazione

L'app usa un **sistema di tab browser-like** (come Chrome):
1. `Sidebar.jsx` — barra laterale sinistra con icone di navigazione
2. `TabBar.jsx` — barra delle schede in alto, drag-and-drop, riordinamento, chiusura
3. `TabContentManager.jsx` — render condizionale della pagina attiva
4. `pageRegistry.jsx` — registro centralizzato delle 13 pagine disponibili

Le pagine registrate sono:
| Route | Pagina | Categoria |
|---|---|---|
| `/` | Dashboard | Principale |
| `/ordermanager` | Order Manager | Ordini |
| `/nuovaddtstudio` | DDT Studio (Pro) | DDT & Spedizioni |
| `/preventivi` | Preventivi | Preventivi |
| `/gestioneinviiddt` | OR Numbers | DDT & Spedizioni |
| `/listinogenerale` | Listino Generale | Listini |
| `/ddtdati` | DDT List | DDT & Spedizioni |
| `/ddtarticoli` | DDT Articoli | DDT & Spedizioni |
| `/listiniclienti` | Listini Clienti | Listini |
| `/fattureelettroniche` | Fatture Elettroniche | Fatturazione |
| `/clienti` | Clienti | Anagrafica |
| `/note` | Note | Strumenti |
| `/settings` | Impostazioni | Sistema |

---

## 4. REDUX STORE — 14 SLICES

```
store = configureStore({
  reducer: {
    Settings:   SettingsAppReducer,   // Impostazioni app, percorsi, email, tema
    Tabs:       TabsReducer,          // Gestione schede aperte (browser-like tabs)
    DDT:        DDTReducer,           // Lista DDT caricati
    Theme:      ThemeReducer,         // Tema UI e AG Grid
    DDTArticoli: DDTArticoliReducer,  // Articoli DDT
    ListGen:    ListinoGeneraleReducer, // Listino Generale
    ListVar:    ListiniVariReducer,   // Listini Vari (fornitori)
    ListCli:    ListiniClientiReducer, // Listini personalizzati per cliente
    FattEl:     FattureElettronicheReducer, // Fatture elettroniche XML
    ImpAllDt:   ImportAllDataReducer, // Stato importazione bulk
    PDFFile:    PDFFileReducer,       // Lista file PDF
    Email:      EmailReducer,         // Stato client email (compose, folder)
    DDTDraft:   DDTDraftReducer,      // DDT in fase di creazione/modifica
    Clients:    ClientsReducer,       // Anagrafica clienti
  }
})
```

### Slice `Settings` (il più ricco — initialState con ~70+ campi)
Contiene TUTTO: percorsi file, credenziali Supabase, indirizzi email preconfigurati (Carrara, Wepa, Banca, Commercialista), tema, colori, permessi, operatore, stazione, heartbeat interval, pagina default, anno corrente, e altro.

---

## 5. SCHEMA DATABASE SUPABASE — 13 TABELLE

Lo schema è definito in [`sqlSchemaDefinition.js`](file:///d:/BricoClassFiles/Sam/noManV1/src/components/settings/sqlSchemaDefinition.js) e comprende:

### 5.1 Tabelle principali

| # | Tabella | Descrizione | Campi chiave |
|---|---|---|---|
| 1 | `app_settings` | Impostazioni app (JSON blob) | `id`, `settings_data` (jsonb) |
| 2 | `ddt` | Documenti di Trasporto (testate) | `numero`, `anno`, `data`, `cliente`, `indirizzo`, `citta`, `pagamento`, `destinazione`, `causale`, `porto`, `aspetto`, `colli`, `peso_kg`, `vettore`, `operatore`, `note`, `totale_imponibile`, `totale_iva`, `totale_documento`, `stato` |
| 3 | `ddt_righe` | Righe articoli di ogni DDT | `ddt_id` (FK → ddt), `riga_nr`, `um`, `quantita`, `descrizione`, `prezzo`, `sconto_pct`, `iva_pct`, `prezzo_acquisto` |
| 4 | `ddt_logs` | Log di stato DDT (id testuale) | `id`, `status`, `created_at` |
| 5 | `fornitori` | Anagrafica fornitori | `nome`, `rappresentante`, `email`, `telefono`, `indirizzo`, `piva`, `note` |
| 6 | `ordini` | Ordini a fornitori | `data`, `fornitore`, `articolo`, `descrizione`, `quantita`, `prezzo`, `ordinato`, `note`, `utente`, `archiviato`, `eliminato` |
| 7 | `storico_operazioni` | Audit trail operazioni | `tabella_coinvolta`, `tipo_operazione`, `utente`, `dati_vecchi` (jsonb), `dati_nuovi` (jsonb), `descrizione_breve` |
| 8 | `clienti` | Anagrafica clienti | `cliente`, `indirizzo`, `localita`, `pagamento`, `piva`, `cod_fiscale` |
| 9 | `preventivi` | Preventivi (testate + dati JSON) | `numero`, `anno`, `data`, `cliente`, `oggetto`, `destinazione`, `pagamento`, `validita_giorni`, `stato`, `totale_imponibile`, `sconto_globale_pct`, `data_json` (jsonb) |
| 10 | `listini_clienti` | Listino prezzi per cliente | `cliente`, `codice_articolo`, `descrizione`, `prezzo_fattura`, `prezzo_acquisto`, `ricarico`, `note`, `note1`, `note2` |
| 11 | `listino_generale` | Listino generale con livelli prezzo | `cat`, `fornitore`, `codice_articolo`, `descrizione`, `um`, `perc_pub`, `prezzo_pubblico`, `perc_prof`, `prezzo_profess`, `perc_dett`, `prezzo_dett`, `perc_riv`, `prezzo_riv`, `prezzo_r2`, `perc_iva` |
| 12 | `listini_vari` | Listini fornitori vari | Simile al generale + `prezzo_fattura`, `prezzo_acquisto`, `aumento`, `r1`, `maga`, `r2` |
| 13 | `listini_prezzi_log` | Audit log variazioni prezzi | `tipo_listino`, `cliente`, `codice_articolo`, `campo_modificato`, `vecchio_valore`, `nuovo_valore`, `variazione_pct`, `operatore`, `motivo` |

### 5.2 Persistenza duale (Locale + Cloud)

L'applicazione mantiene una **doppia persistenza**:
- **JSON su disco** in `%APPDATA%\noManV1\Database\` — database locale primario (funziona offline)
- **Supabase Cloud** — sincronizzazione bidirezionale

I file JSON locali principali:
```
%APPDATA%\noManV1\Database\
├── JsonSettingNoMan.json     (impostazioni app)
├── Clienti.json              (anagrafica clienti)
├── ListinoGenerale.json      (listino generale)
├── ListiniClienti.json       (listini per cliente)
├── ListiniVari.json          (listini fornitori)
├── DDTDati.json              (DDT testate)
├── DDTArticoli.json          (DDT righe articolo)
├── FattureElettroniche.json  (fatture XML parsed)
├── Ordini.json               (ordini fornitori)
├── Fornitori.json            (anagrafica fornitori)
├── Preventivi.json           (preventivi)
├── note_aziendali.json       (note e promemoria)
├── fatture_testate.json      (testate fatture)
├── listini_prezzi_log.json   (log variazioni prezzi)
├── pending_sync_listini.json (coda sync offline listini)
├── pending_offline_sync.json (coda offline globale)
├── sync_tombstones.json      (registro cancellazioni)
├── DDT/
│   ├── 2026/
│   │   ├── 01. Gennaio/
│   │   │   ├── DDTDati.json
│   │   │   └── DDTArticoli.json
│   │   ├── 02. Febbraio/ ...
│   │   └── 12. Dicembre/ ...
│   ├── 2025/DDTDati2025.json (consolidato annuale)
│   └── ...
└── Backups/
```

---

## 6. DETTAGLIO MODULI FUNZIONALI

### 6.1 📦 DDT Studio (`components/DDTStudio/` — 30+ file, nucleo del gestionale)

Il modulo più complesso dell'applicazione. Gestisce la creazione, modifica, stampa ed esportazione dei Documenti di Trasporto.

**Componenti principali:**
- `DDTStudioEditor.jsx` (16KB) — Editor principale del DDT
- `DDTStudioHeader.jsx` (16KB) — Header con toolbar operazioni
- `DDTStudioSidebar.jsx` (22KB) — Sidebar con lista DDT e archivio
- `DDTClienteCard.jsx` (29KB) — Card informazioni cliente con ricerca e selezione
- `DDTArticoliTable.jsx` (20KB) — Tabella articoli del DDT con editing inline
- `DDTArticoliSearchModal.jsx` (37KB) — Modale ricerca articoli dal listino
- `DDTA4Document.jsx` (42KB) — **FILE PIÙ GRANDE** — Generazione documento A4 per stampa/PDF
- `DDTTextEditor.jsx` (19KB) — Editor testi DDT
- `DDTDestinazioneSection.jsx` (9KB) — Sezione destinazione merci
- `DDTLogisticaCard.jsx` (6KB) — Informazioni logistica (porto, aspetto, colli, peso, vettore)

**Hooks:**
- `useDDTStudio.js` (8KB) — Hook coordinatore principale
- `useDdtPersistenceManager.js` (30KB) — Salvataggio/caricamento DDT su disco e cloud
- `useDdtArchiveData.js` (28KB) — Gestione archivio DDT (tutti gli anni)
- `useDdtExportPrint.js` (9KB) — Esportazione e stampa
- `useDdtSessionState.js` (2KB) — Stato sessione
- `useDdtToast.js` (1KB) — Notifiche toast

**Servizi:**
- `ddtStorageManager.js` (35KB) — Manager persistenza disco (JSON partizionato per mese/anno)
- `ddtSupabaseSync.js` (17KB) — Sincronizzazione Supabase
- `ddtExportManager.js` (17KB) — Esportazione Excel
- `ddtMonthlyReportManager.js` (18KB) — Report mensili
- `ddtUtils.js` (21KB) — Utility calcoli e formattazioni

**Modali aggiuntive:**
- `DDTConfirmModal.jsx` — Conferma operazioni
- `DDTConflictModal.jsx` — Gestione conflitti sync
- `DDTNumberGapModal.jsx` — Gestione buchi numerazione
- `DDTOperatoreModal.jsx` — Selezione operatore
- `DDTPrintCopiesModal.jsx` — Copie stampa
- `DDTSelectDestinazioneModal.jsx` — Selezione destinazione
- `DDTPhoneDrawer.jsx` — Drawer contatti telefonici
- `DDTMultiSearchModal.jsx` — Ricerca multi-criterio
- `TheOneSuccessModal.jsx` — Modale successo operazione

### 6.2 📊 Dashboard (`pages/Dashboard.jsx` + `components/dashboard/`)

Dashboard con KPI, grafici e strumenti di analisi:
- **KPI Cards** — Totali giornalieri, mensili, annuali
- **Grafici** — AG Charts (giornalieri, mensili, annuali, ricavi)
- **Confronto giornaliero** — Comparazione con giorno precedente
- **Top Clienti** — Classifica fatturato
- **Modali di analisi:**
  - `AnnualAnalysisModal.jsx` (12KB) — Analisi annuale
  - `MonthlyPerformanceModal.jsx` (22KB) — Performance mensile
  - `DdtArchiveModal.jsx` (24KB) — Archivio DDT consultabile
  - `DdtDetailSummary.jsx` (13KB) — Dettaglio singolo DDT
  - `YearlyClientTurnoverModal.jsx` (11KB) — Fatturato clienti annuale
  - `RibaModal.jsx` (5KB) — Ri.Ba. bancarie
  - `CloudSyncAuditModal.jsx` (22KB) — Audit sincronizzazione cloud
  - `CloudSyncDiffModal.jsx` (10KB) — Diff sync locale/cloud
  - `ReimportSourceModal.jsx` (10KB) — Reimport dati sorgente

**Grafici dedicati** (`components/charts/`):
- `ChartDays.jsx`, `ChartMonth.jsx`, `ChartYears.jsx` (18KB), `ChartRicavi.jsx` (8KB)
- `ChartCR.jsx`, `ChartDailyClients.jsx`, `ChartMonthClients.jsx`, `ChartYearsClients.jsx`

### 6.3 💰 Listini Prezzi (`pages/Listini&DDT/` + `components/listini/`)

Tre tipi di listini:

1. **Listino Generale** — Catalogo completo prodotti con 4 livelli prezzo (Pubblico, Professionista, Dettaglio, Rivendita)
   - `ListinoGenerale.jsx` (8KB) + `ListinoGeneraleHeader.jsx` (5KB)
   - `listinoGeneraleColDefs.jsx` (21KB) — Definizioni colonne AG Grid
   - `useListinoGeneraleTable.js` (25KB) — Hook gestione tabella
   - `listinoGeneraleCalc.js` (6KB) — Calcoli prezzi
   - `listinoChangesTracker.js` (5KB) — Tracking modifiche

2. **Listini Clienti** — Listini personalizzati per singolo cliente
   - `ListiniClienti.jsx` (14KB)
   - `ListiniSyncPopupCard.jsx` (7KB) — Stato sync
   - `ListiniClientCloneModal.jsx` (5KB) — Clonazione listino

3. **Listini Vari** — Listini fornitori/speciali

**Componenti listini condivisi:**
- `BatchPriceModal.jsx` (13KB) — Modifica prezzi in batch
- `DeleteConfirmModal.jsx` (3KB)
- `ListiniBatchActionsBar.jsx` (3KB) — Barra azioni batch
- `ListiniSavingIndicator.jsx` (5KB) — Indicatore salvataggio
- `ListinoSaveReviewModal.jsx` (17KB) — Review prima del salvataggio
- `ListinoDiscardReviewModal.jsx` (16KB) — Review scarto modifiche
- `PriceHistoryModal.jsx` (19KB) — Storico variazioni prezzo
- `listiniDateUtils.js` (4KB) — Utility date

**Storage Manager:**
- `listiniStorageManager.js` (29KB) — Il più grande service, gestisce tutta la persistenza dei 3 listini

### 6.4 📋 Order Manager (`features/OrderManager/`)

Gestione ordini a fornitori con ricerca globale e backup:
- `OrderManager.jsx` (11KB) — Pagina principale
- `OrdersGrid.jsx` (39KB) — **Secondo file più grande** — Griglia ordini con editing inline
- `GlobalSearchTab.jsx` (29KB) — Ricerca globale cross-entità
- `FornitoriTab.jsx` (20KB) — Gestione anagrafica fornitori
- `BackupTab.jsx` (12KB) — Backup dati
- `orderEmailService.js` (4KB) — Invio ordini via email
- `orderExcelService.js` (4KB) — Export ordini in Excel
- `constants.js` (6KB) — Costanti e configurazione

### 6.5 🧾 Fatture Elettroniche (`features/FattureEletroniche/` + `components/fatture/`)

Importazione e visualizzazione fatture elettroniche XML (SDI):
- `FattureElettroniche.jsx` (13KB) — Pagina lista fatture
- `FattureImportModal.jsx` (17KB) — Import da file XML
- `FatturaDetailModal.jsx` (11KB) — Dettaglio singola fattura
- `fattureXmlParser.js` (8KB) — Parser XML fatture SDI
- `fattureStorageManager.js` (10KB) — Persistenza fatture

### 6.6 📝 Preventivi (`features/Preventivi/`)

Creazione e gestione preventivi:
- `PreventiviStudio.jsx` (5KB) — Pagina principale
- `usePreventiviStudio.js` (12KB) — Hook gestione
- `PreventiviTable.jsx` (25KB) — Tabella articoli preventivo
- `PreventiviHeader.jsx` (9KB) — Header con toolbar
- `PreventiviClientInfo.jsx` (9KB) — Info cliente
- `PreventiviKpiBanner.jsx` (8KB) — Banner statistiche
- `PreventiviSidebarArchive.jsx` (7KB) — Archivio laterale
- `PreventivoA4Document.jsx` (16KB) — Generazione documento A4
- `preventiviStorageManager.js` (5KB) — Persistenza
- `preventiviUtils.js` (9KB) — Utility
- `preventivoPdfGenerator.js` (11KB) — Generazione PDF

### 6.7 👥 Clienti (`pages/Clienti.jsx` + `components/clienti/`)

Anagrafica clienti con CRUD completo:
- `Clienti.jsx` (27KB) — Pagina AG Grid con ricerca, filtri, modifica
- `ClientEditModal.jsx` (20KB) — Modale modifica dettagliata
- `ClientsLoader.jsx` (5KB) — Loader dati iniziale

### 6.8 📧 Email (Outlook Integration)

Integrazione completa con Microsoft Outlook via PowerShell COM:
- **Backend Rust** (`main.rs`) — 13 comandi Tauri:
  - `get_emails`, `get_folder_emails`, `get_email_details`
  - `get_email_attachments`, `save_email_attachment`, `open_email_attachment`
  - `new_email`, `reply_email`, `reply_all_email`, `forward_email`
  - `send_email_direct`, `send_order_email`
  - `delete_email`, `mark_email_read`

- **Frontend** — Gestione stato folder (Inbox=6, Sent=5, Drafts=16, Deleted=3), compose, attachment handling

### 6.9 📝 Note Aziendali (`pages/NoteAziendali.jsx` + `components/note/`)

Sistema note e promemoria:
- `NoteAziendali.jsx` (4KB) — Pagina principale
- `NoteCard.jsx` (8KB) — Card singola nota
- `NoteEditorModal.jsx` (13KB) — Editor nota con formattazione
- `NoteQuickFilterBar.jsx` (4KB) — Barra filtri rapidi
- `useNoteAziendali.js` (8KB) — Hook gestione
- `noteStorageManager.js` (5KB) — Persistenza

### 6.10 🚚 Gestione Invii DDT (`pages/GestioneInviiDDT.jsx`)

Pagina per la gestione degli invii DDT e numeri d'ordine (OR Numbers):
- File singolo da 32KB — contiene logica di gestione spedizioni

### 6.11 ⚙️ Settings (`pages/Settings.jsx` + `components/settings/`)

Sistema impostazioni suddiviso in tab:
- `Settings.jsx` (10KB) — Pagina container con tab navigation
- `SettingsGeneralTab.jsx` (14KB) — Impostazioni generali (percorsi, anno, operatore)
- `SettingsAppearanceTab.jsx` (33KB) — Tema, colori, layout, personalizzazione visiva
- `SettingsDatabaseTab.jsx` (7KB) — Database e sync
- `SettingsEmailTab.jsx` (9KB) — Configurazione email
- `SettingsModulesTab.jsx` (16KB) — Moduli e funzionalità
- `SettingsPermissionsTab.jsx` (11KB) — Permessi
- `SettingsHeader.jsx` (3KB) — Header pagina
- `SettingsUnlockDialog.jsx` (2KB) — Dialog sblocco impostazioni protette
- `SupabaseCloudMonitor.jsx` (18KB) — Monitor stato cloud
- `useSettingsForm.js` (14KB) — Hook form impostazioni
- `useTopBarDragEngine.js` (6KB) — Engine drag-and-drop top bar
- `pageColorThemes.js` (3KB) — Temi colore pagine
- `sqlSchemaDefinition.js` (6KB) — Schema SQL per setup DB

### 6.12 🔄 Cloud Sync Services (`services/`)

Layer di sincronizzazione bidirezionale con Supabase:
- `cloudAutoSyncManager.js` (4KB) — Timer heartbeat sync periodica
- `cloudBidirectionalSyncService.js` (5KB) — Sync bidirezionale coordinata
- `cloudBulkSyncService.js` (20KB) — Sync bulk (upload massivo)
- `cloudPullSyncService.js` (17KB) — Pull dati da cloud
- `cloudSyncDiffService.js` (18KB) — Calcolo differenze locale↔cloud
- `cloudOfflineQueueManager.js` (3KB) — Coda operazioni offline
- `cloudTombstoneManager.js` (4KB) — Gestione soft-delete
- `dataReimportService.js` (15KB) — Reimport da sorgenti Excel/CSV

### 6.13 📥 Import Data (`components/import/` + `components/importManual/`)

Importazione dati da sorgenti Excel/CSV:
- `ImportAll.jsx` (12KB) — Import bulk all-in-one
- `ImportDDTDatiLocal.jsx` (13KB) / `ImportDDTArticoliLocal.jsx` (10KB)
- `ImportListinoGen.jsx` (7KB) / `ImportListiniClienti.jsx` (5KB) / `ImportListiniVari.jsx` (9KB)
- `ImportFattureElett.jsx` (13KB) — Import fatture elettroniche XML
- `ImportPDFDDT.jsx` (4KB)

Import manuali via form/Excel:
- `ImportDDTDati.jsx` (7KB) / `ImportDDTArticoli.jsx` (7KB)
- `ImportListinoGenExcel.jsx` (5KB) / `ImportListiniClientiExcel.jsx` (4KB) / `ImportListiniVariExcel.jsx` (4KB)
- `ImportGridFattureXML.jsx` (12KB)

---

## 7. SISTEMA DI TEMI

Il sistema temi è gestito da:
- `ThemeSlice.js` (7KB) — Redux slice con azioni per cambiare tema
- `themeConfig.js` (21KB) — **Configurazione massiva** con palette colori per ogni tema
- `pageColorThemes.js` (3KB) — Colori specifici per pagina
- `SettingsAppearanceTab.jsx` (33KB) — UI completa personalizzazione

Supporta: Dark mode, livelli di grigio (1-7), colore di accento, colore evidenziazione righe, opacità highlight, temi AG Grid.

---

## 8. GESTIONE FILE E PERCORSI

Tutto centralizzato in [`appPaths.js`](file:///d:/BricoClassFiles/Sam/noManV1/src/utilities/appPaths.js) (441 righe):
- ~30 funzioni per generare percorsi deterministici
- Migrazione automatica da OneDrive legacy a `%APPDATA%`
- Supporto multi-anno con partizionamento DDT per mese
- Cache clearing e backup management
- Encoding sicuro Windows-1252/UTF-8 con `safeReadTextFile()`

---

## 9. PUNTI DI FORZA ✅

1. **Architettura offline-first**: L'app funziona completamente offline con JSON su disco, il cloud è opzionale
2. **DDT Studio completo**: Il modulo DDT è estremamente ricco con generazione A4, stampa, export Excel, numerazione automatica, archivio storico multi-anno
3. **Integrazione Outlook nativa**: Client email integrato nell'app senza dipendenze esterne (via COM + PowerShell)
4. **Multi-listino**: Supporto per 3 tipi di listini con storico variazioni prezzi, batch editing, import da Excel
5. **Sync bidirezionale**: Sistema di sincronizzazione locale↔cloud sofisticato con tombstones, offline queue, conflict resolution
6. **Tema personalizzabile**: Sistema temi ricco con personalizzazione colori a livello granulare
7. **Tab system**: UX moderna con navigazione a schede tipo browser
8. **Auditing**: Log storico operazioni e variazioni prezzi
9. **Import automatico all'avvio**: Possibilità di sincronizzare automaticamente i dati Excel/CSV all'avvio
10. **Preventivi con PDF**: Generazione preventivi con documento A4 stampabile
11. **AG Grid**: Tabelle ad alte performance per gestire migliaia di righe

---

## 10. CRITICITÀ E DEBITO TECNICO ⚠️

### 10.1 File monolitici (violazione regola 300-400 righe)

Molti file superano ampiamente le 300-400 righe raccomandate nelle regole del progetto:

| File | Dimensione | Problema |
|---|---|---|
| `DDTA4Document.jsx` | **42KB** | God Component — generazione documento monolitica |
| `OrdersGrid.jsx` | **39KB** | God Component — griglia ordini con logica mista |
| `DDTArticoliSearchModal.jsx` | **37KB** | Modale troppo complessa |
| `ddtStorageManager.js` | **35KB** | God Service — tutta la persistenza DDT |
| `SettingsAppearanceTab.jsx` | **33KB** | Tab impostazioni troppo grande |
| `GestioneInviiDDT.jsx` | **32KB** | Pagina intera monolitica |
| `useDdtPersistenceManager.js` | **30KB** | God Hook |
| `listiniStorageManager.js` | **29KB** | God Service |
| `DDTClienteCard.jsx` | **29KB** | Componente troppo grande |
| `GlobalSearchTab.jsx` | **29KB** | Tab ricerca troppo denso |
| `useDdtArchiveData.js` | **28KB** | Hook archivio troppo grande |
| `Clienti.jsx` | **27KB** | Pagina monolitica |
| `useListinoGeneraleTable.js` | **25KB** | Hook tabella troppo grande |
| `PreventiviTable.jsx` | **25KB** | Tabella monolitica |

### 10.2 Architettura incoerente

- **Mix di pattern**: Alcuni moduli sono in `features/` (Redux-style), altri in `components/`, altri nelle `pages/`. Non c'è coerenza.
- **DDTStudio** vive in `components/DDTStudio/` ma è di fatto una feature completa con hooks, services, e sub-components — dovrebbe essere in `features/`.
- I **Preventivi** sono correttamente in `features/Preventivi/`, ma i **Listini** hanno file sparsi tra `pages/Listini&DDT/`, `components/listini/`, e `services/`.

### 10.3 Logica di business nel frontend

- Calcoli di prezzi, IVA, margini, sconti sono sparsi nei componenti React e negli hook, non in utility pure separate
- La logica di persistenza è mescolata con la logica di presentazione in molti hook

### 10.4 Naming inconsistente

- `features/FattureEletroniche/` ← typo ("Eletroniche" vs "Elettroniche")
- `retriveLoad`, `retriveJsonFile`, `retriveCharts` ← typo ("retrive" vs "retrieve") — hanno anche alias corretti ma i nomi originali rimangono
- Mix italiano/inglese nei nomi (es. `DDTDraftSlice` vs `ListiniClientiSlice`)
- `ListGen`, `ListVar`, `ListCli`, `FattEl`, `ImpAllDt` — abbreviazioni poco leggibili nello store

### 10.5 Sicurezza

- **Tauri Allowlist troppo permissiva**: `fs:all` con scope `["**"]` — accesso a tutto il filesystem
- **Shell:all** abilitato con PowerShell completo
- **CSP con 'unsafe-inline' e 'unsafe-eval'** — potenzialmente vulnerabile
- Credenziali Supabase caricate da `.env` e persistite in Redux/localStorage (visibili in DevTools)

### 10.6 Tauri v1 (Legacy)

Il progetto usa **Tauri v1** (API v1.6), che è in modalità maintenance. La versione corrente è **Tauri v2** con API completamente diverse. Una migrazione a v2 sarà necessaria per supporto a lungo termine.

### 10.7 Assenza di test

Non ci sono test unitari, test di integrazione o test E2E nel progetto. Zero file di test trovati.

### 10.8 Assenza di TypeScript

Tutto è in JavaScript vanilla — nessun tipo, nessun controllo statico. Per un progetto di queste dimensioni (217 file, 2MB di codice), TypeScript migliorerebbe significativamente la manutenibilità.

### 10.9 Gestione errori fragile

Molte operazioni catch errori silenziosamente con `catch {}` o `catch { continue }`. Non c'è un sistema centralizzato di error handling/reporting.

### 10.10 Performance potenziali

- Lo store Redux contiene potenzialmente migliaia di righe di dati (DDT, articoli, listini) caricati in memoria
- Non c'è virtualizzazione a livello Redux (tutto in memoria)
- I selectors memoizzati esistono ma sono limitati a pochi casi (`store/selectors.js`)

### 10.11 Dipendenza esclusiva da Windows

L'app funziona SOLO su Windows per:
- PowerShell COM con Outlook
- Percorsi con backslash hardcoded in `appPaths.js`
- `SYSTEMROOT` e `%APPDATA%` specifici Windows
- `CommandExt` Rust per `creation_flags` Windows

### 10.12 Duplicazione codice

- Il pattern di "clean string" PowerShell è duplicato identicamente in ogni comando Tauri
- Logica di import simile ripetuta per ogni tipo di dato (DDT, listini, fatture)
- Pattern simili di AG Grid column definitions ripetuti

---

## 11. STRUTTURA FILE COMPLETA

```
noManV1/
├── 📁 src/                        (Frontend React)
│   ├── 📄 main.jsx                (Entry point — React.StrictMode + BrowserRouter + Redux Provider)
│   ├── 📄 App.jsx                 (Layout root — Sidebar + TabBar + Content)
│   ├── 📄 store.js                (Redux store — 14 slices)
│   ├── 📄 styles.css              (Stili globali — 11KB)
│   ├── 📄 agGridCustom.css        (Override AG Grid)
│   │
│   ├── 📁 pages/                  (8 pagine + sottocartella)
│   │   ├── Dashboard.jsx
│   │   ├── NuovaDDTStudio.jsx
│   │   ├── PreventiviStudio.jsx
│   │   ├── GestioneInviiDDT.jsx
│   │   ├── Clienti.jsx
│   │   ├── NoteAziendali.jsx
│   │   ├── Settings.jsx
│   │   ├── Loading.jsx
│   │   └── 📁 Listini&DDT/
│   │       ├── ListinoGenerale.jsx + Header + ColDefs + Calc + Hook
│   │       ├── ListiniClienti.jsx
│   │       ├── DDTDati.jsx + DDTArticoli.jsx
│   │       └── FattureElettroniche.jsx
│   │
│   ├── 📁 features/               (16 Redux feature modules)
│   │   ├── DDT/DDTSlice.js
│   │   ├── DDTArticoli/DDTArticoliSlice.js
│   │   ├── DDTDraft/DDTDraftSlice.js
│   │   ├── ListinoGenerale/ListinoGeneraleSlice.js
│   │   ├── ListiniVari/ListiniVariSlice.js
│   │   ├── ListiniClienti/ListiniClientiSlice.js
│   │   ├── FattureEletroniche/FattureElettronicheSlice.js
│   │   ├── SettingsApp/SettingsApp.js
│   │   ├── ImportALLData/ImportAllDataSlice.js
│   │   ├── PDFFile/PDFFileSlice.js
│   │   ├── Email/EmailSlice.js
│   │   ├── Clients/ClientsSlice.js
│   │   ├── Theme/ThemeSlice.js + themeConfig.js
│   │   ├── Tabs/tabsSlice.js
│   │   ├── 📁 OrderManager/ (pagina + componenti + servizi)
│   │   └── 📁 Preventivi/ (componenti + hook + utilities)
│   │
│   ├── 📁 components/             (29 componenti + 12 sottocartelle)
│   │   ├── 📁 DDTStudio/ (30+ file — nucleo del gestionale)
│   │   ├── 📁 dashboard/ (16 file — KPI, grafici, modali)
│   │   ├── 📁 charts/ (8 grafici AG Charts)
│   │   ├── 📁 listini/ (11 componenti listini)
│   │   ├── 📁 settings/ (13 file impostazioni)
│   │   ├── 📁 fatture/ (2 modali fatture)
│   │   ├── 📁 clienti/ (1 modale edit)
│   │   ├── 📁 note/ (3 componenti note)
│   │   ├── 📁 import/ (8 importatori automatici)
│   │   ├── 📁 importManual/ (6 importatori manuali)
│   │   ├── 📁 TabBar/ (3 file — tab system)
│   │   ├── 📁 common/ (1 badge sync)
│   │   └── [17 file componenti standalone]
│   │
│   ├── 📁 services/               (12 file — cloud sync + storage)
│   ├── 📁 hooks/                  (6 custom hooks globali)
│   ├── 📁 store/                  (1 file selectors memoizzati)
│   ├── 📁 contexts/               (1 NotificationContext)
│   ├── 📁 containers/             (Layout.jsx + Sidebar.jsx)
│   ├── 📁 utilities/              (appPaths.js + saveSettingToStorage.js)
│   ├── 📁 lib/                    (supabase.js + dayjs.js + moment.js)
│   └── 📁 assets/                 (immagini, font matrixFont.ttf)
│
├── 📁 src-tauri/                  (Backend Rust / Tauri v1)
│   ├── Cargo.toml                 (3 dipendenze: tauri, serde, serde_json)
│   ├── tauri.conf.json            (Allowlist completa + CSP + window config)
│   └── src/main.rs                (22KB — 13 comandi Tauri per Outlook/Email)
│
├── 📄 package.json                (26 dipendenze prod + 6 dev)
├── 📄 vite.config.js              (Config minima + alias moment)
├── 📄 tailwind.config.js          (Config base + font matrix)
├── 📄 postcss.config.js           (Tailwind + autoprefixer)
├── 📄 AGENTS.md                   (Regole per AI — 6.7KB)
├── 📄 index.html                  (Entry HTML)
└── 📄 .env                        (Credenziali Supabase)
```

---

## 12. REGOLE DI PROGETTO ESISTENTI (da AGENTS.md)

Le regole che l'utente ha definito e che devono essere preservate in qualsiasi refactoring:

1. **🔴 SACRA**: File Excel/CSV sorgente sono SOLA LETTURA ASSOLUTA — MAI scrivere, modificare o cancellare
2. **Supabase GRANT**: Ogni nuova tabella DEVE includere `GRANT` e policy RLS
3. **Prezzi di acquisto**: MAI inseriti automaticamente — solo manualmente dall'utente
4. **No file monolitici**: Target 100-300 righe per file (attualmente violato massicciamente)
5. **No hardcoding**: Tutto deve passare dalle Settings — percorsi, colori, parametri email
6. **Architettura modulare**: Hook specializzati, sotto-componenti atomici, utility pure

---

## 13. CONSIGLI PER LA RICOSTRUZIONE

### Cosa tenere:
- **Lo schema database Supabase** (13 tabelle) — è ben strutturato
- **Il concetto architetturale** di offline-first con sync cloud
- **Il sistema di temi** è ricco e funzionale
- **L'integrazione Outlook** via Tauri commands funziona bene
- **Il page registry pattern** per la navigazione è pulito
- **AG Grid** come tabella principale è una scelta valida per volumi elevati

### Cosa rifare:
- **Migrare a Tauri v2** per supporto a lungo termine
- **Introdurre TypeScript** per type safety
- **Riorganizzare in Feature Modules coerenti** (ogni feature = pagina + componenti + hook + servizi + slice)
- **Scomporre i God Components** rispettando il limite 100-300 righe
- **Centralizzare la logica di business** in utility pure testabili
- **Aggiungere testing** (almeno unit test su utility e servizi)
- **Unificare il naming** (tutto italiano o tutto inglese, no mix)
- **Separare la persistenza** in un data layer astratto (repository pattern)

---

> **Questo report copre l'intero progetto senza omissioni. Può essere usato come contesto completo per un nuovo agente AI per comprendere il progetto da zero.**
