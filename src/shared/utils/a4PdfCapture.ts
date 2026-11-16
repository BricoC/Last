import { getFontEmbedCSS, toJpeg } from "html-to-image";
import jsPDF from "jspdf";

const fontEmbedCssCache = new Map<string, string>();
let fontsReadyDone = false;

export interface CapturePdfOptions {
  pixelRatio?: number;
  quality?: number;
  excludeClass?: string;
  cacheKey?: string;
}

/**
 * Attende il caricamento iniziale dei font di sistema/web al massimo una volta per sessione.
 */
export async function ensureDocumentFontsReady(): Promise<void> {
  if (fontsReadyDone) return;
  if (typeof document !== "undefined" && (document as any).fonts?.ready) {
    try {
      await Promise.race([
        (document as any).fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch {
      // Ignora eventuali errori di caricamento font
    }
  }
  fontsReadyDone = true;
}

/**
 * Attende il prossimo frame di paint del DOM con fallback sicuro se la finestra è minimizzata/nascosta.
 */
export function waitForDomPaint(fallbackMs = 24): Promise<void> {
  if (
    typeof document !== "undefined" &&
    !document.hidden &&
    typeof requestAnimationFrame === "function"
  ) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, fallbackMs);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    });
  }
  return new Promise((resolve) => setTimeout(resolve, fallbackMs));
}

/**
 * Risolve e memorizza in cache il CSS dei font per evitare a html-to-image
 * di riscansionare tutti gli stylesheet del DOM su ogni singola pagina.
 */
export async function getCachedFontEmbedCss(
  node: HTMLElement,
  cacheKey: string,
  excludeClass?: string
): Promise<string | undefined> {
  if (fontEmbedCssCache.has(cacheKey)) {
    return fontEmbedCssCache.get(cacheKey);
  }
  try {
    const css = await getFontEmbedCSS(node, {
      cacheBust: false,
      filter: excludeClass
        ? (el: HTMLElement) => !el.classList?.contains(excludeClass)
        : undefined,
    });
    fontEmbedCssCache.set(cacheKey, css);
    return css;
  } catch {
    return undefined;
  }
}

/**
 * Cattura una singola pagina A4 DOM in JPEG ad alta qualità (veloce e leggera su jsPDF).
 */
export async function captureA4PageToJpeg(
  pageEl: HTMLElement,
  options?: CapturePdfOptions
): Promise<string> {
  const excludeClass = options?.excludeClass;
  const cacheKey = options?.cacheKey || excludeClass || "default-a4";
  const fontEmbedCSS = await getCachedFontEmbedCss(pageEl, cacheKey, excludeClass);

  return await toJpeg(pageEl, {
    pixelRatio: options?.pixelRatio ?? 2.0,
    quality: options?.quality ?? 0.94,
    backgroundColor: "#ffffff",
    cacheBust: false,
    skipAutoScale: true,
    ...(fontEmbedCSS !== undefined ? { fontEmbedCSS } : {}),
    style: {
      boxShadow: "none",
      border: "none",
      margin: "0",
      opacity: "1",
      visibility: "visible",
    },
    filter: excludeClass
      ? (node: Node) => {
          if (node instanceof HTMLElement && node.classList?.contains(excludeClass)) {
            return false;
          }
          return true;
        }
      : undefined,
  });
}

/**
 * Costruisce un documento jsPDF A4 multipagina incorporando direttamente le immagini JPEG
 * (nessuna ricompressione PNG in JS, file 3-4x più leggeri e generazione molto più rapida).
 */
export async function buildA4PdfFromElements(
  pages: HTMLElement[],
  options?: CapturePdfOptions
): Promise<jsPDF> {
  await ensureDocumentFontsReady();

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const dataUrl = await captureA4PageToJpeg(pages[i], options);
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      throw new Error(`Errore nella generazione grafica della pagina ${i + 1}.`);
    }
    pdf.addImage(dataUrl, "JPEG", 0, 0, pdfW, pdfH);
  }

  return pdf;
}
