import { useCallback, useState } from "react";
import type { DdtArchiveEntry } from "../models/ddt";

export function useDdtArchiveDelete(onDeleteDdt: (id: string) => Promise<boolean>) {
  const [pendingDelete, setPendingDelete] = useState<DdtArchiveEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const deleted = await onDeleteDdt(pendingDelete.id);
      if (deleted) {
        setPendingDelete(null);
        setDeleteError(false);
      } else {
        setDeleteError(true);
      }
    } catch {
      setDeleteError(true);
    } finally {
      setIsDeleting(false);
    }
  }, [onDeleteDdt, pendingDelete]);

  const cancelDelete = useCallback(() => {
    setPendingDelete(null);
    setDeleteError(false);
  }, []);

  return {
    pendingDelete,
    setPendingDelete,
    isDeleting,
    deleteError,
    setDeleteError,
    confirmDelete,
    cancelDelete,
  };
}
