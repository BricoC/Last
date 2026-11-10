import { invoke } from "@tauri-apps/api/core";
import * as XLSX from "xlsx";
import { getDatabase } from "@/shared/data-layer/database";
import type {
  SupplierPriceListItem,
  SupplierPriceListFile,
  SupplierDistinctInfo,
} from "../models/supplierPriceList";

export interface FileItemInfo {
  filename: string;
  path: string;
  size_bytes: number;
}

export interface SyncProgressCallback {
  (info: {
    current: number;
    total: number;
    currentFile: string;
    progressText: string;
    pct?: number;
  }): void;
}

const STORAGE_KEY_FOLDER = "last_supplier_price_list_folder";
const DEFAULT_FOLDER = "D:\\BricoClassFiles\\OneDrive\\Last\\Listini Fornitori";

export class SupplierPriceListService {
  public static getFolderPath(): string {
    return localStorage.getItem(STORAGE_KEY_FOLDER) || DEFAULT_FOLDER;
  }

  public static setFolderPath(path: string): void {
    localStorage.setItem(STORAGE_KEY_FOLDER, path.trim());
  }

  /**
   * Ricava fornitore e data di validità stimata a partire dal nome del file.
   */
  public static extractSupplierAndDate(filename: string): {
    supplier: string;
    listDate: string;
  } {
    const clean = filename.replace(/\.(xlsx|xls|xlsm)$/i, "").trim();

    // Rilevamento fornitore
    let supplier = clean.split(/[-_]/)[0].trim().toUpperCase();
    const lower = filename.toLowerCase();
    if (lower.includes("homberger")) supplier = "HOMBERGER";
    else if (lower.includes("secureload")) supplier = "SECURELOAD";
    else if (lower.includes("pferd")) supplier = "PFERD";
    else if (lower.includes("strops")) supplier = "STROPS";
    else if (lower.includes("vogel")) supplier = "VOGEL";
    else if (lower.includes("tractel")) supplier = "TRACTEL";
    else if (lower.includes("carcano")) supplier = "CARCANO";
    else if (lower.includes("elematic")) supplier = "ELEMATIC";
    else if (lower.includes("expert")) supplier = "EXPERT";
    else if (lower.includes("facom")) supplier = "FACOM";
    else if (lower.includes("fasano")) supplier = "FASANO";
    else if (lower.includes("fermec")) supplier = "FERMEC";
    else if (lower.includes("ibfm")) supplier = "IBFM";
    else if (lower.includes("ineco")) supplier = "INECO";

    // Rilevamento data (es. 01.07.2026, Novembre 2026, 2026)
    let listDate = "2026";
    const dateMatch = clean.match(/(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4})/);
    if (dateMatch) {
      listDate = dateMatch[1];
    } else {
      const monthMatch = clean.match(
        /(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s*\d{4}/i
      );
      if (monthMatch) {
        listDate = monthMatch[0];
      } else {
        const yearMatch = clean.match(/\b(202\d)\b/);
        if (yearMatch) {
          listDate = yearMatch[1];
        }
      }
    }

    return { supplier, listDate };
  }

