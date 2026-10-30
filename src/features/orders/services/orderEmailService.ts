import { invoke } from "@tauri-apps/api/core";
import { OrderItem, Supplier } from "../types/order";
import { orderRepository } from "./orderRepository";

export interface SendOrderEmailParams {
  supplierName: string;
  items: OrderItem[];
  supplier?: Supplier;
  currentUser?: string;
  logoUrlOrPath?: string;
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
          <td style="padding: 7px 10px; border: 1px solid #d1d5db; font-size: 13px; font-weight: 600;">${r.article_code || '-'}</td>
          <td style="padding: 7px 10px; border: 1px solid #d1d5db; font-size: 13px;">${r.description || '-'}</td>
          <td style="padding: 7px 10px; border: 1px solid #d1d5db; text-align: center; font-size: 13px; font-weight: 600;">${r.quantity || '-'}</td>
          <td style="padding: 7px 10px; border: 1px solid #d1d5db; text-align: right; font-size: 13px;">${r.price ? '€ ' + r.price : '-'}</td>
          <td style="padding: 7px 10px; border: 1px solid #d1d5db; font-size: 12px; color: #4b5563;">${r.notes || ''}</td>
        </tr>
      `
      )
      .join('');

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
          Cordiali saluti,<br>
          <strong>Brico Class S.r.l.</strong>
        </p>
        ${logoUrlOrPath ? `<img src="${logoUrlOrPath}" alt="Brico Class" style="max-width: 220px; height: auto; margin-top: 8px;" />` : ''}
      </div>
    `;

    const subject = `Ordine materiale — ${supplierName} (${items.length} articol${items.length === 1 ? 'o' : 'i'})`;

    try {
      await invoke("send_order_email", {
        to: email,
        subject,
        body: bodyHtml,
      });

      // Se Outlook apre l'email, aggiorniamo il database locale marcando la data dell'ordine
      await orderRepository.markSupplierOrdersAsSent(supplierName, currentUser);

      return { success: true };
    } catch (err: any) {
      console.error("[OrderEmailService] Errore invio email:", err);
      return { success: false, error: String(err?.message || err) };
    }
  }
}

export const orderEmailService = new OrderEmailService();

