import React, { useEffect, useState, useRef } from "react";

interface MetalSlugOverlayProps {
  isActive: boolean;
  onClose: () => void;
}

export const MetalSlugOverlay: React.FC<MetalSlugOverlayProps> = ({
  isActive,
  onClose,
}) => {
  const [phase, setPhase] = useState<"tied" | "salute" | "drop" | "heavy">("tied");
  const audioRef1 = useRef<HTMLAudioElement | null>(null);
  const audioRef2 = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isActive) return;

    setPhase("tied");

    // 1. Dopo 400ms il prigioniero si libera e fa l'inchino militare con "THANK YOU!"
    const saluteTimer = setTimeout(() => {
      setPhase("salute");
      try {
        const audioThank = new Audio("/easter-eggs/mslug_thankyou.mp3");
        audioThank.volume = 1.0;
        audioRef1.current = audioThank;
        audioThank.play().catch(() => {});
      } catch {}
    }, 400);

    // 2. Dopo 1400ms il prigioniero tira fuori la cassa Heavy Machine Gun [H]
    const dropTimer = setTimeout(() => {
      setPhase("drop");
    }, 1400);

    // 3. Dopo 2100ms tuona la voce arcade "HEAVY MACHINE GUN!"
    const heavyTimer = setTimeout(() => {
      setPhase("heavy");
      try {
        const audioHeavy = new Audio("/easter-eggs/mslug_heavy.mp3");
        audioHeavy.volume = 1.0;
        audioRef2.current = audioHeavy;
        audioHeavy.play().catch(() => {});
      } catch {}
    }, 2100);

    // 4. Chiusura automatica dopo 3.6 secondi
    const closeTimer = setTimeout(() => {
      onClose();
    }, 3800);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(saluteTimer);
      clearTimeout(dropTimer);
      clearTimeout(heavyTimer);
      clearTimeout(closeTimer);
      window.removeEventListener("keydown", handleKeyDown);
      if (audioRef1.current) {
        audioRef1.current.pause();
        audioRef1.current = null;
      }
      if (audioRef2.current) {
        audioRef2.current.pause();
        audioRef2.current = null;
      }
    };
  }, [isActive, onClose]);

  if (!isActive) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[10000] bg-black/75 backdrop-blur-[2px] flex flex-col items-center justify-center select-none cursor-pointer overflow-hidden animate-in fade-in duration-150"
    >
      {/* Scanline Arcade Neo-Geo */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.7) 50%)",
          backgroundSize: "100% 4px",
        }}
      />

      {/* Main Arcade Stage */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col items-center"
      >
        {/* Titolo Top SNK Arcade Banner */}
        <div className="text-amber-400 font-mono font-black text-xs md:text-sm tracking-[0.4em] uppercase mb-4 animate-pulse">
          ★ SNK NEO-GEO ARCADE CLASSIC ★
        </div>

        {/* Annuncio HEAVY MACHINE GUN a tutto schermo */}
        {phase === "heavy" && (
          <div className="absolute -top-24 flex flex-col items-center animate-in zoom-in-75 duration-200">
            <div className="text-4xl md:text-7xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 drop-shadow-[0_0_35px_rgba(245,158,11,0.9)] filter contrast-125">
              HEAVY MACHINE GUN!
            </div>
            <div className="text-sm font-black tracking-widest text-yellow-300 font-mono mt-1 animate-ping">
              [H] +200 AMMO
            </div>
          </div>
        )}

        {/* Palcoscenico Personaggio POW & Cassa [H] */}
        <div className="relative w-80 h-48 flex items-center justify-center">
          {/* Prigioniero di Guerra Animato */}
          <div className="relative flex flex-col items-center">
            {phase === "tied" && (
              <img
                src="/easter-eggs/mslug_pow_tied.gif"
                alt="POW Legato"
                className="h-28 md:h-36 object-contain filter contrast-125 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)] [image-rendering:pixelated]"
              />
            )}

            {phase === "salute" && (
              <div className="flex flex-col items-center animate-in zoom-in-90 duration-150">
                <div className="absolute -top-8 px-3 py-1 bg-yellow-400 text-black font-black text-xs font-mono rounded shadow-lg animate-bounce">
                  THANK YOU!
                </div>
                <img
                  src="/easter-eggs/mslug_pow_salute.gif"
                  alt="POW Saluto Militare"
                  className="h-32 md:h-40 object-contain filter contrast-125 drop-shadow-[0_0_20px_rgba(245,158,11,0.7)] [image-rendering:pixelated]"
                />
              </div>
            )}

            {(phase === "drop" || phase === "heavy") && (
              <div className="flex items-end space-x-6 animate-in slide-in-from-left duration-200">
                {/* POW che se la dà a gambe levate */}
                <img
                  src="/easter-eggs/mslug_pow_salute.gif"
                  alt="POW Libero"
                  className="h-32 md:h-40 object-contain filter contrast-125 [image-rendering:pixelated]"
                />

                {/* Cassa Dorata [H] Rilasciata a Terra */}
                <div className="flex flex-col items-center animate-bounce">
                  <img
                    src="/easter-eggs/mslug_h_box.gif"
                    alt="Heavy Machine Gun Box [H]"
                    className="w-16 h-16 md:w-20 md:h-20 object-contain filter contrast-125 drop-shadow-[0_0_25px_rgba(234,179,8,1)] [image-rendering:pixelated]"
                  />
                  <span className="text-[10px] font-black font-mono text-yellow-400 mt-1">
                    ARMI LIBERATE
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Hint */}
        <div className="mt-8 text-xs font-mono text-zinc-400 uppercase tracking-widest">
          Premi [ESC] o clicca ovunque per chiudere
        </div>
      </div>
    </div>
  );
};

