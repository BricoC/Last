export interface PriceListSectionHandle {
  isEditingCell: () => boolean;
  cancelCellEdit: () => void;
  hasUnsavedChanges: () => boolean;
  saveChanges: () => Promise<void>;
  discardChanges: () => void;
}
