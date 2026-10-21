import React from "react";
import { useWindowStore, SnapSlotType } from "@/shared/stores/useWindowStore";
import { X } from "lucide-react";

interface WindowsSnapFlyoutProps {
  targetWindowId: string | null;
}

export const WindowsSnapFlyout: React.FC<WindowsSnapFlyoutProps> = ({ targetWindowId }) => {
  const { snapWindowToSlot, isSnapFlyoutVisible, setSnapFlyoutVisible, setHoveredSnapSlot } = useWindowStore();

  if (!isSnapFlyoutVisible || !targetWindowId) return null;

  const handleSelectSlot = (slot: SnapSlotType) => {
    snapWindowToSlot(targetWindowId, slot);
  };

  const slotProps = (slot: SnapSlotType, title: string) => ({
    onMouseEnter: () => setHoveredSnapSlot(slot),
    onMouseLeave: () => setHoveredSnapSlot(null),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      handleSelectSlot(slot);
    },
    title,
    className: "rounded bg-[#383b45] border border-[#4e5362] hover:bg-[#0078d4] hover:border-sky-300 transition-all cursor-default",
  });

  return (
    <>
      {/* Flyout di Snap Layouts (Stile Windows 11 nativo) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 left-1/2 -translate-x-1/2 z-[9999] bg-[#202227]/98 backdrop-blur-xl border-x border-b border-[#444957] rounded-b-xl shadow-[0_12px_36px_rgba(0,0,0,0.85)] px-4 pt-2.5 pb-3 flex flex-col items-center select-none cursor-default animate-in fade-in slide-in-from-top-2 duration-150 pointer-events-auto"
      >
        {/* Intestazione flyout con pulsante chiudi rapido */}
        <div className="w-full flex items-center justify-between pb-2 mb-1.5 border-b border-[#343844] text-[11px] text-slate-400 font-medium">
          <span className="tracking-wide">Layout di Affiancamento (Windows 11)</span>
          <button
            type="button"
            onClick={() => {
              setSnapFlyoutVisible(false);
              setHoveredSnapSlot(null);
            }}
            className="p-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors cursor-default"
            title="Chiudi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Schemi di layout (Verticale, Orizzontale, Asimmetrico, 3 Colonne, 4 Quadranti) */}
        <div className="flex items-center space-x-2.5">
          {/* 1. Layout: 50 / 50 Verticale (Sinistra / Destra) */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex space-x-1">
            <div {...slotProps("left-half", "Affianca a Sinistra (50%)")} className={slotProps("left-half", "").className + " flex-1 h-full"} />
            <div {...slotProps("right-half", "Affianca a Destra (50%)")} className={slotProps("right-half", "").className + " flex-1 h-full"} />
          </div>

          {/* 2. Layout: 50 / 50 Orizzontale (Alto / Basso - Punto 2) */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex flex-col space-y-1">
            <div {...slotProps("top-half", "Affianca in Alto (50%)")} className={slotProps("top-half", "").className + " w-full flex-1"} />
            <div {...slotProps("bottom-half", "Affianca in Basso (50%)")} className={slotProps("bottom-half", "").className + " w-full flex-1"} />
          </div>

          {/* 3. Layout: 65 / 35 (Asimmetrico) */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex space-x-1">
            <div {...slotProps("left-two-thirds", "Colonna Principale Sinistra (65%)")} className={slotProps("left-two-thirds", "").className + " w-[62%] h-full"} />
            <div {...slotProps("right-one-third", "Colonna Secondaria Destra (35%)")} className={slotProps("right-one-third", "").className + " w-[38%] h-full"} />
          </div>

          {/* 4. Layout: 3 Colonne (25% / 50% / 25%) */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex space-x-1">
            <div {...slotProps("three-col-left", "Colonna Sinistra (25%)")} className={slotProps("three-col-left", "").className + " w-1/4 h-full"} />
            <div {...slotProps("three-col-mid", "Colonna Centrale (50%)")} className={slotProps("three-col-mid", "").className + " w-2/4 h-full"} />
            <div {...slotProps("three-col-right", "Colonna Destra (25%)")} className={slotProps("three-col-right", "").className + " w-1/4 h-full"} />
          </div>

          {/* 5. Layout: 4 Quadranti (2 x 2) */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] grid grid-cols-2 gap-1">
            <div {...slotProps("top-left", "In alto a sinistra")} className={slotProps("top-left", "").className + " h-full"} />
            <div {...slotProps("top-right", "In alto a destra")} className={slotProps("top-right", "").className + " h-full"} />
            <div {...slotProps("bottom-left", "In basso a sinistra")} className={slotProps("bottom-left", "").className + " h-full"} />
            <div {...slotProps("bottom-right", "In basso a destra")} className={slotProps("bottom-right", "").className + " h-full"} />
          </div>

          {/* 6. Layout: Sinistra intera + 2 Destra */}
          <div className="w-[84px] h-[64px] p-1 rounded-lg border border-[#444957] bg-[#282a31] flex space-x-1">
            <div {...slotProps("left-half", "Metà Sinistra Intera (50%)")} className={slotProps("left-half", "").className + " w-1/2 h-full"} />
            <div className="w-1/2 h-full flex flex-col space-y-1">
              <div {...slotProps("top-right", "In alto a destra")} className={slotProps("top-right", "").className + " flex-1"} />
              <div {...slotProps("bottom-right", "In basso a destra")} className={slotProps("bottom-right", "").className + " flex-1"} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
