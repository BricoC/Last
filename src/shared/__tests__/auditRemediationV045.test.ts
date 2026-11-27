import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

let memSqlite: DatabaseSync;

function createSqliteAdapter(sqlite: DatabaseSync) {
  return {
    async select<T>(sql: string, params: unknown[] = []): Promise<T> {
      const stmt = sqlite.prepare(sql);
      if (!params.length) return stmt.all() as T;
      const bound = Object.fromEntries(
        params.map((v, i) => [`$${i + 1}`, (v === undefined ? null : v) as SQLInputValue])
      );
      return stmt.all(bound) as T;
    },
    async execute(sql: string, params: unknown[] = []) {
      const stmt = sqlite.prepare(sql);
      if (!params.length) {
        const res = stmt.run();
        return { rowsAffected: Number(res.changes), lastInsertId: Number(res.lastInsertRowid) };
      }
      const bound = Object.fromEntries(
        params.map((v, i) => [`$${i + 1}`, (v === undefined ? null : v) as SQLInputValue])
      );
      const res = stmt.run(bound);
      return { rowsAffected: Number(res.changes), lastInsertId: Number(res.lastInsertRowid) };
    },
  };
}

const mockInvoke = vi.fn().mockResolvedValue(null);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/shared/data-layer/database", () => ({
  getDatabase: async () => createSqliteAdapter(memSqlite),
  runMigrations: async () => {},
}));

vi.mock("@/shared/data-layer/localDatabaseBatch", () => ({
  applyLocalDatabaseBatch: async (writes: Array<{ sql: string; params?: unknown[] }>) => {
    const adapter = createSqliteAdapter(memSqlite);
    memSqlite.exec("BEGIN IMMEDIATE");
    try {
      for (const w of writes) {
        await adapter.execute(w.sql, w.params ?? []);
      }
      memSqlite.exec("COMMIT");
    } catch (e) {
      memSqlite.exec("ROLLBACK");
      throw e;
    }
  },
}));

const mockSupabaseFetch = vi.fn();
let mockCreds: { projectUrl: string; anonKey: string } | null = null;
vi.mock("@/shared/services/supabaseSession", () => ({
  getAuthenticatedSupabaseCredentials: async () => mockCreds,
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  requireStationAccess: async () => true,
  isSupabaseAuthError: () => false,
}));

const lsStore = new Map<string, string>();
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => lsStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        lsStore.set(k, String(v));
      },
      removeItem: (k: string) => {
        lsStore.delete(k);
      },
      clear: () => {
        lsStore.clear();
      },
    },
    configurable: true,
  });
}

beforeEach(() => {
  memSqlite = new DatabaseSync(":memory:");
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
  mockSupabaseFetch.mockReset();
  mockCreds = null;
  lsStore.clear();
});

