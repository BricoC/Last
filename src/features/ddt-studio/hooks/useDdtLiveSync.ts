import React, { useEffect } from "react";
import { DdtDocument, DdtItem } from "../models/ddt";
import { buildPaddedDdtItems, makeEmptyItems } from "../ddtStudioDefaults";
import { ddtRepository } from "../services/ddtRepository";
import { ddtIncrementalSyncService } from "../services/ddtIncrementalSyncService";
import { DdtFieldConflict } from "../services/ddtMergeUtils";
import { DdtConflictDetail } from "../components/DdtConflictModal";
import { DdtMergeConflictState } from "../components/DdtMergeConflictModal";

export interface UseDdtLiveSyncParams {
  selectedYear: number | null;
  globalDiscount: string;
  globalMarkup: string;
  currentDdtIdRef: React.MutableRefObject<string | undefined>;
  ddtUpdatedAtRef: React.MutableRefObject<string | undefined>;
  isSavingRef: React.MutableRefObject<boolean>;
  isDirtyRef: React.MutableRefObject<boolean>;
  savedSignature: React.MutableRefObject<string | null>;
  signature: (
    doc: Partial<DdtDocument>,
    rows: DdtItem[],
    discount: string,
    markup: string
  ) => string;
  loadRecentDdts: () => Promise<void>;
  loadAvailableYears: () => Promise<void>;
  refreshNumberingStatus: (targetYear?: number | null) => Promise<void>;
  setDdt: React.Dispatch<React.SetStateAction<Partial<DdtDocument>>>;
  setItems: React.Dispatch<React.SetStateAction<DdtItem[]>>;
  setGlobalDiscount: React.Dispatch<React.SetStateAction<string>>;
  setGlobalMarkup: React.Dispatch<React.SetStateAction<string>>;
  setShowMargini: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveView: React.Dispatch<React.SetStateAction<"editor" | "a4">>;
  setRemoteUpdateNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveConflict: React.Dispatch<React.SetStateAction<DdtConflictDetail | null>>;
  setMergeConflict: React.Dispatch<React.SetStateAction<DdtMergeConflictState | null>>;
  showToast: (msg: string) => void;
}

