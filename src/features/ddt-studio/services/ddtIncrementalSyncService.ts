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

export interface NumberingGapInfo {
  year: number;
  missingNumbers: number[];
}

export interface IncrementalSyncResult {
  newHeadersCount: number;
  newLinesCount: number;
  recoveredGapsCount?: number;
  unresolvedGaps?: NumberingGapInfo[];
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

      // 2. Determina gli anni attivi da SQLite locale
      const db = await getDatabase();
      const currentYear = new Date().getFullYear();
      const activeYears = [currentYear, currentYear - 1];

      const newHeaders: CloudHeader[] = [];
      const newLines: CloudLine[] = [];
      const unresolvedGaps: NumberingGapInfo[] = [];
      let totalRecoveredGaps = 0;

      for (const year of activeYears) {
        // 2a. Recupera tutti i doc_number esistenti in locale per l'anno per identificare sia il massimo che eventuali buchi
        const localDocRows = await db.select<{ doc_number: number }[]>(
          `SELECT doc_number 
           FROM ddt_documents 
           WHERE deleted_at IS NULL AND doc_number IS NOT NULL AND year = $1
           ORDER BY doc_number ASC`,
          [year]
        );

        const localNums = new Set(localDocRows.map((r) => r.doc_number));
        const localMax = localDocRows.length > 0 ? Math.max(...localDocRows.map((r) => r.doc_number)) : 0;

        // Rileva tutti i buchi di numerazione sequenziale tra 1 e localMax
        const missingGaps: number[] = [];
        for (let n = 1; n < localMax; n++) {
          if (!localNums.has(n)) {
            missingGaps.push(n);
          }
        }

        const fetchedHeadersForYear: CloudHeader[] = [];

        // 2b. PRIORITÀ BUCHI: Se ci sono numeri mancanti nella sequenza locale, cerca di recuperarli da Supabase
        if (missingGaps.length > 0) {
          console.warn(`[Sync Incrementale] Rilevati ${missingGaps.length} buchi di numerazione per l'anno ${year}:`, missingGaps);
          const CHUNK = 50;
          for (let i = 0; i < missingGaps.length; i += CHUNK) {
            const chunk = missingGaps.slice(i, i + CHUNK);
            const gapUrl = new URL(`/rest/v1/ddt`, projectUrl);
            gapUrl.searchParams.set("anno", `eq.${year}`);
            gapUrl.searchParams.set("numero", `in.(${chunk.join(",")})`);
            gapUrl.searchParams.set("select", HEADER_FIELDS);
            gapUrl.searchParams.set("order", "numero.asc");

            const gapRes = await fetch(gapUrl.toString(), {
              headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
            });
            if (gapRes.ok) {
              const gapHeaders = (await gapRes.json()) as CloudHeader[];
              if (gapHeaders && gapHeaders.length > 0) {
                console.log(`[Sync Incrementale] Recuperati da Supabase ${gapHeaders.length} DDT che colmano buchi:`, gapHeaders.map((h) => h.numero));
                fetchedHeadersForYear.push(...gapHeaders);
                totalRecoveredGaps += gapHeaders.length;
              }
            }
          }
        }

        // 2c. Query per nuovi DDT con numero superiore al massimo locale
        const headersUrl = new URL(`/rest/v1/ddt`, projectUrl);
        headersUrl.searchParams.set("anno", `eq.${year}`);
        headersUrl.searchParams.set("numero", `gt.${localMax}`);
        headersUrl.searchParams.set("select", HEADER_FIELDS);
        headersUrl.searchParams.set("order", "numero.asc");

        const headersRes = await fetch(headersUrl.toString(), {
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        });

        if (headersRes.ok) {
          const fetchedHeaders = (await headersRes.json()) as CloudHeader[];
          if (fetchedHeaders && fetchedHeaders.length > 0) {
            fetchedHeadersForYear.push(...fetchedHeaders);
          }
        } else {
          console.warn(`[Sync Incrementale] Errore fetch testate anno ${year}: ${headersRes.status}`);
        }

        // Controlla se rimangono buchi di numerazione non trovati neanche su Supabase
        const recoveredNums = new Set(fetchedHeadersForYear.map((h) => Number(h.numero)));
        const stillMissing = missingGaps.filter((n) => !recoveredNums.has(n));
        if (stillMissing.length > 0) {
          unresolvedGaps.push({ year, missingNumbers: stillMissing });
        }

        if (fetchedHeadersForYear.length === 0) {
          continue;
        }

        newHeaders.push(...fetchedHeadersForYear);

        // 2d. Fetch mirato delle righe per TUTTI i numeri individuati (nuovi + buchi recuperati) in chunk
        const distinctNumbers = Array.from(new Set(fetchedHeadersForYear.map((h) => Number(h.numero))));
        const CHUNK = 50;
        for (let i = 0; i < distinctNumbers.length; i += CHUNK) {
          const chunk = distinctNumbers.slice(i, i + CHUNK);
          const linesUrl = new URL(`/rest/v1/ddt_righe`, projectUrl);
          linesUrl.searchParams.set("anno", `eq.${year}`);
          linesUrl.searchParams.set("numero_ddt", `in.(${chunk.join(",")})`);
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
      }

      // Se ci sono buchi irrisolti (mancanti sia in locale che su Supabase), notifica l'evento
      if (unresolvedGaps.length > 0) {
        console.warn("[Sync Incrementale] ATTENZIONE: Rilevati buchi di numerazione DDT non risolti nemmeno su Supabase:", unresolvedGaps);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("ddt-numbering-gap-detected", {
              detail: { unresolvedGaps },
            })
          );
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
        return {
          newHeadersCount: 0,
          newLinesCount: 0,
          backupPath: null,
          recoveredGapsCount: 0,
          unresolvedGaps: unresolvedGaps.length > 0 ? unresolvedGaps : undefined,
        };
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
        recoveredGapsCount: totalRecoveredGaps,
        unresolvedGaps: unresolvedGaps.length > 0 ? unresolvedGaps : undefined,
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
