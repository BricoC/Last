import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { invoke } from "@tauri-apps/api/core";
import { DdtDocument } from "../models/ddt";

/**
 * Formatta il nome file secondo lo standard richiesto:
 * DDT [numero/Bozza] del [gg.mm.aaaa] [nome cliente].png
 */
export function formatDdtImageFilename(
  ddt: Partial<DdtDocument>,
  pageIndex?: number,
  totalPages: number = 1
): string {
  const docNum = ddt.doc_number === null || ddt.doc_number === undefined
    ? "Bozza"
    : `${ddt.series ? `${ddt.series}-` : ""}${ddt.doc_number}`;
  let dateStr = "";
  if (ddt.doc_date) {
    const parts = ddt.doc_date.split("-");
    if (parts.length === 3) {
      dateStr = `${parts[2]}.${parts[1]}.${parts[0]}`;
    } else {
      dateStr = ddt.doc_date.replace(/-/g, ".");
    }
  } else {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    dateStr = `${dd}.${mm}.${yyyy}`;
  }

  const client = (ddt.client_name || "").trim().toUpperCase();
  const pageSuffix = totalPages > 1 && pageIndex !== undefined ? ` - Pagina ${pageIndex + 1}` : "";
  const raw = client
    ? `DDT ${docNum} del ${dateStr} ${client}${pageSuffix}.png`
    : `DDT ${docNum} del ${dateStr}${pageSuffix}.png`;
  // Rimuovi caratteri non validi per il filesystem Windows: < > : " / \ | ? *
  return raw.replace(/[<>:"/\\|?*]/g, "").trim();
}

// Retrocompatibilità per eventuali vecchie chiamate o test
export const formatDdtPdfFilename = (ddt: Partial<DdtDocument>) =>
  formatDdtImageFilename(ddt).replace(/\.png$/, ".pdf");

/**
 * Converte un dataUrl Base64 in array di byte (number[]) per IPC Tauri
 */
export function dataUrlToBytes(dataUrl: string): number[] {
  const base64 = dataUrl.split(",")[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return Array.from(bytes);
}

/**
 * Seleziona gli elementi DOM delle pagine A4 pronti per la cattura/stampa.
 * Se l'utente ha la vista anteprima A4 aperta a video, cattura direttamente quella per perfetta aderenza visiva.
 */
export function getCapturePageElements(): HTMLElement[] {
  // 1. Se l'utente ha la vista anteprima A4 aperta a video (.py-4 .ddt-a4-page), cattura direttamente quella
  const visiblePages = document.querySelectorAll(".py-4 .ddt-a4-page");
  if (visiblePages && visiblePages.length > 0) {
    return Array.from(visiblePages) as HTMLElement[];
  }
  // 2. Altrimenti cerca nel portale dedicato alla stampa
  const portalPages = document.querySelectorAll("#ddt-print-portal .ddt-a4-page");
  if (portalPages && portalPages.length > 0) {
    return Array.from(portalPages) as HTMLElement[];
  }
  // 3. Fallback generale
  const allPages = document.querySelectorAll(".ddt-a4-page");
  if (allPages && allPages.length > 0) {
    return Array.from(allPages) as HTMLElement[];
  }
  return [];
}

/**
 * Cattura una pagina DOM A4 ad alta risoluzione (2.5x pixel ratio)
 * producendo una resa identica al 100% pixel per pixel all'anteprima video del browser.
 */
export async function capturePageToPng(pageEl: HTMLElement): Promise<string> {
  return await toPng(pageEl, {
    pixelRatio: 2.5,
    backgroundColor: "#ffffff",
    style: {
      boxShadow: "none",
      border: "none",
      margin: "0",
      opacity: "1",
      visibility: "visible",
    },
    filter: (node: Node) => {
      if (node instanceof HTMLElement && node.classList?.contains("ddt-no-print")) {
        return false;
      }
      return true;
    },
  });
}

/**
 * Genera l'immagine PNG ad alta risoluzione del DDT e la salva direttamente sul Desktop dell'utente via Tauri.
 * Se ci sono più pagine, salva ciascuna pagina con suffisso numerato.
 */
export async function exportDdtImageToDesktop(
  ddt: Partial<DdtDocument>
): Promise<{ filename: string; path: string }> {
  if ((document as any).fonts?.ready) {
    await (document as any).fonts.ready;
  }

  const pages = getCapturePageElements();
  if (pages.length === 0) {
    throw new Error("Nessuna pagina A4 trovata nel documento.");
  }

  const totalPages = pages.length;
  let primaryFilename = "";
  let savedPath = "";

  for (let i = 0; i < totalPages; i++) {
    const filename = formatDdtImageFilename(ddt, i, totalPages);
    if (i === 0) primaryFilename = filename;

    const dataUrl = await capturePageToPng(pages[i]);
    const bytes = dataUrlToBytes(dataUrl);

    try {
      savedPath = await invoke<string>("save_file_to_desktop", { filename, bytes });
    } catch {
      try {
        savedPath = await invoke<string>("save_pdf_to_desktop", { filename, bytes });
      } catch (err) {
        console.warn("Tauri invoke non riuscito, fallback download browser:", err);
        const link = document.createElement("a");
        link.download = filename;
        link.href = dataUrl;
        link.click();
        savedPath = "Desktop (Download)";
      }
    }
  }

  return { filename: primaryFilename, path: savedPath };
}

/**
 * Genera il PDF A4 multipagina ad altissima fedeltà:
 * incorpora le pagine PNG catturate nativamente (senza html2canvas),
 * garantendo un PDF multipagina perfetto al 100% rispetto all'anteprima video.
 */
export async function exportDdtPdfToDesktop(
  ddt: Partial<DdtDocument>
): Promise<{ filename: string; path: string }> {
  if ((document as any).fonts?.ready) {
    await (document as any).fonts.ready;
  }

  const pages = getCapturePageElements();
  if (pages.length === 0) {
    throw new Error("Nessuna pagina A4 trovata nel documento.");
  }

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const dataUrl = await capturePageToPng(pages[i]);
    pdf.addImage(dataUrl, "PNG", 0, 0, pdfW, pdfH, undefined, "FAST");
  }

  const filename = formatDdtPdfFilename(ddt);
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

  return { filename, path: savedPath };
}

/**
 * Invia la stampa diretta silenziosa con fascicolazione su un solo lato (Simplex) e numero di copie.
 * Cattura le pagine usando la medesima rasterizzazione nativa per fedeltà assoluta al preview.
 */
export async function executeDdtPrint(copies: number = 1): Promise<void> {
  if ((document as any).fonts?.ready) {
    await (document as any).fonts.ready;
  }

  const pages = getCapturePageElements();
  if (pages.length === 0) {
    throw new Error("Nessuna pagina A4 trovata per la stampa.");
  }

  const actualCopies = Math.max(1, copies);

  const imagesBytes: number[][] = [];
  for (let i = 0; i < pages.length; i++) {
    const dataUrl = await capturePageToPng(pages[i]);
    const bytes = dataUrlToBytes(dataUrl);
    imagesBytes.push(bytes);
  }

  try {
    await invoke("print_ddt_silent", { imagesBytes, copies: actualCopies });
  } catch (err) {
    console.warn("Tauri print_ddt_silent fallito, fallback a window.print():", err);
    window.print();
  }
}