  /**
   * Scansiona la cartella condivisa e importa/aggiorna nel database SQLite locale i file.
   * - Elimina automaticamente dall'archivio i file rimossi dalla cartella (ZERO duplicati).
   * - Riconosce e separa Listino Lordo da Prezzo Netto d'acquisto.
   */
  public static async scanAndSync(
    onProgress?: SyncProgressCallback,
    force: boolean = false
  ): Promise<{ updatedFiles: number; totalItems: number; skippedFiles: number; deletedFiles: number }> {
    const db = await getDatabase();
    const folderPath = this.getFolderPath();

    // Assicura colonne ed indici necessari
    try {
      await db.execute("ALTER TABLE supplier_price_list_items ADD COLUMN net_price REAL DEFAULT 0;");
    } catch {
      // Già presente
    }
    try {
      await db.execute("ALTER TABLE supplier_price_list_items ADD COLUMN extra_code TEXT;");
    } catch {
      // Già presente
    }
    try {
      await db.execute("CREATE INDEX IF NOT EXISTS idx_spli_extra_code ON supplier_price_list_items(extra_code);");
    } catch {
      // Già presente
    }

    let fileList: FileItemInfo[] = [];
    try {
      fileList = await invoke<FileItemInfo[]>("list_files_in_folder", {
        folderPath,
        extensions: ["xlsx", "xls", "xlsm"],
      });
    } catch (err) {
      throw new Error(`Impossibile leggere la cartella "${folderPath}": ${err}`);
    }

    // Filtra file temporanei di Excel tipo ~$ o file nascosti
    const validFiles = fileList.filter((f) => {
      const fn = f.filename;
      return !fn.startsWith("~$") && !fn.startsWith(".") && fn.length > 5;
    });

    if (validFiles.length === 0) {
      return { updatedFiles: 0, totalItems: 0, skippedFiles: 0, deletedFiles: 0 };
    }

    // Recupera file già indicizzati nel DB SQLite
    const existingDbFiles = await db.select<SupplierPriceListFile[]>(
      "SELECT id, filename, file_size FROM supplier_price_list_files"
    );
    const existingMap = new Map(existingDbFiles.map((x) => [x.filename, x]));

    // PULIZIA AUTOMATICA FILE RIMOSSI DALLA CARTELLA:
    // Se un file era nel database ma è stato cancellato o sostituito nella cartella,
    // cancelliamo istantaneamente tutte le sue righe dal database per evitare qualsiasi duplicato!
    const validFileNamesSet = new Set(validFiles.map((f) => f.filename));
    let deletedFiles = 0;
    for (const dbFile of existingDbFiles) {
      if (!validFileNamesSet.has(dbFile.filename)) {
        await db.execute("DELETE FROM supplier_price_list_items WHERE file_id = $1", [dbFile.id]);
        await db.execute("DELETE FROM supplier_price_list_files WHERE id = $1", [dbFile.id]);
        deletedFiles++;
      }
    }

    let updatedFiles = 0;
    let skippedFiles = 0;

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const existing = existingMap.get(file.filename);

      // Se non forzato e il file ha la stessa dimensione in byte, saltiamo la rilettura pesante
      if (!force && existing && existing.file_size === file.size_bytes) {
        skippedFiles++;
        continue;
      }

      onProgress?.({
        current: i + 1,
        total: validFiles.length,
        currentFile: file.filename,
        progressText: `Lettura ed elaborazione listino ${i + 1}/${validFiles.length}: ${file.filename}...`,
        pct: Math.round(((i + 1) / validFiles.length) * 100),
      });

      try {
        await this.parseAndSaveExcelFile(file);
        updatedFiles++;
      } catch (err) {
        console.error(`[SupplierPriceListService] Errore su file ${file.filename}:`, err);
      }
    }

    // Calcolo totale voci presenti nel DB
    const countRes = await db.select<{ cnt: number }[]>(
      "SELECT COUNT(*) as cnt FROM supplier_price_list_items"
    );
    const totalItems = countRes[0]?.cnt || 0;

