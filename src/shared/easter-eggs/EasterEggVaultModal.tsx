import React, { useState, useEffect } from "react";
import { useEasterEggStore } from "./useEasterEggStore";
import {
  X,
  Play,
  Flame,
  Shield,
  Swords,
  Gamepad2,
  Cpu,
  Trophy,
  Sparkles,
} from "lucide-react";

type CategoryFilter = "all" | "wow" | "mgs" | "ff" | "sf" | "nier" | "mslug" | "mario";

export const EasterEggVaultModal: React.FC = () => {
  const { isVaultOpen, closeVault, playIllidanCinematic } = useEasterEggStore();
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");

  useEffect(() => {
    if (!isVaultOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeVault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVaultOpen, closeVault]);

  if (!isVaultOpen) return null;

  const easterEggs = [
    {
      id: "illidan",
      category: "wow",
      title: "Illidan Stormrage: 'You Are Not Prepared!'",
      game: "World of Warcraft: The Burning Crusade",
      icon: <Flame className="w-5 h-5 text-emerald-400" />,
      color: "border-emerald-500/40 bg-emerald-950/20",
      accent: "text-emerald-400",
      description:
        "La celebre cinematica in cui Illidan spiega le ali demoniache nel cielo del Tempio Nero, brandisce le Lame di Azzinoth e ruggisce la sua leggendaria frase.",
      trigger:
        "Dashboard ➔ Clicca 15 volte sul quadratino vuoto tra i DDT emessi e la Ri.Ba ➔ Digita 'you are not prepared'.",
      ready: true,
      onTest: () => {
        closeVault();
        playIllidanCinematic();
      },
    },
    {
      id: "mgs-alert",
      category: "mgs",
      title: "Alert '!' & Radio Codec MGS1",
      game: "Metal Gear Solid (Konami)",
      icon: <Shield className="w-5 h-5 text-red-400" />,
      color: "border-red-500/30 bg-red-950/15",
      accent: "text-red-400",
      description:
        "Il classico punto esclamativo rosso con suono BWUMPH! e la mitica radio Codec verde con Campbell, Mei Ling, Otacon, Miller, Meryl, Nastasha e Gray Fox.",
      trigger:
        "Scorciatoia globale [Ctrl + Shift + 1] per l'Alert; Frequenze 140.85, 140.96, ecc. nella ricerca del Listino Generale.",
      ready: false,
    },
    {
      id: "ff7-victory",
      category: "ff",
      title: "Victory Fanfare & Cloud Strife 3D PS1",
      game: "Final Fantasy VII (Square)",
      icon: <Swords className="w-5 h-5 text-sky-400" />,
      color: "border-sky-500/30 bg-sky-950/15",
      accent: "text-sky-400",
      description:
        "Cloud low-poly originale fa roteare la Buster Sword con il jingle leggendario della Fanfara di Vittoria.",
      trigger:
        "DDT Studio ➔ Modale 'Report Excel & Archivio PDF Mesi' ➔ Al completamento con successo dell'esportazione.",
      ready: false,
    },
    {
      id: "ff9-moguri",
      category: "ff",
      title: "Moguri Moguo: 'Kupo! Non disturbarmi!'",
      game: "Final Fantasy IX (Square)",
      icon: <Sparkles className="w-5 h-5 text-amber-400" />,
      color: "border-amber-500/30 bg-amber-950/15",
      accent: "text-amber-400",
      description:
        "Il piccolo Moguri svolazzante col pom-pom rosso si arrabbia se provi a salvare compulsivamente un DDT già definitivo.",
      trigger:
        "DDT Studio ➔ Clicca 9 volte sul pulsante 'The One' quando è disabilitato.",
      ready: false,
    },
    {
      id: "sf-hadouken",
      category: "sf",
      title: "Ryu: Hadouken energetico",
      game: "Street Fighter II (Capcom)",
      icon: <Gamepad2 className="w-5 h-5 text-blue-400" />,
      color: "border-blue-500/30 bg-blue-950/15",
      accent: "text-blue-400",
      description:
        "Ryu lancia un'ondata di energia blu brillante che attraversa orizzontalmente lo schermo con scuotimento e audio arcade.",
      trigger:
        "Dashboard ➔ Box 'DDT del Mese' ➔ Nella casella di ricerca premi [↓] poi [→] poi [Invio] (oppure scrivi 'hadouken').",
      ready: false,
    },
    {
      id: "nier-pod",
      category: "nier",
      title: "POD 042 & Ending [D]dt: Data Destroyed",
      game: "NieR: Automata (Square Enix / Platinum)",
      icon: <Cpu className="w-5 h-5 text-stone-300" />,
      color: "border-stone-500/30 bg-stone-900/40",
      accent: "text-stone-300",
      description:
        "Finestra di avviso monolitica YoRHa per inattività/parola d'ordine e falso finale con titoli di coda neri di 5 secondi.",
      trigger:
        "Listino Clienti ➔ Cerca 'glory to mankind' (oppure 1h di inattività); Chiudi l'app tra i 7 e 9 secondi esatti dall'avvio.",
      ready: false,
    },
    {
      id: "mslug-pow",
      category: "mslug",
      title: "Prigioniero POW & 'HEAVY MACHINE GUN!'",
      game: "Metal Slug (SNK Neo-Geo)",
      icon: <Trophy className="w-5 h-5 text-yellow-400" />,
      color: "border-yellow-500/30 bg-yellow-950/15",
      accent: "text-yellow-400",
      description:
        "Il prigioniero in boxer bianchi fa l'inchino e grida 'THANK YOU!', e la cassa di munizioni cade per le copie massive.",
      trigger:
        "Al riavvio dopo una nuova release di aggiornamento; Copiando più di 10 DDT contemporaneamente nel box DDT del mese.",
      ready: false,
    },
    {
      id: "mario-1up",
      category: "mario",
      title: "Fungo 1-UP & Arpeggio Magico",
      game: "Super Mario Bros (Nintendo)",
      icon: <Sparkles className="w-5 h-5 text-emerald-400" />,
      color: "border-emerald-500/30 bg-emerald-950/15",
      accent: "text-emerald-400",
      description:
        "Arpeggio squillante retro e sbucata del fungo verde 1-UP dall'intestazione del gestionale.",
      trigger:
        "Top Navigation Bar ➔ Clicca 10 volte su 'Dashboard', poi dall'11ª volta per 9 click consecutivi.",
      ready: false,
    },
  ];

  const filteredEggs =
    selectedCategory === "all"
      ? easterEggs
      : easterEggs.filter((e) => e.category === selectedCategory);

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-emerald-500/30 bg-[var(--card)] shadow-[0_0_60px_rgba(16,185,129,0.2)] text-[var(--foreground)] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header Modal */}
        <div className="p-6 border-b border-[var(--border)] bg-gradient-to-r from-emerald-950/40 via-zinc-900/60 to-zinc-900/40 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center p-2 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <Flame className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-wide text-white uppercase">
                  Vault Segreto degli Easter Egg
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  SBLOCCATO
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                Archivio segreto dei segreti di gioco nascosti in Last Gestionale BricoClass.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeVault}
            className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer"
            title="Chiudi Vault (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Categorie / Filtri */}
        <div className="px-6 py-3 border-b border-[var(--border)] bg-[var(--background)] flex items-center gap-2 overflow-x-auto text-xs select-none">
          <span className="text-[11px] font-semibold text-[var(--muted-foreground)] mr-1">
            Filtra:
          </span>
          {[
            { id: "all", label: "Tutti (8)" },
            { id: "wow", label: "Warcraft" },
            { id: "mgs", label: "Metal Gear" },
            { id: "ff", label: "Final Fantasy" },
            { id: "sf", label: "Street Fighter" },
            { id: "nier", label: "NieR" },
            { id: "mslug", label: "Metal Slug" },
            { id: "mario", label: "Mario" },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id as CategoryFilter)}
              className={`px-3 py-1 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === cat.id
                  ? "bg-emerald-500 text-white font-semibold shadow-xs"
                  : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Lista degli Easter Egg */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredEggs.map((egg) => (
              <div
                key={egg.id}
                className={`p-4 rounded-xl border ${egg.color} transition-all duration-200 flex flex-col justify-between hover:scale-[1.01]`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                        {egg.icon}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white leading-tight">
                          {egg.title}
                        </h3>
                        <span className={`text-[11px] font-mono font-medium ${egg.accent}`}>
                          {egg.game}
                        </span>
                      </div>
                    </div>

                    {egg.ready ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                        ATTIVO
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono text-[var(--muted-foreground)] bg-zinc-800/80 border border-zinc-700/50 shrink-0">
                        In Lavorazione
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[var(--muted-foreground)] mt-2 leading-relaxed">
                    {egg.description}
                  </p>

                  <div className="mt-3 p-2.5 rounded-lg bg-black/40 border border-white/5 text-[11px]">
                    <span className="font-semibold text-white/90 block mb-0.5">
                      Come trovarlo:
                    </span>
                    <span className="text-[var(--muted-foreground)] font-mono">
                      {egg.trigger}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-end">
                  {egg.ready && egg.onTest ? (
                    <button
                      type="button"
                      onClick={egg.onTest}
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md cursor-pointer transition-all active:scale-95"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>RIVEDILO ORA</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-[var(--muted-foreground)] italic">
                      Disponibile a breve nel prossimo step
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Premi [Esc] per tornare al gestionale</span>
          <button
            type="button"
            onClick={closeVault}
            className="px-4 py-1.5 rounded-lg bg-[var(--card)] hover:bg-zinc-800 text-[var(--foreground)] border border-[var(--border)] font-medium cursor-pointer transition-colors"
          >
            Chiudi Vault
          </button>
        </div>
      </div>
    </div>
  );
};
