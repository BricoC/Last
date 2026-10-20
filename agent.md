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
   - Divieto di `DELETE` fisico: le eliminazioni avvengono solo tramite Soft Delete (`deleted_at = NOW_UTC()`), per evitare la ricomparsa di record eliminati tra diverse postazioni.

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
- **Desktop Shell:** **Tauri v2** (Rust + plugin: `tauri-plugin-sql`, `fs`, `shell`, `dialog`, `notification`, `process`)
- **Frontend Core:** **React 18+**, **TypeScript** (Strict mode attivo)
- **Bundler:** **Vite**
- **State Management:** **Redux Toolkit** (Riservato esclusivamente allo stato UI: tab aperte, split view, tema, utente attivo, notifiche. I dati di business risiedono in SQLite e sono interrogati on-demand, mai duplicati in RAM).
- **Styling:** **CSS Custom Properties (Design Tokens)** sincronizzate con le Settings + **TailwindCSS**
- **Data Grids:** **Glide Data Grid**
- **Database Locale:** **SQLite embedded** (`LastData.db` gestito da Tauri in `%APPDATA%\Last\`, auto-creato, invisibile e a zero configurazione).
- **Database Cloud:** **Supabase** (PostgreSQL)

---

## 3. 🖥️ SISTEMA DI NAVIGAZIONE A SCHEDE CON SPLIT-VIEW (Chrome-like + Affiancamento)

Per garantire massima produttività nel lavoro quotidiano di cassa e ufficio:
1. **Navigazione Multi-Tab:** L'utente può aprire più schede contemporaneamente (es. DDT Studio, Listino Generale, Scheda Cliente, Ordini).
2. **Split View (Affiancamento Schermi):**
   - Possibilità di **affiancare due schede qualsiasi** (layout split orizzontale o verticale).
   - *Esempio d'uso:* DDT Studio aperto a sinistra e Listino Prezzi / Storico Cliente affiancato a destra per consultare e copiare dati al volo senza saltare continuamente da una schermata all'altra.
3. **Stato Persistente:** Lo stato dei tab e dell'eventuale split view è gestito in Redux e memorizzato localmente per ripristinare la sessione di lavoro all'avvio.

---

## 4. 📧 INTEGRAZIONE OUTLOOK (Composizione e Invio Diretto)

L'integrazione con Microsoft Outlook è snella e mirata:
1. **Scopo Esclusivo (Composizione/Invio):** L'applicazione **non** funge da client di posta (nessuna lettura di inbox o gestione cartelle).
2. **Flusso di Lavoro:**
   - L'utente clicca "Invia DDT via Email" o "Invia Ordine Fornitore".
   - Last genera l'allegato (PDF del DDT o Excel dell'ordine).
   - Tramite un comando leggero Tauri (COM Automation / PowerShell nativo), Last apre una nuova finestra di composizione in Microsoft Outlook con:
     - Destinatario precompilato (email cliente o fornitore).
     - Oggetto formattato.
     - Corpo del testo standard o personalizzato.
     - Documento già allegato.
   - È Outlook (già configurato con l'account `@hotmail` o aziendale) che si occupa dell'invio effettivo.

---

## 5. 📐 STRUTTURA DEL PROGETTO (Feature-Driven)

```
src/
├── features/
│   ├── ddt-studio/             # Documenti di Trasporto
│   ├── orders/                 # Gestione ordini fornitori
│   ├── price-lists/            # Listini prezzi
│   ├── clients/                # Anagrafica clienti
│   ├── quotes/                 # Preventivi
│   ├── electronic-invoices/    # Consultazione fatture XML
│   ├── notes/                  # Memo e note aziendali
│   └── settings/               # Impostazioni, Tema, Credenziali
├── shared/
│   ├── components/             # Componenti UI generici (Button, Modal, Input, Card)
│   │   ├── data-grid/          # Wrapper unificato per Glide Data Grid (Excel-like)
│   │   └── tabs/               # Sistema TabBar e Split View container
│   ├── hooks/                  # Hook riutilizzabili (useDebounce, useHotkeys, ecc.)
│   ├── registry/               # REGISTRO centrale componenti e hook
│   ├── data-layer/             # Repository SQLite locale & Sync Outbox
│   ├── theme/                  # Theme Provider e iniezione CSS tokens
│   ├── types/                  # Interfacce globali e BaseEntity
│   └── utils/                  # Formattazione valute, calcoli puri
```

### Regola dei 100–300 righi per file
- Nessun file deve eccedere le 300 righe di codice.
- I componenti visualizzano; i calcoli sono funzioni pure in `utils/`; la persistenza risiede nei Repository.

---

## 6. 📚 REGISTRO CENTRALE COMPONENTI & HOOK (`src/shared/registry/`)

Per eliminare codice duplicato:
1. **`componentsRegistry.ts`**: Censimento di tutti i componenti riutilizzabili (`AppButton`, `AppModal`, `ExcelGrid`, `SplitPane`, `MetricCard`).
2. **`hooksRegistry.ts`**: Censimento degli hook trasversali (`useTheme`, `useSyncStatus`, `useDdtTotals`).
3. **Regola:** Prima di creare un nuovo elemento di interfaccia, verificare nel registro se esiste già una soluzione adatta o parametrizzabile.

---

## 7. 🎨 THEME ENGINE E DESIGN SYSTEM (Guidato dalle Settings)

1. **Token nei Settings:** Palette colori (sfondo, card, testo, accento, stati), raggi di curvatura bordi (`borderRadius`), ombre e tema per Glide Data Grid.
2. **Propagazione Dinamica:** I valori sono salvati nei Settings e applicati a runtime su `:root` come CSS Custom Properties (`--color-primary`, `--bg-surface`, ecc.).
3. **Estendibilità:** Se occorre un nuovo elemento visivo, va prima formalizzato nei Settings/ThemeConfig e poi consumato dai componenti.

---

## 8. 🔄 ARCHITETTURA DI SINCRONIZZAZIONE (SQLite ↔ Supabase Outbox)

Un'architettura semplice e solida per operare su più PC senza conflitti o perdite:

### 8.1 Struttura Base (`BaseEntity`)
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

### 8.2 Push Locale ➔ Cloud (Pattern Outbox)
1. **Salvataggio Locale Istantaneo (< 3ms):** Scrittura immediata su SQLite (`LastData.db`) con `updated_at = NOW_UTC()` e `sync_status = 'pending'`.
2. **Worker in Background:**
   - Cerca i record con `sync_status = 'pending'`.
   - Esegue l'`upsert` su Supabase.
   - A conferma ricevuta, aggiorna lo stato locale a `'synced'`.
   - Se manca la connessione, i record restano `'pending'` senza alcuna perdita e partiranno al ripristino della rete.

### 8.3 Pull Cloud ➔ Locale (Incrementale per Data)
1. L'app conserva il timestamp dell'ultimo controllo (`last_pulled_at`).
2. Scarica solo le novità con una query diretta:
   ```sql
   SELECT * FROM [tabella] WHERE updated_at > :last_pulled_at;
   ```
3. Applica l'upsert in SQLite locale e aggiorna `last_pulled_at`.

### 8.4 Cancellazioni Senza Fantasmi
- Mai `DELETE` fisico. Si imposta `deleted_at = NOW_UTC()` con `sync_status = 'pending'`.
- La cancellazione viene sincronizzata come un qualsiasi aggiornamento recente, impedendo ai record eliminati di ricomparire.

---

## 9. 🔤 NAMING CONVENTIONS

- **Codice in Inglese:** Nomi di file, variabili, funzioni, interfacce TypeScript e commenti tecnici in inglese.
- **Termini Fiscali/Commerciali:** I termini specifici italiani rimangono chiaramente riconoscibili (es. `DdtDocument`, `RibaPayment`, `CausaleTrasporto`).
- **File:** Componenti in `PascalCase.tsx`, Hook in `useCamelCase.ts`, Utility/Services in `camelCase.ts`.

---

## 10. 🧪 TESTING E CHECKLIST QUALITÀ

- **Testing Mirato (Vitest):** Obbligatorio **solo** per la matematica e la logica critica:
  - Calcoli fiscali (totali DDT, scorporo IVA, ricarichi/sconti).
  - Meccanismo di accodamento Outbox e sincronizzazione SQLite.
  *(Nessuna burocrazia di test obbligatori per semplici schermate UI o form).*
- **Checklist prima di rilasciare una feature:**
  - [ ] Il file rispetta il limite indicativo di ~300 righe?
  - [ ] È stato consultato il registro per evitare componenti/hook duplicati?
  - [ ] Il componente consuma i token del Theme Engine (niente colori hardcoded)?
  - [ ] I record manipolati gestiscono `updated_at` e Soft Delete?
  - [ ] Le tabelle dati sfruttano Glide Data Grid con le interazioni Excel-like?
  - [ ] Tipi TypeScript espliciti (niente `any`).
