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
];
