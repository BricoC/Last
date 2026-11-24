import { supabaseFetch } from "@/shared/services/supabaseSession";
import { getDatabase } from "@/shared/data-layer/database";
import { applyLocalDatabaseBatch, type SqliteWrite } from "@/shared/data-layer/localDatabaseBatch";
import { invoke } from "@tauri-apps/api/core";
import { buildMultiTermSqlSearch } from "@/shared/utils/multiTermSqlSearch";
import {
  matchesActiveSupabaseProject,
  normalizeSupabaseProjectUrl,
  resolveActiveSupabaseProjectUrl,
} from "@/shared/services/supabaseConfigCache";
import { parseInvoiceXmlAll, ParsedInvoiceResult } from "./invoiceXmlParser";

export interface SupplierInvoice {
  id?: number;
  supplier_name: string;
  vat_number?: string;
  fiscal_code?: string;
  doc_number: string;
  doc_date: string;
  year: number;
  total_amount: number;
  taxable_amount: number;
  vat_amount: number;
  payment_method?: string;
  due_date?: string;
  iban?: string;
  bank_name?: string;
  file_name?: string;
  notes?: string;
}

export interface SupplierInvoiceItem {
  id?: number;
  invoice_id?: number;
  supplier_name: string;
  doc_number: string;
  doc_date: string;
  year: number;
  line_number?: number;
  article_code?: string;
  description: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  discount_1: number;
  discount_2: number;
  discount_3: number;
  discounted_price: number;
  total_price: number;
  vat_rate: number;
}

export interface ImportXmlResult {
  totalFiles: number;
  importedInvoices: number;
  skippedDuplicates: number;
  totalLines: number;
  errors: { fileName: string; error: string }[];
  cloudSynced: boolean;
  cloudError?: string;
}

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
  configPath: string;
}

export function invoiceIssuerKey(vat: string | null | undefined, fiscalCode: string | null | undefined, supplier: string): string {
  const taxId = (value: string | null | undefined) => (value ?? "").replace(/[ \t\r\n]/g, "").toUpperCase();
  const vatNumber = taxId(vat);
  if (vatNumber) return "vat:" + vatNumber.replace(/^IT(?=\d{11}$)/, "");
  const fiscal = taxId(fiscalCode);
  return fiscal ? "cf:" + fiscal : "name:" + supplier.trim().toUpperCase();
}

export class ElectronicInvoicesService {
  private retryingUploads: Promise<void> | null = null;

  retryPendingUploads(): Promise<void> {
    if (this.retryingUploads) return this.retryingUploads;
    this.retryingUploads = this.uploadPendingInvoices().finally(() => { this.retryingUploads = null; });
    return this.retryingUploads;
  }

