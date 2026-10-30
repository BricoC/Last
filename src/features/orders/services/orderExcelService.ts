import ExcelJS from "exceljs";
import { invoke } from "@tauri-apps/api/core";
import { OrderItem, OrderViewMode } from "../types/order";
import { TODAY } from "../utils/constants";

export class OrderExcelService {
  /**
   * Esporta gli ordini in un file Excel formattato e lo salva sul Desktop
   */
  async exportOrdersToExcel(items: OrderItem[], viewMode: OrderViewMode): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      if (items.length === 0) {
        return { success: false, error: "Nessun ordine presente da esportare." };
      }

      const workbook = new ExcelJS.Workbook();
      const sheetName =
        viewMode === 'archiviati'
          ? 'Archivio Ordini'
          : viewMode === 'cestino'
          ? 'Cestino Ordini'
          : 'Ordini Attivi';

      const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ showGridLines: true }],
      });

      worksheet.columns = [
        { header: "Data Inserimento", key: "order_date", width: 15 },
        { header: "Fornitore", key: "supplier_name", width: 22 },
        { header: "Codice Articolo", key: "article_code", width: 20 },
        { header: "Descrizione", key: "description", width: 45 },
        { header: "Quantità", key: "quantity", width: 12 },
        { header: "Prezzo", key: "price", width: 15 },
        { header: "Data Ordine Inviato", key: "ordered_date", width: 18 },
        { header: "Note", key: "notes", width: 35 },
      ];

      // Stile testata
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 24;

      for (const item of items) {
        const row = worksheet.addRow({
          order_date: item.order_date,
          supplier_name: item.supplier_name,
          article_code: item.article_code,
          description: item.description,
          quantity: item.quantity,
          price: item.price,
          ordered_date: item.ordered_date || '',
          notes: item.notes || '',
        });
        row.height = 20;
        row.alignment = { vertical: "middle" };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      const cleanDate = TODAY().replace(/\//g, "-");
      const filename = `Ordini_${viewMode}_${cleanDate}_${Date.now()}.xlsx`;

      const savedPath = await invoke<string>("save_file_to_desktop", {
        filename,
        bytes,
      });

      return { success: true, filePath: savedPath };
    } catch (err: any) {
      console.error("[OrderExcelService] Errore esportazione Excel:", err);
      return { success: false, error: String(err?.message || err) };
    }
  }

  /**
   * Importa ordini da un file Excel (.xlsx) caricato dall'utente
   */
  async parseOrdersExcelFile(file: File): Promise<Array<Partial<OrderItem>>> {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const items: Array<Partial<OrderItem>> = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Salta intestazione
      const values = row.values as any[];
      if (!values || values.length < 2) return;

      const order_date = String(values[1] || '').trim();
      const supplier_name = String(values[2] || '').trim();
      const article_code = String(values[3] || '').trim();
      const description = String(values[4] || '').trim().toUpperCase();
      const quantity = String(values[5] || '').trim();
      const price = String(values[6] || '').trim();
      const ordered_date = String(values[7] || '').trim() || null;
      const notes = String(values[8] || '').trim();

      if (supplier_name || article_code || description) {
        items.push({
          order_date: order_date || TODAY(),
          supplier_name,
          article_code,
          description,
          quantity,
          price,
          ordered_date,
          notes,
        });
      }
    });

    return items;
  }
}

export const orderExcelService = new OrderExcelService();

