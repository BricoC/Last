# 🛡️ GUIDA E REGOLE DI SVILUPPO — AGENT.MD (Last)

> **SCOPO DEL DOCUMENTO:**  
> Questo file definisce i principi architetturali, i vincoli operativi e le regole d'oro inderogabili per lo sviluppo del gestionale desktop **Last**.  
> **Ogni agente AI o sviluppatore che lavora su questo progetto DEVE rispettare questo documento alla lettera.**

---

## 1. 🔴 REGOLE D'ORO INVIOLABILI (Zero Tolleranza)

1. **DATI NATIVI (SQLite Locale + Supabase Cloud):**
   - Nessuna dipendenza da file esterni in lettura. L'intero database risiede localmente in **SQLite** (offline-first) e si sincronizza con **Supabase** in cloud. *(L'esportazione di PDF ed Excel per l'utente finale resta supportata).*

2. **TIMESTAMP UTC & SOFT DELETE OBBLIGATORIO:**
   - Qualsiasi record traccia `created_at`, `updated_at` (ISO 8601 UTC) e `updated_by`.
   - Divieto assoluto di `DELETE` fisico: le eliminazioni avvengono solo tramite Soft Delete (`deleted_at = NOW_UTC()`), impedendo la ricomparsa di record eliminati tra diverse postazioni.

3. **REGISTRO DI COMPONENTI E HOOK (No Doppioni):**
   - Prima di creare un nuovo componente UI o custom hook, è **obbligatorio consultare il Registro Centrale** (`src/shared/registry/`).
   - Se serve una variante, si parametrizza l'esistente; se si crea un nuovo componente generico, va registrato immediatamente.

4. **THEME ENGINE CENTRATO SU SETTINGS:**
   - Tutti i colori, forme (border-radius), ombre e stili UI derivano **esclusivamente dai token definiti nei Settings**. Nessun colore hardcoded nei componenti.
   - Nuovi pattern o varianti visive vanno prima registrati nei Settings, diventando la base per tutto il gestionale.

5. **TABELLE DATI EXCEL-LIKE (Glide Data Grid):**
   - Tutte le tabelle adottano **Glide Data Grid** (Canvas virtualizzato, gratuito MIT).
   - Esperienza Excel nativa obbligatoria: navigazione con frecce, selezione a blocchi di celle, fill handle (trascinamento per duplicare) e copia/incolla matrice bidirezionale con Excel reale (Ctrl+C / Ctrl+V).

6. **NESSUN HARDCODING:**
   - Percorsi, credenziali, parametri email e costanti devono risiedere nei Settings o nel `.env`.

7. **SUPABASE SECURITY & RLS:**
   - Ogni tabella Supabase deve avere `ENABLE ROW LEVEL SECURITY` e policy esplicite (`GRANT`/`POLICY`).

---

## 2. 🏗️ STACK TECNOLOGICO TARGET

