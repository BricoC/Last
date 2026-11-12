import React, { useEffect, useState, useRef } from "react";

interface MgsAlertOverlayProps {
  isActive: boolean;
  onStop: () => void;
}

export const MgsAlertOverlay: React.FC<MgsAlertOverlayProps> = ({ isActive, onStop }) => {
  const [timerDisplay, setTimerDisplay] = useState("99.99");
  const [showExclamation, setShowExclamation] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const alertSfxRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
      if (alertSfxRef.current) {
        alertSfxRef.current.pause();
        alertSfxRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setShowExclamation(false);
      setIsShaking(false);
      return;
    }

    // 1. Play BWUMPH alert sound & screen shake
    setShowExclamation(true);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);

    try {
      const sfx = new Audio("/easter-eggs/mgs-alert.wav");
      sfx.volume = 1.0;
      alertSfxRef.current = sfx;
      sfx.play().catch((err) => console.warn("[MGS Alert] SFX play blocked:", err));
    } catch (e) {
      console.warn("[MGS Alert] SFX err:", e);
    }

    // 2. Play Encounter Music
    try {
      const music = new Audio("/easter-eggs/mgs-alert-encounter.mp3");
      music.volume = 0.75;
      music.loop = true;
      musicRef.current = music;
      music.play().catch((err) => console.warn("[MGS Alert] Music play blocked:", err));
    } catch (e) {
      console.warn("[MGS Alert] Music err:", e);
    }

    // 3. Countdown timer:
    // Total duration: 10 seconds (10,000ms)
    // 0s -> 5s (first 5 seconds): from 99.99 down to 95.99
    // 5s -> 10s (next 5 seconds): from 95.99 down to 00.00
    startTimeRef.current = performance.now();

    const updateTimer = (now: number) => {
      const elapsed = now - startTimeRef.current;

      if (elapsed >= 10000) {
        setTimerDisplay("00.00");
        onStop();
        return;
      }

      let currentVal = 99.99;
      if (elapsed <= 5000) {
        const ratio = elapsed / 5000;
        currentVal = 99.99 - 4.0 * ratio; // 99.99 -> 95.99
      } else {
        const ratio = (elapsed - 5000) / 5000;
        currentVal = 95.99 - 95.99 * ratio; // 95.99 -> 00.00
      }

      const formatted = Math.max(0, currentVal).toFixed(2).padStart(5, "0");
      setTimerDisplay(formatted);

      animFrameRef.current = requestAnimationFrame(updateTimer);
    };

    animFrameRef.current = requestAnimationFrame(updateTimer);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onStop();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
      if (alertSfxRef.current) {
        alertSfxRef.current.pause();
        alertSfxRef.current = null;
      }
    };
  }, [isActive, onStop]);

  if (!isActive) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] pointer-events-none select-none overflow-hidden transition-transform duration-75 ${
        isShaking ? "translate-x-1 -translate-y-1 scale-[1.01]" : ""
      }`}
    >
      {/* Bordi d'allerta pulsanti rossi */}
      <div className="absolute inset-0 border-4 border-red-600/70 shadow-[inset_0_0_80px_rgba(239,68,68,0.4)] animate-pulse" />

      {/* Punto esclamativo rosso gigante animato */}
      {showExclamation && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center animate-in zoom-in-50 bounce duration-300 pointer-events-none">
          <div className="text-8xl md:text-9xl font-black text-red-500 drop-shadow-[0_0_35px_rgba(239,68,68,0.9)] tracking-tighter filter contrast-150 select-none animate-bounce">
            !
          </div>
        </div>
      )}

      {/* HUD Timer Rosso MGS1 in alto a destra */}
      <div className="absolute top-4 right-6 flex flex-col items-end pointer-events-auto">
        <div
          onClick={onStop}
          className="bg-zinc-950/90 border-2 border-red-600 rounded-xl p-3.5 shadow-[0_0_30px_rgba(239,68,68,0.6)] backdrop-blur-sm flex flex-col items-center min-w-[190px] cursor-pointer hover:border-red-400 transition-colors"
          title="Clicca o premi ESC per fermare l'allerta"
        >
          <div className="flex items-center gap-2 text-red-500 font-mono text-xs font-black tracking-widest uppercase mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping inline-block" />
            <span className="animate-pulse">ALERT MODE</span>
          </div>

          {/* Display Timer 99.99 */}
          <div className="text-4xl font-mono font-black text-red-400 tracking-wider drop-shadow-[0_0_12px_rgba(248,113,113,0.8)]">
            {timerDisplay}
          </div>
          <span className="text-[9px] font-mono text-zinc-400 mt-1">
            [Clicca o premi ESC per uscire]
          </span>
        </div>
      </div>
    </div>
  );
};
