import React, { useEffect, useRef } from "react";
import { X, Trophy, Swords, Sparkles } from "lucide-react";

interface Ff7VictoryOverlayProps {
  isActive: boolean;
  onClose: () => void;
}

export const Ff7VictoryOverlay: React.FC<Ff7VictoryOverlayProps> = ({
  isActive,
  onClose,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }

    // 1. Riproduci audio leggendario della Fanfara di Vittoria FFVII
    try {
      const audio = new Audio("/easter-eggs/ff7-victory.mp3");
      audio.volume = 1.0;
      audioRef.current = audio;
      audio.play().catch((err) => console.warn("[FF7 Victory] Audio err:", err));
    } catch (e) {
      console.warn("[FF7 Victory] Audio catch:", e);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isActive, onClose]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl flex flex-col items-center">
        {/* Intestazione Fanfara Oro */}
        <div className="mb-3 flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-mono font-bold tracking-widest shadow-lg animate-pulse">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>VICTORY ! - FANFARA DI VITTORIA</span>
        </div>

        {/* Sprite Cloud Strife 3D PS1 Victory Pose */}
        <div className="relative -mb-6 z-20 flex flex-col items-center filter drop-shadow-[0_0_25px_rgba(56,189,248,0.7)]">
          <img
            src="/easter-eggs/ff7-cloud-victory.gif"
            alt="Cloud Strife 3D Victory Pose"
            className="h-44 md:h-52 object-contain [image-rendering:pixelated]"
          />
        </div>

        {/* Finestra Classica Blu Elettrico FFVII con bordo bianco */}
        <div className="relative w-full bg-gradient-to-b from-[#000080] via-[#000050] to-[#000028] border-2 border-white/80 rounded-lg p-5 shadow-[0_0_50px_rgba(0,0,128,0.8),inset_0_0_20px_rgba(255,255,255,0.15)] text-white font-sans">
          {/* Cursore mano/dito FF7 in alto */}
          <div className="flex items-center justify-between border-b border-white/20 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">👉</span>
              <span className="font-bold tracking-wider text-base drop-shadow-[1px_1px_0px_#000]">
                RISULTATO DELLA BATTAGLIA
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Chiudi (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Griglia Statistiche di Fine Scontro */}
          <div className="grid grid-cols-2 gap-3 text-xs tracking-wide">
            {/* Box Sinistro: EXP & GIL */}
            <div className="bg-black/40 border border-white/20 rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sky-300 font-semibold font-mono">PUNTI EXP:</span>
                <span className="font-mono font-black text-amber-300 text-sm tracking-wider">
                  +99,999 P
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-emerald-300 font-semibold font-mono">GIL OTTENUTI:</span>
                <span className="font-mono font-black text-emerald-400 text-sm tracking-wider">
                  +77,777 G
                </span>
              </div>
              <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[11px]">
                <span className="text-purple-300 font-semibold">AP MATERIA:</span>
                <span className="font-mono text-purple-200">+500 AP ★★★★★</span>
              </div>
            </div>

            {/* Box Destro: Oggetti Trovati */}
            <div className="bg-black/40 border border-white/20 rounded p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-sky-300 font-semibold text-[11px] mb-1">
                <Swords className="w-3.5 h-3.5 text-sky-400" />
                <span>OGGETTI TROVATI:</span>
              </div>
              <ul className="text-[11px] text-white/90 space-y-1 font-mono">
                <li className="flex items-center justify-between">
                  <span>🗡️ Buster Sword II</span>
                  <span className="text-amber-300">× 1</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>🧪 Elisir Supremo</span>
                  <span className="text-amber-300">× 99</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>🎀 Nastro di Protezione</span>
                  <span className="text-amber-300">× 1</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Footer Stato Cloud & Tasto Continua */}
          <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span className="font-bold text-sky-200">
                Cloud Strife: <span className="text-emerald-400">LIVELLO SUPERATO!</span>
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 border border-white/40 text-white font-bold shadow-md cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>CONTINUA [ESC]</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

