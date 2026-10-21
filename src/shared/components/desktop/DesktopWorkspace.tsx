import React from "react";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { DesktopWindow } from "./DesktopWindow";

interface DesktopWorkspaceProps {
  renderContent: (componentId: string) => React.ReactNode;
}

export const DesktopWorkspace: React.FC<DesktopWorkspaceProps> = ({ renderContent }) => {
  const { windows } = useWindowStore();

  return (
    <div className="flex-1 relative w-full h-full overflow-hidden bg-[var(--background)]">
      {/* Sfondo del Desktop con watermark ultra-discreto o griglia tecnica minima */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(#3e4350_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />

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