- **Nome Applicazione:** **Last**
- **Desktop Shell:** **Tauri v2** (Rust + plugin ufficiali: `tauri-plugin-sql`, `fs`, `shell`, `dialog`, `notification`, `process`)
- **Frontend Core:** **React 18+**, **TypeScript** (Strict mode attivo)
- **Bundler:** **Vite**
- **State Management (UI):** **Zustand** (Store atomici ultra-leggeri per tab, layout split-screen, tema, utente, notifiche. Zero boilerplate; i dati di business risiedono in SQLite e sono interrogati on-demand, mai duplicati in RAM).
- **Componenti UI:** **shadcn/ui (Radix Primitives) + TailwindCSS** (Componenti nel codice sorgente, accessibili, ultra-leggeri, governati al 100% dalle variabili CSS del Theme Engine).
- **Split-Screen & Layout:** **`react-resizable-panels`** (Pannelli affiancati fluidi e ridimensionabili col mouse con memoria delle dimensioni).
- **Data Grids:** **Glide Data Grid** (Canvas virtualizzato a 60 FPS, esperienza Excel reale).
- **Stampa e Generazione Documenti:** **Template A4 Vettoriale Millimetrico** (Layout A4 a misure fisse in millimetri, CSS `@media print` a 300 DPI nativo; testo, bordi e codici a barre nitidissimi per DDT e Preventivi identici al documento commerciale aziendale).
- **Database Locale:** **SQLite embedded** (`LastData.db` via `tauri-plugin-sql` in `%APPDATA%\Last\`, auto-creato, invisibile e a zero configurazione).
- **Database Cloud:** **Supabase** (PostgreSQL)

---

## 3. 🖥️ SISTEMA DESKTOP MDI A FINESTRE MULTIPLE (Multi-Window Desktop)

1. **Doppia Barra Superiore Integrata (Zero Scrollbar):**
   - **Livello 1 (Navigazione Moduli):** Accesso istantaneo a tutti i moduli aziendali (*Dashboard, Order Manager, Listino Generale, OR Numbers, DDT List, DDT Articoli, Listini Clienti, Fatture Elettroniche, DDT Studio, Preventivi, Clienti*) + indicatore stato Cloud + Settings.
   - **Livello 2 (Schede Aperte con Frecce):** Visualizzazione tab a pill con scorrimento orizzontale a frecce `<` e `>`, privo di scrollbar native invasive.
2. **Desktop Window Manager (Stile Desktop Windows):**
   - Ogni scheda aperta vive come finestra indipendente sul desktop: trascinabile per l'intestazione, ridimensionabile dagli angoli, minimizzabile a icona (`_`), massimizzabile a tutto schermo (`□`) e richiudibile (`×`).
   - Comandi rapidi di layout: Affianca 50/50 a sinistra e destra, Griglia 4 quadranti, e Disposizione a Cascata.
3. **Stato Persistente (`useWindowStore`):** Coordinate, dimensioni, livelli z-index e stato minimizzato/massimizzato persistiti e orchestrati da Zustand.

---

## 4. 📄 DOCUMENTI FISCALI A4 (DDT e Preventivi BricoClass)

1. **Precisione Tipografica:**
   - Layout identico al modulo ufficiale: logo e testata con riquadro *Numero/Data*, sezioni affiancate *Spettabile ditta* e *Luogo di destinazione*, causale, operatore, pagamento (*In conto / A Saldo*).
   - Tabella articoli con griglia a linee fisse che scendono fino ai totali.
   - Fascia totali con imponibile, aliquote IVA, imposta e totale documento.
   - Riquadri firme (vettore, conducente, cessionario), porto e piè di pagina aziendale con P.IVA e recapiti.
2. **Motore di Render:**
   - Template React dimensionato rigorosamente in millimetri (`210mm × 297mm`).
   - Stampa e salvataggio PDF tramite motore vettoriale nativo di WebView2 (risoluzione 300 DPI, zero sgranature, codici a barre leggibili dai lettori ottici).

---

## 5. 📧 INTEGRAZIONE OUTLOOK (Composizione e Invio Diretto)

1. **Scopo Esclusivo (Composizione/Invio):** L'applicazione non legge inbox né gestisce cartelle.
2. **Flusso di Lavoro:**
   - L'utente clicca "Invia DDT via Email" o "Invia Ordine Fornitore".
   - Last genera il file (PDF vettoriale del DDT o foglio Excel dell'ordine).
   - Tramite un comando leggero Tauri (COM Automation / PowerShell nativo), Last apre la finestra di composizione di Microsoft Outlook precompilando:
     - Destinatario (email cliente o fornitore).
     - Oggetto e corpo del messaggio.
     - Documento già allegato.
   - Sarà Outlook (collegato all'account Hotmail o aziendale) a gestire l'invio.

---

## 6. 📐 STRUTTURA DEL PROGETTO (Feature-Driven)

```
src/
├── features/
│   ├── ddt-studio/             # Documenti di Trasporto
│   │   ├── components/         # Sotto-componenti (<300 righe)
│   │   ├── document/           # Template A4 vettoriale millimetrico per stampa/PDF
│   │   ├── hooks/              # Hook specifici
│   │   ├── models/             # Tipi e interfacce TypeScript
│   │   ├── services/           # Repository e operazioni SQLite
│   │   ├── utils/              # Calcoli fiscali puri
│   │   └── DdtStudioPage.tsx
│   ├── orders/                 # Gestione ordini fornitori
│   ├── price-lists/            # Listini prezzi
│   ├── clients/                # Anagrafica clienti
│   ├── quotes/                 # Preventivi (con template A4 vettoriale)
│   ├── electronic-invoices/    # Consultazione fatture XML
│   ├── notes/                  # Memo e note aziendali
│   └── settings/               # Impostazioni, Theme Engine, Credenziali
├── shared/
│   ├── components/             # Componenti UI generici (Button, Modal, Input, Card)
│   │   ├── ui/                 # Componenti base shadcn/ui (Radix Primitives)
│   │   ├── data-grid/          # Wrapper unificato Glide Data Grid (Excel-like)
│   │   └── tabs/               # TabBar e contenitore Split-View (react-resizable-panels)
│   ├── hooks/                  # Hook riutilizzabili (useDebounce, useHotkeys)
│   ├── registry/               # REGISTRO centrale componenti e hook
│   ├── stores/                 # Store Zustand atomici (useTabStore, useThemeStore)
│   ├── data-layer/             # Repository SQLite locale & Sync Outbox
│   ├── theme/                  # Theme Provider e iniezione CSS tokens
│   ├── types/                  # Interfacce globali e BaseEntity
│   └── utils/                  # Formattazione valute, calcoli puri
```

### Regola dei 100–300 righi per file
- Nessun file deve eccedere le 300 righe di codice.
- I componenti visualizzano; i calcoli risiedono in funzioni pure (`utils/`); la persistenza risiede nei Repository.

---

## 7. 📚 REGISTRO CENTRALE COMPONENTI & HOOK (`src/shared/registry/`)

Per eliminare codice duplicato:
1. **`componentsRegistry.ts`**: Censimento di tutti i componenti riutilizzabili (`AppButton`, `AppModal`, `ExcelGrid`, `SplitPane`, `MetricCard`).
2. **`hooksRegistry.ts`**: Censimento degli hook trasversali (`useTheme`, `useSyncStatus`, `useDdtTotals`).
3. **Regola:** Prima di creare un nuovo elemento di interfaccia, verificare nel registro se esiste già una soluzione adatta o parametrizzabile.

---

## 8. 🎨 THEME ENGINE E DESIGN SYSTEM (Guidato dalle Settings)

1. **Token nei Settings:** Palette colori (sfondo, card, testo, accento, stati), raggi di curvatura bordi (`borderRadius`), ombre e tema per Glide Data Grid.
2. **Propagazione Dinamica:** I valori sono salvati nei Settings e applicati a runtime su `:root` come CSS Custom Properties (`--color-primary`, `--bg-surface`, ecc.), consumate sia da Tailwind che dai componenti shadcn/ui.
3. **Estendibilità:** Se occorre un nuovo elemento visivo, va prima formalizzato nei Settings/ThemeConfig e poi consumato dai componenti.

---

## 9. 🔄 ARCHITETTURA DI SINCRONIZZAZIONE (SQLite ↔ Supabase Outbox)

### 9.1 Struttura Base (`BaseEntity`)
Tutti i record includono obbligatoriamente:
```typescript
export interface BaseEntity {
  id: string;                    // UUID v4 generato localmente
  created_at: string;            // ISO 8601 UTC
  updated_at: string;            // ISO 8601 UTC
  updated_by: string;            // Utente o postazione (es. "Cassa 1")
  deleted_at: string | null;     // Soft Delete (null se attivo, UTC se eliminato)
  sync_status: 'synced' | 'pending'; // Flag locale per il sync engine
}
```

### 9.2 Push Locale ➔ Cloud (Pattern Outbox)
1. **Salvataggio Locale Istantaneo (< 3ms):** Scrittura immediata su SQLite (`LastData.db`) con `updated_at = NOW_UTC()` e `sync_status = 'pending'`.
2. **Worker in Background:**
   - Cerca i record con `sync_status = 'pending'`.
   - Esegue l'`upsert` su Supabase.
   - A conferma ricevuta, aggiorna lo stato locale a `'synced'`.
   - Se manca la connessione, i record restano protetti in SQLite come `'pending'` e partiranno al ripristino della rete.

### 9.3 Pull Cloud ➔ Locale (Incrementale per Data)
1. L'app conserva il timestamp dell'ultimo controllo (`last_pulled_at`).
2. Scarica solo le novità con una query diretta:
   ```sql
   SELECT * FROM [tabella] WHERE updated_at > :last_pulled_at;
   ```
3. Applica l'upsert in SQLite locale e aggiorna `last_pulled_at`.

### 9.4 Cancellazioni Senza Fantasmi
- Mai `DELETE` fisico. Si imposta `deleted_at = NOW_UTC()` con `sync_status = 'pending'`.
- La cancellazione viene sincronizzata come un qualsiasi aggiornamento recente, impedendo ai record eliminati di ricomparire.

---

## 10. 🔤 NAMING CONVENTIONS

- **Codice in Inglese:** Nomi di file, variabili, funzioni, interfacce TypeScript e commenti tecnici in inglese.
- **Termini Fiscali/Commerciali:** I termini specifici italiani rimangono chiaramente riconoscibili (es. `DdtDocument`, `RibaPayment`, `CausaleTrasporto`).
- **File:** Componenti in `PascalCase.tsx`, Hook in `useCamelCase.ts`, Store Zustand in `use[Feature]Store.ts`, Utility/Services in `camelCase.ts`.

---

## 11. 🧪 TESTING E CHECKLIST QUALITÀ

- **Testing Mirato (Vitest):** Obbligatorio **solo** per la matematica e la logica critica:
  - Calcoli fiscali (totali DDT, scorporo IVA, ricarichi/sconti).
  - Meccanismo di accodamento Outbox e sincronizzazione SQLite.
- **Checklist prima di rilasciare una feature:**
  - [ ] Il file rispetta il limite indicativo di ~300 righe?
  - [ ] È stato consultato il registro per evitare componenti/hook duplicati?
  - [ ] Il componente consuma i token del Theme Engine (niente colori hardcoded)?
  - [ ] I record manipolati gestiscono `updated_at` e Soft Delete?
  - [ ] Le tabelle dati sfruttano Glide Data Grid con le interazioni Excel-like?
  - [ ] Tipi TypeScript espliciti (niente `any`).
