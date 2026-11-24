import React, { useCallback, useState } from "react";

export function useDdtSearchPanelResize() {
  const [searchPanelWidth, setSearchPanelWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ddt_search_panel_width");
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 320 && val <= 850) return val;
      }
    }
    return 480;
  });

  const handleSplitterMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = searchPanelWidth;
      let rafId: number | null = null;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const delta = startX - moveEvent.clientX;
          const newWidth = Math.max(320, Math.min(850, startWidth + delta));
          setSearchPanelWidth(newWidth);
        });
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        const delta = startX - upEvent.clientX;
        const finalWidth = Math.max(320, Math.min(850, startWidth + delta));
        setSearchPanelWidth(finalWidth);
        localStorage.setItem("ddt_search_panel_width", String(finalWidth));
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [searchPanelWidth]
  );

  return { searchPanelWidth, handleSplitterMouseDown };
}
