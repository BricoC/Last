export type PriceListTextColorToken = "red" | "amber" | "green" | "blue" | "purple";
export type PriceListHighlightToken = "yellow" | "green" | "sky" | "rose";

export const PRICE_LIST_TEXT_COLORS: { token: PriceListTextColorToken; label: string; swatch: string }[] = [
  { token: "red", label: "Rosso", swatch: "#ef4444" },
  { token: "amber", label: "Ambra", swatch: "#d97706" },
  { token: "green", label: "Verde", swatch: "#16a34a" },
  { token: "blue", label: "Blu", swatch: "#2563eb" },
  { token: "purple", label: "Viola", swatch: "#9333ea" },
];

export const PRICE_LIST_HIGHLIGHT_COLORS: { token: PriceListHighlightToken; label: string; swatch: string }[] = [
  { token: "yellow", label: "Evidenzia Giallo", swatch: "#fde047" },
  { token: "green", label: "Evidenzia Verde", swatch: "#86efac" },
  { token: "sky", label: "Evidenzia Azzurro", swatch: "#7dd3fc" },
  { token: "rose", label: "Evidenzia Rosa", swatch: "#fda4af" },
];

const ALLOWED_TEXT_COLORS = new Set<string>(PRICE_LIST_TEXT_COLORS.map((c) => c.token));
const ALLOWED_HIGHLIGHTS = new Set<string>(PRICE_LIST_HIGHLIGHT_COLORS.map((c) => c.token));

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeInlineText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\r?\n/g, " ");
}

function serializeCleanNode(node: Node): { html: string; hasFormatting: boolean } {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = normalizeInlineText(node.textContent || "");
    return { html: escapeHtml(raw), hasFormatting: false };
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return { html: "", hasFormatting: false };
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  let innerHtml = "";
  let innerHasFormatting = false;
  el.childNodes.forEach((child) => {
    const res = serializeCleanNode(child);
    innerHtml += res.html;
    if (res.hasFormatting) innerHasFormatting = true;
  });

  if (!innerHtml) {
    return { html: "", hasFormatting: false };
  }

  if (tag === "b" || tag === "strong") {
    return { html: `<b>${innerHtml}</b>`, hasFormatting: true };
  }
  if (tag === "i" || tag === "em") {
    return { html: `<i>${innerHtml}</i>`, hasFormatting: true };
  }
  if (tag === "span") {
    const color = el.getAttribute("data-pl-color");
    if (color && ALLOWED_TEXT_COLORS.has(color)) {
      return { html: `<span data-pl-color="${color}">${innerHtml}</span>`, hasFormatting: true };
    }
    // Support inline bold/italic produced by browser execCommand in some WebViews
    const fw = el.style?.fontWeight;
    const fs = el.style?.fontStyle;
    let wrapped = innerHtml;
    let formatted = innerHasFormatting;
    if (fw === "bold" || fw === "700" || fw === "600") {
      wrapped = `<b>${wrapped}</b>`;
      formatted = true;
    }
    if (fs === "italic") {
      wrapped = `<i>${wrapped}</i>`;
      formatted = true;
    }
    return { html: wrapped, hasFormatting: formatted };
  }
  if (tag === "mark") {
    const hl = el.getAttribute("data-pl-hl");
    if (hl && ALLOWED_HIGHLIGHTS.has(hl)) {
      return { html: `<mark data-pl-hl="${hl}">${innerHtml}</mark>`, hasFormatting: true };
    }
  }

  return { html: innerHtml, hasFormatting: innerHasFormatting };
}

/**
 * Sanitizza l'HTML dell'editor descrizione, consentendo solo <b>, <i>,
 * <span data-pl-color="..."> e <mark data-pl-hl="...">.
 * Restituisce null se non è presente alcuna formattazione effettiva.
 */
export function sanitizeDescriptionRichHtml(rawHtml: string | null | undefined): string | null {
  if (!rawHtml || !rawHtml.trim()) return null;
  if (typeof document === "undefined") return null;

  const container = document.createElement("div");
  container.innerHTML = rawHtml;

  let html = "";
  let hasFormatting = false;
  container.childNodes.forEach((child) => {
    const res = serializeCleanNode(child);
    html += res.html;
    if (res.hasFormatting) hasFormatting = true;
  });

  const plain = normalizeInlineText(container.textContent || "").trim();
  if (!plain || !hasFormatting) return null;
  return html.trim();
}

/**
 * Estrae il testo semplice normalizzato da un frammento HTML descrizione.
 */
export function extractPlainTextFromRichHtml(rawHtml: string | null | undefined): string {
  if (!rawHtml) return "";
  if (typeof document === "undefined") {
    return rawHtml.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }
  const container = document.createElement("div");
  container.innerHTML = rawHtml;
  return normalizeInlineText(container.textContent || "").trim();
}

/**
 * Restituisce l'HTML formattato solo se è valido e coerente con il testo `descrizione`
 * (protegge da modifiche effettuate con versioni precedenti di Last che non aggiornano `descrizione_rich`).
 */
export function getEffectiveDescriptionRichHtml(
  plainDescription: string | null | undefined,
  richHtml: string | null | undefined
): string | null {
  if (!richHtml) return null;
  const plain = (plainDescription || "").trim();
  if (!plain) return null;
  const sanitized = sanitizeDescriptionRichHtml(richHtml);
  if (!sanitized) return null;
  const richPlain = extractPlainTextFromRichHtml(sanitized);
  if (richPlain !== plain) return null;
  return sanitized;
}
