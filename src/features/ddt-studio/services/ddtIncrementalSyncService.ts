import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { clientSyncService } from "@/features/clients/services/clientSyncService";
import { ddtRepository } from "./ddtRepository";
import {
  HEADER_FIELDS,
  LINE_FIELDS,
  mapHeaderForLocal,
  mapLineForLocal,
  CloudHeader,
  CloudLine,
  DdtImportResult,
} from "@/features/settings/data-import/ddtReadOnlyPreviewService";

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

interface ConfigStatus {
  config: SupabaseConfig | null;
}

export interface IncrementalSyncResult {
  newHeadersCount: number;
  newLinesCount: number;
  backupPath: string | null;
  error?: string;
}

class DdtIncrementalSyncService {
  private isSyncing = false;

  public async syncNewDdtsFromSupabase(): Promise<IncrementalSyncResult> {
    if (this.isSyncing) {
      return { newHeadersCount: 0, newLinesCount: 0, backupPath: null };
    }
    this.isSyncing = true;

    try {
      // 1. Carica configurazione Supabase
      const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
      if (!status?.config?.projectUrl || !status?.config?.anonKey) {
        return { newHeadersCount: 0, newLinesCount: 0, backupPath: null };
      }

      const projectUrl = status.config.projectUrl.trim().replace(/\/$/, "");
      const anonKey = status.config.anonKey.trim();

      // 2. Determina gli anni attivi e il massimo doc_number per ciascuno da SQLite locale
      const db = await getDatabase();
      const currentYear = new Date().getFullYear();
      const activeYears = [currentYear, currentYear - 1];

      const maxRows = await db.select<{ year: number; max_num: number }[]>(
        `SELECT year, MAX(doc_number) as max_num 
         FROM ddt_documents 
         WHERE deleted_at IS NULL AND doc_number IS NOT NULL AND year >= $1
         GROUP BY year`,
        [currentYear - 1]
      );

      const maxByYear = new Map<number, number>();
      maxRows.forEach((r) => maxByYear.set(r.year, r.max_num || 0));

      const newHeaders: CloudHeader[] = [];
      const newLines: CloudLine[] = [];

      for (const year of activeYears) {
        const localMax = maxByYear.get(year) ?? 0;

        // Query mirata e leggera: interroga SOLO i DDT con numero superiore al massimo locale
        const headersUrl = new URL(`/rest/v1/ddt`, projectUrl);
        headersUrl.searchParams.set("anno", `eq.${year}`);
        headersUrl.searchParams.set("numero", `gt.${localMax}`);
        headersUrl.searchParams.set("select", HEADER_FIELDS);
        headersUrl.searchParams.set("order", "numero.asc");

        const headersRes = await fetch(headersUrl.toString(), {
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        });

        if (!headersRes.ok) {
          console.warn(`[Sync Incrementale] Errore fetch testate anno ${year}: ${headersRes.status}`);
          continue;
        }

        const fetchedHeaders = (await headersRes.json()) as CloudHeader[];
        if (!fetchedHeaders || fetchedHeaders.length === 0) {
          continue;
        }

        newHeaders.push(...fetchedHeaders);

        // Fetch mirato delle righe per i nuovi numeri DDT individuati
        const minNum = Math.min(...fetchedHeaders.map((h) => Number(h.numero)));
        const maxNum = Math.max(...fetchedHeaders.map((h) => Number(h.numero)));

        const linesUrl = new URL(`/rest/v1/ddt_righe`, projectUrl);
        linesUrl.searchParams.set("anno", `eq.${year}`);
        linesUrl.searchParams.set("and", `(numero_ddt.gte.${minNum},numero_ddt.lte.${maxNum})`);
        linesUrl.searchParams.set("select", LINE_FIELDS);
        linesUrl.searchParams.set("order", "numero_ddt.asc,riga_nr.asc");

        const linesRes = await fetch(linesUrl.toString(), {
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        });

        if (linesRes.ok) {
          const fetchedLines = (await linesRes.json()) as CloudLine[];
          if (fetchedLines && fetchedLines.length > 0) {
            newLines.push(...fetchedLines);
          }
        }
      }

      // 2b. Controllo e recupero di sicurezza: se esistono DDT recenti senza righe in SQLite, scarica le righe mancanti
      const missingLinesDocs = await db.select<{ id: string; year: number; doc_number: number }[]>(
        `SELECT id, year, doc_number 
         FROM ddt_documents 
         WHERE deleted_at IS NULL 
           AND doc_number IS NOT NULL 
           AND year >= $1
           AND id NOT IN (SELECT DISTINCT ddt_id FROM ddt_items WHERE ddt_id IS NOT NULL)`,
        [currentYear - 1]
      );

      if (missingLinesDocs.length > 0) {
        console.log(`[Sync Incrementale] Rilevati ${missingLinesDocs.length} DDT senza righe: avvio recupero da Supabase...`);
        const docById = new Map<string, { id: string; year: number; doc_number: number }>();
        const docByYearNum = new Map<string, string>();
        missingLinesDocs.forEach((d) => {
          docById.set(d.id, d);
          docByYearNum.set(`${d.year}:${d.doc_number}`, d.id);
        });

        const missingByYear = new Map<number, number[]>();
        missingLinesDocs.forEach((d) => {
          missingByYear.set(d.year, [...(missingByYear.get(d.year) ?? []), d.doc_number]);
        });

        for (const [year, numbers] of missingByYear.entries()) {
          const minN = Math.min(...numbers);
          const maxN = Math.max(...numbers);

          const recoveryUrl = new URL(`/rest/v1/ddt_righe`, projectUrl);
          recoveryUrl.searchParams.set("anno", `eq.${year}`);
          recoveryUrl.searchParams.set("and", `(numero_ddt.gte.${minN},numero_ddt.lte.${maxN})`);
          recoveryUrl.searchParams.set("select", LINE_FIELDS);
          recoveryUrl.searchParams.set("order", "numero_ddt.asc,riga_nr.asc");

          const recoveryRes = await fetch(recoveryUrl.toString(), {
            headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          });

          if (recoveryRes.ok) {
            const recoveryLines = (await recoveryRes.json()) as CloudLine[];
            for (const line of recoveryLines) {
              const targetDocId = line.ddt_id && docById.has(line.ddt_id)
                ? line.ddt_id
                : docByYearNum.get(`${line.anno}:${line.numero_ddt}`);

              if (!targetDocId) continue;

              const mapped = mapLineForLocal(line, targetDocId, Number(line.riga_nr || 1));
              await db.execute(
                `INSERT OR REPLACE INTO ddt_items (
                  id, ddt_id, row_index, description, row_kind, unit, quantity,
                  unit_price_subunits, discount_pct, net_amount_subunits, vat_rate,
                  vat_amount_subunits, purchase_price_subunits, created_at, updated_at,
                  updated_by, sync_status
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'supabase-read-only-import','synced')`,
                [
                  mapped.id,
                  targetDocId,
                  mapped.rowIndex,
                  mapped.description,
                  mapped.rowKind,
                  mapped.unit,
                  mapped.quantity,
                  mapped.unitPriceSubunits,
                  mapped.discountPct,
                  mapped.netAmountSubunits,
                  mapped.vatRate,
                  mapped.vatAmountSubunits,
                  mapped.purchasePriceSubunits,
                  mapped.createdAt,
                  mapped.updatedAt,
                ]
              );
            }

            // Ricalcola i totali per i documenti recuperati
            for (const doc of missingLinesDocs.filter((d) => d.year === year)) {
              const totals = await db.select<{ net: number; vat: number }[]>(
                `SELECT SUM(net_amount_subunits) as net, SUM(vat_amount_subunits) as vat FROM ddt_items WHERE ddt_id = $1`,
                [doc.id]
              );
              const net = totals[0]?.net ?? 0;
              const vat = totals[0]?.vat ?? 0;
              await db.execute(
                `UPDATE ddt_documents SET total_taxable_subunits = $1, total_vat_subunits = $2, total_document_subunits = $3 WHERE id = $4`,
                [net, vat, net + vat, doc.id]
              );
            }
          }
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("ddt-data-updated"));
        }
      }

      // 3. Se non ci sono nuovi DDT su Supabase e non c'erano righe da recuperare, chiudi all'istante
      if (newHeaders.length === 0) {
        return { newHeadersCount: 0, newLinesCount: 0, backupPath: null };
      }

      console.log(`[Sync Incrementale] Individuati ${newHeaders.length} nuovi DDT da importare (${newLines.length} righe).`);

      // 4. Mappatura per il formato di importazione locale
      const byId = new Map(newHeaders.map((h) => [h.id, h]));
      const byNumber = new Map<string, CloudHeader[]>();
      newHeaders.forEach((h) => {
        if (Number.isFinite(Number(h.anno)) && Number.isFinite(Number(h.numero))) {
          const key = `${h.anno}:${h.numero}`;
          byNumber.set(key, [...(byNumber.get(key) ?? []), h]);
        }
      });

      const importedHeaders = newHeaders
        .filter((h) => Boolean(h.id) && Number.isFinite(Number(h.anno)) && Number.isFinite(Number(h.numero)) && Boolean(h.data))
        .map(mapHeaderForLocal);

      const rowSequences = new Map<string, number>();
      const mappedLines = newLines.map((line) => {
        let header = line.ddt_id ? byId.get(line.ddt_id) : undefined;
        if (!header && !line.ddt_id && line.anno !== null && line.numero_ddt !== null) {
          const matches = byNumber.get(`${line.anno}:${line.numero_ddt}`) ?? [];
          if (matches.length === 1) header = matches[0];
        }
        const headerId = header?.id ?? null;
        const fallbackRowIndex = headerId ? (rowSequences.get(headerId) ?? 0) + 1 : 0;
        if (headerId) rowSequences.set(headerId, fallbackRowIndex);
        return mapLineForLocal(line, headerId, fallbackRowIndex);
      });

      // 5. Inserimento atomico transazionale in SQLite locale (con backup automatico di sicurezza)
      const importResult = await invoke<DdtImportResult>("import_supabase_ddt_into_local", {
        payload: { headers: importedHeaders, lines: mappedLines },
      });

      // 6. Arricchimento anagrafiche e sedi per i DDT appena scaricati
      await clientSyncService.importMissingClientsFromDdts();
      await ddtRepository.enrichMissingDdtClientData();

      // 7. Notifica ai componenti aperti di ricaricare i dati aggiornati
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ddt-data-updated"));
      }

      return {
        newHeadersCount: importResult.importedHeaders,
        newLinesCount: importResult.importedLines,
        backupPath: importResult.backupPath,
      };
    } catch (err) {
      console.error("[Sync Incrementale] Errore sincronizzazione:", err);
      return {
        newHeadersCount: 0,
        newLinesCount: 0,
        backupPath: null,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const ddtIncrementalSyncService = new DdtIncrementalSyncService();
