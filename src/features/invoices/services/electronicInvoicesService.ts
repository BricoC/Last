import { getDatabase } from "@/shared/data-layer/database";
import { invoke } from "@tauri-apps/api/core";
import { buildMultiTermSqlSearch } from "@/shared/utils/multiTermSqlSearch";
import { parseInvoiceXml, ParsedInvoiceResult } from "./invoiceXmlParser";

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

export class ElectronicInvoicesService {
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
    const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
    if (!status?.config?.projectUrl || !status?.config?.anonKey) {
      throw new Error("Configurazione Supabase mancante o non valida.");
    }

    const { projectUrl, anonKey } = status.config;
    const cleanUrl = projectUrl.replace(/\/+$/, "");
    const headers = {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    };

    onProgress?.("Connessione a Supabase...", 5);

    // 1. Scarica tutte le testate con paginazione
    onProgress?.("Download testate fatture...", 10);
    const db = await getDatabase();
    let testateOffset = 0;
    const testatePageSize = 1000;
    let totalTestate = 0;

    while (true) {
      const testateRes = await fetch(
        `${cleanUrl}/rest/v1/fatture_elettroniche_testate?select=*&order=id.asc&offset=${testateOffset}&limit=${testatePageSize}`,
        { headers }
      );
      if (!testateRes.ok) {
        throw new Error(`Errore fetch testate: HTTP ${testateRes.status}`);
      }
      const rawTestate: any[] = await testateRes.json();
      if (!rawTestate || rawTestate.length === 0) break;

      totalTestate += rawTestate.length;
      onProgress?.(`Salvataggio ${totalTestate} testate in SQLite locale...`, 20);

      for (const t of rawTestate) {
        await db.execute(
          `INSERT INTO supplier_invoices (
            supplier_name, vat_number, fiscal_code, doc_number, doc_date, year,
            total_amount, taxable_amount, vat_amount, payment_method, due_date,
            iban, bank_name, file_name, notes
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT(supplier_name, doc_number, doc_date) DO UPDATE SET
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
            notes = excluded.notes;`,
          [
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
          ]
        );
      }

      testateOffset += testatePageSize;
      if (rawTestate.length < testatePageSize) break;
    }

    // 3. Scarica tutte le righe a blocchi paginati da 1000
    onProgress?.("Download righe articoli da Supabase...", 35);
    let offset = 0;
    const pageSize = 1000;
    let totalRighe = 0;

    // Svuota tabella locale righe prima del ricarico completo pulito
    await db.execute("DELETE FROM supplier_invoice_items");

