import React, { useEffect, useRef, useState } from "react";
import { useEasterEggStore } from "./useEasterEggStore";
import { Flame, Sparkles, X, ChevronRight } from "lucide-react";

export const IllidanCinematicOverlay: React.FC = () => {
  const { isIllidanPlaying, stopIllidanCinematic, openVault, unlockVault } = useEasterEggStore();
  const [shaking, setShaking] = useState(false);
  const [textVisible, setTextVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mountTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isIllidanPlaying) {
      setShaking(false);
      setTextVisible(false);
      return;
    }

    mountTimeRef.current = Date.now();

    // Marca sbloccato nel local storage
    unlockVault();

    // 1. Riproduci audio autentico di Illidan
    try {
      const audio = new Audio("/easter-eggs/illidan-you-are-not-prepared.mp3");
      audio.volume = 1.0;
      audioRef.current = audio;
      audio.play().catch((err) => {
        console.warn("[Illidan] Audio autoplay bloccato dal browser:", err);
      });
    } catch (e) {
      console.warn("[Illidan] Errore riproduzione audio:", e);
    }

    // 2. Tempismo: Text appare dopo 600ms, Screen Shake a 1100ms
    const timerText = setTimeout(() => {
      setTextVisible(true);
    }, 600);

    const timerShake = setTimeout(() => {
      setShaking(true);
    }, 1100);

    const timerStopShake = setTimeout(() => {
      setShaking(false);
    }, 3000);

    // 3. Auto-transizione al Vault dopo 6 secondi
    const timerEnd = setTimeout(() => {
      handleComplete();
    }, 6000);

    // Keyboard listener per saltare (SOLO Esc, e solo dopo 1 secondo per evitare doppi input da Invio)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (Date.now() - mountTimeRef.current > 800) {
          e.preventDefault();
          handleComplete();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timerText);
      clearTimeout(timerShake);
      clearTimeout(timerStopShake);
      clearTimeout(timerEnd);
      window.removeEventListener("keydown", handleKeyDown);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isIllidanPlaying]);

  if (!isIllidanPlaying) return null;

  const handleComplete = () => {
    stopIllidanCinematic();
    openVault();
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none overflow-hidden bg-black transition-all duration-300 ${
        shaking ? "animate-illidan-shake" : ""
      }`}
      style={{
        background: "radial-gradient(ellipse at center, #052e16 0%, #021a0d 35%, #000000 85%)",
      }}
    >
      {/* Texture di fiamme e braci verdi demoniache */}
      <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_50%_40%,rgba(34,197,94,0.35)_0%,transparent_60%)]" />

      {/* Particelle di braci verdi fluttuanti */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-2 h-2 rounded-full bg-emerald-400 blur-xs animate-ping top-1/4 left-1/5 opacity-70" />
        <div className="absolute w-3 h-3 rounded-full bg-green-500 blur-xs animate-pulse top-2/3 right-1/4 opacity-60" />
        <div className="absolute w-1.5 h-1.5 rounded-full bg-lime-400 blur-2xs animate-ping bottom-1/4 left-1/3 opacity-80" />
        <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-300 blur-xs animate-pulse top-1/3 right-1/5 opacity-75" />
      </div>

      {/* Pulsante Salta in alto a destra */}
      <button
        type="button"
        onClick={handleComplete}
        className="absolute top-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 border border-emerald-500/40 text-emerald-300 hover:text-emerald-100 hover:border-emerald-400 hover:bg-emerald-950/60 transition-all text-xs font-mono font-bold tracking-wider backdrop-blur-md cursor-pointer shadow-lg"
      >
        <span>CHIUDI [ESC]</span>
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Frame Principale Illidan in Volo */}
      <div className="relative z-10 flex flex-col items-center max-w-4xl w-full px-4 text-center">
        {/* Glow circolare dietro il video */}
        <div className="absolute -inset-10 bg-emerald-500/20 blur-3xl rounded-full pointer-events-none animate-pulse" />

        {/* Immagine GIF Illidan in Volo con le ali spiegate */}
        <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/60 shadow-[0_0_60px_rgba(16,185,129,0.5)] bg-black/80 max-w-lg w-full aspect-[4/3] flex items-center justify-center">
          <img
            src="/easter-eggs/illidan.gif"
            alt="Illidan Stormrage in volo"
            className="w-full h-full object-cover block"
          />

          {/* Overlay gradiente cinematico sui bordi */}
          <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-emerald-400/40" />
        </div>

        {/* Citazione Ruggente: YOU ARE NOT PREPARED! */}
        <div
          className={`mt-6 transition-all duration-700 transform ${
            textVisible
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 translate-y-6 scale-90"
          }`}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 text-xs font-mono uppercase tracking-widest mb-3 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <Flame className="w-3.5 h-3.5 animate-bounce text-emerald-400" />
            <span>Illidan Stormrage • The Burning Crusade</span>
            <Sparkles className="w-3.5 h-3.5 text-lime-400" />
          </div>

          <h1
            className="text-4xl sm:text-6xl md:text-7xl font-black tracking-widest text-white uppercase"
            style={{
              textShadow:
                "0 0 10px #10b981, 0 0 25px #059669, 0 0 50px #047857, 0 4px 15px rgba(0,0,0,0.9)",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            YOU ARE NOT PREPARED!
          </h1>

          <p className="mt-3 text-xs sm:text-sm font-medium text-emerald-300/90 max-w-lg mx-auto tracking-wide">
            Il velo del gestionale è stato squarciato. Tutti gli easter egg di Last sono stati svelati.
          </p>

          {/* Pulsante Entra nel Vault */}
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleComplete}
              className="group relative inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 via-green-600 to-emerald-700 text-white font-bold text-sm tracking-wider uppercase shadow-[0_0_30px_rgba(16,185,129,0.6)] hover:shadow-[0_0_45px_rgba(16,185,129,0.9)] hover:scale-105 active:scale-95 transition-all cursor-pointer border border-emerald-400/50"
            >
              <span>Accedi al Vault degli Easter Egg</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
