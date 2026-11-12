import React, { useEffect, useState, useRef } from "react";

interface NierAutomataOverlayProps {
  isActive: boolean;
  onClose: () => void;
}

export const NierAutomataOverlay: React.FC<NierAutomataOverlayProps> = ({
  isActive,
  onClose,
}) => {
  const [phase, setPhase] = useState<"dialogue" | "ending" | "completed">("dialogue");
  const [displayedText, setDisplayedText] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chimeRef = useRef<HTMLAudioElement | null>(null);
  const typewriterTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fullDialogue =
    "Rapporto Pod 042 all'operatore.\nRilevata interrogazione anomala nel database: 'Gloria all'umanità'.\nAnalisi: Cercare il senso dell'esistenza nel listino prezzi clienti è irrazionale.\nProposta: Interruzione forzata della routine.\nGloria all'umanità.";

  useEffect(() => {
    if (!isActive) {
      if (typewriterTimerRef.current) clearInterval(typewriterTimerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (chimeRef.current) {
        chimeRef.current.pause();
        chimeRef.current = null;
      }
      return;
    }

    setPhase("dialogue");
    setDisplayedText("");

    // 1. Riproduci audio Pod 042 ultra-robotico (DSP ring-mod + comb filter)
    try {
      const audio = new Audio("/easter-eggs/nier_pod042_robot.wav");
      audio.volume = 1.0;
      audioRef.current = audio;
      audio.play().catch(() => {});

      // Quando il Pod conclude il discorso: passa al mini-finale "ending [d]dt"
      audio.onended = () => {
        triggerEndingSequence();
      };
    } catch {}

    // 2. Typewriter fluido del testo Pod 042 (24ms)
    let charIdx = 0;
    typewriterTimerRef.current = setInterval(() => {
      charIdx++;
      if (charIdx <= fullDialogue.length) {
        setDisplayedText(fullDialogue.slice(0, charIdx));
      } else {
        if (typewriterTimerRef.current) clearInterval(typewriterTimerRef.current);
      }
    }, 24);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (typewriterTimerRef.current) clearInterval(typewriterTimerRef.current);
      window.removeEventListener("keydown", handleKeyDown);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (chimeRef.current) {
        chimeRef.current.pause();
        chimeRef.current = null;
      }
    };
  }, [isActive]);

  const triggerEndingSequence = () => {
    if (typewriterTimerRef.current) clearInterval(typewriterTimerRef.current);
    setPhase("ending");

    // Riproduci jingle NieR
    try {
      const chime = new Audio("/easter-eggs/nier_sound5.mp3");
      chime.volume = 0.9;
      chimeRef.current = chime;
      chime.play().catch(() => {});
    } catch {}

    // Dopo 5.5 secondi di titoli di coda a scorrimento, mostra schermata finale
    setTimeout(() => {
      setPhase("completed");
    }, 5500);
  };

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-[10000] select-none overflow-hidden font-mono text-[#dad4bb]">
      {/* ================= FASE 1: DIALOGO TERMINALE POD 042 ================= */}
      {phase === "dialogue" && (
        <div
          onClick={triggerEndingSequence}
          className="relative w-full h-full bg-[#1e1d1a]/95 flex flex-col justify-between p-6 md:p-12 cursor-pointer animate-in fade-in duration-300"
          style={{
            backgroundImage:
              "radial-gradient(#2b2823 1px, transparent 1px), linear-gradient(180deg, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.3) 50%)",
            backgroundSize: "20px 20px, 100% 4px",
          }}
        >
          {/* Top Bar Header YoRHa */}
          <div className="flex items-center justify-between border-b border-[#dad4bb]/30 pb-3">
            <div className="flex items-center space-x-3">
              <span className="px-2 py-0.5 bg-[#dad4bb] text-[#1e1d1a] font-black text-xs tracking-widest uppercase">
                YORHA
              </span>
              <span className="text-sm font-bold tracking-widest text-[#dad4bb]">
                POD 042 // LOG #8841-B
              </span>
            </div>
            <span className="text-xs text-[#8c8874]">
              [CLICK PER SALTARE • ESC PER USCIRE]
            </span>
          </div>

          {/* Center Stage: Testo Monolitico a Sinistra & Render Pod 042 a Destra */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 my-auto max-w-5xl mx-auto w-full">
            {/* Box Messaggio YoRHa */}
            <div className="bg-[#141311]/90 border border-[#dad4bb]/40 p-6 md:p-8 rounded shadow-2xl flex-1 w-full">
              <div className="text-xs text-[#8c8874] tracking-widest mb-3 uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#dad4bb] animate-ping" />
                <span>DIRECTIVE // PRIORITY ALPHA</span>
              </div>
              <div className="text-base md:text-xl font-mono leading-relaxed whitespace-pre-line tracking-wide text-[#dad4bb]">
                {displayedText}
                <span className="inline-block w-2.5 h-5 bg-[#dad4bb] ml-1 animate-pulse" />
              </div>
            </div>

            {/* Render Pod 042 Flottante */}
            <div className="relative flex flex-col items-center shrink-0 animate-[bounce_3s_infinite]">
              <img
                src="/easter-eggs/nier_pod042.png"
                alt="Pod 042"
                className="h-56 md:h-72 object-contain filter drop-shadow-[0_0_20px_rgba(218,212,187,0.3)] contrast-110"
              />
              <div className="text-[10px] text-[#8c8874] font-bold mt-2 tracking-widest">
                POD 042 // SUPPORT UNIT
              </div>
            </div>
          </div>

          {/* Bottom Bar Footer */}
          <div className="border-t border-[#dad4bb]/20 pt-3 flex justify-between text-xs text-[#8c8874]">
            <span>LAST GESTIONALE // BRICO CLASS</span>
            <span className="animate-pulse">FOR THE GLORY OF MANKIND</span>
          </div>
        </div>
      )}

      {/* ================= FASE 2: TITOLI DI CODA RAPIDI (JOKE ENDING) ================= */}
      {phase === "ending" && (
        <div className="relative w-full h-full bg-black flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
          {/* Titolo Joke Ending in stile NieR */}
          <div className="absolute top-12 flex flex-col items-center animate-in zoom-in-90 duration-500">
            <h1 className="text-3xl md:text-5xl font-serif font-black tracking-widest text-zinc-100 uppercase">
              ending [d]dt
            </h1>
            <h2 className="text-base md:text-lg text-zinc-400 font-mono tracking-wider mt-1">
              data [d]estroyed
            </h2>
          </div>

          {/* Crediti a Scorrimento Rapido verso l'alto */}
          <div className="w-full max-w-md h-72 overflow-hidden relative flex flex-col items-center">
            <div className="flex flex-col items-center gap-6 text-sm font-mono tracking-widest text-zinc-300 animate-[marquee_5.5s_linear_infinite]">
              <div className="text-zinc-500 text-xs">=== CAST & CREW ===</div>
              <div>DIRECTOR: YOKO TARO</div>
              <div>TACTICAL SUPPORT: POD 042</div>
              <div>COMBAT OPERATIVES: 2B & 9S</div>
              <div>DATABASE OPERATOR: BRICO CLASS TEAM</div>
              <div>FINANCIAL DATA INTEGRITY: 100% INTACT</div>
              <div>CUSTOMER PRICE LIST: RESTORED</div>
              <div>HUMAN PURPOSE: STILL UNDEFINED</div>
              <div>FOR THE GLORY OF MANKIND</div>
            </div>
          </div>
        </div>
      )}

      {/* ================= FASE 3: SCHERMATA FINALE & RITORNO AL GESTIONALE ================= */}
      {phase === "completed" && (
        <div className="relative w-full h-full bg-black flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-400">
          <div className="max-w-lg bg-[#191815] border-2 border-[#dad4bb]/40 p-8 rounded-xl shadow-2xl flex flex-col items-center text-[#dad4bb]">
            <div className="text-3xl mb-2">🤖</div>
            <h2 className="text-xl md:text-2xl font-bold font-mono tracking-widest mb-3 uppercase">
              Sequenza Terminata
            </h2>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Tranquillo: nessun DDT, cliente o listino aziendale è stato cancellato.  
              Il sistema è pronto a ritornare alla normale operatività.
            </p>

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded bg-[#dad4bb] hover:bg-[#fff9df] text-[#191815] font-black text-sm tracking-widest uppercase transition-all shadow-lg active:scale-95 cursor-pointer"
            >
              Ritorna al Gestionale
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

