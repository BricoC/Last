import type ExcelJS from "exceljs";
export function formatExportTimestamp(): { label: string; fileSuffix: string; dateFolder: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  return {
    label: `${dd}/${mm}/${yyyy} ${hh}:${min}`,
    fileSuffix: `${yyyy}.${mm}.${dd} ore ${hh}.${min}`,
    dateFolder: `${yyyy}.${mm}.${dd}`,
  };
}

export function styleHeaderRow(row: ExcelJS.Row, colCount: number): void {
  row.height = 22;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF334155" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  }
}

export function toExcelFraction(value: number | null | undefined): number | null {
  if (value == null || isNaN(value) || !isFinite(value)) return null;
  return Math.round(value * 100000) / 100000;
}
