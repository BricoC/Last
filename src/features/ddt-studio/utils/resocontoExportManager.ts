import { invoke } from "@tauri-apps/api/core";
import { buildA4PdfFromElements } from "@/shared/utils/a4PdfCapture";

export interface ResocontoExportOptions {
  pageElements: HTMLElement[];
  clientTitle: string;
  yearTitle: string;
}

/**
 * Cattura le pagine A4 del resoconto in VERTICALE (portrait) multipagina
 * ed esporta il PDF salvandolo direttamente sul Desktop dell'utente via Tauri.
 */
export async function exportResocontoPdfToDesktop(
  options: ResocontoExportOptions
): Promise<{ filename: string; path: string; totalPages: number }> {
  const { pageElements, clientTitle, yearTitle } = options;

  if (!pageElements || pageElements.length === 0) {
    throw new Error("Nessuna pagina A4 trovata per il resoconto.");
  }

  const pdf = await buildA4PdfFromElements(pageElements, {
    pixelRatio: 2.0,
    quality: 0.94,
    cacheKey: "resoconto-a4",
  });

  // Nome file formattato: Resoconto_Storico_[Cliente]_[Anno]_[Data].pdf
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  const safeClient = clientTitle.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 30);
  const safeYear = yearTitle.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `Resoconto_Storico_${safeClient}_${safeYear}_${d}.${m}.${y}.pdf`;

  const pdfArrayBuffer = pdf.output("arraybuffer");
  const bytes = Array.from(new Uint8Array(pdfArrayBuffer));

  let savedPath = "";
  try {
    savedPath = await invoke<string>("save_file_to_desktop", { filename, bytes });
  } catch {
    try {
      savedPath = await invoke<string>("save_pdf_to_desktop", { filename, bytes });
    } catch (err) {
      console.warn("Tauri invoke non riuscito, fallback download browser:", err);
      const blob = pdf.output("blob");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      savedPath = "Desktop (Download)";
    }
  }

  return { filename, path: savedPath, totalPages: pageElements.length };
}
