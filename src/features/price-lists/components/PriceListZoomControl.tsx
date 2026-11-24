import React, { useCallback, useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

const MIN_ZOOM = 75;
const MAX_ZOOM = 150;
const STEP_ZOOM = 5;
const DEFAULT_ZOOM = 100;

export function usePriceListZoom(storageKey: string): [number, (next: number) => void] {
  const [zoom, setZoomState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? parseInt(raw, 10) : NaN;
      if (!isNaN(parsed) && parsed >= MIN_ZOOM && parsed <= MAX_ZOOM) {
        return parsed;
      }
    } catch {}
    return DEFAULT_ZOOM;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(zoom));
    } catch {}
  }, [storageKey, zoom]);

  const setZoom = useCallback((next: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(next / STEP_ZOOM) * STEP_ZOOM));
    setZoomState(clamped);
  }, []);

  return [zoom, setZoom];
}

export interface PriceListZoomControlProps {
  zoom: number;
  onChangeZoom: (next: number) => void;
}

export const PriceListZoomControl: React.FC<PriceListZoomControlProps> = ({ zoom, onChangeZoom }) => {
  return (
    <div
      className="flex items-center gap-1.5 pl-3 ml-2 border-l border-[var(--border)] select-none"
      title="Zoom tabella (salvato localmente)"
    >
      <button
        type="button"
        onClick={() => onChangeZoom(zoom - STEP_ZOOM)}
        disabled={zoom <= MIN_ZOOM}
        className="p-0.5 rounded hover:bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-35 transition-colors"
        title="Riduci zoom"
      >
        <Minus className="w-3 h-3" />
      </button>

      <input
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={STEP_ZOOM}
        value={zoom}
        onChange={(e) => onChangeZoom(Number(e.target.value))}
        aria-label="Zoom tabella"
        className="w-24 h-1 accent-[var(--primary)] cursor-pointer"
      />

      <button
        type="button"
        onClick={() => onChangeZoom(zoom + STEP_ZOOM)}
        disabled={zoom >= MAX_ZOOM}
        className="p-0.5 rounded hover:bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-35 transition-colors"
        title="Aumenta zoom"
      >
        <Plus className="w-3 h-3" />
      </button>

      <button
        type="button"
        onClick={() => onChangeZoom(DEFAULT_ZOOM)}
        className="w-9 text-right font-mono text-[11px] font-semibold text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
        title="Clicca per ripristinare zoom al 100%"
      >
        {zoom}%
      </button>
    </div>
  );
};
