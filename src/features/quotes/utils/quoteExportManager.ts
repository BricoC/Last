import { invoke } from "@tauri-apps/api/core";
import type { QuoteDraft } from "../models/quoteDraft";
import { buildA4PdfFromElements } from "@/shared/utils/a4PdfCapture";

export function makeQuotePdfFilename(draft: QuoteDraft): string {
  const year = draft.year || new Date().getFullYear();
  const num = draft.quote_number != null ? ` ${year}.${draft.quote_number}` : ` ${year}`;
  const client = (draft.client_name || draft.subject || "").trim();
  const raw = client ? `Preventivo${num} ${client}.pdf` : `Preventivo${num}.pdf`;
  // Rimuovi caratteri non ammessi nei nomi file di Windows (< > : " / \ | ? *) e normalizza gli spazi
  return raw.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
}

export async function generateQuotePdfBytes(draft: QuoteDraft): Promise<{ filename: string; bytes: Uint8Array }> {
  await waitForPreview();
  const pages = Array.from(document.querySelectorAll<HTMLElement>("#quote-print-root .quote-a4-page"));
  if (!pages.length) throw new Error("Anteprima del preventivo non disponibile.");

  const pdf = await buildA4PdfFromElements(pages, {
    pixelRatio: 2.0,
    quality: 0.94,
    excludeClass: "quote-no-print",
    cacheKey: "quote-a4",
  });

  const filename = makeQuotePdfFilename(draft);
  const bytes = new Uint8Array(pdf.output("arraybuffer"));
  return { filename, bytes };
}

/**
 * Genera il PDF del preventivo, lo salva nei file temporanei e lo copia negli Appunti di Windows (CF_HDROP).
 * Successivamente è possibile incollarlo direttamente come file allegato in qualsiasi email o cartella (Ctrl+V).
 */
export async function copyQuotePdfToClipboard(draft: QuoteDraft): Promise<string> {
  const { filename, bytes } = await generateQuotePdfBytes(draft);
  const savedPath = await invoke<string>("save_temp_file", {
    filename,
    bytes: Array.from(bytes),
  });
  await invoke("copy_files_to_clipboard", {
    paths: [savedPath],
  });
  return savedPath;
}

export async function exportQuotePdf(draft: QuoteDraft): Promise<string> {
  const { filename, bytes } = await generateQuotePdfBytes(draft);
  const bytesArray = Array.from(bytes);
  try {
    await invoke<string>("save_file_to_desktop", { filename, bytes: bytesArray });
  } catch {
    try {
      await invoke<string>("save_pdf_to_desktop", { filename, bytes: bytesArray });
    } catch {
      const blob = new Blob([bytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  return filename;
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (document.querySelector('#quote-print-root[data-ready="true"]')) return;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
}


