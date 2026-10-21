import React from "react";
import { useWindowStore, SnapSlotType } from "@/shared/stores/useWindowStore";

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
    <div
      onMouseLeave={() => setSnapFlyoutVisible(false)}
      className="absolute top-2 left-1/2 -translate-x-1/2 z-[9999] bg-[#1e2128]/95 backdrop-blur-md border border-[#424856] rounded-xl shadow-2xl p-3 flex items-center space-x-3 select-none animate-in fade-in slide-in-from-top-3 duration-200"
    >
      {/* 1. Layout: 50 / 50 (Due metà uguali) */}
      <div className="w-16 h-12 p-1 rounded-lg border border-[#3e4350] bg-[#272b35] flex space-x-1 group">
        <div
          onClick={() => handleSelectSlot("left-half")}
          className="flex-1 h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="Affianca a sinistra (50%)"
        />
        <div
          onClick={() => handleSelectSlot("right-half")}
          className="flex-1 h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="Affianca a destra (50%)"
        />
      </div>

      {/* 2. Layout: 65 / 35 (Asimmetrico) */}
      <div className="w-16 h-12 p-1 rounded-lg border border-[#3e4350] bg-[#272b35] flex space-x-1 group">
        <div
          onClick={() => handleSelectSlot("left-two-thirds")}
          className="w-2/3 h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="Colonna principale sinistra (65%)"
        />
        <div
          onClick={() => handleSelectSlot("right-one-third")}
          className="w-1/3 h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="Colonna secondaria destra (35%)"
        />
      </div>

      {/* 3. Layout: 3 Colonne (25% / 50% / 25%) */}
      <div className="w-16 h-12 p-1 rounded-lg border border-[#3e4350] bg-[#272b35] flex space-x-1 group">
        <div
          onClick={() => handleSelectSlot("three-col-left")}
          className="w-1/4 h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="Colonna sinistra (25%)"
        />
        <div
          onClick={() => handleSelectSlot("three-col-mid")}
          className="w-2/4 h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="Colonna centrale ampia (50%)"
        />
        <div
          onClick={() => handleSelectSlot("three-col-right")}
          className="w-1/4 h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="Colonna destra (25%)"
        />
      </div>

      {/* 4. Layout: 4 Quadranti (2 x 2) */}
      <div className="w-16 h-12 p-1 rounded-lg border border-[#3e4350] bg-[#272b35] grid grid-cols-2 gap-1 group">
        <div
          onClick={() => handleSelectSlot("top-left")}
          className="h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="In alto a sinistra"
        />
        <div
          onClick={() => handleSelectSlot("top-right")}
          className="h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="In alto a destra"
        />
        <div
          onClick={() => handleSelectSlot("bottom-left")}
          className="h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="In basso a sinistra"
        />
        <div
          onClick={() => handleSelectSlot("bottom-right")}
          className="h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="In basso a destra"
        />
      </div>

      {/* 5. Layout: Sinistra intera + 2 Destra */}
      <div className="w-16 h-12 p-1 rounded-lg border border-[#3e4350] bg-[#272b35] flex space-x-1 group">
        <div
          onClick={() => handleSelectSlot("left-half")}
          className="w-1/2 h-full rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
          title="Metà sinistra intera"
        />
        <div className="w-1/2 h-full flex flex-col space-y-1">
          <div
            onClick={() => handleSelectSlot("top-right")}
            className="flex-1 rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
            title="In alto a destra"
          />
          <div
            onClick={() => handleSelectSlot("bottom-right")}
            className="flex-1 rounded bg-[#1e2128] border border-transparent hover:bg-blue-500 hover:border-blue-400 transition-colors"
            title="In basso a destra"
          />
        </div>
      </div>
    </div>
  );
};
