import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { invoke } from "@tauri-apps/api/core";

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

  // Attende il caricamento dei font se disponibili
  if ((document as any).fonts?.ready) {
    try {
      await Promise.race([
        (document as any).fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      // Ignora errori font
    }
  }

  // Creazione PDF A4 Portrait (verticale: 210mm x 297mm)
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pageElements.length; i++) {
    if (i > 0) pdf.addPage();

    const pageEl = pageElements[i];

    // Cattura ad alta risoluzione 2.2x pixel ratio
    const dataUrl = await toPng(pageEl, {
      pixelRatio: 2.2,
      backgroundColor: "#ffffff",
      style: {
        boxShadow: "none",
        border: "none",
        margin: "0",
        opacity: "1",
        visibility: "visible",
      },
    });

    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      throw new Error(`Errore nella generazione grafica della pagina ${i + 1}.`);
    }

    pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
  }

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
