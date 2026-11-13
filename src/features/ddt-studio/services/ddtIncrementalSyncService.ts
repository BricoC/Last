import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { clientSyncService } from "@/features/clients/services/clientSyncService";
import { ddtRepository } from "./ddtRepository";
import { OrNumbersRepository } from "@/features/or-numbers/services/orNumbersRepository";
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
  updatedHistoricalCount?: number;
  unresolvedGaps?: NumberingGapInfo[];
  backupPath: string | null;
  error?: string;
}

class DdtIncrementalSyncService {
  private isSyncing = false;

  private async fetchLinesWithPagination(
    projectUrl: string,
    anonKey: string,
    year: number,
    numbers: number[]
  ): Promise<CloudLine[]> {
    if (numbers.length === 0) return [];
    const allLines: CloudLine[] = [];
    const PAGE_LIMIT = 1000;
    let offset = 0;

    while (true) {
      const linesUrl = new URL(`/rest/v1/ddt_righe`, projectUrl);
      linesUrl.searchParams.set("anno", `eq.${year}`);
      linesUrl.searchParams.set("numero_ddt", `in.(${numbers.join(",")})`);
      linesUrl.searchParams.set("select", LINE_FIELDS);
      linesUrl.searchParams.set("order", "numero_ddt.asc,riga_nr.asc");
      linesUrl.searchParams.set("limit", String(PAGE_LIMIT));
      linesUrl.searchParams.set("offset", String(offset));

      const linesRes = await fetch(linesUrl.toString(), {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });

      if (!linesRes.ok) break;
      const fetchedLines = (await linesRes.json()) as CloudLine[];
      if (!fetchedLines || fetchedLines.length === 0) break;
      allLines.push(...fetchedLines);
      if (fetchedLines.length < PAGE_LIMIT) break;
      offset += PAGE_LIMIT;
    }

    return allLines;
  }

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
      let totalUpdatedHistorical = 0;

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