export function useDdtLiveSync({
  selectedYear,
  globalDiscount,
  globalMarkup,
  currentDdtIdRef,
  ddtUpdatedAtRef,
  isSavingRef,
  isDirtyRef,
  savedSignature,
  signature,
  loadRecentDdts,
  loadAvailableYears,
  refreshNumberingStatus,
  setDdt,
  setItems,
  setGlobalDiscount,
  setGlobalMarkup,
  setShowMargini,
  setActiveView,
  setRemoteUpdateNotice,
  setActiveConflict,
  setMergeConflict,
  showToast,
}: UseDdtLiveSyncParams) {
  // Ascolto eventi di conflitto rilevati durante importazione o sincronizzazione
  useEffect(() => {
    const handleConflict = (e: any) => {
      if (e?.detail) {
        setActiveConflict(e.detail as DdtConflictDetail);
      }
    };
    const handleMergeConflict = (e: Event) => {
      const detail = (e as CustomEvent<{
        docId: string;
        year: number;
        docNumber: number | null;
        conflicts: DdtFieldConflict[];
        missingBaseSnapshot?: boolean;
      }>).detail;
      if (detail?.docId && ((detail.conflicts?.length ?? 0) > 0 || detail.missingBaseSnapshot)) {
        setMergeConflict({
          docId: detail.docId,
          year: detail.year,
          docNumber: detail.docNumber,
          conflicts: detail.conflicts ?? [],
        });
      }
    };
    window.addEventListener("ddt-conflict-detected", handleConflict);
    window.addEventListener("ddt-merge-conflict", handleMergeConflict);
    return () => {
      window.removeEventListener("ddt-conflict-detected", handleConflict);
      window.removeEventListener("ddt-merge-conflict", handleMergeConflict);
    };
  }, [setActiveConflict, setMergeConflict]);

  // Aggiornamento reattivo live quando Supabase Realtime / 3-way merge aggiorna i dati
  useEffect(() => {
    const syncOpenEditorIfNeeded = async (mergedDocId?: string) => {
      const openId = currentDdtIdRef.current;
      if (!openId || isSavingRef.current) return;
      if (mergedDocId && mergedDocId !== openId) return;
      try {
        const latest = await ddtRepository.getDdtById(openId);
        if (!latest || currentDdtIdRef.current !== openId) return;

        const isMerged = Boolean(mergedDocId === openId);
        const changedOnDisk =
          isMerged ||
          (latest.updated_at && latest.updated_at !== ddtUpdatedAtRef.current);

        if (!changedOnDisk) return;

        const padded = buildPaddedDdtItems(latest.id, latest.items || []);
        const latestSignature = signature(latest, padded, globalDiscount, globalMarkup);
        if (!isMerged && latestSignature === savedSignature.current) {
          ddtUpdatedAtRef.current = latest.updated_at;
          return;
        }

        if (!isDirtyRef.current || isMerged) {
          setDdt(latest);
          setItems(padded);
          setRemoteUpdateNotice(null);
          ddtUpdatedAtRef.current = latest.updated_at;
          savedSignature.current = latestSignature;
          showToast(
            isMerged
              ? "Modifiche unite automaticamente con l'altra postazione"
              : "DDT aggiornato in tempo reale da un'altra postazione"
          );
        } else {
          setRemoteUpdateNotice(
            "Un'altra postazione ha aggiornato questo DDT sul Cloud: al tuo salvataggio le modifiche verranno unite automaticamente."
          );
        }
      } catch (err) {
        console.warn("[DDTStudio] Errore reload live editor:", err);
      }
    };

    const handleSyncUpdate = () => {
      void loadRecentDdts();
      void loadAvailableYears();
      void refreshNumberingStatus(selectedYear);
      void syncOpenEditorIfNeeded();
    };
    const handleMergedUpdate = (e: Event) => {
      const docId = (e as CustomEvent<{ docId?: string }>).detail?.docId;
      void loadRecentDdts();
      void refreshNumberingStatus(selectedYear);
      void syncOpenEditorIfNeeded(docId);
    };
    window.addEventListener("ddt-data-updated", handleSyncUpdate);
    window.addEventListener("ddt-data-merged", handleMergedUpdate);
    return () => {
      window.removeEventListener("ddt-data-updated", handleSyncUpdate);
      window.removeEventListener("ddt-data-merged", handleMergedUpdate);
    };
  }, [
    loadRecentDdts,
    loadAvailableYears,
    refreshNumberingStatus,
    selectedYear,
    signature,
    globalDiscount,
    globalMarkup,
    currentDdtIdRef,
    ddtUpdatedAtRef,
    isSavingRef,
    isDirtyRef,
    savedSignature,
    setDdt,
    setItems,
    setRemoteUpdateNotice,
    showToast,
  ]);

  useEffect(() => {
    void ddtIncrementalSyncService
      .syncNewDdtsFromSupabase({ checkModifiedRecent: true })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleQuoteConversion = (event: Event) => {
      const detail = (event as CustomEvent<{ ddt: Partial<DdtDocument>; items: DdtItem[] }>).detail;
      if (!detail?.ddt?.id) return;
      const blanks = makeEmptyItems();
      const padded = [...detail.items, ...blanks.slice(detail.items.length)].map((item) => ({
        ...item,
        ddt_id: detail.ddt.id!,
      }));
      setDdt(detail.ddt);
      setItems(padded);
      setGlobalDiscount("");
      setGlobalMarkup("");
      setShowMargini(false);
      savedSignature.current = signature(detail.ddt, padded, "", "");
      setActiveView("editor");
      showToast("Preventivo convertito in bozza DDT");
    };
    window.addEventListener("quote-converted-to-ddt", handleQuoteConversion);
    return () => window.removeEventListener("quote-converted-to-ddt", handleQuoteConversion);
  }, [
    signature,
    savedSignature,
    setDdt,
    setItems,
    setGlobalDiscount,
    setGlobalMarkup,
    setShowMargini,
    setActiveView,
    showToast,
  ]);
}