    return { updatedFiles, totalItems, skippedFiles, deletedFiles };
  }

  /**
   * Legge un singolo file Excel tramite Tauri, individua in modo completo
   * TUTTE le colonne (Codice, Codice Vecchio, Descrizione, Barcode, Prezzo Listino, Prezzo Netto, U.M., Note)
   * ed inserisce gli articoli a blocchi in SQLite.
   */
  private static async parseAndSaveExcelFile(file: FileItemInfo): Promise<number> {
    const db = await getDatabase();
    const base64Str = await invoke<string>("read_single_excel_file_base64", {
      filePath: file.path,
    });
    const binaryStr = atob(base64Str);
    const wb = XLSX.read(binaryStr, { type: "binary", dense: true });

    if (!wb.SheetNames || wb.SheetNames.length === 0) return 0;

    // Seleziona il foglio più probabile
    let sheetName = wb.SheetNames[0];
    for (const name of wb.SheetNames) {
      const lower = name.toLowerCase();
      if (
        lower.includes("listino") ||
        lower.includes("base") ||
        lower.includes("cat") ||
        lower.includes("tops") ||
        lower.includes("export") ||
        lower.includes("foglio1")
      ) {
        sheetName = name;
        break;
      }
    }

    const ws = wb.Sheets[sheetName];
    if (!ws) return 0;

    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    if (rawRows.length < 2) return 0;

    // Individuazione colonne (tra le prime 8 righe)
    let headerRowIdx = -1;
    let codeColIdx = -1;
    let descColIdx = -1;
    let extraDescColIdx = -1;
    let listPriceColIdx = -1;
    let netPriceColIdx = -1;
    let barcodeColIdx = -1;
    let unitColIdx = -1;
    let brandColIdx = -1;
    let oldCodeColIdx = -1;
    let substituteColIdx = -1;
    let notesColIdx = -1;

    for (let r = 0; r < Math.min(8, rawRows.length); r++) {
      const row = rawRows[r] as unknown[];
      if (!Array.isArray(row)) continue;

      let foundCode = -1;
      let foundDesc = -1;
      let foundExtraDesc = -1;
      let foundListPrice = -1;
      let foundNetPrice = -1;
      let foundBarcode = -1;
      let foundUnit = -1;
      let foundBrand = -1;
      let foundOldCode = -1;
      let foundSubstitute = -1;
      let foundNotes = -1;

      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || "").trim().toLowerCase();
        if (!val) continue;

        // Codice Principale
        if (
          (val.includes("codice") ||
            val.includes("articolo") ||
            val.includes("materiale") ||
            val.includes("oggetto")) &&
          !val.includes("vecchio") &&
          !val.includes("alternativ") &&
          !val.includes("sostitut") &&
          !val.includes("esaurimento") &&
          !val.includes("eliminato") &&
          !val.includes("barcode") &&
          !val.includes("ean") &&
          !val.includes("classe") &&
          !val.includes("statistica") &&
          foundCode === -1
        ) {
          foundCode = c;
        }
        // Codice Vecchio o Alternativo
        else if (
          (val.includes("vecchio") ||
            val.includes("alternativ") ||
            val.includes("precedente") ||
            val.includes("eliminato") ||
            val.includes("codice no spazi")) &&
          foundOldCode === -1
        ) {
          foundOldCode = c;
        }
        // Articolo Sostitutivo
        else if (val.includes("sostitut") && foundSubstitute === -1) {
          foundSubstitute = c;
        }
        // Descrizione Principale
        else if (
          val.includes("descr") &&
          !val.includes("aggiuntiva") &&
          !val.includes("inglese") &&
          !val.includes("classe") &&
          !val.includes("statistica") &&
          foundDesc === -1
        ) {
          foundDesc = c;
        }
        // Descrizione Aggiuntiva (es. STROPS)
        else if (
          (val.includes("aggiuntiva") || val.includes("descr 2") || val.includes("descrizione 2")) &&
          foundExtraDesc === -1
        ) {
          foundExtraDesc = c;
        }
        // Prezzo Netto (es. Fasano NETTO FASCIA 1, Vogel sc. 40%)
        else if (
          ((val.includes("netto") && !val.includes("peso netto") && !val.includes("volume")) ||
            val.includes("sc. 40%") ||
            val.includes("sc.")) &&
          foundNetPrice === -1
        ) {
          foundNetPrice = c;
        }
        // Prezzo Listino (Lordo)
        else if (
          (val.includes("prezzo") ||
            val.includes("listino") ||
            val.includes("lordo") ||
            val.includes("base05") ||
            val.includes("€/cad")) &&
          !val.includes("sconto") &&
          !val.includes("netto") &&
          !val.includes("promoday") &&
          !val.includes("sc.") &&
          foundListPrice === -1
        ) {
          foundListPrice = c;
        }
        // Barcode / EAN
        else if (
          (val.includes("barcode") ||
            val.includes("ean") ||
            val.includes("a barre") ||
            val.includes("ean13")) &&
          foundBarcode === -1
        ) {
          foundBarcode = c;
        }
        // Unità di Misura
        else if (
          (val === "um" ||
            val === "u.m" ||
            val === "uoq" ||
            val === "cd_armisura" ||
            val.includes("unità di misura") ||
            val.includes("unità di vendita")) &&
          foundUnit === -1
        ) {
          foundUnit = c;
        }
        // Brand / Marchio
        else if (
          (val.includes("brand") || val.includes("marca") || val.includes("produttore")) &&
          foundBrand === -1
        ) {
          foundBrand = c;
        }
        // Note / Confezione / Esaurimento
        else if (
          (val.includes("note") ||
            val.includes("imballo") ||
            val.includes("confezione") ||
            val.includes("esaurimento") ||
            val.includes("scatola") ||
            val.includes("cartone")) &&
          foundNotes === -1
        ) {
          foundNotes = c;
        }
      }

      if (foundDesc !== -1 && (foundCode !== -1 || foundListPrice !== -1 || foundNetPrice !== -1)) {
        headerRowIdx = r;
        codeColIdx = foundCode;
        descColIdx = foundDesc;
        extraDescColIdx = foundExtraDesc;
        listPriceColIdx = foundListPrice;
        netPriceColIdx = foundNetPrice;
        barcodeColIdx = foundBarcode;
        unitColIdx = foundUnit;
        brandColIdx = foundBrand;
        oldCodeColIdx = foundOldCode;
        substituteColIdx = foundSubstitute;
        notesColIdx = foundNotes;
        break;
      }
    }

    if (headerRowIdx === -1 || descColIdx === -1) {
      headerRowIdx = 0;
      codeColIdx = 0;
      descColIdx = 1;
      listPriceColIdx = 2;
    }

    const { supplier, listDate } = this.extractSupplierAndDate(file.filename);
    const fileId = crypto.randomUUID();

    // Elimina record precedenti del file (in caso di re-import o aggiornamento)
    await db.execute(
      "DELETE FROM supplier_price_list_items WHERE file_id IN (SELECT id FROM supplier_price_list_files WHERE filename = $1)",
      [file.filename]
    );
    await db.execute("DELETE FROM supplier_price_list_files WHERE filename = $1", [file.filename]);

    await db.execute(
      `INSERT INTO supplier_price_list_files (
        id, filename, file_path, supplier_name, file_date, file_size, last_modified_ms, total_items, imported_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        fileId,
        file.filename,
        file.path,
        supplier,
        listDate,
        file.size_bytes,
        Date.now(),
        0,
        new Date().toISOString(),
      ]
    );

    interface PreparedItem {
      id: string;
      file_id: string;
      supplier_name: string;
      code: string;
      description: string;
      price: number;
      net_price: number;
      unit: string;
      barcode: string | null;
      list_date: string;
      brand: string | null;
      notes: string | null;
      extra_code: string | null;
      created_at: string;
    }

    const items: PreparedItem[] = [];
    const nowIso = new Date().toISOString();

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r] as unknown[];
      if (!Array.isArray(row) || row.length === 0) continue;

      let desc = String(row[descColIdx] || "").trim();
      if (!desc || desc.length < 2) continue;

      // Unisci descrizione aggiuntiva se presente (es. STROPS)
      if (extraDescColIdx !== -1 && row[extraDescColIdx]) {
        const extraDesc = String(row[extraDescColIdx]).trim();
        if (extraDesc && !desc.includes(extraDesc)) {
          desc = `${desc} - ${extraDesc}`;
        }
      }

      const codeRaw = codeColIdx !== -1 ? String(row[codeColIdx] || "").trim() : "";

      // Estrazione Prezzo Listino Lordo
      const listPriceRaw = listPriceColIdx !== -1 ? row[listPriceColIdx] : 0;
      let listPriceNum = 0;
      if (typeof listPriceRaw === "number") {
        listPriceNum = listPriceRaw;
      } else if (typeof listPriceRaw === "string") {
        const cleanPrice = listPriceRaw.replace("€", "").replace(/\s+/g, "").replace(",", ".");
        listPriceNum = parseFloat(cleanPrice) || 0;
      }

      // Estrazione Prezzo Netto
      const netPriceRaw = netPriceColIdx !== -1 ? row[netPriceColIdx] : 0;
      let netPriceNum = 0;
      if (typeof netPriceRaw === "number") {
        netPriceNum = netPriceRaw;
      } else if (typeof netPriceRaw === "string") {
        const cleanNet = netPriceRaw.replace("€", "").replace(/\s+/g, "").replace(",", ".");
        netPriceNum = parseFloat(cleanNet) || 0;
      }

      const barcodeRaw =
        barcodeColIdx !== -1 && row[barcodeColIdx]
          ? String(row[barcodeColIdx]).trim()
          : null;
      const unitRaw =
        unitColIdx !== -1 && row[unitColIdx]
          ? String(row[unitColIdx]).trim().toUpperCase()
          : "NR";
      const brandRaw =
        brandColIdx !== -1 && row[brandColIdx]
          ? String(row[brandColIdx]).trim().toUpperCase()
          : null;

      // Codice vecchio / alternativo
      const oldCodeRaw =
        oldCodeColIdx !== -1 && row[oldCodeColIdx]
          ? String(row[oldCodeColIdx]).trim()
          : null;

      // Note e riferimenti (esaurimento, articolo sostitutivo, imballo)
      const noteParts: string[] = [];
      if (notesColIdx !== -1 && row[notesColIdx]) {
        const nVal = String(row[notesColIdx]).trim();
        if (nVal) noteParts.push(nVal);
      }
      if (substituteColIdx !== -1 && row[substituteColIdx]) {
        const subVal = String(row[substituteColIdx]).trim();
        if (subVal) noteParts.push(`Sost: ${subVal}`);
      }

      items.push({
        id: crypto.randomUUID(),
        file_id: fileId,
        supplier_name: supplier,
        code: codeRaw,
        description: desc.toUpperCase(),
        price: listPriceNum,
        net_price: netPriceNum,
        unit: unitRaw || "NR",
        barcode: barcodeRaw,
        list_date: listDate,
        brand: brandRaw,
        notes: noteParts.length > 0 ? noteParts.join(" | ") : null,
        extra_code: oldCodeRaw,
        created_at: nowIso,
      });
    }

    if (items.length === 0) return 0;

    // Inserimento a blocchi in SQLite (14 colonne per record, inclusi price, net_price ed extra_code)
    const CHUNK_SIZE = 300;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const valuePlaceholders: string[] = [];
      const params: unknown[] = [];

      chunk.forEach((it, idx) => {
        const offset = idx * 14;
        valuePlaceholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`
        );
        params.push(
          it.id,
          it.file_id,
          it.supplier_name,
          it.code,
          it.description,
          it.price,
          it.net_price,
          it.unit,
          it.barcode,
          it.list_date,
          it.brand,
          it.notes,
          it.extra_code,
          it.created_at
        );
      });

      await db.execute(
        `INSERT INTO supplier_price_list_items (
          id, file_id, supplier_name, code, description, price, net_price, unit, barcode, list_date, brand, notes, extra_code, created_at
        ) VALUES ${valuePlaceholders.join(", ")}`,
        params
      );
    }

    // Aggiorna totale elementi nel file
    await db.execute(
      "UPDATE supplier_price_list_files SET total_items = $1 WHERE id = $2",
      [items.length, fileId]
    );

    return items.length;
  }

  /**
   * Ricerca full-text multi-parola super-veloce con filtri su:
   * Fornitore, Codice Principale, Codice Vecchio/Alternativo (extra_code), Descrizione, Barcode, Brand e Note!
   */
  public static async searchItems(params: {
    query?: string;
    supplier?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: SupplierPriceListItem[]; total: number }> {
    const db = await getDatabase();
    const limit = params.limit ?? 10000;
    const offset = params.offset ?? 0;

    const whereClauses: string[] = [];
    const queryParams: unknown[] = [];

    // Filtro Fornitore da menu a tendina
    if (params.supplier && params.supplier !== "ALL") {
      queryParams.push(params.supplier);
      whereClauses.push(`supplier_name = $${queryParams.length}`);
    }

    // Filtro multi-parola (cerca su fornitore, codice, extra_code, descrizione, barcode, brand, note)
    const rawQuery = (params.query || "").trim();
    if (rawQuery.length > 0) {
      const tokens = rawQuery
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      tokens.forEach((token) => {
        queryParams.push(`%${token}%`);
        const idx = queryParams.length;
        whereClauses.push(
          `(supplier_name LIKE $${idx} OR code LIKE $${idx} OR extra_code LIKE $${idx} OR description LIKE $${idx} OR barcode LIKE $${idx} OR brand LIKE $${idx} OR notes LIKE $${idx})`
        );
      });
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) as total FROM supplier_price_list_items ${whereSql}`;
    const countRes = await db.select<{ total: number }[]>(countSql, queryParams);
    const total = countRes[0]?.total || 0;

    queryParams.push(limit);
    const limitIdx = queryParams.length;
    queryParams.push(offset);
    const offsetIdx = queryParams.length;

    const selectSql = `
      SELECT id, file_id, supplier_name, code, description, price, net_price, unit, barcode, list_date, brand, notes, extra_code, created_at
      FROM supplier_price_list_items
      ${whereSql}
      ORDER BY supplier_name ASC, description ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const items = await db.select<SupplierPriceListItem[]>(selectSql, queryParams);
    return { items, total };
  }

  /**
   * Elenco dei fornitori disponibili con totale articoli e data listino
   */
  public static async getDistinctSuppliers(): Promise<SupplierDistinctInfo[]> {
    const db = await getDatabase();
    return db.select<SupplierDistinctInfo[]>(`
      SELECT supplier_name as name, COUNT(*) as items_count, MAX(list_date) as last_date
      FROM supplier_price_list_items
      GROUP BY supplier_name
      ORDER BY supplier_name ASC
    `);
  }

  /**
   * Elimina un intero fornitore e tutti i suoi articoli dal database locale
   */
  public static async deleteSupplier(supplierName: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      "DELETE FROM supplier_price_list_items WHERE supplier_name = $1",
      [supplierName]
    );
    await db.execute(
      "DELETE FROM supplier_price_list_files WHERE supplier_name = $1",
      [supplierName]
    );
  }

  /**
   * Svuota completamente l'archivio dei listini fornitori
   */
  public static async clearAll(): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM supplier_price_list_items");
    await db.execute("DELETE FROM supplier_price_list_files");
  }
}
