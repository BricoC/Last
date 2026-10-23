import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { invoke } from "@tauri-apps/api/core";
import type { QuoteDraft } from "../models/quoteDraft";

export async function exportQuotePdf(draft: QuoteDraft): Promise<string> {
  if (document.fonts?.ready) await document.fonts.ready;
  await waitForPreview();
  const pages = Array.from(document.querySelectorAll<HTMLElement>("#quote-print-root .quote-a4-page"));
  if (!pages.length) throw new Error("Anteprima del preventivo non disponibile.");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  for (const [index, page] of pages.entries()) {
    if (index) pdf.addPage();
    const image = await toPng(page, {
      pixelRatio: 2.5,
      backgroundColor: "#ffffff",
      style: { boxShadow: "none", border: "none", margin: "0", opacity: "1", visibility: "visible" },
      filter: (node) => !(node instanceof HTMLElement && node.classList.contains("quote-no-print")),
    });
    pdf.addImage(image, "PNG", 0, 0, width, height, undefined, "FAST");
  }

  const filename = makeFilename(draft);
  const bytes = Array.from(new Uint8Array(pdf.output("arraybuffer")));
  try {
    await invoke<string>("save_file_to_desktop", { filename, bytes });
  } catch {
    try {
      await invoke<string>("save_pdf_to_desktop", { filename, bytes });
    } catch {
      const url = URL.createObjectURL(pdf.output("blob"));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
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

function makeFilename(draft: QuoteDraft): string {
  const base = (draft.subject || "Preventivo").trim();
  return `${base.replace(/[<>:"/\\|?*]/g, "_")}.pdf`;
}
