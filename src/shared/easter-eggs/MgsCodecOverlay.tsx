import React, { useState, useEffect, useRef } from "react";
import { Radio, X, Volume2, VolumeX, ChevronRight } from "lucide-react";

interface CodecDialogue {
  speaker: string;
  portrait: "snake" | "contact";
  text: string;
}

interface CharacterCodecData {
  name: string;
  role: string;
  frequency: string;
  portraitSrc: string;
  dialogues: CodecDialogue[];
}

const CODEC_CONTACTS: Record<string, CharacterCodecData> = {
  "140.85": {
    name: "ROY CAMPBELL",
    role: "COLONEL - FOXHOUND COMMANDER",
    frequency: "140.85",
    portraitSrc: "/easter-eggs/mgs-campbell.png",
    dialogues: [
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Qui Snake, riesci a sentirmi colonnello?",
      },
      {
        speaker: "CAMPBELL",
        portrait: "contact",
        text: "Forte e chiaro. Qual è la situazione, Snake?",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Sembra che l'ascensore sul retro sia l'unico modo per salire.",
      },
      {
        speaker: "CAMPBELL",
        portrait: "contact",
        text: "Me lo aspettavo. Dovrai utilizzare quello per raggiungere la superficie. Fai in modo che nessuno ti veda.",
      },
      {
        speaker: "CAMPBELL",
        portrait: "contact",
        text: "Se hai bisogno di contattarmi, chiama il 140.85. Quando vorrai metterti in contatto con me, premi il tasto Selezione.",
      },
      {
        speaker: "CAMPBELL",
        portrait: "contact",
        text: "Il ricevitore del Codec stimola direttamente gli ossicini all'interno del tuo orecchio. Solamente tu potrai sentire i messaggi.",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Ho capito. Ok, sono pronto.",
      },
    ],
  },
  "140.96": {
    name: "MEI LING",
    role: "DATA ANALYST & RADAR TECH",
    frequency: "140.96",
    portraitSrc: "/easter-eggs/mgs-meiling.png",
    dialogues: [
      {
        speaker: "MEI LING",
        portrait: "contact",
        text: "Snake, ascolta cosa disse Lao-Tse: 'Colui che capisce che quel che basta è abbastanza, ne avrà sempre a sufficienza'.",
      },
      {
        speaker: "MEI LING",
        portrait: "contact",
        text: "Solo perché vedi un oggetto, non significa che tu debba prenderlo se non ne hai bisogno. Vuoi salvare la partita?",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Ho capito, Mei Ling. Salviamo la partita.",
      },
    ],
  },
  "141.12": {
    name: "HAL EMMERICH (OTACON)",
    role: "CHIEF TECH ENGINEER",
    frequency: "141.12",
    portraitSrc: "/easter-eggs/mgs-otacon.png",
    dialogues: [
      {
        speaker: "OTACON",
        portrait: "contact",
        text: "Un soldato psichico... Che spreco! Scommetto che gli hanno insegnato solo a combattere...",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Ti dispiace per lui?",
      },
      {
        speaker: "OTACON",
        portrait: "contact",
        text: "Mantis aveva un potere incredibile, fantastico. Forse avrebbe potuto utilizzarlo per fare felice qualcuno... È triste vedere tutto quel potere usato soltanto per la guerra.",
      },
    ],
  },
  "141.80": {
    name: "MASTER MILLER",
    role: "SURVIVAL TRAINER",
    frequency: "141.80",
    portraitSrc: "/easter-eggs/mgs-miller.png",
    dialogues: [
      {
        speaker: "MILLER",
        portrait: "contact",
        text: "Snake, sono McDonnell Miller. Ne è passato di tempo, vero?",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Master! Che cosa ci fa lei qui?",
      },
      {
        speaker: "MILLER",
        portrait: "contact",
        text: "Mi sono stancato di fare l'istruttore e mi sono trasferito qui in cerca di quiete. Ogni tanto do ancora una mano nell'addestramento degli scout.",
      },
      {
        speaker: "MILLER",
        portrait: "contact",
        text: "Ti farò da supporto per questa operazione. Chiamami se hai bisogno di consigli su flora, fauna e tecniche di sopravvivenza.",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Grazie, Master. È un onore riaverti al mio fianco.",
      },
    ],
  },
  "140.15": {
    name: "MERYL SILVERBURGH",
    role: "SPECIAL TACTICAL FORCES",
    frequency: "140.15",
    portraitSrc: "/easter-eggs/mgs-meryl.png",
    dialogues: [
      {
        speaker: "MERYL",
        portrait: "contact",
        text: "Sei unico Snake! Hai vinto un corpo a corpo con un carro M1!",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Mah, niente di che. Scommetto però che il simulatore VR sul quale ti sei addestrata non ha uno scenario di scontro individuale con un carro armato vero, eh?",
      },
      {
        speaker: "MERYL",
        portrait: "contact",
        text: "No! Neanche di scontro con un gruppo terroristico accompagnata da un soldato dei reparti speciali!",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Nella vita reale le cose non vanno mai come ti aspetteresti, specie sul campo di battaglia.",
      },
      {
        speaker: "MERYL",
        portrait: "contact",
        text: "Hai ragione... Farò molta più attenzione, Snake!",
      },
    ],
  },
  "141.52": {
    name: "NASTASHA ROMANENKO",
    role: "MILITARY LOGISTICS SPECIALIST",
    frequency: "141.52",
    portraitSrc: "/easter-eggs/mgs-nastasha.png",
    dialogues: [
      {
        speaker: "NASTASHA",
        portrait: "contact",
        text: "Sono Nastasha Romanenko, è un piacere lavorare con te, Solid Snake.",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Sei l'esperta nucleare di cui mi ha parlato il colonnello?",
      },
      {
        speaker: "NASTASHA",
        portrait: "contact",
        text: "Sono io. Puoi chiedermi tutto quello che vuoi sull'argomento. Sono anche analista militare, perciò ho una vasta conoscenza di armamenti.",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Questi terroristi hanno davvero intenzione di lanciare una testata nucleare?",
      },
      {
        speaker: "NASTASHA",
        portrait: "contact",
        text: "Il mondo non può stare a guardare che ciò accada, e nemmeno io. Purtroppo da qui posso soltanto fornirti delle informazioni, spero che basti.",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "In ogni caso, un altro soldato qui non cambierebbe molto le cose. Sono felice di lavorare con te, Nastasha.",
      },
      {
        speaker: "NASTASHA",
        portrait: "contact",
        text: "Il piacere è mio, Snake.",
      },
    ],
  },
  "140.48": {
    name: "DEEPTHROAT",
    role: "CYBORG NINJA (GRAY FOX)",
    frequency: "140.48",
    portraitSrc: "/easter-eggs/mgs-grayfox.png",
    dialogues: [
      {
        speaker: "DEEPTHROAT",
        portrait: "contact",
        text: "Snake! Fai attenzione, ci sono delle mine Claymore da quelle parti. Usa il cercamine!",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "E tu chi sei?!",
      },
      {
        speaker: "DEEPTHROAT",
        portrait: "contact",
        text: "Chiamami... Gola Profonda.",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Gola Profonda?! L'informatore dello scandalo Watergate?!",
      },
      {
        speaker: "DEEPTHROAT",
        portrait: "contact",
        text: "Questo non ha nessuna importanza. Non stai utilizzando una trasmissione intermittente, sei nelle vicinanze. Ascolta: dritto davanti a te c'è un carro armato in agguato.",
      },
      {
        speaker: "SNAKE",
        portrait: "snake",
        text: "Mi vuoi dire chi sei?!",
      },
      {
        speaker: "DEEPTHROAT",
        portrait: "contact",
        text: "Diciamo... un tuo ammiratore.",
      },
    ],
  },
};

