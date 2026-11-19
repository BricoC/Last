import { createSupabaseRealtimeSubscription } from "@/shared/services/supabaseRealtimeSubscription";
import { getAuthenticatedSupabaseClient } from "@/shared/services/supabaseSession";
import { supabaseFetch } from "@/shared/services/supabaseSession";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "@/shared/data-layer/database";
import { clientSyncService } from "@/features/clients/services/clientSyncService";
import { ddtRepository } from "./ddtRepository";
import { ddtCloudPushService } from "./ddtCloudPushService";
import { buildSnapshotFromCloud } from "./ddtMergeUtils";
import { saveDdtBaseSnapshot } from "./ddtSnapshotService";
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

export interface SyncDdtOptions {
  includePreviousYear?: boolean;
  checkModifiedRecent?: boolean;
}

class DdtIncrementalSyncService {
  private activeSyncPromise: Promise<IncrementalSyncResult> | null = null;
  private pendingResync = false;
  private pendingIncludePrevYear = false;
  private pendingCheckModified = false;
  private verifiedEmptyDdtIds = new Set<string>();
  private checkedGapKeys = new Set<string>();
  public readonly subscribeRealtime = createSupabaseRealtimeSubscription(
    async () => {
      const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
      const config = status?.config;
      return config?.projectUrl && config.anonKey
        ? getAuthenticatedSupabaseClient(config.projectUrl, config.anonKey)
        : null;
    },
    (client, isCurrent) => client
        .channel("last:ddt", { config: { private: true } })
        .on(
          "broadcast",
          { event: "ddt" },
          ({ payload }) => {
            if (!isCurrent() || !payload) return;
            if (payload.eventType === "DELETE" && payload.old && typeof (payload.old as { id?: string }).id === "string") {
              void this.handleRemoteDelete((payload.old as { id: string }).id, isCurrent);
            } else {
              const changedAnno = Number((payload.new as { anno?: number } | null)?.anno || 0);
              const isPrevYear = changedAnno > 0 && changedAnno < new Date().getFullYear();
              void this.syncNewDdtsFromSupabase({
                includePreviousYear: isPrevYear,
                checkModifiedRecent: true,
              }).catch(() => {});
            }
          }
        )
        .subscribe(),
    "[Sync Incrementale] Realtime DDT",
  );

  private async handleRemoteDelete(remoteId: string, isCurrent: () => boolean): Promise<void> {
    try {
      const db = await getDatabase();
      if (!isCurrent()) return;
      const res = await db.execute(
        `DELETE FROM ddt_documents WHERE id = $1 AND sync_status = 'synced'`,
        [remoteId]
      );
      if ((res.rowsAffected ?? 0) > 0 && typeof window !== "undefined") {
        await db.execute(`DELETE FROM ddt_items WHERE ddt_id = $1`, [remoteId]);
        window.dispatchEvent(new CustomEvent("ddt-data-updated"));
      }
    } catch (err) {
      console.warn("[Sync Incrementale] Errore rimozione DDT eliminato da remoto:", err);
    }
  }

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
      linesUrl.searchParams.set("order", "numero_ddt.asc,riga_nr.asc,id.asc");
      linesUrl.searchParams.set("limit", String(PAGE_LIMIT));
      linesUrl.searchParams.set("offset", String(offset));

      const linesRes = await supabaseFetch(linesUrl.toString(), {
        headers: { apikey: anonKey },
      });

