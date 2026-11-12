import React, { useEffect, useState, useRef } from "react";

interface StreetFighterOverlayProps {
  move: "hadouken" | "shoryuken" | null;
  onClose: () => void;
}

export const StreetFighterOverlay: React.FC<StreetFighterOverlayProps> = ({ move, onClose }) => {
  const [isShaking, setIsShaking] = useState(false);
  const [flash, setFlash] = useState(true);
  const [fireballPosition, setFireballPosition] = useState(0); // 0% to 100%
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const openedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!move) return;

    openedAtRef.current = performance.now();

    // 1. Play original arcade audio
    try {
      const audioUrl =
        move === "hadouken"
          ? "/easter-eggs/sf-hadouken.mp3"
          : "/easter-eggs/sf-shoryuken.mp3";

      const audio = new Audio(audioUrl);
      audio.volume = 1.0;
      audioRef.current = audio;
      audio.play().catch((err) => console.warn("[SF Audio] blocked:", err));
    } catch (e) {
      console.warn("[SF Audio] error:", e);
    }

    // 2. Screen Flash & Screen Shake
    setFlash(true);
    setIsShaking(true);
    const flashTimer = setTimeout(() => setFlash(false), 140);
    const shakeTimer = setTimeout(() => setIsShaking(false), 700);

    // 3. Fireball projectile animation for Hadouken
    let projectileInterval: number | null = null;
    if (move === "hadouken") {
      setFireballPosition(0);
      let pos = 0;
      projectileInterval = window.setInterval(() => {
        pos += 5;
        setFireballPosition(pos);
        if (pos >= 115) {
          if (projectileInterval) clearInterval(projectileInterval);
        }
      }, 20);
    }

    // 4. Close automatically after animation finishes (~2.8s)
    const closeTimer = setTimeout(() => {
      onClose();
    }, 2800);

    // Chiudi SOLO con Escape dopo che sono passati almeno 400ms dall'apertura
    // MAI con Enter o Spazio, perché il trigger dell'utente usa proprio il tasto Invio!
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && performance.now() - openedAtRef.current > 400) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(flashTimer);
      clearTimeout(shakeTimer);
      clearTimeout(closeTimer);
      if (projectileInterval) clearInterval(projectileInterval);
      window.removeEventListener("keydown", handleKeyDown);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [move, onClose]);

  if (!move) return null;

  const isHadouken = move === "hadouken";

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Evita chiusure accidentali da click nei primi 400ms
    if (performance.now() - openedAtRef.current > 400) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[10000] bg-black/75 backdrop-blur-[2px] flex flex-col items-center justify-center select-none overflow-hidden cursor-pointer transition-transform duration-75 ${
        isShaking ? "translate-x-1.5 -translate-y-1.5 scale-[1.01]" : ""
      }`}
    >
      {/* Quick White Screen Flash */}
      {flash && (
        <div className="absolute inset-0 bg-white/50 z-50 pointer-events-none animate-out fade-out duration-100" />
      )}

      {/* Top Arcade Title Banner */}
      <div className="absolute top-10 flex flex-col items-center animate-in zoom-in-75 duration-300">
        <div className="text-xs md:text-sm font-black tracking-[0.4em] uppercase text-zinc-400 font-mono">
          CAPCOM ARCADE CLASSIC
        </div>

        <div
          className={`text-6xl md:text-8xl font-black italic tracking-tighter drop-shadow-[0_0_40px_rgba(255,255,255,0.8)] filter ${
            isHadouken
              ? "text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-500 to-indigo-400 drop-shadow-[0_0_35px_rgba(6,182,212,0.9)]"
              : "text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-orange-500 to-red-600 drop-shadow-[0_0_35px_rgba(249,115,22,0.9)]"
          }`}
        >
          {isHadouken ? "HADOUKEN!" : "SHORYUKEN!"}
        </div>

        <div
          className={`text-lg md:text-xl font-black tracking-widest font-mono mt-1 ${
            isHadouken ? "text-cyan-400" : "text-amber-400"
          }`}
        >
          {isHadouken ? "波動拳" : "昇龍拳"}
        </div>
      </div>

      {/* Main Action Stage */}
      <div className="relative w-full max-w-4xl h-[360px] flex items-center justify-center">
        {isHadouken ? (
          /* ================= HADOUKEN STAGE ================= */
          <div className="relative w-full h-full flex items-center">
            {/* Ryu Sprite Launcher on Left */}
            <div className="absolute left-8 md:left-20 bottom-12 flex flex-col items-center">
              <img
                src="/easter-eggs/sf-hadouken.gif"
                alt="Ryu Hadouken"
                className="h-44 md:h-52 object-contain filter contrast-125 brightness-110 drop-shadow-[0_0_20px_rgba(6,182,212,0.5)]"
                style={{ mixBlendMode: "screen" }}
              />
            </div>

            {/* Glowing Energy Fireball flying across the screen */}
            <div
              className="absolute bottom-24 transition-all duration-75 pointer-events-none"
              style={{
                left: `${25 + fireballPosition * 0.7}%`,
              }}
            >
              {/* Fiery Core */}
              <div className="relative flex items-center justify-center">
                {/* Large outer glow */}
                <div className="w-24 h-24 rounded-full bg-cyan-400/40 blur-xl animate-pulse" />

                {/* Fireball Ball */}
                <div className="absolute w-20 h-20 rounded-full bg-gradient-to-r from-white via-cyan-300 to-blue-600 shadow-[0_0_50px_rgba(6,182,212,1)] border-2 border-cyan-200 animate-spin" />

                {/* Trailing energy sparks */}
                <div className="absolute right-12 w-32 h-10 bg-gradient-to-l from-transparent via-cyan-400/60 to-white blur-sm rounded-full -scale-x-100" />
              </div>
            </div>
          </div>
        ) : (
          /* ================= SHORYUKEN STAGE ================= */
          <div className="relative w-full h-full flex flex-col items-center justify-end pb-8">
            {/* Rising Flame Column Background */}
            <div className="absolute bottom-4 w-40 h-80 bg-gradient-to-t from-red-600/50 via-orange-500/40 to-transparent blur-2xl animate-pulse pointer-events-none" />

            {/* Ryu Rising Dragon Punch Sprite */}
            <div className="relative flex flex-col items-center animate-in slide-in-from-bottom-20 duration-300">
              <img
                src="/easter-eggs/sf-shoryuken.gif"
                alt="Ryu Shoryuken"
                className="h-56 md:h-64 object-contain filter contrast-125 brightness-110 drop-shadow-[0_0_35px_rgba(249,115,22,0.7)]"
                style={{ mixBlendMode: "screen" }}
              />

              {/* Flame aura under Ryu */}
              <div className="absolute -bottom-6 w-32 h-8 bg-orange-500/80 blur-lg rounded-full animate-ping" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Hint */}
      <div className="absolute bottom-8 text-[11px] font-mono font-bold tracking-widest text-zinc-400/80 uppercase">
        Premi [ESC] o clicca ovunque per chiudere
      </div>
    </div>
  );
};

