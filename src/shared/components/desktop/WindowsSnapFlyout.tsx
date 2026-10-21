import React from "react";
import { useWindowStore, SnapSlotType } from "@/shared/stores/useWindowStore";
import { X } from "lucide-react";

interface WindowsSnapFlyoutProps {
  targetWindowId: string | null;
}

export const WindowsSnapFlyout: React.FC<WindowsSnapFlyoutProps> = ({ targetWindowId }) => {
  const { snapWindowToSlot, isSnapFlyoutVisible, setSnapFlyoutVisible } = useWindowStore();

  if (!isSnapFlyoutVisible || !targetWindowId) return null;

  const handleSelectSlot = (slot: SnapSlotType) => {
    snapWindowToSlot(targetWindowId, slot);
  };

  return (
    <>
      {/* Backdrop invisibile per chiudere il menu se si clicca fuori */}
      <div
        onClick={() => setSnapFlyoutVisible(false)}
        className="fixed inset-0 z-[9990] bg-black/10"
      />

      {/* Flyout di Snap Layouts (Stile Windows 11 nativo, ancorato al bordo superiore) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 left-1/2 -translate-x-1/2 z-[9999] bg-[#202227]/98 backdrop-blur-xl border-x border-b border-[#444957] rounded-b-xl shadow-[0_12px_36px_rgba(0,0,0,0.85)] px-4 pt-2.5 pb-3 flex flex-col items-center select-none cursor-default animate-in fade-in slide-in-from-top-2 duration-150"
      >
        {/* Intestazione flyout con pulsante chiudi rapido */}
        <div className="w-full flex items-center justify-between pb-2 mb-1.5 border-b border-[#343844] text-[11px] text-slate-400 font-medium">
          <span className="tracking-wide">Layout di Affiancamento (Windows 11)</span>
          <button
            type="button"
            onClick={() => setSnapFlyoutVisible(false)}
            className="p-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors cursor-default"
            title="Chiudi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 6 Schemi di layout esattamente come nello screenshot Windows 11 */}
        <div className="flex items-center space-x-2.5">
          {/* 1. Layout: 50 / 50 (Due metà uguali) */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex space-x-1">
            <div
              onClick={() => handleSelectSlot("left-half")}
              className="flex-1 h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="Metà Sinistra (50%)"
            />
            <div
              onClick={() => handleSelectSlot("right-half")}
              className="flex-1 h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="Metà Destra (50%)"
            />
          </div>

          {/* 2. Layout: 65 / 35 (Asimmetrico) */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex space-x-1">
            <div
              onClick={() => handleSelectSlot("left-two-thirds")}
              className="w-[62%] h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="Colonna Principale Sinistra (65%)"
            />
            <div
              onClick={() => handleSelectSlot("right-one-third")}
              className="w-[38%] h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="Colonna Secondaria Destra (35%)"
            />
          </div>

          {/* 3. Layout: 3 Colonne (25% / 50% / 25%) */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex space-x-1">
            <div
              onClick={() => handleSelectSlot("three-col-left")}
              className="w-1/4 h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="Colonna Sinistra (25%)"
            />
            <div
              onClick={() => handleSelectSlot("three-col-mid")}
              className="w-2/4 h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="Colonna Centrale (50%)"
            />
            <div
              onClick={() => handleSelectSlot("three-col-right")}
              className="w-1/4 h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="Colonna Destra (25%)"
            />
          </div>

          {/* 4. Layout: 3 Colonne Uguali (33% / 33% / 33%) */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex space-x-1">
            <div
              onClick={() => handleSelectSlot("three-col-left")}
              className="flex-1 h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="Colonna Sinistra (33%)"
            />
            <div
              onClick={() => handleSelectSlot("three-col-mid")}
              className="flex-1 h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="Colonna Centrale (33%)"
            />
            <div
              onClick={() => handleSelectSlot("three-col-right")}
              className="flex-1 h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="Colonna Destra (33%)"
            />
          </div>

          {/* 5. Layout: 4 Quadranti (2 x 2) */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] grid grid-cols-2 gap-1">
            <div
              onClick={() => handleSelectSlot("top-left")}
              className="h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="In alto a sinistra"
            />
            <div
              onClick={() => handleSelectSlot("top-right")}
              className="h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="In alto a destra"
            />
            <div
              onClick={() => handleSelectSlot("bottom-left")}
              className="h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="In basso a sinistra"
            />
            <div
              onClick={() => handleSelectSlot("bottom-right")}
              className="h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="In basso a destra"
            />
          </div>

          {/* 6. Layout: Sinistra intera + 2 Destra */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex space-x-1">
            <div
              onClick={() => handleSelectSlot("left-half")}
              className="w-1/2 h-full rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
              title="Metà Sinistra (50%)"
            />
            <div className="w-1/2 h-full flex flex-col space-y-1">
              <div
                onClick={() => handleSelectSlot("top-right")}
                className="flex-1 rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
                title="In alto a destra"
              />
              <div
                onClick={() => handleSelectSlot("bottom-right")}
                className="flex-1 rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default"
                title="In basso a destra"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