      if (!linesRes.ok) throw new Error(`Download righe DDT: HTTP ${linesRes.status}`);
      const fetchedLines = (await linesRes.json()) as CloudLine[];
      if (!Array.isArray(fetchedLines)) throw new Error("Risposta Supabase non valida per le righe DDT");
      if (fetchedLines.length === 0) break;
      allLines.push(...fetchedLines);
      offset += fetchedLines.length;
    }

    return allLines;
  }

  public async syncNewDdtsFromSupabase(
    options: SyncDdtOptions = {}
  ): Promise<IncrementalSyncResult> {
    if (this.activeSyncPromise) {
      this.pendingResync = true;
      if (options.includePreviousYear) this.pendingIncludePrevYear = true;
      if (options.checkModifiedRecent) this.pendingCheckModified = true;
      return this.activeSyncPromise;
    }

    this.activeSyncPromise = (async () => {
      let lastResult: IncrementalSyncResult = { newHeadersCount: 0, newLinesCount: 0, backupPath: null };
      let totalHeaders = 0;
      let totalLines = 0;
      let nextOpts: SyncDdtOptions = { ...options };

      do {
        this.pendingResync = false;
        this.pendingIncludePrevYear = false;
        this.pendingCheckModified = false;
        lastResult = await this.executeSingleSync(nextOpts);
        totalHeaders += lastResult.newHeadersCount;
        totalLines += lastResult.newLinesCount;
        if (lastResult.error) {
          this.pendingResync = false;
          return { ...lastResult, newHeadersCount: totalHeaders, newLinesCount: totalLines };
        }
        nextOpts = {
          includePreviousYear: this.pendingIncludePrevYear,
          checkModifiedRecent: this.pendingCheckModified,
        };
      } while (this.pendingResync);

      return { ...lastResult, newHeadersCount: totalHeaders, newLinesCount: totalLines };
    })().finally(() => {
      this.activeSyncPromise = null;
    });

    return this.activeSyncPromise;
  }

  private async executeSingleSync(options: SyncDdtOptions = {}): Promise<IncrementalSyncResult> {
    try {
      // 0. PUSH PRIMA DEL PULL: invia eventuali DDT locali in attesa (emessi/modificati/cestinati offline)
      await ddtCloudPushService.pushPendingDdts().catch(() => {});

      // 1. Carica configurazione Supabase
      const status = await invoke<ConfigStatus>("load_supabase_config").catch(() => null);
      if (!status?.config?.projectUrl || !status?.config?.anonKey) {
        return { newHeadersCount: 0, newLinesCount: 0, backupPath: null, error: "Configurazione Supabase assente" };
      }

      const projectUrl = status.config.projectUrl.trim().replace(/\/$/, "");
      const anonKey = status.config.anonKey.trim();

      // 2. Determina gli anni attivi da SQLite locale (di default solo anno corrente; precedente su avvio/richiesta esplicita)
      const db = await getDatabase();
      const currentYear = new Date().getFullYear();
      const activeYears = options.includePreviousYear ? [currentYear, currentYear - 1] : [currentYear];

      const newHeaders: CloudHeader[] = [];
      const newLines: CloudLine[] = [];
      const unresolvedGaps: NumberingGapInfo[] = [];
      let totalRecoveredGaps = 0;
      let totalUpdatedHistorical = 0;

      for (const year of activeYears) {
        // 2a. Recupera tutti i doc_number esistenti (inclusi quelli cestinati per non segnalare falsi buchi)
        const allDocRows = await db.select<{ doc_number: number; deleted_at: string | null }[]>(
          `SELECT doc_number, deleted_at
           FROM ddt_documents 
           WHERE doc_number IS NOT NULL AND year = $1 AND (status <> 'bozza' OR deleted_at IS NOT NULL)
           ORDER BY doc_number ASC`,
          [year]
        );

        const localNums = new Set(allDocRows.filter((r) => !r.deleted_at).map((r) => r.doc_number));
        const knownOrTrashedNums = new Set(allDocRows.map((r) => r.doc_number));
        const localMax = localNums.size > 0 ? Math.max(...localNums) : 0;

        // Rileva tutti i buchi di numerazione sequenziale tra 1 e localMax (escludendo i numeri intenzionalmente cestinati)
        const missingGaps: number[] = [];
        for (let n = 1; n < localMax; n++) {
          if (!knownOrTrashedNums.has(n)) {
            missingGaps.push(n);
          }
        }

        const fetchedHeadersForYear: CloudHeader[] = [];

        // 2b. PRIORITÀ BUCHI: Se ci sono numeri mancanti nella sequenza locale, cerca di recuperarli da Supabase
        const gapsToCheck = options.includePreviousYear
          ? missingGaps
          : missingGaps.filter((n) => !this.checkedGapKeys.has(`${year}:${n}`));

        if (gapsToCheck.length > 0) {
          console.warn(`[Sync Incrementale] Rilevati ${gapsToCheck.length} buchi di numerazione per l'anno ${year}:`, gapsToCheck);
          const CHUNK = 50;
          for (let i = 0; i < gapsToCheck.length; i += CHUNK) {
            const chunk = gapsToCheck.slice(i, i + CHUNK);
            const gapUrl = new URL(`/rest/v1/ddt`, projectUrl);
            gapUrl.searchParams.set("anno", `eq.${year}`);
            gapUrl.searchParams.set("numero", `in.(${chunk.join(",")})`);
            gapUrl.searchParams.set("select", HEADER_FIELDS);
            gapUrl.searchParams.set("order", "numero.asc");

            const gapRes = await supabaseFetch(gapUrl.toString(), {
              headers: { apikey: anonKey },
            });
            if (!gapRes.ok) throw new Error(`Download DDT mancanti: HTTP ${gapRes.status}`);
            {
              const gapHeaders = (await gapRes.json()) as CloudHeader[];
              const foundSet = new Set((gapHeaders || []).map((h) => Number(h.numero)));
              for (const gNum of chunk) {
                if (!foundSet.has(gNum)) {
                  this.checkedGapKeys.add(`${year}:${gNum}`);
                }
              }
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

        const headersRes = await supabaseFetch(headersUrl.toString(), {
          headers: { apikey: anonKey },
        });

        if (headersRes.ok) {
          const fetchedHeaders = (await headersRes.json()) as CloudHeader[];
          if (fetchedHeaders && fetchedHeaders.length > 0) {
            fetchedHeadersForYear.push(...fetchedHeaders);
          }
        } else {
          throw new Error(`Download testate DDT ${year}: HTTP ${headersRes.status}`);
        }

        // 2c-bis. Controllo Conflitto su localMax e su eventuali DDT pending: se esiste su Supabase un DDT con lo stesso numero ma contenuto diverso
        const pendingConflictCheckRows = await db.select<{ doc_number: number }[]>(
          `SELECT DISTINCT doc_number FROM ddt_documents
           WHERE year = $1 AND deleted_at IS NULL AND doc_number IS NOT NULL
             AND status <> 'bozza' AND sync_status = 'pending'`,
          [year]
        );
        const numbersToCheck = Array.from(
          new Set(
            [localMax, ...pendingConflictCheckRows.map((r) => Number(r.doc_number))].filter(
              (n) => Number.isFinite(n) && n > 0
            )
          )
        );

        if (numbersToCheck.length > 0) {
          try {
            const checkUrl = new URL(`/rest/v1/ddt`, projectUrl);
            checkUrl.searchParams.set("anno", `eq.${year}`);
            checkUrl.searchParams.set("numero", `in.(${numbersToCheck.join(",")})`);
            checkUrl.searchParams.set("select", HEADER_FIELDS);
            const checkRes = await supabaseFetch(checkUrl.toString(), {
              headers: { apikey: anonKey },
            });
            if (checkRes.ok) {
              const remoteHeaders = (await checkRes.json()) as CloudHeader[];
              for (const remote of remoteHeaders || []) {
                const remoteNum = Number(remote.numero);
                const localRows = await db.select<any[]>(
                  "SELECT * FROM ddt_documents WHERE year = $1 AND doc_number = $2 AND deleted_at IS NULL LIMIT 1",
                  [year, remoteNum]
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
                    confLinesUrl.searchParams.set("numero_ddt", `eq.${remoteNum}`);
                    confLinesUrl.searchParams.set("select", LINE_FIELDS);
                    confLinesUrl.searchParams.set("order", "riga_nr.asc");
                    const confLinesRes = await supabaseFetch(confLinesUrl.toString(), {
                      headers: { apikey: anonKey },
                    });
                    if (!confLinesRes.ok) throw new Error(`Download righe DDT in conflitto: HTTP ${confLinesRes.status}`);
                    const confLines = await confLinesRes.json() as CloudLine[];

                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("ddt-conflict-detected", {
                          detail: {
                            year,
                            docNumber: remoteNum,
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
                    break;
                  }
                }
              }
            }
          } catch (conflictCheckErr) {
            console.warn("[Sync Incrementale] Errore controllo conflitto numeri DDT:", conflictCheckErr);
          }
        }

        // Controlla se rimangono buchi di numerazione non trovati neanche su Supabase
        const recoveredNums = new Set(fetchedHeadersForYear.map((h) => Number(h.numero)));
        const stillMissing = missingGaps.filter((n) => !recoveredNums.has(n));
        if (stillMissing.length > 0 && options.includePreviousYear) {
          unresolvedGaps.push({ year, missingNumbers: stillMissing });
        }

        const visibleFetched = fetchedHeadersForYear.filter((h) => !ddtCloudPushService.isRecentlyDeleted(h.id));
        if (visibleFetched.length > 0) {
          newHeaders.push(...visibleFetched);

          // 2d. Fetch mirato delle righe per TUTTI i numeri individuati (nuovi + buchi recuperati) in chunk con paginazione
          const distinctNumbers = Array.from(new Set(visibleFetched.map((h) => Number(h.numero))));
          const CHUNK = 50;
          for (let i = 0; i < distinctNumbers.length; i += CHUNK) {
            const chunk = distinctNumbers.slice(i, i + CHUNK);
            const lines = await this.fetchLinesWithPagination(projectUrl, anonKey, year, chunk);
            if (lines.length > 0) {
              newLines.push(...lines);
            }
          }
        }

        // 2e. Verifica modifiche su DDT esistenti solo su avvio/Realtime/nuovi arrivi (evita polling pesante ogni tick)
        if (!options.checkModifiedRecent && visibleFetched.length === 0) {
          continue;
        }
        try {
          const modUrl = new URL(`/rest/v1/ddt`, projectUrl);
          modUrl.searchParams.set("anno", `eq.${year}`);
          modUrl.searchParams.set("select", HEADER_FIELDS);
          modUrl.searchParams.set("order", "ultima_modifica.desc.nullslast");
          modUrl.searchParams.set("limit", "25");

          const modRes = await supabaseFetch(modUrl.toString(), {
            headers: { apikey: anonKey },
          });

          if (!modRes.ok) throw new Error(`Controllo modifiche DDT: HTTP ${modRes.status}`);
          {
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
                project_url?: string | null;
              }>>(
                `SELECT id, total_document_subunits, total_taxable_subunits, total_vat_subunits, updated_at, order_reference, internal_notes, sync_status, project_url
                 FROM ddt_documents
                 WHERE year = $1 AND doc_number = $2 AND deleted_at IS NULL
                 LIMIT 1`,
                [year, num]
              );

              if (localRows.length === 0) continue;
              const loc = localRows[0];
              // Non sovrascrivere bozze, modifiche locali pendenti o DDT appartenenti ad un altro progetto Supabase
              if (loc.sync_status === "pending") continue;
              if (loc.project_url && loc.project_url.trim().replace(/\/+$/, "").toLowerCase() !== projectUrl.trim().replace(/\/+$/, "").toLowerCase()) continue;

              const remoteTotDoc = Math.round((Number(remoteH.totale_documento) || 0) * 100000);
              const remoteTaxable = Math.round((Number(remoteH.totale_imponibile) || 0) * 100000);
              const remoteVat = Math.round((Number(remoteH.totale_iva) || 0) * 100000);
              const remoteModified = remoteH.ultima_modifica || remoteH.created_at || "";

              const remoteMs = remoteModified ? Date.parse(remoteModified) : NaN;
              const localMs = loc.updated_at ? Date.parse(loc.updated_at) : NaN;
              // Tolleranza 0.01 EUR (1000 subunits) per evitare falsi aggiornamenti dovuti ad arrotondamenti decimali
              const isTotalDiff = Math.abs((loc.total_document_subunits || 0) - remoteTotDoc) > 1000;
              const isTimestampNewer =
                Number.isFinite(remoteMs) && Number.isFinite(localMs) && remoteMs > localMs + 1000;

              if (isTotalDiff || isTimestampNewer) {
                console.log(`[Sync Incrementale] Rilevata modifica su DDT storico ${num}/${year} (totale: ${loc.total_document_subunits} -> ${remoteTotDoc})`);

                // Preserva riferimento d'ordine o note se già compilati localmente in Last
                const resolvedOrderRef = (loc.order_reference && loc.order_reference.trim())
                  ? loc.order_reference
                  : (remoteH.nr_vs_ordine || null);

                await db.execute(
                  `UPDATE ddt_documents 
                   SET status = $1, doc_date = COALESCE($2, doc_date), client_name = COALESCE($3, client_name),
                       client_address = $4, client_city = $5, destination_name = $6, destination_city = $7,
                       payment_method = $8, transport_reason = $9, carriage_terms = $10,
                       packages_count = $11, weight_kg = $12, carrier = $13, operator = $14,
                       internal_notes = $15, total_taxable_subunits = $16, total_vat_subunits = $17,
                       total_document_subunits = $18, order_reference = $19, updated_at = $20
                   WHERE id = $21`,
                  [
                    remoteH.stato || "confermato",
                    remoteH.data || null,
                    remoteH.cliente?.trim() || null,
                    remoteH.indirizzo || null,
                    remoteH.citta || null,
                    remoteH.destinazione || null,
                    remoteH.citta_dest || null,
                    remoteH.pagamento || null,
                    remoteH.causale || "Vendita",
                    remoteH.porto || "Franco stabilimento",
                    remoteH.colli || null,
                    remoteH.peso_kg === null ? null : String(remoteH.peso_kg),
                    remoteH.vettore || null,
                    remoteH.operatore || null,
                    remoteH.note || null,
                    remoteTaxable,
                    remoteVat,
                    remoteTotDoc,
                    resolvedOrderRef,
                    remoteModified || new Date().toISOString(),
                    loc.id,
                  ]
                );

                if (isTotalDiff || isTimestampNewer) {
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
                  await saveDdtBaseSnapshot(
                    loc.id,
                    remoteModified || null,
                    buildSnapshotFromCloud(remoteH, updatedLines)
                  );
                }

                totalUpdatedHistorical++;
              }
            }
          }
        } catch (histErr) {
          throw new Error(`Controllo modifiche storiche DDT ${year}: ${String(histErr)}`);
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

      // 2b. Controllo e recupero di sicurezza: se esistono DDT recenti senza righe in SQLite, scarica SOLO i numeri mancanti
      const minRecoveryYear = options.includePreviousYear ? currentYear - 1 : currentYear;
      const missingLinesRaw = await db.select<{ id: string; year: number; doc_number: number; project_url?: string | null }[]>(
        `SELECT id, year, doc_number, project_url 
         FROM ddt_documents 
         WHERE deleted_at IS NULL 
           AND doc_number IS NOT NULL 
           AND year >= $1
           AND id NOT IN (SELECT DISTINCT ddt_id FROM ddt_items WHERE ddt_id IS NOT NULL)`,
        [minRecoveryYear]
      );
      const activeProjectNorm = projectUrl.trim().replace(/\/+$/, "").toLowerCase();
      const missingLinesDocs = missingLinesRaw.filter((d) => {
        if (this.verifiedEmptyDdtIds.has(d.id)) return false;
        const docProj = d.project_url?.trim().replace(/\/+$/, "").toLowerCase();
        return Boolean(docProj && docProj === activeProjectNorm);
      });

      if (missingLinesDocs.length > 0) {
        console.log(`[Sync Incrementale] Rilevati ${missingLinesDocs.length} DDT senza righe: avvio recupero mirato da Supabase...`);
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

        let recoveredLinesCount = 0;
        const recoveredDocIds = new Set<string>();

        for (const [year, numbers] of missingByYear.entries()) {
          const CHUNK = 50;
          const recoveryLines: CloudLine[] = [];
          for (let i = 0; i < numbers.length; i += CHUNK) {
            const chunk = numbers.slice(i, i + CHUNK);
            const lines = await this.fetchLinesWithPagination(projectUrl, anonKey, year, chunk);
            if (lines.length > 0) {
              recoveryLines.push(...lines);
            }
          }

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
            recoveredLinesCount++;
            recoveredDocIds.add(targetDocId);
          }

          // Ricalcola i totali solo per i documenti che hanno effettivamente recuperato righe;
          // marca in sessione quelli confermati a 0 righe su Supabase per evitare loop ogni sync
          for (const doc of missingLinesDocs.filter((d) => d.year === year)) {
            if (!recoveredDocIds.has(doc.id)) {
              this.verifiedEmptyDdtIds.add(doc.id);
              continue;
            }
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

        if (recoveredLinesCount > 0 && typeof window !== "undefined") {
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

      const syncProjectUrl = projectUrl.trim().replace(/\/+$/, "").toLowerCase() || null;
      const importedHeaders = newHeaders
        .filter((h) => Boolean(h.id) && Number.isFinite(Number(h.anno)) && Number.isFinite(Number(h.numero)) && Boolean(h.data))
        .map((h) => ({ ...mapHeaderForLocal(h), projectUrl: syncProjectUrl }));

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

      // Salva gli snapshot base per i nuovi DDT scaricati (usati dal 3-way merge)
      const linesByDocKey = new Map<string, CloudLine[]>();
      for (const line of newLines) {
        const k = line.ddt_id || `${line.anno}:${line.numero_ddt}`;
        const list = linesByDocKey.get(k);
        if (list) list.push(line);
        else linesByDocKey.set(k, [line]);
      }
      for (const h of newHeaders) {
        const docLines =
          linesByDocKey.get(h.id) ??
          linesByDocKey.get(`${h.anno}:${h.numero}`) ??
          [];
        await saveDdtBaseSnapshot(
          h.id,
          h.ultima_modifica || h.created_at || null,
          buildSnapshotFromCloud(h, docLines)
        );
      }

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
    }
  }
}

export const ddtIncrementalSyncService = new DdtIncrementalSyncService();
