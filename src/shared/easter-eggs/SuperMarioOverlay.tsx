import React, { useEffect, useState, useRef } from "react";
import { useEasterEggStore } from "./useEasterEggStore";

interface SuperMarioOverlayProps {
  isActive: boolean;
  onClose: () => void;
}

interface FloatingCoin {
  id: number;
}

export const SuperMarioOverlay: React.FC<SuperMarioOverlayProps> = ({
  isActive,
  onClose,
}) => {
  const { marioCoinsCount, hitMarioBlock } = useEasterEggStore();
  const [bumping, setBumping] = useState(false);
  const [floatingCoins, setFloatingCoins] = useState<FloatingCoin[]>([]);
  const prevCountRef = useRef(0);
  const coinIdCounterRef = useRef(0);

  // All'avvio dell'easter egg: reset e primo chime
  useEffect(() => {
    if (!isActive) {
      setFloatingCoins([]);
      prevCountRef.current = 0;
      return;
    }

    // Suono iniziale del blocco che appare
    try {
      const audio = new Audio("/easter-eggs/mario_coin.mp3");
      audio.volume = 0.9;
      audio.play().catch(() => {});
    } catch {}

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActive, onClose]);

  // Ogni volta che marioCoinsCount aumenta (fino a 7):
  useEffect(() => {
    if (!isActive) return;
    if (marioCoinsCount > prevCountRef.current) {
      prevCountRef.current = marioCoinsCount;

      // 1. Riproduci il suono pulito della moneta di Super Mario Bros
      try {
        const audio = new Audio("/easter-eggs/mario_coin.mp3");
        audio.volume = 1.0;
        audio.play().catch(() => {});
      } catch {}

      // 2. Fai rimbalzare il blocco in su
      setBumping(true);
      setTimeout(() => setBumping(false), 220);

      // 3. Genera una nuova moneta che sale e scompare
      const newId = ++coinIdCounterRef.current;
      setFloatingCoins((prev) => [...prev, { id: newId }]);

      setTimeout(() => {
        setFloatingCoins((prev) => prev.filter((c) => c.id !== newId));
      }, 950);
    }
  }, [marioCoinsCount, isActive]);

  if (!isActive) return null;

  const isExhausted = marioCoinsCount >= 7;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none select-none flex flex-col items-center justify-center">
      {/* HUD NES Super Mario Bros in alto a sinistra/destra */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 px-6 py-2 rounded-xl bg-black/80 border-2 border-amber-500/50 backdrop-blur-md shadow-2xl flex items-center gap-6 text-white font-mono text-xs md:text-sm tracking-widest font-black pointer-events-auto">
        <div className="flex flex-col items-center">
          <span className="text-red-400">MARIO</span>
          <span className="text-white">
            {String(marioCoinsCount * 200).padStart(6, "0")}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-amber-300">
          <img
            src="/easter-eggs/mario_coin_clean.gif"
            alt="Coin"
            className="w-5 h-5 object-contain [image-rendering:pixelated]"
          />
          <span className="text-white">×</span>
          <span className="text-amber-300 font-bold">
            {String(marioCoinsCount).padStart(2, "0")}
          </span>
          <span className="text-[11px] text-zinc-400">/ 07</span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-emerald-400">WORLD</span>
          <span className="text-white">1 - 1</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="ml-2 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-300 border border-zinc-600 transition-colors cursor-pointer"
          title="Esci da Super Mario (ESC)"
        >
          ESC
        </button>
      </div>

      {/* Area del Blocco '?' e Monete che saltano fuori */}
      <div className="relative flex flex-col items-center">
        {/* Monete fluttuanti che saltano in alto e svaniscono */}
        {floatingCoins.map((coin) => (
          <div
            key={coin.id}
            className="absolute -top-16 z-30 flex flex-col items-center animate-[mario-coin-float_0.9s_ease-out_forwards]"
          >
            <img
              src="/easter-eggs/mario_coin_clean.gif"
              alt="Mario Coin"
              className="w-16 h-16 md:w-20 md:h-20 object-contain filter drop-shadow-[0_0_15px_rgba(251,191,36,0.9)] [image-rendering:pixelated]"
            />
            <span className="text-sm font-mono font-black text-amber-300 drop-shadow-[1px_1px_0px_#000] -mt-1">
              +200
            </span>
          </div>
        ))}

        {/* Blocco '?' o Blocco Marrone Esaurito */}
        <div
          onClick={() => {
            if (!isExhausted) hitMarioBlock();
          }}
          className={`relative z-20 w-28 h-28 md:w-36 md:h-36 rounded-lg border-4 shadow-2xl flex items-center justify-center pointer-events-auto cursor-pointer transition-transform duration-100 ${
            bumping ? "-translate-y-4 scale-105" : "translate-y-0"
          } ${
            isExhausted
              ? "bg-[#8b5a2b] border-[#4a2e12] shadow-orange-950/50"
              : "bg-amber-500 border-amber-900 shadow-amber-900/40 hover:scale-102"
          }`}
          title={
            isExhausted
              ? "Blocco esaurito! Premi ESC per chiudere"
              : "Clicca 'Dashboard' in alto o clicca questo blocco per far uscire le monete!"
          }
        >
          {/* Rivetti/viti ai 4 angoli del blocco NES */}
          <span
            className={`absolute top-1.5 left-1.5 w-2 h-2 rounded-xs ${
              isExhausted ? "bg-[#351e08]" : "bg-amber-900"
            }`}
          />
          <span
            className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-xs ${
              isExhausted ? "bg-[#351e08]" : "bg-amber-900"
            }`}
          />
          <span
            className={`absolute bottom-1.5 left-1.5 w-2 h-2 rounded-xs ${
              isExhausted ? "bg-[#351e08]" : "bg-amber-900"
            }`}
          />
          <span
            className={`absolute bottom-1.5 right-1.5 w-2 h-2 rounded-xs ${
              isExhausted ? "bg-[#351e08]" : "bg-amber-900"
            }`}
          />

          {/* Simbolo '?' oppure Blocco Vuoto */}
          {isExhausted ? (
            <span className="text-4xl md:text-5xl font-mono text-[#4a2e12] select-none">
              ■
            </span>
          ) : (
            <span className="text-5xl md:text-7xl font-black text-amber-950 font-mono select-none drop-shadow-[2px_2px_0px_rgba(255,255,255,0.4)]">
              ?
            </span>
          )}
        </div>

        {/* Istruzione / Suggerimento a scomparsa in basso */}
        <div className="mt-4 px-4 py-1.5 rounded-full bg-black/75 border border-white/10 text-white font-mono text-xs backdrop-blur-sm pointer-events-auto">
          {isExhausted ? (
            <span className="text-amber-300 font-bold">
              🪙 7 Monete raccolte! Premi <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-600 text-white">ESC</kbd> per chiudere.
            </span>
          ) : (
            <span className="text-zinc-300">
              Clicca ancora su <strong className="text-amber-400">Dashboard</strong> o sul <strong className="text-amber-400">Blocco</strong> ({7 - marioCoinsCount} rimanenti) • Premi <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-600 text-white">ESC</kbd> per chiudere
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