describe("Audit Remediation v0.4.5 Regression Suite (AUD-02 .. AUD-23)", () => {
  it("AUD-02: notesRepository.moveToTrash does not rebind legacy note deletion to active Project B", async () => {
    memSqlite.exec(`
      CREATE TABLE notes (
        id TEXT PRIMARY KEY, supabase_id INTEGER, title TEXT, content_html TEXT, content_text TEXT,
        is_pinned INTEGER, is_archived INTEGER, color TEXT, created_by TEXT, updated_by TEXT,
        created_at TEXT, updated_at TEXT, sync_status TEXT, project_url TEXT
      );
      CREATE TABLE notes_trash (
        id TEXT PRIMARY KEY, supabase_id INTEGER, title TEXT, content_html TEXT, content_text TEXT,
        is_pinned INTEGER, is_archived INTEGER, color TEXT, created_by TEXT, updated_by TEXT,
        created_at TEXT, updated_at TEXT, deleted_at TEXT, deleted_by TEXT, project_url TEXT
      );
      CREATE TABLE note_deletions (
        id TEXT PRIMARY KEY, supabase_id INTEGER, deleted_at TEXT, project_url TEXT
      );
      INSERT INTO notes VALUES ('n1', 42, 'Legacy', '<p>hi</p>', 'hi', 0, 0, 'default', 'Op', 'Op',
        '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'synced', NULL);
    `);

    const projB = "https://proj-b.supabase.co";
    mockInvoke.mockResolvedValue({ config: { projectUrl: projB, anonKey: "anon-b" }, isValid: true });
    mockCreds = { projectUrl: projB, anonKey: "anon-b" };
    mockSupabaseFetch.mockImplementation(async () => new Response(JSON.stringify([]), { status: 200 }));

    const { invalidateSupabaseConfigCache } = await import("@/shared/services/supabaseConfigCache");
    invalidateSupabaseConfigCache();
    const { notesRepository } = await import("@/features/notes/services/notesRepository");
    const { notesSyncService } = await import("@/features/notes/services/notesSyncService");

    await notesRepository.moveToTrash("n1", "Op");
    const delRow = memSqlite.prepare("SELECT * FROM note_deletions WHERE id = 'n1'").get() as Record<string, unknown>;
    expect(delRow.project_url).toBeNull();

    await notesSyncService.sync();
    const deleteCalls = mockSupabaseFetch.mock.calls.filter(
      ([u, o]) => typeof u === "string" && u.startsWith(projB) && (o as { method?: string })?.method === "DELETE"
    );
    expect(deleteCalls.length).toBe(0);
  });

  it("AUD-05: single deleted remote note does not block remaining note pushes or PULL", async () => {
    memSqlite.exec(`
      CREATE TABLE notes (
        id TEXT PRIMARY KEY, supabase_id INTEGER, title TEXT, content_html TEXT, content_text TEXT,
        is_pinned INTEGER, is_archived INTEGER, color TEXT, created_by TEXT, updated_by TEXT,
        created_at TEXT, updated_at TEXT, sync_status TEXT, project_url TEXT
      );
      CREATE TABLE note_deletions (id TEXT PRIMARY KEY, supabase_id INTEGER, deleted_at TEXT, project_url TEXT);
    `);
    const proj = "https://proj-a.supabase.co";
    memSqlite.exec(`
      INSERT INTO notes VALUES ('n1', 10, 'DeletedRemotely', '', '', 0, 0, 'default', 'Op', 'Op',
        '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'pending', '${proj}');
      INSERT INTO notes VALUES ('n2', NULL, 'NewNote', '', '', 0, 0, 'default', 'Op', 'Op',
        '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'pending', '${proj}');
    `);
    mockInvoke.mockResolvedValue({ config: { projectUrl: proj, anonKey: "anon-a" }, isValid: true });
    mockCreds = { projectUrl: proj, anonKey: "anon-a" };
    mockSupabaseFetch.mockImplementation(async (_url: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") return new Response(JSON.stringify([]), { status: 200 });
      if (opts?.method === "POST") return new Response(JSON.stringify([{ id: 99 }]), { status: 201 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { notesSyncService } = await import("@/features/notes/services/notesSyncService");
    const res = await notesSyncService.sync();
    expect(res.error).toContain("eliminata");
    expect(res.pushed).toBe(1);
    const postCalls = mockSupabaseFetch.mock.calls.filter(([, o]) => (o as { method?: string })?.method === "POST");
    const getCalls = mockSupabaseFetch.mock.calls.filter(([, o]) => !(o as { method?: string })?.method || (o as { method?: string })?.method === "GET");
    expect(postCalls.length).toBe(1);
    expect(getCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("AUD-06: quote print model preserves negative global_discount_pct surcharge", async () => {
    const { prepareQuoteForPrint } = await import("@/features/quotes/document/quotePrintModel");
    const printed = prepareQuoteForPrint({
      quote_number: 1,
      year: 2026,
      quote_date: "2026-01-10",
      client_name: "ACME",
      global_discount_pct: -10,
      items: [{
        id: "i1",
        row_index: 0,
        code: "A1",
        description: "Test",
        unit: "NR",
        quantity: "1",
        purchase_price: 50,
        markup_pct: 0,
        discount_pct: 0,
        base_unit_price: 100,
        forced_unit_price: null,
        vat_rate: 22,
      }],
    } as never);
    expect(printed.totals.taxable.toNumber()).toBe(110);
  });

  it("AUD-07: buildSupabaseDdtPayloads keeps destination_address when name and city are set", async () => {
    const { buildSupabaseDdtPayloads } = await import("@/features/ddt-studio/services/ddtCloudPayload");
    const { headerPayload } = buildSupabaseDdtPayloads({
      id: "ddt-1",
      doc_number: 1,
      year: 2026,
      doc_date: "2026-01-10",
      client_name: "ACME SRL",
      destination_name: "Cantiere Nord",
      destination_address: "Via Roma 12",
      destination_city: "Milano",
      total_taxable_subunits: 10000000,
      total_vat_subunits: 2200000,
      total_document_subunits: 12200000,
    } as never, []);
    expect(headerPayload.destinazione).toBe("Cantiere Nord - Via Roma 12");
  });

  it("AUD-08: DDT 3-way merge preserves local item code and cascade discount_pct", async () => {
    const { buildSnapshotFromLocal, buildSnapshotFromCloud } = await import("@/features/ddt-studio/services/ddtSnapshotBuilders");
    const { buildSupabaseDdtPayloads } = await import("@/features/ddt-studio/services/ddtCloudPayload");
    const { mergeDdtSnapshots } = await import("@/features/ddt-studio/services/ddtMergeUtils");

    const doc = {
      id: "ddt-1", doc_number: 1, year: 2026, doc_date: "2026-01-10", client_name: "ACME",
      total_taxable_subunits: 8730000, total_vat_subunits: 1920600, total_document_subunits: 10650600,
    } as never;
    const items = [{
      id: "it-1", row_index: 0, row_kind: "item", code: "ART-001", description: "Vite",
      unit: "NR", quantity: "1", unit_price_subunits: 10000000, purchase_price_subunits: 5000000,
      discount_pct: "10+3", vat_rate: 22, net_amount_subunits: 8730000, vat_amount_subunits: 1920600,
    }] as never;

    const baseSnap = buildSnapshotFromLocal(doc, items);
    const localSnap = buildSnapshotFromLocal(doc, items);
    const { headerPayload, linePayloads } = buildSupabaseDdtPayloads(doc, items);
    const remoteSnap = buildSnapshotFromCloud(headerPayload as never, linePayloads as never);

    const result = mergeDdtSnapshots(baseSnap, localSnap, new Set(), remoteSnap);
    expect(result.conflicts.length).toBe(0);
    expect(result.merged.items[0].code).toBe("ART-001");
    expect(result.merged.items[0].discount_pct).toBe("10+3");
  });

  it("AUD-09: modular restore in replace mode clears stale pending_cloud_operations for legacy backups", async () => {
    memSqlite.exec(`
      CREATE TABLE quotes (id TEXT PRIMARY KEY, quote_number INTEGER, year INTEGER, client_name TEXT);
      CREATE TABLE quote_items (id TEXT PRIMARY KEY, quote_id TEXT);
      CREATE TABLE quotes_trash (id TEXT PRIMARY KEY);
      CREATE TABLE quote_favorites (id TEXT PRIMARY KEY);
      CREATE TABLE pending_cloud_operations (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, record_id TEXT,
        action TEXT, payload TEXT, created_at TEXT, project_url TEXT
      );
      INSERT INTO pending_cloud_operations (scope, record_id, action, payload, created_at, project_url)
        VALUES ('quotes', 'q1', 'delete', '{}', '2026-01-01T00:00:00Z', 'https://proj-a.supabase.co');
    `);

    const { restoreModularBackup } = await import("@/features/settings/services/backupService");
    const legacyPkg = {
      format: "last-modular-backup",
      version: 1,
      appVersion: "0.3.5",
      createdAt: "2026-01-01T00:00:00Z",
      categories: ["quotes"],
      tables: {
        quotes: [{ id: "q1", quote_number: 1, year: 2026, client_name: "ACME" }],
        quote_items: [],
        quotes_trash: [],
        quote_favorites: [],
      },
    };
    const res = await restoreModularBackup(legacyPkg as never, ["quotes"], "replace");
    expect(res.success).toBe(true);
    const remaining = memSqlite.prepare("SELECT * FROM pending_cloud_operations WHERE scope = 'quotes'").all();
    expect(remaining.length).toBe(0);
  });

  it("AUD-11: companySettingsRepository preserves sync_status='pending' when stale push resolves after newer failed save", async () => {
    memSqlite.exec(`
      CREATE TABLE company_settings (
        id TEXT PRIMARY KEY, business_name TEXT, address TEXT, postal_code TEXT, city TEXT, province TEXT,
        vat_number TEXT, fiscal_code TEXT, sdi_code TEXT, phone TEXT, email TEXT, logo_data_url TEXT,
        created_at TEXT, updated_at TEXT, updated_by TEXT, deleted_at TEXT, sync_status TEXT
      );
    `);
    const proj = "https://proj-a.supabase.co";
    mockInvoke.mockResolvedValue({ config: { projectUrl: proj, anonKey: "anon-a" }, isValid: true });
    mockCreds = { projectUrl: proj, anonKey: "anon-a" };

    let resolveFirst!: (r: Response) => void;
    let callCount = 0;
    mockSupabaseFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.reject(new Error("Network offline for E2"));
    });

    const { saveCompanySettings, clearCompanySettingsCache, DEFAULT_COMPANY_SETTINGS } = await import("@/features/settings/companySettingsRepository");
    clearCompanySettingsCache();

    const p1 = saveCompanySettings({ ...DEFAULT_COMPANY_SETTINGS, business_name: "Edit 1" });
    await new Promise((r) => setTimeout(r, 20));
    const p2 = saveCompanySettings({ ...DEFAULT_COMPANY_SETTINGS, business_name: "Edit 2" });
    await p2;

    resolveFirst(new Response("", { status: 201 }));
    await p1;

    const afterResolve = memSqlite.prepare("SELECT business_name, sync_status FROM company_settings").get() as Record<string, unknown>;
    expect(afterResolve.business_name).toBe("Edit 2");
    expect(afterResolve.sync_status).toBe("pending");
  });

  it("AUD-12: flushPendingCloudOperations reruns for operations enqueued mid-flush", async () => {
    memSqlite.exec(`
      CREATE TABLE pending_cloud_operations (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, record_id TEXT,
        action TEXT, payload TEXT, project_url TEXT
      );
    `);
    const proj = "https://proj-a.supabase.co";
    const { pendingCloudWrite, flushPendingCloudOperations } = await import("@/shared/data-layer/pendingCloudOperations");
    const adapter = createSqliteAdapter(memSqlite);
    const w1 = pendingCloudWrite("quotes", "q1", "delete", {}, proj);
    await adapter.execute(w1.sql, w1.params);

    let releaseFirst!: () => void;
    const processed: string[] = [];
    const handler = vi.fn(async (op: { record_id: string }) => {
      processed.push(op.record_id);
      if (op.record_id === "q1") {
        await new Promise<void>((r) => {
          releaseFirst = r;
        });
      }
    });

    const flush1 = flushPendingCloudOperations("quotes", handler, proj);
    await new Promise((r) => setTimeout(r, 20));
    const w2 = pendingCloudWrite("quotes", "q2", "delete", {}, proj);
    await adapter.execute(w2.sql, w2.params);
    const flush2 = flushPendingCloudOperations("quotes", handler, proj);

    releaseFirst();
    await Promise.all([flush1, flush2]);
    expect(processed).toEqual(["q1", "q2"]);
    const remaining = memSqlite.prepare("SELECT record_id FROM pending_cloud_operations").all();
    expect(remaining.length).toBe(0);
  });

  it("AUD-14: invoiceXmlParser rejects non-FatturaPA XML and negates TD04 credit note totals", async () => {
    const origDP = globalThis.DOMParser;
    (globalThis as Record<string, unknown>).DOMParser = class {
      parseFromString(xml: string) {
        const hasBody = xml.includes("FatturaElettronicaBody");
        const makeEl = (tag: string, text: string, children: unknown[] = []) => ({
          localName: tag.toLowerCase(),
          nodeName: tag,
          textContent: text,
          getElementsByTagName: (q: string) => (q === "*" ? children : []),
        });
        const riepilogo = makeEl("DatiRiepilogo", "", [
          makeEl("ImponibileImporto", "100.00"),
          makeEl("Imposta", "22.00"),
        ]);
        const bodyChildren = [
          makeEl("TipoDocumento", "TD04"),
          makeEl("Numero", "NC-1"),
          makeEl("Data", "2026-02-01"),
          makeEl("ImportoTotaleDocumento", "122.00"),
          riepilogo,
        ];
        const bodyEl = makeEl("FatturaElettronicaBody", "", bodyChildren);
        return {
          getElementsByTagName: (tag: string) => {
            if (tag === "*" && hasBody) return [bodyEl];
            if (tag === "FatturaElettronicaBody") return hasBody ? [bodyEl] : [];
            return [];
          },
          querySelector: () => null,
        };
      }
    } as never;

    try {
      const { parseInvoiceXmlAll } = await import("@/features/invoices/services/invoiceXmlParser");
      expect(() => parseInvoiceXmlAll("<root><hello>world</hello></root>", "random.xml")).toThrow();
      const [nc] = parseInvoiceXmlAll("<FatturaElettronicaBody></FatturaElettronicaBody>", "nc.xml");
      expect(nc.invoice.total_amount).toBe(-122);
      expect(nc.invoice.taxable_amount).toBe(-100);
      expect(nc.invoice.vat_amount).toBe(-22);
    } finally {
      (globalThis as Record<string, unknown>).DOMParser = origDP;
    }
  });

  it("AUD-15: DDT cascade discount >100% is ignored so net and VAT never go negative", async () => {
    const { calculateRowAmounts } = await import("@/features/ddt-studio/utils/ddtCalculations");
    const res = calculateRowAmounts("1", 100, "120", 22);
    expect(res.netAmount.toNumber()).toBe(100);
    expect(res.vatAmount.toNumber()).toBe(22);
  });

  it("AUD-16: registerRibaPayment does not mark localStorage isPaid when SQLite & Supabase fail", async () => {
    const { registerRibaPayment, getLocalRibaStatus } = await import("@/features/dashboard/services/ribaService");
    const res = await registerRibaPayment("2026-03-31", "31/03/2026", "2026-03-20T10:00:00Z");
    expect(res.confirmed).toBe(false);
    expect(getLocalRibaStatus("2026-03-31")).toBeNull();
  });

  it("AUD-17: AppUserService fails closed on corrupted allowed_pages, enforces admin backup perm, and blocks empty-hash password lock", async () => {
    memSqlite.exec(`
      CREATE TABLE app_users (
        id TEXT PRIMARY KEY, name TEXT, station_name TEXT, is_admin INTEGER,
        can_access_settings INTEGER, can_access_ddt INTEGER, can_access_price_lists INTEGER,
        can_edit_price_lists INTEGER, can_edit_or_numbers INTEGER, can_manage_backups INTEGER,
        password_hash TEXT, require_password INTEGER, allowed_pages TEXT,
        theme_preset TEXT, theme_brightness INTEGER, topbar_order TEXT,
        created_at TEXT, updated_at TEXT
      );
      INSERT INTO app_users VALUES (
        'u-nonadmin', 'Operatore', 'PC1', 0, 0, 1, 1, 0, 0, 0, '', 0,
        '{corrupted-json', 'grigio', 4, '[]', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
      );
      INSERT INTO app_users VALUES (
        'u-admin', 'Admin', 'Ufficio', 1, 1, 1, 1, 1, 1, 0, '', 0,
        '["dashboard"]', 'grigio', 4, '[]', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
      );
    `);
    const { AppUserService } = await import("@/shared/services/appUserService");
    const users = await AppUserService.getAllUsers();
    const nonAdmin = users.find((x) => x.id === "u-nonadmin")!;
    const admin = users.find((x) => x.id === "u-admin")!;
    expect(nonAdmin.allowed_pages).toEqual(["dashboard"]);
    expect(admin.can_manage_backups).toBe(true);

    await expect(
      AppUserService.updateUser({
        ...nonAdmin,
        require_password: true,
        password_hash: "",
      })
    ).rejects.toThrow();
  });

  it("AUD-18: generalPriceListWorkbook escapes formulas in NOTE column (col 19)", async () => {
    const { buildGeneralPriceListWorkbook } = await import("@/features/price-lists/services/generalPriceListWorkbook");
    const wb = buildGeneralPriceListWorkbook([{
      id: "p1", codice: "C1", cod_f: "CF1", fornitore: "F1", descrizione: "=SUM(A1:A2)",
      um: "NR", cat: "", data_ref: "", prezzo_listino: 10, sconto: "", prezzo_acquisto: 5,
      perc_pub: 0, prezzo_pubblico: 12, perc_prof: 0, prezzo_profess: 11, perc_fatt: 0,
      aumento: 0, r1: "", maga: "", r2: "", note: '=HYPERLINK("http://evil","click")',
    } as never]);
    const ws = wb.worksheets[0];
    let foundNote: string | null = null;
    ws.eachRow((row) => {
      const c19 = row.getCell(19).value;
      if (typeof c19 === "string" && c19.includes("HYPERLINK")) {
        foundNote = c19;
      }
    });
    expect(foundNote).toBe('\'=HYPERLINK("http://evil","click")');
  });

  it("AUD-21: hasAnyUnsavedChanges returns true for windowCloseGuards without a dirtyCheck", async () => {
    const { registerWindowCloseGuard, hasAnyUnsavedChanges } = await import("@/shared/stores/useWindowStore");
    const unregister = registerWindowCloseGuard("test-win-guard-only", async () => true);
    try {
      expect(hasAnyUnsavedChanges()).toBe(true);
    } finally {
      unregister();
    }
  });
});
