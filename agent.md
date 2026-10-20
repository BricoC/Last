# 🛡️ GUIDA E REGOLE DI SVILUPPO — AGENT.MD (Last)

> **SCOPO DEL DOCUMENTO:**  
> Questo file definisce i principi architetturali, i vincoli operativi e le regole d'oro inderogabili per lo sviluppo e la realizzazione del gestionale desktop **Last**.  
> **Ogni agente AI o sviluppatore che lavora su questo progetto DEVE rispettare questo documento alla lettera.**

---

## 1. 🔴 REGOLE D'ORO INVIOLABILI (Zero Tolleranza)

1. **ARCHITETTURA DATI PURAMENTE NATIVA (Zero dipendenze esterne in lettura):**
   - Questa versione **NON legge file sorgente esterni (Excel, CSV o PDF da parsare)**.
   - L'intero ecosistema dati vive unicamente nel binomio **SQLite Locale (Offline-first) ↔ Cloud (Supabase)**.
   - *(Nota: L'esportazione/generazione di PDF di cortesia e file Excel per l'utente finale resta pienamente supportata come output).*

2. **OGNI MODIFICA DEVE AVERE UN TIMESTAMP OBBLIGATORIO (UTC):**
   - Qualsiasi record o entità DEVE tracciare `created_at`, `updated_at` (ISO 8601 UTC) e `updated_by`.
   - Le eliminazioni avvengono esclusivamente tramite **Soft Delete** (`deleted_at`), trattate come normali aggiornamenti con timestamp più recente per evitare disallineamenti tra client e cloud.

3. **REGISTRO DI COMPONENTI E HOOK (Divieto di duplicazione):**
   - Esiste un **Registro Centralizzato** di tutti i componenti riutilizzabili, custom hook e utility (vedi Sezione 4).
   - Prima di creare un nuovo componente o hook, è **obbligatorio consultare il registro**.
   - È vietato creare doppioni: componenti simili vanno parametrizzati o composti; se si crea un nuovo hook/componente riutilizzabile, va immediatamente catalogato nel registro.

4. **THEME ENGINE CENTRATO SU SETTINGS (Design System Dinamico):**
   - Tutti i colori, forme (border-radius), ombre, spaziature e stili UI derivano **esclusivamente dal tema configurato nei Settings**.
   - **Nuovi componenti/pagine:** devono attingere ai token del tema (CSS variables / theme tokens) senza stili hardcoded isolati.
   - **Estensioni del tema:** se una nuova interfaccia necessita di un nuovo pattern visivo, stile o variante (es. una nuova sfumatura o variante di card/pulsante), questo **DEVE essere aggiunto alla configurazione nei Settings**, così da diventare uno standard di base riutilizzabile per tutto il progetto.

5. **TABELLE DATI EXCEL-LIKE (Glide Data Grid Standard):**
   - Tutte le tabelle dati del gestionale adottano **Glide Data Grid** come standard primario.
   - Devono garantire la completa esperienza Excel-like: selezione a intervalli di celle (range selection), navigazione fluida con frecce tastiera/Tab/Invio, editing immediato, maniglia di trascinamento (fill handle) e copia/incolla matrice bidirezionale (Ctrl+C / Ctrl+V) compatibile con Excel.
   - Il tema visivo di Glide Data Grid deve essere vincolato dinamicamente ai token definiti nelle Settings.

6. **NESSUN HARDCODING:**
   - Nessun percorso su disco, credenziale, parametro email o impostazione deve essere inserito a codice. Tutto deve risiedere nei Settings o nel `.env`.

7. **SUPABASE SECURITY & RLS:**
   - Ogni singola tabella creata su Supabase **DEVE** avere abilitato il Row Level Security (`ENABLE ROW LEVEL SECURITY`) e relative policy (`GRANT` / `POLICY`) esplicite.

---

## 2. 🏗️ STACK TECNOLOGICO TARGET

- **Nome Applicazione:** **Last**
- **Desktop Shell:** **Tauri v2** (Rust + Plugin ufficiali v2: `tauri-plugin-sql`, `fs`, `shell`, `dialog`, `notification`, `process`)
- **Frontend Core:** **React 18+**, **TypeScript** (Strict mode attivo)
- **Bundler:** **Vite**
- **State Management:** **Redux Toolkit** (slices tipizzate) + Custom Repository Hooks
- **Styling & Theme Engine:** **CSS Custom Properties (Design Tokens)** sincronizzate con le Settings + **TailwindCSS**
- **Data Grids:** **Glide Data Grid** (Canvas virtualizzato ad alte prestazioni, 60 FPS, esperienza Excel-like nativa, licenza MIT)
- **Database Locale (Invisibile e Auto-gestito):** **SQLite embedded** (`LastData.db` via plugin ufficiale Tauri SQL). Nessuna installazione o configurazione manuale sui PC client.
- **Database Cloud:** **Supabase** (PostgreSQL + PostgREST)

---

## 3. 📐 STRUTTURA DEL PROGETTO (Feature-Driven)

