import React from "react";
import { DdtDocument, DdtItem } from "../models/ddt";
import { DDTMultiListinoModal } from "./DDTMultiListinoModal";
import { DDTPrintCopiesModal } from "./DDTPrintCopiesModal";
import { DdtTrashModal } from "./DdtTrashModal";
import { DdtConflictModal, DdtConflictDetail } from "./DdtConflictModal";
import { DdtGapModal } from "./DdtGapModal";
import {
  DdtPurchaseHistoryModal,
  PurchaseHistoryCandidateRow,
} from "./DdtPurchaseHistoryModal";
import { DdtOperatorModal } from "./DdtOperatorModal";
import { DdtMergeConflictModal, DdtMergeConflictState } from "./DdtMergeConflictModal";
import { InsertDdtArticlePayload } from "../utils/ddtStudioEditorUtils";

export interface DdtGapModalState {
  isOpen: boolean;
  mode: "new_ddt" | "inspect";
  missingNumbers: number[];
  nextSequentialNumber: number | null;
  year: number;
}

export interface DdtPurchaseHistoryModalState {
  isOpen: boolean;
  clientName: string;
  rows: PurchaseHistoryCandidateRow[];
}

export interface DdtOperatorPromptState {
  actionMode: "emit" | "the_one";
  resolve: (operator: string | null) => void;
}

export interface DdtStudioModalsProps {
  ddt: Partial<DdtDocument>;
  items: DdtItem[];
  setItems: React.Dispatch<React.SetStateAction<DdtItem[]>>;
  isAlexModalOpen: boolean;
  onCloseAlexModal: () => void;
  onInsertArticle: (article: InsertDdtArticlePayload) => void;
  isPrintCopiesModalOpen: boolean;
  onClosePrintCopiesModal: () => void;
  onConfirmPrint: (copies: number) => void;
  isPrinting: boolean;
  isTrashOpen: boolean;
  onCloseTrash: () => void;
  onDdtRestored: () => Promise<void>;
  purchaseHistoryModal: DdtPurchaseHistoryModalState | null;
  onClosePurchaseHistory: () => void;
  onConfirmPurchaseHistory: (
    selected: Array<{ rowKey: string; purchasePriceSubunits: number }>
  ) => void;
  gapModalState: DdtGapModalState | null;
  onCloseGapModal: () => void;
  onRecoverGapNumber: (num: number) => void;
  onCreateGapPlaceholder: (num: number) => Promise<void>;
  onIgnoreGapsAndContinue: (nums: number[]) => void;
  activeConflict: DdtConflictDetail | null;
  onCloseConflict: () => void;
  onResolveConflict: (action: "replace" | "draft" | "new_number" | "ignore") => void;
  mergeConflict: DdtMergeConflictState | null;
  resolvingMerge: boolean;
  onUseRemoteMerge: () => void;
  onKeepLocalMerge: () => void;
  operatorPrompt: DdtOperatorPromptState | null;
  onSelectOperator: (op: string) => void;
  onCancelOperator: () => void;
}

export const DdtStudioModals: React.FC<DdtStudioModalsProps> = ({
  ddt,
  items,
  setItems,
  isAlexModalOpen,
  onCloseAlexModal,
  onInsertArticle,
  isPrintCopiesModalOpen,
  onClosePrintCopiesModal,
  onConfirmPrint,
  isPrinting,
  isTrashOpen,
  onCloseTrash,
  onDdtRestored,
  purchaseHistoryModal,
  onClosePurchaseHistory,
  onConfirmPurchaseHistory,
  gapModalState,
  onCloseGapModal,
  onRecoverGapNumber,
  onCreateGapPlaceholder,
  onIgnoreGapsAndContinue,
  activeConflict,
  onCloseConflict,
  onResolveConflict,
  mergeConflict,
  resolvingMerge,
  onUseRemoteMerge,
  onKeepLocalMerge,
  operatorPrompt,
  onSelectOperator,
  onCancelOperator,
}) => {
  return (
    <>
      <DDTMultiListinoModal
        isOpen={isAlexModalOpen}
        onClose={onCloseAlexModal}
        currentClientName={ddt.client_name}
        currentDdtItems={items}
        onUpdateDdtItems={setItems}
        onSelectArticle={onInsertArticle}
      />

      <DDTPrintCopiesModal
        isOpen={isPrintCopiesModalOpen}
        onClose={onClosePrintCopiesModal}
        onConfirm={onConfirmPrint}
        isPrinting={isPrinting}
      />

      <DdtTrashModal
        isOpen={isTrashOpen}
        onClose={onCloseTrash}
        onDdtRestored={onDdtRestored}
      />

      {purchaseHistoryModal && (
        <DdtPurchaseHistoryModal
          isOpen={purchaseHistoryModal.isOpen}
          clientName={purchaseHistoryModal.clientName}
          rows={purchaseHistoryModal.rows}
          onClose={onClosePurchaseHistory}
          onConfirm={onConfirmPurchaseHistory}
        />
      )}

      {gapModalState && (
        <DdtGapModal
          isOpen={gapModalState.isOpen}
          year={gapModalState.year}
          missingNumbers={gapModalState.missingNumbers}
          nextSequentialNumber={gapModalState.nextSequentialNumber}
          mode={gapModalState.mode}
          onClose={onCloseGapModal}
          onRecoverNumber={onRecoverGapNumber}
          onCreatePlaceholder={onCreateGapPlaceholder}
          onIgnoreAndContinue={onIgnoreGapsAndContinue}
        />
      )}

      <DdtConflictModal
        isOpen={Boolean(activeConflict)}
        conflict={activeConflict}
        onClose={onCloseConflict}
        onResolve={onResolveConflict}
      />

      <DdtMergeConflictModal
        mergeConflict={mergeConflict}
        resolvingMerge={resolvingMerge}
        onUseRemote={onUseRemoteMerge}
        onKeepLocal={onKeepLocalMerge}
      />

      <DdtOperatorModal
        isOpen={Boolean(operatorPrompt)}
        actionMode={operatorPrompt?.actionMode ?? "emit"}
        onSelect={onSelectOperator}
        onCancel={onCancelOperator}
      />
    </>
  );
};
