import React, { useMemo } from "react";
import {
  DataEditor,
  GridColumn,
  GridCell,
  Item,
  EditableGridCell,
  Theme as GlideTheme,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useThemeStore } from "@/shared/stores/useThemeStore";

export interface ExcelGridProps {
  columns: GridColumn[];
  rows: number;
  getCellContent: (cell: Item) => GridCell;
  onCellEdited?: (cell: Item, newValue: EditableGridCell) => void;
  onCellClicked?: (cell: Item) => void;
  onRowAppended?: () => void;
  onPaste?: (target: Item, values: readonly (readonly string[])[]) => boolean | Promise<boolean>;
  className?: string;
}

/**
 * Wrapper riutilizzabile per Glide Data Grid.
 * Offre un'esperienza tipo Excel nativa (selezione celle/aree, frecce tastiera, fill handle, copia-incolla).
 * Adatta automaticamente i colori al Theme Engine delle Settings.
 */
export const ExcelGrid: React.FC<ExcelGridProps> = ({
  columns,
  rows,
  getCellContent,
  onCellEdited,
  onCellClicked,
  onRowAppended,
  onPaste,
  className,
}) => {
  const { theme } = useThemeStore();

  // Mappa dinamica del tema di Last sui token di Glide Data Grid
  const glideTheme: Partial<GlideTheme> = useMemo(() => {
    return {
      accentColor: theme.primaryColor,
      accentLight: `${theme.primaryColor}25`,
      bgCell: theme.cardColor,
      bgCellMedium: theme.cardColor,
      bgHeader: "#0b1329",
      bgHeaderHasFocus: "#1e293b",
      bgHeaderHovered: "#1e293b",
      textHeader: "#94a3b8",
      textHeaderSelected: "#ffffff",
      textDark: theme.textColor,
      textMedium: theme.textColor,
      textLight: "#94a3b8",
      borderColor: theme.borderColor,
      horizontalBorderColor: theme.borderColor,
      headerBottomBorderColor: theme.borderColor,
      lineHeight: 1.4,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      baseFontStyle: "13px",
      headerFontStyle: "bold 12px",
    };
  }, [theme]);

  // Adapter per onPaste asincrono se Glide richiede ritorno sincrono
  const handleGlidePaste = (target: Item, values: readonly (readonly string[])[]): boolean => {
    if (!onPaste) return false;
    const res = onPaste(target, values);
    if (typeof res === "boolean") return res;
    return true; // Gestito in background
  };

  return (
    <div className={`w-full h-full flex flex-col overflow-hidden ${className || ""}`}>
      <DataEditor
        columns={columns}
        rows={rows}
        getCellContent={getCellContent}
        onCellEdited={onCellEdited}
        onCellClicked={onCellClicked}
        onRowAppended={onRowAppended}
        onPaste={handleGlidePaste}
        rowMarkers="number"
        fillHandle={true}
        smoothScrollX={true}
        smoothScrollY={true}
        theme={glideTheme}
        width="100%"
        height="100%"
        rowHeight={34}
        headerHeight={36}
      />
    </div>
  );
};
