import { ClientDestination } from "@/features/clients/models/client";

/**
 * Rimuove il nome del cliente dalla stringa di destinazione.
 * Es. "CV7 - CARTIERE CARRARA" con cliente "CARTIERE CARRARA" -> "CV7"
 * Es. "F.SSO RALLETTA - WEPA ITALIA" con cliente "WEPA ITALIA" -> "F.SSO RALLETTA"
 * Es. "CARTIERE CARRARA" con cliente "CARTIERE CARRARA" -> ""
 */
export function cleanDestinationName(text: string, clientName?: string): string {
  if (!text) return "";
  let clean = text.trim();
  if (clientName) {
    const cn = clientName.trim();
    const escaped = cn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    clean = clean.replace(new RegExp(`\\s*[-·/,|]\\s*${escaped}\\b`, "gi"), "");
    clean = clean.replace(new RegExp(`^${escaped}\\s*[-·/,|]\\s*`, "gi"), "");
    clean = clean.replace(new RegExp(`\\s*\\(${escaped}\\)`, "gi"), "");
    clean = clean.replace(new RegExp(`\\[${escaped}\\]`, "gi"), "");
    if (clean.toUpperCase() === cn.toUpperCase()) {
      clean = "";
    }
  }
  return clean.trim();
}

/**
 * Restituisce l'etichetta da visualizzare nella selezione e il valore pulito
 * da impostare come indirizzo di consegna (destination_address).
 */
export function getDestinationInfo(d: ClientDestination, clientName?: string): { label: string; addressValue: string } {
  const cCitta = cleanDestinationName(d.citta || "", clientName);
  const cLuogo = cleanDestinationName(d.luogo || "", clientName);

  let label = cCitta;
  if (!label) {
    label = cLuogo;
  } else if (cLuogo && cLuogo.toUpperCase() !== cCitta.toUpperCase()) {
    label = `${cCitta} · ${cLuogo}`;
  }
  if (!label) {
    label = d.citta || d.luogo || "Destinazione";
  }

  const addressValue = cCitta || cLuogo || d.citta || d.luogo || "";

  return { label, addressValue };
}

