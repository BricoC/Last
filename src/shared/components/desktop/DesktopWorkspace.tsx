import React from "react";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { DesktopWindow } from "./DesktopWindow";
import { WindowsSnapFlyout } from "./WindowsSnapFlyout";

interface DesktopWorkspaceProps {
  renderContent: (componentId: string) => React.ReactNode;
}

export const DesktopWorkspace: React.FC<DesktopWorkspaceProps> = ({ renderContent }) => {
  const { windows, draggingWindowId, activeWindowId } = useWindowStore();

  return (
    <div className="flex-1 relative w-full h-full overflow-hidden bg-[var(--background)] cursor-default">
      {/* Sfondo del Desktop con watermark discreto */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(#3e4350_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />

      {/* Flyout di Snap Layout Windows 11 in alto al centro */}
      <WindowsSnapFlyout targetWindowId={draggingWindowId || activeWindowId} />

      {/* Render delle finestre aperte */}
      {windows.map((win) => (
        <DesktopWindow
          key={win.id}
          window={win}
          renderContent={renderContent}
        />
      ))}
    </div>
  );
};
