import React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useTabStore } from "@/shared/stores/useTabStore";

interface SplitPaneContainerProps {
  renderContent: (tabId: string) => React.ReactNode;
}

export const SplitPaneContainer: React.FC<SplitPaneContainerProps> = ({ renderContent }) => {
  const { activeTabId, isSplit, splitTabId, splitDirection } = useTabStore();

  if (!isSplit || !splitTabId) {
    return (
      <div className="flex-1 w-full h-full overflow-auto bg-[var(--background)]">
        {renderContent(activeTabId)}
      </div>
    );
  }

  return (
    <PanelGroup
      direction={splitDirection}
      className="flex-1 w-full h-full bg-[var(--background)]"
    >
      {/* Pannello Primario (Sinistra o Alto) */}
      <Panel defaultSize={50} minSize={25} className="overflow-auto border-r border-[var(--border)]">
        {renderContent(activeTabId)}
      </Panel>

      {/* Divisore trascinabile col mouse */}
      <PanelResizeHandle className="w-1.5 hover:w-2 bg-[var(--border)] hover:bg-[var(--primary)] transition-all cursor-col-resize select-none" />

      {/* Pannello Secondario Affiancato (Destra o Basso) */}
      <Panel defaultSize={50} minSize={25} className="overflow-auto bg-slate-900/40">
        {renderContent(splitTabId)}
      </Panel>
    </PanelGroup>
  );
};
