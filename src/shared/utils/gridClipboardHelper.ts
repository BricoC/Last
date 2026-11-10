/**
 * Utility per la gestione della selezione a rettangolo (range)
 * e dello scambio di dati via Appunti (TSV compatibile Excel)
 * sia per DDT Studio che per Preventivi.
 */

export interface CellCoord {
  rowIndex: number;
  colId: string;
}

export interface CellRange {
  start: CellCoord;
  end: CellCoord;
}

/**
 * Verifica se una cella (rowIndex, colId) ricade all'interno dell'intervallo di selezione attivo.
 */
export function isCellInRange(
  rowIndex: number | undefined | null,
  colId: string | undefined | null,
  range: CellRange | null | undefined,
  colsOrder: string[]
): boolean {
  if (!range || rowIndex === null || rowIndex === undefined || !colId) return false;

  const minRow = Math.min(range.start.rowIndex, range.end.rowIndex);
  const maxRow = Math.max(range.start.rowIndex, range.end.rowIndex);

  if (rowIndex < minRow || rowIndex > maxRow) return false;

  const startColIdx = colsOrder.indexOf(range.start.colId);
  const endColIdx = colsOrder.indexOf(range.end.colId);

  if (startColIdx === -1 || endColIdx === -1) return false;

  const minCol = Math.min(startColIdx, endColIdx);
  const maxCol = Math.max(startColIdx, endColIdx);
  const currentColIdx = colsOrder.indexOf(colId);

  if (currentColIdx === -1) return false;

  return currentColIdx >= minCol && currentColIdx <= maxCol;
}

/**
 * Converte il testo copiato dagli appunti (da Excel o altre tabelle TSV)
 * in una matrice bidimensionale [riga][colonna].
 */
export function parseTsv(clipText: string): string[][] {
  if (!clipText) return [];

  // Rimuove eventuali ritorni a capo finali generati da Excel
  const rawLines = clipText.split(/\r?\n/);
  const lines = rawLines.filter((line, idx, arr) => {
    if (idx === arr.length - 1 && line.trim() === "") return false;
    return true;
  });

  if (lines.length === 0) return [];

  return lines.map((line) => {
    const rawCells = line.split("\t");
    return rawCells.map((cell) => {
      let val = cell.trim();
      // Se la cella è racchiusa tra virgolette (standard CSV/TSV di Excel per celle con virgole o ritorni)
      if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
        val = val.slice(1, -1).replace(/""/g, '"').trim();
      }
      return val;
    });
  });
}

/**
 * Converte una matrice [riga][colonna] in formato TSV standard per gli appunti,
 * compatibile al 100% con Microsoft Excel e Google Sheets.
 */
export function formatTsv(matrix: string[][]): string {
  if (!matrix || matrix.length === 0) return "";
  return matrix.map((row) => row.join("\t")).join("\r\n");
}

/**
 * Rimuove le celle vuote "fantasma" generate da Excel quando la colonna DESCRIZIONE
 * nel foglio Excel è formata da celle unite (es. 4-5 colonne unite in una sola).
 * In questo modo, quando si copia U.M. + Quantità + Descrizione + Prezzo da Excel,
 * il prezzo viene agganciato correttamente alla colonna Prezzo invece di scivolare via.
 */
export function normalizeExcelRowCells(
  rawCells: string[],
  startColIdx: number,
  colOrder: string[]
): string[] {
  const descColIdx = colOrder.indexOf("description");
  if (descColIdx === -1 || descColIdx < startColIdx) {
    return rawCells;
  }

  const descOffset = descColIdx - startColIdx;
  if (descOffset >= rawCells.length) {
    return rawCells;
  }

  let emptyCount = 0;
  for (let i = descOffset + 1; i < rawCells.length; i++) {
    if (rawCells[i].trim() === "") {
      emptyCount++;
    } else {
      break;
    }
  }

  if (emptyCount > 0 && descOffset + 1 + emptyCount < rawCells.length) {
    const cleaned = [...rawCells];
    cleaned.splice(descOffset + 1, emptyCount);
    return cleaned;
  }

  return rawCells;
}