```
src/
├── features/
│   ├── ddt-studio/             # Modulo Documenti di Trasporto
│   │   ├── api/                # Repositories & Sync DDT
│   │   ├── components/         # Sotto-componenti (<300 righe)
│   │   ├── hooks/              # Custom hook interni
│   │   ├── models/             # Tipi e interfacce TypeScript
│   │   ├── state/              # Redux slice atomica
│   │   ├── utils/              # Funzioni pure di calcolo
│   │   └── DdtStudioPage.tsx
│   ├── orders/                 # Gestione ordini fornitori
│   ├── price-lists/            # Listini prezzi (Generale, Clienti, Fornitori)
│   ├── clients/                # Anagrafica clienti
│   ├── electronic-invoices/    # Gestione fatture elettroniche
│   ├── quotes/                 # Preventivi
│   ├── notes/                  # Note e memo aziendali
│   └── settings/               # Gestione impostazioni e Theme Engine
├── shared/
│   ├── components/             # Componenti UI generici catalogati nel registro
│   │   └── data-grid/          # Componente wrapper unificato per Glide Data Grid (Excel-like)
│   ├── hooks/                  # Hook generici riutilizzabili
│   ├── registry/               # REGISTRO dei componenti, hook e temi
│   ├── data-layer/             # Repository Pattern & Sync Engine (SQLite + Supabase Outbox)
│   ├── theme/                  # Theme Provider, token CSS, sincronizzazione Settings
│   ├── types/                  # Interfacce globali e BaseEntity
│   └── utils/                  # Utility pure generiche
```

### Regola dei 100–300 righi per file
- Nessun file deve eccedere le 300 righe di codice.
- La UI (TSX) visualizza e interagisce; i calcoli risiedono in funzioni pure (`utils/`); la persistenza risiede nei Repository.

---

## 4. 📚 REGISTRO CENTRALE COMPONENTI & HOOK (`src/shared/registry/`)

Per garantire massima coerenza e azzerare i doppioni, il progetto adotta un catalogo tracciato:

1. **`componentsRegistry.ts`**:
   - Elenco e documentazione di tutti i componenti UI generici (es. `AppButton`, `AppModal`, `ExcelDataGrid`, `SearchBar`, `MetricCard`, `DateRangePicker`).
   - Prima di creare un componente di interfaccia, verificare se ne esiste già uno adatto o se una prop opzionale può risolvere la necessità.

2. **`hooksRegistry.ts`**:
   - Elenco di tutti gli hook globali e feature-level (es. `useTheme`, `useDebounce`, `useSyncStatus`, `useDdtCalculations`, `useKeyboardShortcuts`).

3. **Regola di Aggiunta:**
   - Ogni nuovo componente atomico riutilizzabile o hook generico deve essere registrato con: nome, scopo, percorso file ed esempi di parametri.

---

## 5. 🎨 THEME ENGINE E DESIGN SYSTEM BASATO SUI SETTINGS

Il tema non è un foglio di stile statico, ma un'entità dinamica controllata dall'utente e dai Settings:

1. **Struttura dei Token nei Settings (`ThemeSettings`):**
   - **Color Palette:** Sfondo base, pannelli/card, testo primario/secondario, colore di accento (Primary), warning, danger, success.
   - **Superfici & Forme:** Raggio di curvatura angoli (`borderRadius`: 'none' | 'sm' | 'md' | 'lg' | 'full'), ombreggiature (`shadows`).
   - **Glide Data Grid Theme:** Sfondo celle, testo cella, griglia di demarcazione, cella attiva/selezionata, header background/testo, accent color per fill handle e range selection.

2. **Propagazione Automatica:**
   - Le impostazioni del tema sono salvate nel database / Supabase e iniettate a livello di `:root` sotto forma di **CSS Custom Properties** (es. `--color-primary`, `--bg-card`, `--radius-ui`).
   - Il wrapper di Glide Data Grid consuma direttamente l'oggetto tema generato da queste proprietà.

3. **Workflow di Creazione Nuovi Componenti / Varianti:**
   - Un nuovo componente DEVE consumare le classi o variabili del tema.
   - **Se occorre un nuovo stile non presente**:
     1. Si dichiara il nuovo token in `ThemeSettings` / `themeConfig.ts`.
     2. Viene esposto nella pagina **Settings -> Aspetto/Tema**.
     3. Il componente lo utilizza come standard.
     4. Da quel momento, ogni altro componente potrà ereditare lo stesso nuovo standard.

---

## 6. 🔄 ARCHITETTURA DI SINCRONIZZAZIONE A PROVA DI BOMBA (SQLite ↔ Supabase Outbox)

Per eliminare definitivamente conflitti, duplicati, file corrotti e "resurrezioni" di record cancellati, Last adotta il **Pattern Outbox** con **SQLite embedded locale** e **Supabase Cloud come fonte della verità**.

### 6.1 Struttura Base di Ogni Record (`BaseEntity`)
Tutte le tabelle condividono obbligatoriamente questi campi:

