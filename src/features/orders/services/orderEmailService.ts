import { invoke } from "@tauri-apps/api/core";
import { OrderItem, Supplier } from "../types/order";
import { orderSupabaseService } from "./orderSupabaseService";
import { getCompanySettings } from "@/features/settings/companySettingsRepository";

export interface SendOrderEmailParams {
  supplierName: string;
  items: OrderItem[];
  supplier?: Supplier;
  currentUser?: string;
  logoUrlOrPath?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeLogoSrc(src?: string): string {
  const trimmed = (src || "").trim();
  if (!trimmed) return "";
  if (/^(https?:\/\/|data:image\/(png|jpeg|jpg|gif|webp);base64,)/i.test(trimmed)) {
    return escapeHtml(trimmed);
  }
  return "";
}

export class OrderEmailService {
  /**
   * Genera il template HTML dell'ordine e apre la finestra Outlook di anteprima
   */
  async sendOrderEmail({
    supplierName,
    items,
    supplier,
    currentUser = 'Operatore',
    logoUrlOrPath,
  }: SendOrderEmailParams): Promise<{ success: boolean; error?: string }> {
    if (!supplierName || items.length === 0) {
      return { success: false, error: "Nessun articolo selezionato per l'ordine." };
    }

    const email = supplier?.email || '';
    const now = new Date();
    const timeVal = now.getHours() * 100 + now.getMinutes();
    const greeting = timeVal > 0 && timeVal <= 1230 ? 'Buongiorno.' : 'Buonasera.';

    const tableRows = items
      .map(
        (r) => `
        <tr>
          <td style="padding: 7px 10px; border: 1px solid #d1d5db; font-size: 13px; font-weight: 600;">${escapeHtml(r.article_code || '-')}</td>
          <td style="padding: 7px 10px; border: 1px solid #d1d5db; font-size: 13px;">${escapeHtml(r.description || '-')}</td>
          <td style="padding: 7px 10px; border: 1px solid #d1d5db; text-align: center; font-size: 13px; font-weight: 600;">${escapeHtml(r.quantity || '-')}</td>
          <td style="padding: 7px 10px; border: 1px solid #d1d5db; text-align: right; font-size: 13px;">${r.price ? '€ ' + escapeHtml(r.price) : '-'}</td>
          <td style="padding: 7px 10px; border: 1px solid #d1d5db; font-size: 12px; color: #4b5563;">${escapeHtml(r.notes || '')}</td>
        </tr>
      `
      )
      .join('');

    const safeLogoSrc = sanitizeLogoSrc(logoUrlOrPath);
    const companySettings = await getCompanySettings().catch(() => null);
    const companyName = (companySettings?.business_name || "").trim();
    const safeCompanyName = escapeHtml(companyName);
    const signatureHtml = safeCompanyName
      ? `Cordiali saluti,<br><strong>${safeCompanyName}</strong>`
      : "Cordiali saluti.";
    const safeLogoAlt = safeCompanyName || "Logo aziendale";

    const bodyHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #1f2937; line-height: 1.5;">
        <p style="margin-bottom: 12px;">${greeting}</p>
        <p style="margin-bottom: 16px;">A seguire materiale da inviarci, grazie:</p>
        
        <table style="border-collapse: collapse; width: 100%; max-width: 850px; margin-top: 10px; border: 1px solid #d1d5db;">
          <thead>
            <tr style="background-color: #f3f4f6; color: #111827;">
              <th style="padding: 8px 10px; border: 1px solid #d1d5db; text-align: left; width: 18%;">Articolo</th>
              <th style="padding: 8px 10px; border: 1px solid #d1d5db; text-align: left; width: 42%;">Descrizione</th>
              <th style="padding: 8px 10px; border: 1px solid #d1d5db; text-align: center; width: 10%;">Quantità</th>
              <th style="padding: 8px 10px; border: 1px solid #d1d5db; text-align: right; width: 12%;">Prezzo</th>
              <th style="padding: 8px 10px; border: 1px solid #d1d5db; text-align: left; width: 18%;">Note</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div style="margin-top: 24px; padding: 12px; background-color: #f9fafb; border-left: 4px solid #3b82f6; max-width: 820px;">
          <p style="margin: 0; font-size: 12px; color: #374151;">
            ⚠️ <strong>Orari di scarico merci:</strong><br>
            Dal lunedì al venerdì: <strong>08:30 - 12:00</strong> e <strong>14:30 - 18:00</strong>.
          </p>
        </div>

        <p style="margin-top: 24px; margin-bottom: 8px;">
          ${signatureHtml}
        </p>
        ${safeLogoSrc ? `<img src="${safeLogoSrc}" alt="${safeLogoAlt}" style="max-width: 220px; height: auto; margin-top: 8px;" />` : ''}
      </div>
    `;

    const subject = `Ordine materiale — ${supplierName} (${items.length} articol${items.length === 1 ? 'o' : 'i'})`;

    try {
      await invoke("send_order_email", {
        to: email,
        subject,
        body: bodyHtml,
      });

      // Se Outlook apre l'email, aggiorniamo Supabase Cloud e il database locale solo per gli articoli inviati
      const sentIds = items.map((item) => String(item.supabase_id ?? item.id ?? "")).filter(Boolean);
      await orderSupabaseService.markSupplierOrdersAsSent(supplierName, currentUser, sentIds);

      return { success: true };
    } catch (err: any) {
      console.error("[OrderEmailService] Errore invio email:", err);
      return { success: false, error: String(err?.message || err) };
    }
  }
}

export const orderEmailService = new OrderEmailService();

