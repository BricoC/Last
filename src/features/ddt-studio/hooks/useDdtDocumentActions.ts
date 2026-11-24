import React, { useCallback } from "react";
import { DdtDocument, DdtItem } from "../models/ddt";
import { buildPaddedDdtItems, makeTest48Items, makeTestDdt } from "../ddtStudioDefaults";
import { ddtRepository } from "../services/ddtRepository";
import { normalizeImportedDdt } from "../services/ddtImportNormalization";
import { ddtCloudPushService } from "../services/ddtCloudPushService";
import { clientRepository } from "@/features/clients/services/clientRepository";
import { normalizeOperator } from "../utils/ddtCalculations";
import { DdtConflictDetail } from "../components/DdtConflictModal";
import { DdtMergeConflictState } from "../components/DdtMergeConflictModal";
import { DdtOperatorPromptState } from "../components/DdtStudioModals";
import {
  buildClientUpsertPayloadFromDdt,
  formatDdtIdentifier,
  getDdtErrorMessage,
} from "../utils/ddtStudioEditorUtils";
import {
  executeDdtPrint,
  exportDdtPdfToDesktop,
} from "../utils/ddtExportManager";

export interface UseDdtDocumentActionsParams {
  ddt: Partial<DdtDocument>;
  items: DdtItem[];
  globalDiscount: string;
  globalMarkup: string;
  isSaving: boolean;
  isPrinting: boolean;
  currentSignature: string;
  activeConflict: DdtConflictDetail | null;
  mergeConflict: DdtMergeConflictState | null;
  isSavingRef: React.MutableRefObject<boolean>;
  isDirtyRef: React.MutableRefObject<boolean>;
  ddtUpdatedAtRef: React.MutableRefObject<string | undefined>;
  savedSignature: React.MutableRefObject<string | null>;
  printPortalRef: React.RefObject<HTMLDivElement>;
  handleSaveDraftRef: React.MutableRefObject<() => Promise<boolean>>;
  signature: (
    doc: Partial<DdtDocument>,
    rows: DdtItem[],
    discount: string,
    markup: string
  ) => string;
  setDdt: React.Dispatch<React.SetStateAction<Partial<DdtDocument>>>;
  setItems: React.Dispatch<React.SetStateAction<DdtItem[]>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPrinting: React.Dispatch<React.SetStateAction<boolean>>;
  setIsExportingPdf: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPrintCopiesModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveView: React.Dispatch<React.SetStateAction<"editor" | "a4">>;
  setRemoteUpdateNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setOperatorPrompt: React.Dispatch<React.SetStateAction<DdtOperatorPromptState | null>>;
  setActiveConflict: React.Dispatch<React.SetStateAction<DdtConflictDetail | null>>;
  setMergeConflict: React.Dispatch<React.SetStateAction<DdtMergeConflictState | null>>;
  setResolvingMerge: React.Dispatch<React.SetStateAction<boolean>>;
  loadRecentDdts: () => Promise<void>;
  refreshTrashCount: () => Promise<void>;
  promptUnsavedChanges: () => Promise<boolean>;
  handleSelectDdt: (id: string) => Promise<void>;
  handleNewDdt: () => Promise<void>;
  showToast: (msg: string) => void;
}

