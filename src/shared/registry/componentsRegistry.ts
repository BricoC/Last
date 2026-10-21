/**
 * REGISTRO CENTRALE COMPONENTI — LAST GESTIONALE
 * Obbligo di consultazione prima di creare qualsiasi nuovo elemento UI.
 * Divieto assoluto di doppioni: se esiste, si riutilizza o si parametrizza.
 */

export interface ComponentRegistryEntry {
  name: string;
  category: "ui" | "layout" | "grid" | "feedback";
  path: string;
  description: string;
  propsSummary: string[];
}

export const COMPONENTS_REGISTRY: ComponentRegistryEntry[] = [
  {
    name: "Button",
    category: "ui",
    path: "src/shared/components/ui/button.tsx",
    description: "Pulsante standard compatibile con il Theme Engine e le varianti visive.",
    propsSummary: ["variant ('primary' | 'secondary' | 'outline' | 'danger')", "size ('sm' | 'md' | 'lg')", "disabled", "onClick"],
  },
  {
    name: "Card",
    category: "ui",
    path: "src/shared/components/ui/card.tsx",
    description: "Contenitore superficie con supporto a header, content, footer e stili tema.",
    propsSummary: ["title", "children", "className"],
  },
  {
    name: "TabBar",
    category: "layout",
    path: "src/shared/components/tabs/TabBar.tsx",
    description: "Barra delle linguette multi-scheda in stile Chrome con pulsanti di chiusura e split view.",
    propsSummary: ["tabs", "activeTabId", "onSelectTab", "onCloseTab", "onToggleSplit"],
  },
  {
    name: "SplitPaneContainer",
    category: "layout",
    path: "src/shared/components/tabs/SplitPaneContainer.tsx",
    description: "Contenitore per affiancare due schede con divisorio ridimensionabile col mouse.",
    propsSummary: ["primaryContent", "secondaryContent", "direction", "isSplit"],
  },
  {
    name: "ExcelGrid",
    category: "grid",
    path: "src/shared/components/data-grid/ExcelGrid.tsx",
    description: "Griglia tabellare ad alte performance basata su Glide Data Grid (Canvas 60 FPS, Excel-like, fill handle, copia/incolla, thema integrato).",
    propsSummary: ["columns", "rows", "getCellContent", "onCellEdited", "onRowAppended", "onPaste"],
  },
  {
    name: "TopNavBar",
    category: "layout",
    path: "src/shared/components/navigation/TopNavBar.tsx",
    description: "Barra superiore di primo livello con pulsanti moduli, indicatore Cloud e comandi di affiancamento/disposizione desktop.",
    propsSummary: ["openWindow", "activeWindowId", "tileSideBySide", "tileGrid", "cascadeWindows", "minimizeAll"],
  },
  {
    name: "WindowTabBar",
    category: "layout",
    path: "src/shared/components/navigation/WindowTabBar.tsx",
    description: "Barra inferiore delle schede aperte con scorrimento a frecce laterali (zero scrollbar), indicatore di focus e chiusura tab.",
    propsSummary: ["windows", "activeWindowId", "focusWindow", "closeWindow"],
  },
  {
    name: "DesktopWorkspace",
    category: "layout",
    path: "src/shared/components/desktop/DesktopWorkspace.tsx",
    description: "Contenitore canvas desktop MDI stile Windows che ospita finestre flessibili, ridimensionabili e massimizzabili.",
    propsSummary: ["renderContent"],
  },
  {
    name: "DesktopWindow",
    category: "layout",
    path: "src/shared/components/desktop/DesktopWindow.tsx",
    description: "Finestra flottante singola stile Windows con drag & drop su intestazione, ridimensionamento ad angoli, minimizzazione, massimizzazione e chiusura.",
    propsSummary: ["window", "renderContent"],
  },
];
