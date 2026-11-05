import React from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { DdtDocument } from "../models/ddt";
import { DdtRepository } from "../services/ddtRepository";
import { DDTA4Document } from "../document/DDTA4Document";
import { generatePdfBytesFromElements, formatDdtPdfFilename } from "./ddtExportManager";

/**
 * Renderizza un DdtDocument fuori schermo in formato A4 ed estrae i byte PDF generati.
 */
export async function generatePdfBytesForDoc(doc: DdtDocument): Promise<Uint8Array> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.width = "210mm";
  container.style.pointerEvents = "none";
  container.style.opacity = "1";
  container.style.zIndex = "-99999";
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(
    React.createElement(DDTA4Document, {
      ddt: doc,
      items: doc.items || [],
      isPrintOnly: true,
    })
  );

  try {
    if ((document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    }
    // Breve pausa per garantire il calcolo del layout flex/grid multipagina
    await new Promise((resolve) => setTimeout(resolve, 80));

    const pages = container.querySelectorAll(".ddt-a4-page");
    const pagesArray = Array.from(pages) as HTMLElement[];
    if (pagesArray.length === 0) {
      throw new Error(`Nessuna pagina A4 trovata nel DDT ${doc.doc_number ?? "Bozza"}`);
    }
    return await generatePdfBytesFromElements(pagesArray);
  } finally {
    // Pulizia accurata del DOM offscreen
    try {
      root.unmount();
    } catch {
      // Ignora eventuali race condition di unmount
    }
    container.remove();
  }
}

/**
 * Genera il PDF di un singolo DDT, lo salva nei file temporanei e lo copia negli Appunti di Windows (CF_HDROP).
 * Successivamente è possibile incollarlo direttamente come file allegato in qualsiasi email o cartella (Ctrl+V).
 */
export async function copySingleDdtPdfToClipboard(doc: DdtDocument): Promise<string> {
  const filename = formatDdtPdfFilename(doc);
  const pdfBytes = await generatePdfBytesForDoc(doc);

  const savedPath = await invoke<string>("save_temp_file", {
    filename,
    bytes: Array.from(pdfBytes),
  });

  await invoke("copy_files_to_clipboard", {
    paths: [savedPath],
  });

  return savedPath;
}

/**
 * Genera in sequenza i PDF di un elenco di DDT (tramite ID), li salva nei file temporanei
 * e copia l'intero gruppo di file negli Appunti di Windows per incollarli in un'email.
 */
export async function copyMultipleDdtPdfsByIds(
  ddtIds: string[],
  onProgress?: (current: number, total: number, label: string) => void
): Promise<{ count: number; paths: string[] }> {
  if (ddtIds.length === 0) {
    return { count: 0, paths: [] };
  }

  const repo = new DdtRepository();
  const paths: string[] = [];
  const total = ddtIds.length;

  for (let i = 0; i < total; i++) {
    const id = ddtIds[i];
    const doc = await repo.getDdtById(id);
    if (!doc) continue;

    const label = `DDT ${doc.doc_number ?? "BOZ"}${doc.series ? `/${doc.series}` : ""} · ${doc.client_name}`;
    onProgress?.(i + 1, total, label);

    const filename = formatDdtPdfFilename(doc);
    const pdfBytes = await generatePdfBytesForDoc(doc);

    const savedPath = await invoke<string>("save_temp_file", {
      filename,
      bytes: Array.from(pdfBytes),
    });

    paths.push(savedPath);
  }

  if (paths.length > 0) {
    await invoke("copy_files_to_clipboard", {
      paths,
    });
  }

  return { count: paths.length, paths };
}