```typescript
export interface BaseEntity {
  id: string;                    // UUID v4 generato localmente (unico al mondo)
  created_at: string;            // ISO 8601 UTC
  updated_at: string;            // ISO 8601 UTC (aggiornato ad ogni modifica)
  updated_by: string;            // Username / Nome postazione (es. "Cassa 1")
  deleted_at: string | null;     // Soft Delete (null se attivo, timestamp UTC se cancellato)
  sync_status: 'synced' | 'pending'; // Flag locale per il motore di sincronizzazione
}
```

### 6.2 Flusso di Scrittura Locale e Invio Cloud (Push con Outbox)
1. **Scrittura Immediata in Locale (< 3ms):**
   - Quando l'utente crea o modifica un record (DDT, cliente, articolo, nota), l'applicazione scrive immediatamente nel file SQLite locale (`LastData.db`).
   - Il record riceve: `updated_at = NOW_UTC()` e `sync_status = 'pending'`.
   - L'interfaccia utente si aggiorna istantaneamente. Zero attese di rete.
2. **Spedizione in Background (Worker):**
   - Un worker leggero in background interroga SQLite:
     ```sql
     SELECT * FROM [tabella] WHERE sync_status = 'pending' LIMIT 50;
     ```
   - Invia i record a Supabase tramite una singola operazione `upsert` su chiave primaria `id`.
   - Se Supabase risponde con successo, il worker aggiorna SQLite locale:
     ```sql
     UPDATE [tabella] SET sync_status = 'synced' WHERE id IN (...);
     ```
   - **Se il PC è offline o internet cade:** i record restano semplicemente `'pending'` nel database SQLite locale e verranno spediti automaticamente non appena la connessione torna disponibile.

### 6.3 Flusso di Ricezione dal Cloud (Pull Incrementale)
Niente confronti di alberi JSON o calcoli "diff" pesanti:
1. L'applicazione memorizza l'ultimo timestamp di sincronizzazione (`last_pulled_at`).
2. Per scaricare le modifiche effettuate dagli altri PC, esegue una query puntuale e leggera su Supabase:
   ```sql
   SELECT * FROM [tabella] WHERE updated_at > :last_pulled_at;
   ```
3. I record ricevuti vengono inseriti/aggiornati (UPSERT) direttamente nel database SQLite locale con `sync_status = 'synced'`.
4. `last_pulled_at` viene aggiornato all'orario UTC della richiesta.

### 6.4 Cancellazioni Senza Fantasmi (Soft Delete Puro)
- È **vietato eseguire il comando `DELETE` fisico** sui record.
- Per eliminare un record si imposta:
  `deleted_at = NOW_UTC()` e `sync_status = 'pending'`.
- La cancellazione viaggia verso Supabase come un normalissimo aggiornamento con timestamp più recente.
- In tutte le viste dell'applicazione, le query filtrano automaticamente con `WHERE deleted_at IS NULL`.
- In questo modo nessun record cancellato potrà mai "risorgere" a causa di un allineamento ritardato tra PC.

### 6.5 Risoluzione dei Conflitti
- **Regola Generale:** *Last Write Wins* basata rigorosamente sul confronto dei timestamp UTC `updated_at`.
- **Documenti Fiscali / DDT:** Poiché i DDT hanno numerazione progressiva e stato di emissione, se due postazioni modificano lo stesso identico DDT mentre una è offline, all'atto dell'allineamento viene presentata una modale visiva di revisione per scegliere o unire le modifiche.

---

## 7. 🔤 NAMING CONVENTIONS

- **Codice in Inglese:** Tipi, interfacce, nomi di file, variabili, funzioni e commenti tecnici devono essere in lingua inglese.
- **Eccezioni di Dominio:** I termini specifici normativi/commerciali italiani restano nel nome composto per evitare traduzioni forzate (es. `DdtDocument`, `RibaPayment`, `CausaleTrasporto`).
- **Standard di File:**
  - Componenti: `PascalCase.tsx`
  - Hook: `useCamelCase.ts`
  - Utility/Services: `camelCase.ts`
  - Tipi/Modelli: `camelCase.types.ts` o `PascalCase.model.ts`

---

## 8. 🧪 TESTING E VERIFICA

- **Unit Testing (Vitest):** Funzioni di calcolo (IVA, scorpori, margini, totali documento, formattazione valute) coperte da test unitari.
- **Checklist prima di rilasciare una modifica:**
  - [ ] Il file rispetta il limite delle ~300 righe?
  - [ ] È stato consultato il registro per non creare duplicati di hook/componenti?
  - [ ] Il componente usa i token del Theme Engine e non stili/colori hardcoded?
  - [ ] Le entità manipolate aggiornano `updated_at`, impostano `sync_status` e gestiscono il soft-delete?
  - [ ] Nessuna dipendenza o lettura da file esterni Excel/CSV/PDF?
  - [ ] La griglia dati usa Glide Data Grid con le interazioni Excel-like previste?
  - [ ] Tutti i tipi TypeScript sono rigorosi e senza `any`?