export function useDdtDocumentActions({
  ddt,
  items,
  globalDiscount,
  globalMarkup,
  isSaving,
  isPrinting,
  currentSignature,
  activeConflict,
  mergeConflict,
  isSavingRef,
  isDirtyRef,
  ddtUpdatedAtRef,
  savedSignature,
  printPortalRef,
  handleSaveDraftRef,
  signature,
  setDdt,
  setItems,
  setIsSaving,
  setIsPrinting,
  setIsExportingPdf,
  setIsPrintCopiesModalOpen,
  setActiveView,
  setRemoteUpdateNotice,
  setOperatorPrompt,
  setActiveConflict,
  setMergeConflict,
  setResolvingMerge,
  loadRecentDdts,
  refreshTrashCount,
  promptUnsavedChanges,
  handleSelectDdt,
  handleNewDdt,
  showToast,
}: UseDdtDocumentActionsParams) {
  const syncClientInAnagrafica = useCallback(
    (
      source: Partial<DdtDocument>,
      savedId: string,
      clientId: string | undefined,
      projectUrl: string | null,
      contextLabel: string
    ) => {
      if (!source.client_name?.trim()) return;
      void clientRepository
        .upsertClientFromDocument(buildClientUpsertPayloadFromDdt(source, clientId, projectUrl))
        .then((upserted) => {
          setDdt((prev) =>
            prev.id === savedId && !prev.client_id ? { ...prev, client_id: upserted.id } : prev
          );
        })
        .catch((e) => console.warn(contextLabel, e));
    },
    [setDdt]
  );

  // Salva Bozza
  const handleSaveDraft = async (): Promise<boolean> => {
    if (isSavingRef.current) return false;
    setIsSaving(true);
    try {
      const saved = await ddtRepository.saveDraft(ddt, items);
      const syncedItems = buildPaddedDdtItems(saved.id, saved.items || []);
      setDdt(saved);
      setItems(syncedItems);
      setRemoteUpdateNotice(null);
      savedSignature.current = signature(saved, syncedItems, globalDiscount, globalMarkup);
      await loadRecentDdts();

      syncClientInAnagrafica(
        ddt,
        saved.id,
        saved.client_id || ddt.client_id,
        saved.project_url ?? null,
        "Auto-salvataggio cliente bozza:"
      );

      showToast("Bozza salvata con successo");
      return true;
    } catch (e) {
      console.error("Errore salvataggio bozza:", e);
      showToast(`Errore salvataggio bozza: ${getDdtErrorMessage(e)}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };
  handleSaveDraftRef.current = handleSaveDraft;

  const promptOperatorSelection = useCallback(
    (actionMode: "emit" | "the_one"): Promise<string | null> =>
      new Promise((resolve) => {
        setOperatorPrompt({ actionMode, resolve });
      }),
    [setOperatorPrompt]
  );

  // Salva e Conferma DDT (Emissione con numero progressivo)
  const handleEmitDdt = async (): Promise<boolean> => {
    if (isSavingRef.current) return false;
    if (!ddt.client_name?.trim()) {
      showToast("Attenzione: Inserisci il nome del cliente prima di salvare il DDT!");
      return false;
    }

    let targetDdt = ddt;
    if (!normalizeOperator(targetDdt.operator)) {
      const chosenOp = await promptOperatorSelection("emit");
      if (!chosenOp) return false;
      targetDdt = { ...targetDdt, operator: chosenOp };
      setDdt(targetDdt);
    }

    setIsSaving(true);
    try {
      const saved = await ddtRepository.emitDdt(targetDdt, items);
      const syncedItems = buildPaddedDdtItems(saved.id, saved.items || []);
      ddtUpdatedAtRef.current = saved.updated_at;
      setDdt(saved);
      setItems(syncedItems);
      setRemoteUpdateNotice(null);
      savedSignature.current = signature(saved, syncedItems, globalDiscount, globalMarkup);
      await loadRecentDdts();

      syncClientInAnagrafica(
        saved,
        saved.id,
        saved.client_id || ddt.client_id,
        saved.project_url ?? null,
        "Auto-salvataggio cliente emissione:"
      );

      const identifier = formatDdtIdentifier(saved);
      const cloudPushError = (saved as DdtDocument & { _cloudPushError?: string })._cloudPushError;
      if (cloudPushError) {
        showToast(
          `DDT #${identifier} salvato in locale, ma invio al Cloud non riuscito: ${cloudPushError}`
        );
      } else {
        showToast(`DDT emesso con successo! Numero assegnato: #${identifier}`);
      }
      return true;
    } catch (e) {
      console.error("Errore emissione DDT:", e);
      showToast(`Errore emissione DDT: ${getDdtErrorMessage(e)}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // The One: Salva DDT con numero progressivo e stampa immediatamente 3 copie
  const executeTheOne = async (targetDdt: Partial<DdtDocument>) => {
    setIsSaving(true);
    showToast("The One: Salvataggio DDT con numero progressivo...");
    try {
      const saved = await ddtRepository.emitDdt(targetDdt, items);
      const syncedItems = buildPaddedDdtItems(saved.id, saved.items || []);
      ddtUpdatedAtRef.current = saved.updated_at;
      setDdt(saved);
      setItems(syncedItems);
      setRemoteUpdateNotice(null);
      savedSignature.current = signature(saved, syncedItems, globalDiscount, globalMarkup);
      await loadRecentDdts();

      syncClientInAnagrafica(
        saved,
        saved.id,
        saved.client_id || targetDdt.client_id,
        saved.project_url ?? null,
        "Auto-salvataggio cliente The One:"
      );

      setIsSaving(false);

      const identifier = formatDdtIdentifier(saved);
      const cloudPushError = (saved as DdtDocument & { _cloudPushError?: string })._cloudPushError;
      showToast(
        cloudPushError
          ? `DDT #${identifier} salvato in locale (Cloud in attesa: ${cloudPushError}). Invio stampa di 3 copie...`
          : `DDT #${identifier} salvato! Invio stampa di 3 copie immediate...`
      );

      setIsPrinting(true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await executeDdtPrint(3, printPortalRef.current);
      showToast(`The One completato: DDT #${identifier} emesso e 3 copie inviate alla stampante!`);
    } catch (e: any) {
      console.error("Errore The One:", e);
      showToast(`Errore The One: ${e?.message || e}`);
    } finally {
      setIsSaving(false);
      setIsPrinting(false);
    }
  };

  const handleTheOne = async () => {
    if (isSaving || isPrinting) return;
    if (ddt.status === "confermato" && ddt.doc_number !== null) {
      showToast("Questo DDT è già stato emesso e salvato con numero definitivo.");
      return;
    }
    if (!ddt.client_name?.trim()) {
      showToast("Attenzione: Inserisci il nome del cliente prima di salvare il DDT!");
      return;
    }
    let targetDdt = ddt;
    if (!normalizeOperator(targetDdt.operator)) {
      const chosenOp = await promptOperatorSelection("the_one");
      if (!chosenOp) return;
      targetDdt = { ...targetDdt, operator: chosenOp };
      setDdt(targetDdt);
    }
    await executeTheOne(targetDdt);
  };

  // Duplica DDT
  const handleDuplicateDdt = async () => {
    if (!ddt.id) return;
    if (isDirtyRef.current) {
      const allowed = await promptUnsavedChanges();
      if (!allowed) return;
    }
    setIsSaving(true);
    try {
      const dup = await ddtRepository.duplicateDdt(ddt.id);
      setDdt(dup);
      await handleSelectDdt(dup.id);
      await loadRecentDdts();
      showToast("DDT duplicato come nuova bozza non numerata");
    } catch (e) {
      console.error("Errore duplicazione:", e);
      showToast("Errore durante la duplicazione del DDT");
    } finally {
      setIsSaving(false);
    }
  };

  // Elimina DDT (sposta nel Cestino a 15 elementi FIFO)
  const handleDeleteDdt = async () => {
    if (!ddt.id) return;
    if (!confirm("Sei sicuro di voler eliminare questo DDT? Verrà conservato nel Cestino (15 voci max).")) {
      return;
    }

    try {
      await ddtRepository.deleteDdt(ddt.id);
      savedSignature.current = currentSignature;
      isDirtyRef.current = false;
      await handleNewDdt();
      await loadRecentDdts();
      await refreshTrashCount();
      showToast("DDT spostato nel Cestino");
    } catch (e) {
      console.error("Errore eliminazione:", e);
      showToast(`Errore eliminazione DDT: ${getDdtErrorMessage(e)}`);
    }
  };

  const handleDeleteArchivedDdt = async (id: string): Promise<boolean> => {
    try {
      await ddtRepository.deleteDdt(id);
      if (ddt.id === id) {
        savedSignature.current = currentSignature;
        isDirtyRef.current = false;
        await handleNewDdt();
      }
      await loadRecentDdts();
      await refreshTrashCount();
      showToast("DDT spostato nel Cestino");
      return true;
    } catch (e) {
      console.error("Errore eliminazione DDT dall’archivio:", e);
      showToast(`Errore eliminazione DDT: ${getDdtErrorMessage(e)}`);
      return false;
    }
  };

  // Risoluzione conflitti numerazione DDT durante importazione
  const handleResolveConflict = async (action: "replace" | "draft" | "new_number" | "ignore") => {
    if (!activeConflict) return;
    try {
      if (action === "replace") {
        await ddtRepository.replaceLocalDdtWithImported(
          activeConflict.localDoc.id,
          activeConflict.incomingDoc.rawHeader,
          activeConflict.incomingDoc.rawLines
        );
        showToast(
          `DDT ${activeConflict.docNumber} sostituito con la versione importata (precedente nel Cestino)`
        );
      } else if (action === "draft") {
        const { doc, items: importedItems } = normalizeImportedDdt(
          activeConflict.incomingDoc.rawHeader,
          activeConflict.incomingDoc.rawLines
        );
        const draftId = crypto.randomUUID();
        const draftHeader = { ...doc, id: draftId, doc_number: null, status: "bozza" as const };
        const draftLines = importedItems.map((it) => ({
          ...it,
          id: crypto.randomUUID(),
          ddt_id: draftId,
        }));
        await ddtRepository.saveDraft(draftHeader, draftLines);
        showToast("DDT importato salvato tra le Bozze");
      } else if (action === "new_number") {
        const { doc, items: importedItems } = normalizeImportedDdt(
          activeConflict.incomingDoc.rawHeader,
          activeConflict.incomingDoc.rawLines
        );
        const nextNum = await ddtRepository.getNextDocNumberWithCloud(activeConflict.year);
        const newDocId = crypto.randomUUID();
        const numberedHeader = { ...doc, id: newDocId, doc_number: nextNum, status: "bozza" as const };
        const numberedLines = importedItems.map((it) => ({
          ...it,
          id: crypto.randomUUID(),
          ddt_id: newDocId,
        }));
        await ddtRepository.emitDdt(numberedHeader, numberedLines);
        showToast(`DDT importato registrato come DDT ${nextNum}`);
      } else {
        showToast("DDT importato ignorato");
      }
      setActiveConflict(null);
      await loadRecentDdts();
      await refreshTrashCount();
    } catch (err) {
      console.error("Errore risoluzione conflitto:", err);
      showToast(`Errore risoluzione: ${getDdtErrorMessage(err)}`);
    }
  };

  // Stampa diretta con popup numero copie e lato singolo (Simplex)
  const handleConfirmPrint = async (copies: number) => {
    setIsPrintCopiesModalOpen(false);
    setIsPrinting(true);
    showToast(`Invio stampa di ${copies} ${copies === 1 ? "copia" : "copie"} in corso...`);
    try {
      await executeDdtPrint(copies, printPortalRef.current);
      showToast(
        `Stampa inviata alla stampante predefinita (${copies} ${copies === 1 ? "copia" : "copie"})`
      );
    } catch (e: any) {
      console.error("Errore stampa:", e);
      showToast(`Errore durante la stampa: ${e?.message || e}`);
    } finally {
      setIsPrinting(false);
    }
  };

  // Salva PDF multipagina del DDT direttamente sul Desktop
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    showToast("Generazione PDF multipagina del DDT in corso...");
    try {
      const { filename } = await exportDdtPdfToDesktop(ddt, printPortalRef.current);
      showToast(`PDF salvato sul Desktop: ${filename}`);
    } catch (e: any) {
      console.error("Errore salvataggio PDF:", e);
      showToast(`Errore salvataggio PDF: ${e?.message || e}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Popola 48 righe ed esporta direttamente sul Desktop il PDF
  const handleGenerateTest48 = async () => {
    const testDoc = makeTestDdt();
    const testItems = makeTest48Items();
    setDdt(testDoc);
    setItems(testItems);
    setActiveView("a4");
    showToast("Compilate 48 righe! Esportazione PDF in corso...");

    setTimeout(async () => {
      try {
        setIsExportingPdf(true);
        const pdfRes = await exportDdtPdfToDesktop(testDoc, printPortalRef.current);
        showToast(`PDF salvato su Desktop: ${pdfRes.filename}`);
      } catch (err: any) {
        console.error("Errore salvataggio test:", err);
        showToast(`Errore salvataggio test: ${err?.message || err}`);
      } finally {
        setIsExportingPdf(false);
      }
    }, 500);
  };

  const handleResolveMergeConflictChoice = async (strategy: "use-remote" | "keep-local") => {
    if (!mergeConflict) return;
    setResolvingMerge(true);
    try {
      const res = await ddtCloudPushService.resolveMergeConflict(mergeConflict.docId, strategy);
      if (res.success) {
        setMergeConflict(null);
        showToast(
          strategy === "use-remote"
            ? "Versione del Cloud scaricata e applicata."
            : "Modifiche di questo PC inviate al Cloud."
        );
      } else {
        showToast(
          res.error ||
            (strategy === "use-remote"
              ? "Impossibile applicare la versione Cloud"
              : "Impossibile inviare al Cloud")
        );
      }
    } finally {
      setResolvingMerge(false);
    }
  };

  return {
    handleSaveDraft,
    handleEmitDdt,
    handleTheOne,
    handleDuplicateDdt,
    handleDeleteDdt,
    handleDeleteArchivedDdt,
    handleResolveConflict,
    handleConfirmPrint,
    handleExportPdf,
    handleGenerateTest48,
    handleResolveMergeConflictChoice,
  };
}