        // 2c-bis. Controllo Conflitto su localMax: se esiste su Supabase un DDT con lo stesso numero ma contenuto diverso
        if (localMax > 0) {
          try {
            const checkMaxUrl = new URL(`/rest/v1/ddt`, projectUrl);
            checkMaxUrl.searchParams.set("anno", `eq.${year}`);
            checkMaxUrl.searchParams.set("numero", `eq.${localMax}`);
            checkMaxUrl.searchParams.set("select", HEADER_FIELDS);
            const checkMaxRes = await fetch(checkMaxUrl.toString(), {
              headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
            });
            if (checkMaxRes.ok) {
              const maxHeaders = (await checkMaxRes.json()) as CloudHeader[];
              if (maxHeaders && maxHeaders.length > 0) {
                const remote = maxHeaders[0];
                const localRows = await db.select<any[]>(
                  "SELECT * FROM ddt_documents WHERE year = $1 AND doc_number = $2 AND deleted_at IS NULL LIMIT 1",
                  [year, localMax]
                );
                if (localRows.length > 0) {
                  const loc = localRows[0];
                  const remoteTotalSubunits = Math.round((Number(remote.totale_documento) || 0) * 100000);
                  const isDifferent =
                    loc.id !== remote.id &&
                    (loc.client_name?.trim().toLowerCase() !== remote.cliente?.trim().toLowerCase() ||
                      Math.abs((loc.total_document_subunits || 0) - remoteTotalSubunits) > 100);

                  if (isDifferent) {
                    const confLinesUrl = new URL(`/rest/v1/ddt_righe`, projectUrl);
                    confLinesUrl.searchParams.set("anno", `eq.${year}`);
                    confLinesUrl.searchParams.set("numero_ddt", `eq.${localMax}`);
                    confLinesUrl.searchParams.set("select", LINE_FIELDS);
                    confLinesUrl.searchParams.set("order", "riga_nr.asc");
                    const confLinesRes = await fetch(confLinesUrl.toString(), {
                      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
                    });
                    const confLines = confLinesRes.ok ? ((await confLinesRes.json()) as CloudLine[]) : [];

                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("ddt-conflict-detected", {
                          detail: {
                            year,
                            docNumber: localMax,
                            localDoc: {
                              id: loc.id,
                              client_name: loc.client_name,
                              doc_date: loc.doc_date,
                              total_document_subunits: loc.total_document_subunits,
                              status: loc.status,
                            },
                            incomingDoc: {
                              id: remote.id,
                              client_name: remote.cliente || "",
                              doc_date: remote.data || "",
                              total_document_subunits: remoteTotalSubunits,
                              items_count: confLines.length,
                              source: "Gestionale / Cloud Supabase",
                              rawHeader: mapHeaderForLocal(remote),
                              rawLines: confLines.map((l, idx) => mapLineForLocal(l, remote.id, idx + 1)),
                            },
                          },
                        })
                      );
                    }
                  }
                }
              }
            }
          } catch (conflictCheckErr) {
            console.warn("[Sync Incrementale] Errore controllo conflitto su localMax:", conflictCheckErr);
          }
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

        // 2d. Fetch mirato delle righe per TUTTI i numeri individuati (nuovi + buchi recuperati) in chunk con paginazione
        const distinctNumbers = Array.from(new Set(fetchedHeadersForYear.map((h) => Number(h.numero))));
        const CHUNK = 50;
        for (let i = 0; i < distinctNumbers.length; i += CHUNK) {
          const chunk = distinctNumbers.slice(i, i + CHUNK);
          const lines = await this.fetchLinesWithPagination(projectUrl, anonKey, year, chunk);
          if (lines.length > 0) {
            newLines.push(...lines);
          }
        }

        // 2e. Verifica e riconciliazione modifiche storiche per DDT già esistenti (es. correzione prezzi/quantità su Supabase)
        try {
          const modUrl = new URL(`/rest/v1/ddt`, projectUrl);
          modUrl.searchParams.set("anno", `eq.${year}`);
          modUrl.searchParams.set("select", HEADER_FIELDS);
          modUrl.searchParams.set("order", "ultima_modifica.desc.nullslast");
          modUrl.searchParams.set("limit", "50");

          const modRes = await fetch(modUrl.toString(), {
            headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          });

          if (modRes.ok) {
            const recentModHeaders = (await modRes.json()) as CloudHeader[];
            for (const remoteH of recentModHeaders) {
              const num = Number(remoteH.numero);
              if (!num || !localNums.has(num)) continue;

              const localRows = await db.select<Array<{
                id: string;
                total_document_subunits: number;
                total_taxable_subunits: number;
                total_vat_subunits: number;
                updated_at: string;
                order_reference: string | null;
                internal_notes: string | null;
                sync_status: string;
              }>>(
                `SELECT id, total_document_subunits, total_taxable_subunits, total_vat_subunits, updated_at, order_reference, internal_notes, sync_status
                 FROM ddt_documents
                 WHERE year = $1 AND doc_number = $2 AND deleted_at IS NULL
                 LIMIT 1`,
                [year, num]
              );

              if (localRows.length === 0) continue;
              const loc = localRows[0];
              // Non sovrascrivere bozze o modifiche locali pendenti
              if (loc.sync_status === "pending") continue;

              const remoteTotDoc = Math.round((Number(remoteH.totale_documento) || 0) * 100000);
              const remoteTaxable = Math.round((Number(remoteH.totale_imponibile) || 0) * 100000);
              const remoteVat = Math.round((Number(remoteH.totale_iva) || 0) * 100000);
              const remoteModified = remoteH.ultima_modifica || remoteH.created_at || "";

              const isTotalDiff = Math.abs((loc.total_document_subunits || 0) - remoteTotDoc) > 10;
              const isTimestampNewer = Boolean(remoteModified && loc.updated_at && remoteModified > loc.updated_at);

              if (isTotalDiff || isTimestampNewer) {
                console.log(`[Sync Incrementale] Rilevata modifica su DDT storico ${num}/${year} (totale: ${loc.total_document_subunits} -> ${remoteTotDoc})`);

                // Preserva riferimento d'ordine o note se già compilati localmente in Last
                const resolvedOrderRef = (loc.order_reference && loc.order_reference.trim())
                  ? loc.order_reference
                  : (remoteH.nr_vs_ordine || null);

                await db.execute(
                  `UPDATE ddt_documents 
                   SET status = $1, payment_method = $2, transport_reason = $3, carriage_terms = $4,
                       packages_count = $5, weight_kg = $6, carrier = $7, operator = $8,
                       total_taxable_subunits = $9, total_vat_subunits = $10, total_document_subunits = $11,
                       order_reference = $12, updated_at = $13
                   WHERE id = $14`,
                  [
                    remoteH.stato || "emessa",
                    remoteH.pagamento || null,
                    remoteH.causale || "Vendita",
                    remoteH.porto || "Franco stabilimento",
                    remoteH.colli || null,
                    remoteH.peso_kg === null ? null : String(remoteH.peso_kg),
                    remoteH.vettore || null,
                    remoteH.operatore || null,
                    remoteTaxable,
                    remoteVat,
                    remoteTotDoc,
                    resolvedOrderRef,
                    remoteModified || new Date().toISOString(),
                    loc.id,
                  ]
                );

                if (isTotalDiff) {
                  const updatedLines = await this.fetchLinesWithPagination(projectUrl, anonKey, year, [num]);
                  if (updatedLines.length > 0) {
                    await db.execute("DELETE FROM ddt_items WHERE ddt_id = $1", [loc.id]);
                    for (let rIdx = 0; rIdx < updatedLines.length; rIdx++) {
                      const mapped = mapLineForLocal(updatedLines[rIdx], loc.id, rIdx + 1);
                      await db.execute(
                        `INSERT OR REPLACE INTO ddt_items (
                          id, ddt_id, row_index, description, row_kind, unit, quantity,
                          unit_price_subunits, discount_pct, net_amount_subunits, vat_rate,
                          vat_amount_subunits, purchase_price_subunits, created_at, updated_at,
                          updated_by, sync_status
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'supabase-read-only-import','synced')`,
                        [
                          mapped.id,
                          loc.id,
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
                  }
                }

                totalUpdatedHistorical++;
              }
            }
          }
        } catch (histErr) {
          console.warn(`[Sync Incrementale] Controllo modifiche storiche anno ${year} warning:`, histErr);
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

      // 3. Se non ci sono nuovi DDT su Supabase e non c'erano righe da recuperare né storici modificati, chiudi all'istante
      if (newHeaders.length === 0) {
        if (totalUpdatedHistorical > 0 && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("ddt-data-updated"));
        }
        return {
          newHeadersCount: 0,
          newLinesCount: 0,
          backupPath: null,
          recoveredGapsCount: 0,
          updatedHistoricalCount: totalUpdatedHistorical,
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

      // 7. Sincronizzazione aggiornamenti numeri d'ordine (nr_vs_ordine) da Supabase
      try {
        await OrNumbersRepository.syncOrdersFromSupabase(currentYear);
      } catch (errSyncOrd) {
        console.warn("[Sync Incrementale] Warning sync ordini:", errSyncOrd);
      }

      // 8. Notifica ai componenti aperti di ricaricare i dati aggiornati
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ddt-data-updated"));
      }

      return {
        newHeadersCount: importResult.importedHeaders,
        newLinesCount: importResult.importedLines,
        recoveredGapsCount: totalRecoveredGaps,
        updatedHistoricalCount: totalUpdatedHistorical,
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
