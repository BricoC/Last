import React, { useEffect, useState, useRef } from "react";

interface Ff9MoguoOverlayProps {
  isActive: boolean;
  stage: number;
  onClose: () => void;
}

interface MoguoDialogueLine {
  text: string;
  isAngry?: boolean;
  audioUrl: string;
}

const MOGUO_DIALOGUES: MoguoDialogueLine[] = [
  {
    text: "Kupò! Perché continui a premere \"The One\" se è già disabilitato?!",
    isAngry: false,
    audioUrl: "/easter-eggs/ff9-moguo-1.mp3",
  },
  {
    text: "Smettila di cliccare a vuoto! Questo DDT ha già il suo numero definitivo, kupò!",
    isAngry: false,
    audioUrl: "/easter-eggs/ff9-moguo-2.mp3",
  },
  {
    text: "Guarda che sto affilando il mio coltello... non mettermi alla prova, kupò!",
    isAngry: true,
    audioUrl: "/easter-eggs/ff9-moguo-3.mp3",
  },
  {
    text: "KUPÒÒÒ! BASTAAAA! SMETTILA DI DISTURBARMI, KUPÒ!",
    isAngry: true,
    audioUrl: "/easter-eggs/ff9-moguo-4.mp3",
  },
];

export const Ff9MoguoOverlay: React.FC<Ff9MoguoOverlayProps> = ({ isActive, stage, onClose }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isFlyingAway, setIsFlyingAway] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const kupoSfxRef = useRef<HTMLAudioElement | null>(null);
  const typewriterTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Determina quale messaggio mostrare in base allo stage (da 0 a 3)
  const currentLineIndex = Math.min(Math.max(0, stage || 0), MOGUO_DIALOGUES.length - 1);
  const currentLine = MOGUO_DIALOGUES[currentLineIndex];

  // Chiusura: ammessa ESCLUSIVAMENTE tramite click sul pulsante CONTINUA
  const handleDismiss = () => {
    if (isFlyingAway) return;
    setIsFlyingAway(true);
    setTimeout(() => {
      onClose();
    }, 450);
  };

  useEffect(() => {
    if (!isActive) {
      if (typewriterTimerRef.current) clearInterval(typewriterTimerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (kupoSfxRef.current) {
        kupoSfxRef.current.pause();
        kupoSfxRef.current = null;
      }
      return;
    }

    setIsFlyingAway(false);
    setDisplayedText("");
    setIsTyping(true);

    // 1. Suona l'iconico Kupo Chime originale di FF9
    try {
      const kupoSfx = new Audio("/easter-eggs/ff9-kupo.mp3");
      kupoSfxRef.current = kupoSfx;
      kupoSfxRef.current.volume = 0.9;
      kupoSfx.play().catch(() => {});
    } catch {}

    // 2. Suona la voce doppiata corrispondente alla battuta corrente
    try {
      const lineAudio = new Audio(currentLine.audioUrl);
      lineAudio.volume = 1.0;
      audioRef.current = lineAudio;
      lineAudio.play().catch(() => {});
    } catch {}

    // 3. Effetto macchina da scrivere rapido (20ms)
    let charIdx = 0;
    const fullText = currentLine.text;
    typewriterTimerRef.current = setInterval(() => {
      charIdx++;
      if (charIdx <= fullText.length) {
        setDisplayedText(fullText.slice(0, charIdx));
      } else {
        if (typewriterTimerRef.current) clearInterval(typewriterTimerRef.current);
        setIsTyping(false);
      }
    }, 20);

    return () => {
      if (typewriterTimerRef.current) clearInterval(typewriterTimerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (kupoSfxRef.current) {
        kupoSfxRef.current.pause();
        kupoSfxRef.current = null;
      }
    };
  }, [isActive, stage]);

  if (!isActive) return null;

  const isAngryState = currentLine.isAngry;

  return (
    // Backdrop SENZA onClick: non si esce cliccando fuori!
    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 select-none animate-in fade-in duration-200">
      {/* Contenitore Scena Moguo & Finestra FFIX */}
      <div
        className={`relative flex flex-col items-center max-w-2xl w-full transition-all duration-500 ${
          isFlyingAway ? "-translate-y-96 opacity-0 scale-75" : "translate-y-0 opacity-100 scale-100"
        }`}
      >
        {/* Personaggio Moguo Flottante */}
        <div
          className={`relative z-20 flex flex-col items-center mb-[-25px] transition-transform duration-300 ${
            isAngryState
              ? "animate-[bounce_0.35s_infinite] scale-110 filter drop-shadow-[0_0_25px_rgba(239,68,68,0.8)]"
              : "animate-[bounce_2s_infinite] drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]"
          }`}
        >
          {/* Segno arrabbiato in stile Anime quando è furioso */}
          {isAngryState && (
            <div className="absolute -top-6 -right-4 text-3xl animate-ping select-none">
              💢
            </div>
          )}

          {/* Sprite / Illustrazione Moguo (normale o rosso furioso) */}
          <img
            src={
              isAngryState
                ? "/easter-eggs/ff9-mog-angry.png"
                : "/easter-eggs/ff9-mog-transparent.png"
            }
            alt="Moguo"
            className={`h-36 md:h-44 object-contain transition-all duration-300 ${
              isAngryState ? "brightness-110 contrast-125" : ""
            }`}
          />

          {/* Ombra Flottante sotto Moguo */}
          <div className="w-20 h-3 bg-black/40 rounded-full blur-sm mt-1 animate-pulse" />
        </div>

        {/* ================= FINESTRA DI DIALOGO CLASSICA FINAL FANTASY IX ================= */}
        <div
          className="relative z-10 w-full rounded-xl p-1 shadow-[0_10px_40px_rgba(0,0,0,0.85)] border-2 border-zinc-950"
          style={{
            background: "linear-gradient(180deg, #182c8a 0%, #0d1854 45%, #050b28 100%)",
            boxShadow:
              "0 0 0 2px #c0c2db, inset 0 0 0 2px #485ab8, inset 0 0 20px rgba(0,0,80,0.8)",
          }}
        >
          {/* Cornice interna argentata FFIX */}
          <div className="border border-[#d0d3ed]/60 rounded-lg p-5 md:p-6 flex flex-col min-h-[140px] justify-between relative overflow-hidden">
            {/* Tag Nome Personaggio FFIX in alto a sinistra */}
            <div className="flex items-center justify-between mb-3 border-b border-[#4d63d6]/40 pb-1.5">
              <div className="flex items-center space-x-2">
                <span className="text-[#f5d76e] font-serif font-black tracking-widest text-sm md:text-base drop-shadow-[1px_2px_2px_rgba(0,0,0,0.9)]">
                  MOGUO
                </span>
                <span className="text-zinc-400 text-xs font-mono">
                  (Moguri di Salvataggio • #{currentLineIndex + 1}/4)
                </span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400/80">
                Final Fantasy IX
              </span>
            </div>

            {/* Testo del Dialogo con Typewriter */}
            <div className="text-white font-serif text-lg md:text-xl leading-relaxed tracking-wide drop-shadow-[1px_2px_3px_rgba(0,0,0,1)] min-h-[64px]">
              {displayedText}
              {isTyping && (
                <span className="inline-block w-2 h-4 ml-1 bg-[#f5d76e] animate-pulse" />
              )}
            </div>

            {/* Sezione Inferiore: CHIUSURA OBBLIGATORIA CON IL TASTO CONTINUA */}
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#4d63d6]/30">
              <span className="text-[11px] text-zinc-300/80 font-mono">
                Premi su [CONTINUA] per chiudere
              </span>

              <button
                type="button"
                onClick={handleDismiss}
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-zinc-950 font-black text-sm font-mono tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.5)] border border-amber-300 flex items-center space-x-2 cursor-pointer active:scale-95 transition-all"
              >
                <span>CONTINUA</span>
                <span className="text-base">▼</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