interface MgsCodecOverlayProps {
  isOpen: boolean;
  frequency: string;
  onClose: () => void;
}

export const MgsCodecOverlay: React.FC<MgsCodecOverlayProps> = ({
  isOpen,
  frequency,
  onClose,
}) => {
  const contact = CODEC_CONTACTS[frequency] || CODEC_CONTACTS["140.85"];
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);

  const openedAtRef = useRef<number>(0);

  // Sound effects on open / close
  useEffect(() => {
    if (!isOpen) {
      stopAllVoiceAudio();
      return;
    }

    openedAtRef.current = performance.now();
    setCurrentLineIdx(0);
    setDisplayedText("");
    stopAllVoiceAudio();

    try {
      const openAudio = new Audio("/easter-eggs/mgs-codec-open.wav");
      openAudio.volume = 0.85;
      openAudio.play().catch(() => {});
    } catch {}

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora tasti per i primi 450ms per evitare catture dall'apertura
      if (performance.now() - openedAtRef.current < 450) return;

      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      } else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        handleAdvance();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      stopAllVoiceAudio();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, frequency]);

  const stopAllVoiceAudio = () => {
    if (autoAdvanceTimerRef.current) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (voiceAudioRef.current) {
      try {
        voiceAudioRef.current.onended = null;
        voiceAudioRef.current.pause();
        voiceAudioRef.current.currentTime = 0;
        voiceAudioRef.current.src = "";
      } catch {}
      voiceAudioRef.current = null;
    }
  };

  const handleClose = () => {
    stopAllVoiceAudio();
    try {
      const closeAudio = new Audio("/easter-eggs/mgs-codec-over.wav");
      closeAudio.volume = 0.85;
      closeAudio.play().catch(() => {});
    } catch {}
    onClose();
  };

  // Typewriter effect & Audio playback for current line
  const currentLine = contact.dialogues[currentLineIdx];
  const typewriterIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isOpen || !currentLine) {
      stopAllVoiceAudio();
      return;
    }

    stopAllVoiceAudio();
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }

    const fullText = currentLine.text;
    setDisplayedText("");
    setIsTyping(true);

    // 1. Scorrimento rapido e fluido del testo teletype stile MGS1 (16ms per carattere)
    let charIdx = 0;
    typewriterIntervalRef.current = setInterval(() => {
      charIdx++;
      if (charIdx <= fullText.length) {
        setDisplayedText(fullText.slice(0, charIdx));
      } else {
        if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
        setIsTyping(false);
      }
    }, 16);

    // 2. Riproduzione della voce originale senza blocchi
    if (!isVoiceMuted) {
      const cleanFreq = (contact.frequency || frequency).replace(".", "");
      const audioUrl = `/easter-eggs/codec/${cleanFreq}_${currentLineIdx}.mp3`;
      const voice = new Audio(audioUrl);
      voice.volume = 1.0;
      voiceAudioRef.current = voice;

      // Quando la voce originale termina la frase, cambia IMMEDIATAMENTE testo senza attese
      voice.onended = () => {
        if (currentLineIdx < contact.dialogues.length - 1) {
          setCurrentLineIdx((prev) => prev + 1);
        } else {
          // Fine conversazione Codec
          handleClose();
        }
      };

      voice.play().catch((err) => {
        console.warn("[Codec Audio] Play error:", err);
      });
    } else {
      // Se voce disattivata: avanza dopo il tempo di lettura
      const readingTimeMs = Math.max(2000, fullText.length * 35);
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        if (currentLineIdx < contact.dialogues.length - 1) {
          setCurrentLineIdx((prev) => prev + 1);
        } else {
          autoAdvanceTimerRef.current = window.setTimeout(() => {
            handleClose();
          }, 1200);
        }
      }, readingTimeMs);
    }

    return () => {
      stopAllVoiceAudio();
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
    };
  }, [currentLineIdx, isOpen, frequency, isVoiceMuted]);

  const handleAdvance = () => {
    if (performance.now() - openedAtRef.current < 450) return;

    if (autoAdvanceTimerRef.current) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }

    // Se il testo sta ancora comparendo, mostralo subito per intero senza fermare la voce
    if (isTyping && currentLine) {
      if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
      setDisplayedText(currentLine.text);
      setIsTyping(false);
      return;
    }

    // Avanza alla battuta successiva
    stopAllVoiceAudio();
    if (currentLineIdx < contact.dialogues.length - 1) {
      setCurrentLineIdx((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  if (!isOpen) return null;

  const isSnakeSpeaking = currentLine?.portrait === "snake";

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/95 flex flex-col items-center justify-center p-3 select-none overflow-hidden animate-in fade-in duration-200"
    >
      {/* Scanline CRT overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.7) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))",
          backgroundSize: "100% 3px, 6px 100%",
        }}
      />

      {/* Codec Console Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl bg-zinc-950 border-4 border-emerald-600/80 rounded-2xl shadow-[0_0_80px_rgba(16,185,129,0.4)] p-4 md:p-6 flex flex-col gap-4 text-emerald-400 font-mono overflow-hidden"
      >
        {/* Top Header Bar: CODEC, Spectrum Bars & Frequency */}
        <div className="flex items-center justify-between border-b-2 border-emerald-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            <span className="text-lg font-black tracking-widest text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]">
              CODEC
            </span>
          </div>

          {/* Equalizer Wave / Freq Center Display */}
          <div className="flex items-center gap-4 bg-emerald-950/60 border border-emerald-600/60 rounded-xl px-5 py-1.5 shadow-[inset_0_0_15px_rgba(16,185,129,0.3)]">
            <div className="flex items-end gap-0.5 h-4">
              {[4, 12, 8, 15, 6, 14, 10, 16, 7].map((h, i) => (
                <span
                  key={i}
                  className="w-1 bg-emerald-400 rounded-xs animate-pulse"
                  style={{
                    height: `${h}px`,
                    animationDuration: `${0.3 + (i % 4) * 0.15}s`,
                  }}
                />
              ))}
            </div>

            <div className="text-xl md:text-2xl font-black tracking-widest text-emerald-300">
              {contact.frequency} <span className="text-xs text-emerald-500 font-semibold">MHz</span>
            </div>

            <div className="flex items-end gap-0.5 h-4">
              {[7, 16, 10, 14, 6, 15, 8, 12, 4].map((h, i) => (
                <span
                  key={i}
                  className="w-1 bg-emerald-400 rounded-xs animate-pulse"
                  style={{
                    height: `${h}px`,
                    animationDuration: `${0.3 + (i % 3) * 0.18}s`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Controls: Voice Toggle & Close button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsVoiceMuted((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/70 text-xs text-emerald-300 font-bold uppercase transition-all cursor-pointer"
              title={isVoiceMuted ? "Attiva Voce Parlata" : "Disattiva Voce"}
            >
              {isVoiceMuted ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
              )}
              <span className="hidden sm:inline">{isVoiceMuted ? "VOCE: OFF" : "VOCE: ON"}</span>
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600 text-xs text-emerald-300 font-bold uppercase transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>CHIUDI [ESC]</span>
            </button>
          </div>
        </div>

        {/* Center: Dual Portraits (Solid Snake Left vs Contact Right) */}
        <div className="grid grid-cols-2 gap-4 md:gap-8 my-2">
          {/* Left: Solid Snake */}
          <div
            className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-200 ${
              isSnakeSpeaking
                ? "border-emerald-400 bg-emerald-950/40 shadow-[0_0_25px_rgba(16,185,129,0.4)]"
                : "border-emerald-900/40 bg-zinc-950/60 opacity-60 filter grayscale-[40%]"
            }`}
          >
            <div className="relative w-36 h-36 md:w-44 md:h-44 rounded-lg overflow-hidden border border-emerald-500/60 bg-black flex items-center justify-center">
              <img
                src="/easter-eggs/mgs-snake.png"
                alt="Solid Snake"
                className="w-full h-full object-contain filter contrast-125 brightness-110"
              />
              {isSnakeSpeaking && (
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-emerald-950/90 border border-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold text-emerald-300">
                  <Volume2 className="w-3 h-3 animate-ping" />
                  <span>TRANSMITTING</span>
                </div>
              )}
            </div>
            <div className="mt-2 text-sm font-black tracking-wider text-emerald-300">SOLID SNAKE</div>
            <div className="text-[10px] text-emerald-500 tracking-tight">OPERATIVE</div>
          </div>

          {/* Right: Contact Person */}
          <div
            className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-200 ${
              !isSnakeSpeaking
                ? "border-emerald-400 bg-emerald-950/40 shadow-[0_0_25px_rgba(16,185,129,0.4)]"
                : "border-emerald-900/40 bg-zinc-950/60 opacity-60 filter grayscale-[40%]"
            }`}
          >
            <div className="relative w-36 h-36 md:w-44 md:h-44 rounded-lg overflow-hidden border border-emerald-500/60 bg-black flex items-center justify-center">
              <img
                src={currentLine?.speaker === "NAOMI" ? "/easter-eggs/mgs-naomi.png" : contact.portraitSrc}
                alt={currentLine?.speaker === "NAOMI" ? "NAOMI HUNTER" : contact.name}
                className="w-full h-full object-contain filter contrast-125 brightness-110"
              />
              {!isSnakeSpeaking && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-950/90 border border-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold text-emerald-300">
                  <Volume2 className="w-3 h-3 animate-ping" />
                  <span>RECEIVING</span>
                </div>
              )}
            </div>
            <div className="mt-2 text-sm font-black tracking-wider text-emerald-300">
              {currentLine?.speaker === "NAOMI" ? "NAOMI HUNTER" : contact.name}
            </div>
            <div className="text-[10px] text-emerald-500 tracking-tight">
              {currentLine?.speaker === "NAOMI" ? "CHIEF MEDICAL OFFICER" : contact.role}
            </div>
          </div>
        </div>

        {/* Bottom Dialogue Box with Typewriter Effect */}
        <div
          onClick={handleAdvance}
          className="relative min-h-[110px] md:min-h-[125px] bg-black/90 border-2 border-emerald-600/80 rounded-xl p-4 md:p-5 shadow-[inset_0_0_20px_rgba(16,185,129,0.25)] flex flex-col justify-between cursor-pointer hover:border-emerald-400 transition-colors"
        >
          <div>
            <div className="text-xs font-black tracking-widest text-emerald-400 mb-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>{currentLine?.speaker}</span>
            </div>

            <p className="text-sm md:text-base leading-relaxed text-emerald-200 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]">
              {displayedText}
              {isTyping && <span className="inline-block w-2 h-4 bg-emerald-400 ml-1 animate-pulse" />}
            </p>
          </div>

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-emerald-900/60 text-[10px] text-emerald-500">
            <span>
              Battuta {currentLineIdx + 1} di {contact.dialogues.length}
            </span>
            <div className="flex items-center gap-1 text-emerald-400 font-bold animate-pulse">
              <span>Premi Invio o Clicca per continuare</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

