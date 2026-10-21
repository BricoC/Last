import React from "react";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { DesktopWindow } from "./DesktopWindow";
import { WindowsSnapFlyout } from "./WindowsSnapFlyout";

interface DesktopWorkspaceProps {
  renderContent: (componentId: string) => React.ReactNode;
}

export const DesktopWorkspace: React.FC<DesktopWorkspaceProps> = ({ renderContent }) => {
  const { windows, draggingWindowId, activeWindowId, snapPreviewBounds } = useWindowStore();

  return (
    <div className="flex-1 relative w-full h-full overflow-hidden bg-[var(--background)] cursor-default">
      {/* Sfondo del Desktop con watermark discreto */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(#3e4350_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />

      {/* Anteprima Istantanea Trasparente (Aero Snap Ghost Preview stile Windows 11) */}
      {snapPreviewBounds && (
        <div
          style={{
            left: `${snapPreviewBounds.x + 4}px`,
            top: `${snapPreviewBounds.y + 4}px`,
            width: `${Math.max(100, snapPreviewBounds.width - 8)}px`,
            height: `${Math.max(100, snapPreviewBounds.height - 8)}px`,
          }}
          className="absolute z-[9985] rounded-xl bg-blue-500/25 border-2 border-blue-400 backdrop-blur-md shadow-[0_0_36px_rgba(59,130,246,0.5),inset_0_0_24px_rgba(59,130,246,0.2)] transition-all duration-150 pointer-events-none animate-in fade-in zoom-in-95"
        />
      )}

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
