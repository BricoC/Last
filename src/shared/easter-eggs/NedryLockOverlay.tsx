import React, { useEffect, useRef } from "react";
import { ShieldAlert } from "lucide-react";

interface NedryLockOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NedryLockOverlay: React.FC<NedryLockOverlayProps> = ({ isOpen, onClose }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    try {
      const audio = new Audio("/easter-eggs/nedry-magic-word.mp3");
      audio.volume = 1.0;
      audio.loop = true;
      audioRef.current = audio;
      audio.play().catch((err) => {
        console.warn("[Nedry] Autoplay audio bloccato:", err);
      });
    } catch (e) {
      console.warn("[Nedry] Errore audio:", e);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none cursor-default">
      {/* Finestra Stile Jurassic Park Terminal - Chiusura consentita SOLO tramite il tasto rosso */}
      <div className="relative max-w-lg w-full bg-zinc-950 border-4 border-red-600 rounded-2xl shadow-[0_0_80px_rgba(239,68,68,0.7)] p-6 text-center text-white overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Intestazione Allerta */}
        <div className="flex items-center justify-center gap-2 mb-4 text-red-500 font-mono font-bold tracking-widest text-xs uppercase animate-pulse">
          <ShieldAlert className="w-4 h-4" />
          <span>SECURITY BREACH • ACCESS DENIED</span>
          <ShieldAlert className="w-4 h-4" />
        </div>

        {/* GIF Dennis Nedry */}
        <div className="relative mx-auto rounded-xl overflow-hidden border-2 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.4)] bg-white max-w-md aspect-[4/3] flex items-center justify-center">
          <img
            src="/easter-eggs/nedry.gif"
            alt="Dennis Nedry - Jurassic Park"
            className="w-full h-full object-contain block"
          />
        </div>

        <div className="mt-5">
          <h2 className="text-xl font-black text-red-500 tracking-wider font-mono">
            AH AH AH! YOU DIDN'T SAY THE MAGIC WORD!
          </h2>
        </div>

        {/* Unico pulsante consentito per uscire */}
        <div className="mt-6 pt-4 border-t border-red-900/60 flex items-center justify-center">
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-lg hover:shadow-red-500/50 active:scale-95 transition-all cursor-pointer"
          >
            CHIUDI
          </button>
        </div>
      </div>
    </div>
  );
};