  private async uploadPendingInvoices(): Promise<void> {
    const db = await getDatabase();
    const invoices = await db.select<Array<SupplierInvoice & { id: number; project_url?: string | null }>>(
      "SELECT * FROM supplier_invoices WHERE cloud_upload_pending = 1 ORDER BY id",
    );
    if (!invoices.length) return;
    const status = await invoke<ConfigStatus>("load_supabase_config");
    if (!status.config?.projectUrl || !status.config.anonKey) throw new Error("Invio fatture in attesa della connessione cloud.");
    const { projectUrl, anonKey } = status.config;
    const activeProjectUrl = normalizeSupabaseProjectUrl(projectUrl);
    const matchingInvoices = invoices.filter((inv) =>
      matchesActiveSupabaseProject(inv.project_url, activeProjectUrl)
    );
    if (!matchingInvoices.length) return;
    const failures: string[] = [];

    for (const invoice of matchingInvoices) {
      const items = await db.select<SupplierInvoiceItem[]>(
        "SELECT * FROM supplier_invoice_items WHERE invoice_id = $1 ORDER BY line_number, id",
        [invoice.id],
      );
      const header = {
        fornitore: invoice.supplier_name,
        partita_iva: invoice.vat_number || null,
        codice_fiscale: invoice.fiscal_code || null,
        numero_documento: invoice.doc_number,
        data_documento: invoice.doc_date,
        anno: invoice.year,
        totale_documento: invoice.total_amount,
        imponibile: invoice.taxable_amount,
        imposta: invoice.vat_amount,
        tipo_pagamento: invoice.payment_method || null,
        data_scadenza: invoice.due_date || null,
        iban: invoice.iban || null,
        istituto_finanziario: invoice.bank_name || null,
        nome_file: invoice.file_name || null,
        note: invoice.notes || null,
      };
      const lines = items.map((it) => ({
        numero_linea: it.line_number || 1,
        codice_articolo: it.article_code || null,
        descrizione: it.description,
        quantita: it.quantity,
        unita_misura: it.unit || null,
        prezzo_unitario: it.unit_price,
        sconto_1: it.discount_1,
        sconto_2: it.discount_2,
        sconto_3: it.discount_3,
        prezzo_scontato: it.discounted_price,
        prezzo_totale: it.total_price,
        aliquota_iva: it.vat_rate,
      }));
      try {
        const response = await supabaseFetch(new URL("/rest/v1/rpc/last_replace_supplier_invoice_v2", projectUrl), {
          method: "POST",
          headers: { apikey: anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ p_header: header, p_lines: lines }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await db.execute(
          "UPDATE supplier_invoices SET cloud_upload_pending = 0, cloud_uploaded_at = $1 WHERE id = $2",
          [new Date().toISOString(), invoice.id],
        );
      } catch (error) {
        failures.push(`${invoice.doc_number}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length) throw new Error(`Fatture salvate in locale. Invio cloud incompleto: ${failures.join(" · ")}.`);
  }

  /**
   * Conta quanti record ci sono nel database locale
   */
  async getLocalCounts(): Promise<{ testate: number; righe: number }> {
    const db = await getDatabase();
    const tRes = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM supplier_invoices");
    const rRes = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM supplier_invoice_items");
    return {
      testate: tRes[0]?.count || 0,
      righe: rRes[0]?.count || 0,
    };
  }

  /**
   * Sincronizza / Scarica tutte le fatture e righe da Supabase nel database locale SQLite
   */
  async syncFromSupabase(
    onProgress?: (msg: string, percent: number) => void
  ): Promise<{ testateCount: number; righeCount: number }> {
    const startedAt = new Date().toISOString();
    const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
    if (!status?.config?.projectUrl || !status?.config?.anonKey) {
      throw new Error("Configurazione Supabase mancante o non valida.");
    }

    const { projectUrl, anonKey } = status.config;
    const cleanUrl = projectUrl.replace(/\/+$/, "");
    const headers = {
      apikey: anonKey,
    };

    onProgress?.("Connessione a Supabase...", 5);

    // 1. Scarica tutte le testate con paginazione
    onProgress?.("Download testate fatture...", 10);
    const writes: SqliteWrite[] = [];
    const remoteInvoices = new Map<string, [string, string, string]>();
    const legacyInvoiceKeys = new Map<string, [string, string, string] | null>();
    let testateOffset = 0;
    const testatePageSize = 1000;
    let totalTestate = 0;

    while (true) {
      const testateRes = await supabaseFetch(
        `${cleanUrl}/rest/v1/fatture_elettroniche_testate?select=*&order=id.asc&offset=${testateOffset}&limit=${testatePageSize}`,
        { headers }
      );
      if (!testateRes.ok) {
        throw new Error(`Errore fetch testate: HTTP ${testateRes.status}`);
      }
      const rawTestate: any[] = await testateRes.json();
      if (!Array.isArray(rawTestate)) throw new Error("Risposta non valida per le testate fatture.");
      if (rawTestate.length === 0) break;

      totalTestate += rawTestate.length;
      onProgress?.(`Scaricate ${totalTestate} testate...`, 20);

      for (const t of rawTestate) {
        const issuer = t.issuer_key || invoiceIssuerKey(t.partita_iva, t.codice_fiscale, t.fornitore || "");
        const identity: [string, string, string] = [
          issuer, String(t.numero_documento || "").trim(), t.data_documento || "",
        ];
        if (t.id != null) remoteInvoices.set(String(t.id), identity);
        const legacyKey = JSON.stringify([t.fornitore || "", identity[1], identity[2]]);
        legacyInvoiceKeys.set(legacyKey, legacyInvoiceKeys.has(legacyKey) ? null : identity);
        writes.push({
          sql: `INSERT INTO supplier_invoices (
            supplier_name, vat_number, fiscal_code, doc_number, doc_date, year,
            total_amount, taxable_amount, vat_amount, payment_method, due_date,
            iban, bank_name, file_name, notes, project_url, issuer_key
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$17,$18)
          ON CONFLICT(issuer_key, doc_number, doc_date) DO UPDATE SET
            supplier_name = excluded.supplier_name,
            vat_number = excluded.vat_number,
            fiscal_code = excluded.fiscal_code,
            year = excluded.year,
            total_amount = excluded.total_amount,
            taxable_amount = excluded.taxable_amount,
            vat_amount = excluded.vat_amount,
            payment_method = excluded.payment_method,
            due_date = excluded.due_date,
            iban = excluded.iban,
            bank_name = excluded.bank_name,
            file_name = excluded.file_name,
            notes = excluded.notes,
            project_url = excluded.project_url
          WHERE supplier_invoices.cloud_upload_pending = 0
            AND supplier_invoices.project_url = excluded.project_url
            AND (supplier_invoices.cloud_uploaded_at IS NULL
              OR julianday(supplier_invoices.cloud_uploaded_at) < julianday($16));`,
          params: [
            t.fornitore || "",
            t.partita_iva || null,
            t.codice_fiscale || null,
            String(t.numero_documento || "").trim(),
            t.data_documento || "",
            Number(t.anno) || new Date(t.data_documento || "").getFullYear() || 2026,
            Number(t.totale_documento) || 0,
            Number(t.imponibile) || 0,
            Number(t.imposta) || 0,
            t.tipo_pagamento || null,
            t.data_scadenza || null,
            t.iban || null,
            t.istituto_finanziario || null,
            t.nome_file || null,
            t.note || null,
            startedAt,
            normalizeSupabaseProjectUrl(projectUrl),
            issuer,
          ]
        });
      }

      testateOffset += rawTestate.length;
    }

    // 3. Scarica tutte le righe a blocchi paginati da 1000
    onProgress?.("Download righe articoli da Supabase...", 35);
    let offset = 0;
    const pageSize = 1000;
    let totalRighe = 0;

    const activeSyncProjectUrl = normalizeSupabaseProjectUrl(projectUrl);
    writes.push({
      sql: `DELETE FROM supplier_invoice_items WHERE invoice_id IN (
        SELECT invoice.id FROM supplier_invoices AS invoice
        JOIN json_each($3) AS imported
          ON invoice.issuer_key = json_extract(imported.value,'$[0]')
          AND invoice.doc_number = json_extract(imported.value,'$[1]')
          AND invoice.doc_date = json_extract(imported.value,'$[2]')
        WHERE invoice.cloud_upload_pending = 0 AND invoice.project_url = $2
          AND (invoice.cloud_uploaded_at IS NULL OR julianday(invoice.cloud_uploaded_at) < julianday($1))
      )`,
      params: [startedAt, activeSyncProjectUrl,
        JSON.stringify([...remoteInvoices.values(), ...[...legacyInvoiceKeys.values()].filter(Boolean)])],
    });

    while (true) {
      const righeRes = await supabaseFetch(
        `${cleanUrl}/rest/v1/fatture_elettroniche_righe?select=*&order=id.asc&offset=${offset}&limit=${pageSize}`,
        { headers }
      );
      if (!righeRes.ok) {
        throw new Error(`Errore fetch righe: HTTP ${righeRes.status}`);
      }
      const rawRighe: any[] = await righeRes.json();
      if (!Array.isArray(rawRighe)) throw new Error("Risposta non valida per le righe fatture.");
      if (rawRighe.length === 0) break;

      totalRighe += rawRighe.length;
      const pct = Math.min(95, Math.round(35 + (offset / 25000) * 60));
      onProgress?.(`Scaricate ${totalRighe} righe articolo...`, pct);

      for (const r of rawRighe) {
        const identity = r.invoice_id != null
          ? remoteInvoices.get(String(r.invoice_id))
          : legacyInvoiceKeys.get(JSON.stringify([r.fornitore || "", String(r.numero_documento || "").trim(), r.data_documento || ""]));
        if (!identity) {
          if (identity === null) {
            throw new Error("Una riga fattura cloud non ha una testata univoca. Verifica i dati su Supabase.");
          }
          if (r.invoice_id != null) {
            // Testata inserita concorrentemente da un altro PC tra il fetch testate e righe: salta la riga per questo ciclo
            console.warn(`[ElectronicInvoices] Riga ${r.id ?? "?"} ignorata temporaneamente: testata ${r.invoice_id} non presente nello snapshot corrente.`);
          }
          continue;
        }
        writes.push({
          sql: `INSERT INTO supplier_invoice_items (
            invoice_id, supplier_name, doc_number, doc_date, year, line_number, article_code,
            description, quantity, unit, unit_price, discount_1, discount_2, discount_3,
            discounted_price, total_price, vat_rate
          ) SELECT id,supplier_name,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
          FROM supplier_invoices WHERE issuer_key = $1 AND doc_number = $2 AND doc_date = $3
            AND cloud_upload_pending = 0 AND project_url = $18
            AND (cloud_uploaded_at IS NULL OR julianday(cloud_uploaded_at) < julianday($17));`,
          params: [
            ...identity,
            Number(r.anno) || new Date(r.data_documento || "").getFullYear() || 2026,
            Number(r.numero_linea) || 1,
            r.codice_articolo || null,
            r.descrizione || "",
            Number(r.quantita) || 0,
            r.unita_misura || null,
            Number(r.prezzo_unitario) || 0,
            Number(r.sconto_1) || 0,
            Number(r.sconto_2) || 0,
            Number(r.sconto_3) || 0,
            Number(r.prezzo_scontato) || 0,
            Number(r.prezzo_totale) || 0,
            r.aliquota_iva !== null && r.aliquota_iva !== undefined && r.aliquota_iva !== "" && Number.isFinite(Number(r.aliquota_iva))
              ? Number(r.aliquota_iva)
              : 22,
            startedAt,
            activeSyncProjectUrl,
          ]
        });
      }

      offset += rawRighe.length;
    }

    onProgress?.("Aggiornamento archivio fatture locale...", 95);
    await getDatabase();
    await applyLocalDatabaseBatch(writes);
    onProgress?.("Sincronizzazione completata con successo!", 100);
    return { testateCount: totalTestate, righeCount: totalRighe };
  }

  /**
   * Importa file XML di fatture elettroniche:
   * 1. Effettua il parsing XML (standard SDI FPR12/FPA12)
   * 2. Verifica ed evita duplicati rispetto al database locale
   * 3. Salva testate e righe su SQLite locale
   * 4. Sincronizza automaticamente le nuove fatture su Supabase Cloud
   */
  async importXmlFiles(
    files: { name: string; content: string | ArrayBuffer | Uint8Array }[],
    onProgress?: (msg: string, percent: number) => void
  ): Promise<ImportXmlResult> {
    const errors: { fileName: string; error: string }[] = [];
    const parsedList: ParsedInvoiceResult[] = [];

    onProgress?.("Parsing dei file XML in corso...", 5);

    // 1. Parsing di ciascun file (supporta multi-FatturaElettronicaBody e .p7m binari)
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const parsedBatch = parseInvoiceXmlAll(f.content, f.name);
        parsedList.push(...parsedBatch);
      } catch (err) {
        errors.push({
          fileName: f.name,
          error: err instanceof Error ? err.message : "Errore parsing XML",
        });
      }
      const pct = Math.min(25, Math.round(5 + ((i + 1) / files.length) * 20));
      onProgress?.(`Analisi ${f.name} (${i + 1}/${files.length})...`, pct);
    }

    if (parsedList.length === 0) {
      return {
        totalFiles: files.length,
        importedInvoices: 0,
        skippedDuplicates: 0,
        totalLines: 0,
        errors,
        cloudSynced: false,
      };
    }

    // 2. Controllo duplicati con SQLite
    onProgress?.("Verifica duplicati nel database locale...", 30);
    const db = await getDatabase();
    const existing = await db.select<{ issuer_key: string; d_num: string; d_date: string }[]>(
      `SELECT issuer_key, doc_number as d_num, doc_date as d_date FROM supplier_invoices`
    );

    const existingKeySet = new Set<string>();
    for (const r of existing) {
      const k = JSON.stringify([r.issuer_key, r.d_num.trim().toUpperCase(), r.d_date.trim()]);
      existingKeySet.add(k);
    }

    const toInsert: ParsedInvoiceResult[] = [];
    let skippedDuplicates = 0;

    for (const p of parsedList) {
      const { invoice } = p;
      const issuer = invoiceIssuerKey(invoice.vat_number, invoice.fiscal_code, invoice.supplier_name);
      const k = JSON.stringify([issuer, invoice.doc_number.trim().toUpperCase(), invoice.doc_date.trim()]);
      if (existingKeySet.has(k)) {
        skippedDuplicates++;
      } else {
        existingKeySet.add(k); // Evita duplicati anche all'interno dello stesso batch
        toInsert.push(p);
      }
    }

    if (toInsert.length === 0) {
      onProgress?.("Tutte le fatture sono già presenti nell'archivio.", 100);
      return {
        totalFiles: files.length,
        importedInvoices: 0,
        skippedDuplicates,
        totalLines: 0,
        errors,
        cloudSynced: false,
      };
    }

    // 3. Salva l'import locale prima di tentare l'invio cloud.
    const localWrites: SqliteWrite[] = [];
    let totalLinesInserted = 0;
    for (let i = 0; i < toInsert.length; i++) {
      const { invoice, items } = toInsert[i];
      const issuer = invoiceIssuerKey(invoice.vat_number, invoice.fiscal_code, invoice.supplier_name);
      const pct = Math.min(70, Math.round(30 + ((i + 1) / toInsert.length) * 40));
      onProgress?.(`Salvataggio ${invoice.supplier_name} doc. ${invoice.doc_number}...`, pct);

      localWrites.push({
        sql: `INSERT INTO supplier_invoices (
          supplier_name, vat_number, fiscal_code, doc_number, doc_date, year,
          total_amount, taxable_amount, vat_amount, payment_method, due_date,
          iban, bank_name, file_name, notes, cloud_upload_pending, project_url, issuer_key
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,$16,$17);`,
        params: [
          invoice.supplier_name,
          invoice.vat_number || null,
          invoice.fiscal_code || null,
          invoice.doc_number,
          invoice.doc_date,
          invoice.year,
          invoice.total_amount,
          invoice.taxable_amount,
          invoice.vat_amount,
          invoice.payment_method || null,
          invoice.due_date || null,
          invoice.iban || null,
          invoice.bank_name || null,
          invoice.file_name || null,
          invoice.notes || null,
          await resolveActiveSupabaseProjectUrl(),
          issuer,
        ],
      });

      for (const it of items) {
        localWrites.push({
          sql: `INSERT INTO supplier_invoice_items (
            invoice_id, supplier_name, doc_number, doc_date, year, line_number, article_code,
            description, quantity, unit, unit_price, discount_1, discount_2, discount_3,
            discounted_price, total_price, vat_rate
          ) SELECT id, supplier_name, $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
          FROM supplier_invoices WHERE issuer_key = $1 AND doc_number = $2 AND doc_date = $3;`,
          params: [
            issuer,
            invoice.doc_number,
            invoice.doc_date,
            it.year,
            it.line_number || 1,
            it.article_code || null,
            it.description,
            it.quantity,
            it.unit || null,
            it.unit_price,
            it.discount_1,
            it.discount_2,
            it.discount_3,
            it.discounted_price,
            it.total_price,
            it.vat_rate,
          ],
        });
        totalLinesInserted++;
      }
    }
    await applyLocalDatabaseBatch(localWrites);

    // 4. Invio a Supabase Cloud
    let cloudSynced = false;
    let cloudError: string | undefined;
    try {
      onProgress?.("Invio su Supabase Cloud...", 75);
      await this.retryPendingUploads();
      const activeProjectUrl = await resolveActiveSupabaseProjectUrl();
      const pending = activeProjectUrl
        ? await db.select<Array<{ id: number }>>(
            "SELECT id FROM supplier_invoices WHERE cloud_upload_pending = 1 AND project_url = $1 LIMIT 1",
            [activeProjectUrl]
          )
        : await db.select<Array<{ id: number }>>(
            "SELECT id FROM supplier_invoices WHERE cloud_upload_pending = 1 LIMIT 1"
          );
      cloudSynced = pending.length === 0;
      if (!cloudSynced) cloudError = "Fatture salvate in locale. Invio cloud ancora in sospeso.";
    } catch (error) {
      cloudError = error instanceof Error ? error.message : String(error);
    }

    onProgress?.(cloudError ? "Importazione locale completata. Invio cloud incompleto." : "Importazione completata con successo!", 100);

    return {
      totalFiles: files.length,
      importedInvoices: toInsert.length,
      skippedDuplicates,
      totalLines: totalLinesInserted,
      errors,
      cloudSynced,
      cloudError,
    };
  }

  /**
   * Carica tutte le righe dal database locale per la ricerca istantanea in memoria a 60fps (come DDT Articoli)
   */
  async getAllItems(): Promise<SupplierInvoiceItem[]> {
    const db = await getDatabase();
    return db.select<SupplierInvoiceItem[]>(
      `SELECT * FROM supplier_invoice_items ORDER BY doc_date DESC, id DESC`
    );
  }

  /**
   * Carica tutte le testate fattura dal database locale
   */
  async getAllInvoices(): Promise<SupplierInvoice[]> {
    const db = await getDatabase();
    return db.select<SupplierInvoice[]>(
      `SELECT * FROM supplier_invoices ORDER BY doc_date DESC, id DESC`
    );
  }

  /**
   * Cerca e filtra righe articolo con ricerca multi-termine (AND di parole)
   */
  async searchItems(params: {
    query?: string;
    year?: number | null;
    supplier?: string;
    onlyWithPrice?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ items: SupplierInvoiceItem[]; totalCount: number }> {
    const db = await getDatabase();
    const whereClauses: string[] = [];
    const sqlParams: any[] = [];

    if (params.year) {
      whereClauses.push("year = ?");
      sqlParams.push(params.year);
    }

    if (params.supplier && params.supplier.trim() !== "") {
      whereClauses.push("supplier_name = ?");
      sqlParams.push(params.supplier.trim());
    }

    if (params.onlyWithPrice) {
      whereClauses.push("(discounted_price > 0 OR unit_price > 0 OR total_price > 0)");
    }

    if (params.query && params.query.trim() !== "") {
      const searchSql = buildMultiTermSqlSearch(
        params.query,
        ["description", "article_code", "supplier_name", "doc_number"],
        { numberedParameters: false, stripPunctuation: true }
      );
      if (searchSql.sql) {
        whereClauses.push(`(${searchSql.sql})`);
        sqlParams.push(...searchSql.params);
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Conteggio totale
    const countRes = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM supplier_invoice_items ${whereSql}`,
      sqlParams
    );
    const totalCount = countRes[0]?.count || 0;

    // Selezione con limite
    const limit = params.limit || 300;
    const offset = params.offset || 0;

    const selectSql = `
      SELECT * FROM supplier_invoice_items
      ${whereSql}
      ORDER BY doc_date DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const items = await db.select<SupplierInvoiceItem[]>(selectSql, sqlParams);
    return { items, totalCount };
  }

  /**
   * Cerca e visualizza le testate fattura con ricerca multi-termine
   */
  async searchInvoices(params: {
    query?: string;
    year?: number | null;
    limit?: number;
  }): Promise<SupplierInvoice[]> {
    const db = await getDatabase();
    const whereClauses: string[] = [];
    const sqlParams: any[] = [];

    if (params.year) {
      whereClauses.push("year = ?");
      sqlParams.push(params.year);
    }

    if (params.query && params.query.trim() !== "") {
      const searchSql = buildMultiTermSqlSearch(
        params.query,
        ["supplier_name", "doc_number", "iban", "bank_name", "notes"],
        { numberedParameters: false, stripPunctuation: true }
      );
      if (searchSql.sql) {
        whereClauses.push(`(${searchSql.sql})`);
        sqlParams.push(...searchSql.params);
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const limit = params.limit || 500;

    return db.select<SupplierInvoice[]>(
      `SELECT * FROM supplier_invoices ${whereSql} ORDER BY doc_date DESC LIMIT ${limit}`,
      sqlParams
    );
  }

  async getInvoiceById(id: number): Promise<SupplierInvoice | undefined> {
    const db = await getDatabase();
    const [invoice] = await db.select<SupplierInvoice[]>("SELECT * FROM supplier_invoices WHERE id=$1", [id]);
    return invoice;
  }

  async getInvoiceLines(supplierName: string, docNumber: string, docDate: string, invoiceId?: number): Promise<SupplierInvoiceItem[]> {
    const db = await getDatabase();
    return db.select<SupplierInvoiceItem[]>(
      `SELECT * FROM supplier_invoice_items
       WHERE invoice_id = $4 OR ($4 IS NULL AND invoice_id IS NULL
         AND supplier_name = $1 AND doc_number = $2 AND doc_date = $3)
       ORDER BY line_number ASC, id ASC`,
      [supplierName, docNumber, docDate, invoiceId ?? null]
    );
  }

  /**
   * Recupera tutti i fornitori unici per il dropdown
   */
  async getUniqueSuppliers(): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.select<{ supplier_name: string }[]>(
      `SELECT DISTINCT supplier_name FROM supplier_invoices WHERE supplier_name IS NOT NULL AND supplier_name != '' ORDER BY supplier_name ASC`
    );
    return rows.map((r) => r.supplier_name);
  }
}

export const electronicInvoicesService = new ElectronicInvoicesService();

