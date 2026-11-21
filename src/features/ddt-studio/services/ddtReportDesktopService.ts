import { invoke } from "@tauri-apps/api/core";
/**
 * Salva il file Excel generato direttamente sul Desktop dell'utente (usando Tauri)
 * oppure tramite download classico nel browser.
 */
export async function saveReportToDesktop(
  filename: string,
  content: Uint8Array | string
): Promise<string> {
  try {
    if (typeof content === "string") {
      return await invoke<string>("save_file_base64_to_desktop", {
        filename,
        base64Content: content,
      });
    }

    try {
      let binary = "";
      const len = content.byteLength;
      const chunkSize = 0x8000;
      for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode.apply(
          null,
          content.subarray(i, Math.min(i + chunkSize, len)) as any
        );
      }
      const base64Content = btoa(binary);
      return await invoke<string>("save_file_base64_to_desktop", {
        filename,
        base64Content,
      });
    } catch {
      return await invoke<string>("save_file_to_desktop", {
        filename,
        bytes: Array.from(content),
      });
    }
  } catch (err) {
    console.warn("Fallback download browser perché Tauri save non disponibile:", err);
    let blob: Blob;
    if (typeof content === "string") {
      const clean = content.includes(";base64,") ? content.split(";base64,")[1] : content;
      const bString = atob(clean);
      const bArray = new Uint8Array(bString.length);
      for (let i = 0; i < bString.length; i++) {
        bArray[i] = bString.charCodeAt(i);
      }
      blob = new Blob([bArray], {
        type: filename.endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
      });
    } else {
      const mimeType = filename.endsWith(".xlsx")
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf";
      blob = new Blob([content as BlobPart], { type: mimeType });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return `Scaricato nei Download come ${filename}`;
  }
}
