import type { DdtArchiveEntry } from "../models/ddt";

interface DdtArchiveDeleteDialogProps {
  document: DdtArchiveEntry | null;
  isDeleting: boolean;
  deleteError: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DdtArchiveDeleteDialog({ document, isDeleting, deleteError, onCancel, onConfirm }: DdtArchiveDeleteDialogProps) {
  if (!document) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" role="presentation">
      <section role="alertdialog" aria-modal="true" aria-labelledby="ddt-archive-delete-title" className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--foreground)] shadow-2xl">
        <h2 id="ddt-archive-delete-title" className="text-sm font-semibold">Eliminare il DDT?</h2>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">{document.doc_number === null ? "La bozza" : `Il DDT n. ${document.doc_number}`} di {document.client_name || "cliente non specificato"} verrà rimosso dall’archivio.</p>
        <div className="mt-4 flex justify-end gap-2">
          {deleteError && <span className="mr-auto self-center text-[10px] text-red-400">Eliminazione non riuscita.</span>}
          <button type="button" disabled={isDeleting} onClick={onCancel} className="rounded border border-[var(--border)] px-3 py-1.5 text-xs cursor-pointer">Annulla</button>
          <button type="button" disabled={isDeleting} onClick={onConfirm} className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer">{isDeleting ? "Eliminazione…" : "Elimina"}</button>
        </div>
      </section>
    </div>
  );
}