    while (true) {
      const righeRes = await fetch(
        `${cleanUrl}/rest/v1/fatture_elettroniche_righe?select=*&order=id.asc&offset=${offset}&limit=${pageSize}`,
        { headers }
      );
      if (!righeRes.ok) {
        throw new Error(`Errore fetch righe: HTTP ${righeRes.status}`);
      }
      const rawRighe: any[] = await righeRes.json();
      if (!rawRighe || rawRighe.length === 0) break;

      totalRighe += rawRighe.length;
      const pct = Math.min(95, Math.round(35 + (offset / 25000) * 60));
      onProgress?.(`Importate ${totalRighe} righe articolo...`, pct);

      for (const r of rawRighe) {
        await db.execute(
          `INSERT INTO supplier_invoice_items (
            supplier_name, doc_number, doc_date, year, line_number, article_code,
            description, quantity, unit, unit_price, discount_1, discount_2, discount_3,
            discounted_price, total_price, vat_rate
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16);`,
          [
            r.fornitore || "",
            String(r.numero_documento || "").trim(),
            r.data_documento || "",
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
            Number(r.aliquota_iva) || 22,
          ]
        );
      }

      offset += pageSize;
      if (rawRighe.length < pageSize) break;
    }

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
    files: { name: string; content: string }[],
    onProgress?: (msg: string, percent: number) => void
  ): Promise<ImportXmlResult> {
    const errors: { fileName: string; error: string }[] = [];
    const parsedList: ParsedInvoiceResult[] = [];

    onProgress?.("Parsing dei file XML in corso...", 5);

    // 1. Parsing di ciascun file
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const parsed = parseInvoiceXml(f.content, f.name);
        parsedList.push(parsed);
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
    const existing = await db.select<{ s_name: string; d_num: string; d_date: string }[]>(
      `SELECT supplier_name as s_name, doc_number as d_num, doc_date as d_date FROM supplier_invoices`
    );

    const existingKeySet = new Set<string>();
    for (const r of existing) {
      const k = `${(r.s_name || "").trim().toUpperCase()}||${(r.d_num || "").trim().toUpperCase()}||${(r.d_date || "").trim()}`;
      existingKeySet.add(k);
    }

    const toInsert: ParsedInvoiceResult[] = [];
    let skippedDuplicates = 0;

    for (const p of parsedList) {
      const k = `${p.invoice.supplier_name.trim().toUpperCase()}||${p.invoice.doc_number.trim().toUpperCase()}||${p.invoice.doc_date.trim()}`;
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

    // 3. Inserimento in SQLite locale
    let totalLinesInserted = 0;
    for (let i = 0; i < toInsert.length; i++) {
      const { invoice, items } = toInsert[i];
      const pct = Math.min(70, Math.round(30 + ((i + 1) / toInsert.length) * 40));
      onProgress?.(`Salvataggio ${invoice.supplier_name} doc. ${invoice.doc_number}...`, pct);

      await db.execute(
        `INSERT INTO supplier_invoices (
          supplier_name, vat_number, fiscal_code, doc_number, doc_date, year,
          total_amount, taxable_amount, vat_amount, payment_method, due_date,
          iban, bank_name, file_name, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT(supplier_name, doc_number, doc_date) DO UPDATE SET
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
          notes = excluded.notes;`,
        [
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
        ]
      );

      for (const it of items) {
        await db.execute(
          `INSERT INTO supplier_invoice_items (
            supplier_name, doc_number, doc_date, year, line_number, article_code,
            description, quantity, unit, unit_price, discount_1, discount_2, discount_3,
            discounted_price, total_price, vat_rate
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16);`,
          [
            it.supplier_name,
            it.doc_number,
            it.doc_date,
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
          ]
        );
        totalLinesInserted++;
      }
    }

    // 4. Invio a Supabase Cloud
    let cloudSynced = false;
    let cloudError: string | undefined = undefined;

    try {
      onProgress?.("Invio su Supabase Cloud...", 75);
      const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
      if (status?.config?.projectUrl && status?.config?.anonKey) {
        const { projectUrl, anonKey } = status.config;
        const cleanUrl = projectUrl.replace(/\/+$/, "");
        const headers = {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        };

        // Inserimento testate
        const supabaseTestate = toInsert.map((p) => ({
          fornitore: p.invoice.supplier_name,
          partita_iva: p.invoice.vat_number || null,
          codice_fiscale: p.invoice.fiscal_code || null,
          numero_documento: p.invoice.doc_number,
          data_documento: p.invoice.doc_date,
          anno: p.invoice.year,
          totale_documento: p.invoice.total_amount,
          imponibile: p.invoice.taxable_amount,
          imposta: p.invoice.vat_amount,
          tipo_pagamento: p.invoice.payment_method || null,
          data_scadenza: p.invoice.due_date || null,
          iban: p.invoice.iban || null,
          istituto_finanziario: p.invoice.bank_name || null,
          nome_file: p.invoice.file_name || null,
          note: p.invoice.notes || null,
        }));

        const tRes = await fetch(
          `${cleanUrl}/rest/v1/fatture_elettroniche_testate?on_conflict=fornitore,numero_documento,data_documento`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(supabaseTestate),
          }
        );

        if (!tRes.ok) {
          throw new Error(`Errore invio testate Supabase: HTTP ${tRes.status}`);
        }

        // Inserimento righe a blocchi di 200
        const allItemsToPush = toInsert.flatMap((p) =>
          p.items.map((it) => ({
            fornitore: it.supplier_name,
            numero_documento: it.doc_number,
            data_documento: it.doc_date,
            anno: it.year,
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
          }))
        );

        const chunkSize = 200;
        for (let c = 0; c < allItemsToPush.length; c += chunkSize) {
          const chunk = allItemsToPush.slice(c, c + chunkSize);
          const rRes = await fetch(`${cleanUrl}/rest/v1/fatture_elettroniche_righe`, {
            method: "POST",
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(chunk),
          });
          if (!rRes.ok) {
            console.warn(`Errore invio blocco righe Supabase: HTTP ${rRes.status}`);
          }
        }

        cloudSynced = true;
      }
    } catch (cErr) {
      console.warn("Avviso sincronizzazione Cloud non riuscita:", cErr);
      cloudError = cErr instanceof Error ? cErr.message : "Errore connessione Cloud";
    }

    onProgress?.("Importazione completata con successo!", 100);

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

  /**
   * Recupera tutte le righe di una singola fattura per la modale di dettaglio
   */
  async getInvoiceLines(supplierName: string, docNumber: string, docDate: string): Promise<SupplierInvoiceItem[]> {
    const db = await getDatabase();
    return db.select<SupplierInvoiceItem[]>(
      `SELECT * FROM supplier_invoice_items
       WHERE supplier_name = $1 AND doc_number = $2 AND doc_date = $3
       ORDER BY line_number ASC, id ASC`,
      [supplierName, docNumber, docDate]
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

