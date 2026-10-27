import React, { useState, useRef } from "react";
import { MapPin, Trash2, GripVertical, Plus, Sparkles, Check, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { ClientDestination } from "../models/client";
import { deduplicateDestinations } from "../utils/destinationUtils";

interface ClientDestinationsTabProps {
  destinations: ClientDestination[];
  onChangeDestinations: (destinations: ClientDestination[]) => void;
}

export const ClientDestinationsTab: React.FC<ClientDestinationsTabProps> = ({
  destinations,
  onChangeDestinations,
}) => {
  const [draftCitta, setDraftCitta] = useState("");
  const [draftLuogo, setDraftLuogo] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const draftCittaRef = useRef<HTMLInputElement>(null);

  // Drag & drop tramite Pointer Events (funziona al 100% in WebView2, Tauri e browser)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const draggingIndexRef = useRef<number | null>(null);
  const overIndexRef = useRef<number | null>(null);
  const destinationsRef = useRef<ClientDestination[]>(destinations);
  destinationsRef.current = destinations;

  // Deduplicazione solo in caso di veri duplicati identici
  const deduped = deduplicateDestinations(destinations);
  const duplicatesCount = destinations.length - deduped.length;

  const handleUnifyDuplicates = () => {
    onChangeDestinations(deduped);
  };

  const handleCommitDraft = () => {
    const citta = draftCitta.trim().toUpperCase();
    const luogo = draftLuogo.trim().toUpperCase();
    const note = draftNote.trim();

    if (!citta && !luogo && !note) return;

    const newDest: ClientDestination = {
      id: crypto.randomUUID(),
      citta: citta,
      luogo: luogo,
      note: note || undefined,
    };

    onChangeDestinations([...destinations, newDest]);
    setDraftCitta("");
    setDraftLuogo("");
    setDraftNote("");

    // Mantieni il focus sul primo campo per inserimenti multipli consecutivi rapidi
    setTimeout(() => {
      draftCittaRef.current?.focus();
    }, 50);
  };

  const handleDraftKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommitDraft();
    }
  };

  const handleUpdateRow = (index: number, field: "citta" | "luogo" | "note", value: string) => {
    const updated = destinations.map((d, i) => {
      if (i !== index) return d;
      return {
        ...d,
        [field]: field === "note" ? value : value.toUpperCase(),
      };
    });
    onChangeDestinations(updated);
  };

  const handleDeleteRow = (index: number) => {
    const updated = destinations.filter((_, i) => i !== index);
    onChangeDestinations(updated);
  };

  // Reorder con frecce
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...destinations];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    onChangeDestinations(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index >= destinations.length - 1) return;
    const updated = [...destinations];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    onChangeDestinations(updated);
  };

  // Drag & drop tramite Pointer Events
  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    draggingIndexRef.current = index;
    overIndexRef.current = index;
    setDraggingIndex(index);
    setOverIndex(index);

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const onPointerMove = (moveEvt: PointerEvent) => {
      const el = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY);
      const row = el?.closest("[data-dest-row-idx]");
      if (row) {
        const idxStr = row.getAttribute("data-dest-row-idx");
        if (idxStr !== null) {
          const target = parseInt(idxStr, 10);
          if (!isNaN(target) && target !== overIndexRef.current) {
            overIndexRef.current = target;
            setOverIndex(target);
          }
        }
      }
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      const from = draggingIndexRef.current;
      const to = overIndexRef.current;

      if (from !== null && to !== null && from !== to) {
        const updated = [...destinationsRef.current];
        const [moved] = updated.splice(from, 1);
        updated.splice(to, 0, moved);
        onChangeDestinations(updated);
      }

      setDraggingIndex(null);
      setOverIndex(null);
      draggingIndexRef.current = null;
      overIndexRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const isDraftFilled = draftCitta.trim().length > 0 || draftLuogo.trim().length > 0 || draftNote.trim().length > 0;

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Intestazione informativa */}
      <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]/50">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Destinazioni Merci Multiple & Cantieri ({destinations.length})
            </h3>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Trascina la maniglia o usa le frecce per riordinare. Modifica direttamente le celle o scrivi nell'ultima riga in basso per aggiungere una nuova destinazione.
          </p>
        </div>

        {duplicatesCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUnifyDuplicates}
            className="h-8 text-xs font-semibold text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            title="Unifica indirizzi con punteggiatura o spazi identici"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Unifica {duplicatesCount} duplicat{duplicatesCount === 1 ? "o" : "i"}
          </Button>
        )}
      </div>

      {/* Tabella interattiva stile righe DDT */}
      <div className="flex-1 min-h-[320px] rounded-lg border border-[var(--border)] bg-[var(--card)]/40 overflow-hidden flex flex-col">
        {/* Intestazione colonne */}
        <div className="flex items-center bg-[var(--card)]/90 border-b border-[var(--border)] text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider select-none px-2 py-2">
          <div className="w-16 sm:w-20 shrink-0 text-center flex items-center justify-center gap-1">
            <GripVertical className="w-3.5 h-3.5 opacity-40" />
            <span>#</span>
          </div>
          <div className="w-44 sm:w-52 shrink-0 px-2">Sigla / Città / Cantiere</div>
          <div className="flex-1 min-w-[200px] px-2">Luogo / Destinatario Merce</div>
          <div className="w-48 sm:w-64 shrink-0 px-2">Note Scarico / Consegna</div>
          <div className="w-12 shrink-0 text-center">Azioni</div>
        </div>

        {/* Corpo della tabella scorrevole */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/40">
          {destinations.map((d, index) => {
            const isBeingDragged = draggingIndex === index;
            const isTargetDrop = overIndex === index && draggingIndex !== index;

            return (
              <div
                key={d.id}
                data-dest-row-idx={index}
                className={`flex items-center px-2 py-1.5 transition-colors group ${
                  isBeingDragged
                    ? "opacity-35 bg-sky-500/20 ring-1 ring-sky-400"
                    : isTargetDrop
                    ? "bg-sky-500/15 border-t-2 border-sky-400"
                    : "hover:bg-[var(--background)]/60"
                }`}
              >
                {/* Drag Handle & Posizione & Frecce riordino */}
                <div
                  onPointerDown={(e) => handlePointerDown(index, e)}
                  className="w-16 sm:w-20 shrink-0 flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing text-[var(--muted-foreground)] hover:text-sky-400 select-none py-1"
                  title="Trascina con il mouse per spostare di posizione"
                >
                  <GripVertical className="w-3.5 h-3.5 pointer-events-none" />
                  <span className="w-5 h-5 rounded-full bg-sky-500/10 text-sky-400 font-bold text-[11px] flex items-center justify-center pointer-events-none">
                    {index + 1}
                  </span>
                  <div className="flex flex-col ml-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveUp(index);
                      }}
                      className="p-0.5 hover:text-sky-400 disabled:opacity-20 disabled:hover:text-inherit"
                      title="Sposta su"
                    >
                      <ChevronUp className="w-2.5 h-2.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === destinations.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveDown(index);
                      }}
                      className="p-0.5 hover:text-sky-400 disabled:opacity-20 disabled:hover:text-inherit"
                      title="Sposta giù"
                    >
                      <ChevronDown className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                {/* Colonna: Sigla / Città / Stabilimento */}
                <div className="w-44 sm:w-52 shrink-0 px-1">
                  <input
                    type="text"
                    value={d.citta || ""}
                    onChange={(e) => handleUpdateRow(index, "citta", e.target.value)}
                    placeholder="es. CV1, ROGIO..."
                    className="h-8 w-full rounded border border-transparent hover:border-[var(--border)] focus:border-sky-500/60 bg-transparent hover:bg-[var(--background)]/70 focus:bg-[var(--background)] px-2 text-xs font-bold text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/40 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all"
                  />
                </div>

                {/* Colonna: Luogo / Ragione Sociale */}
                <div className="flex-1 min-w-[200px] px-1">
                  <input
                    type="text"
                    value={d.luogo || ""}
                    onChange={(e) => handleUpdateRow(index, "luogo", e.target.value)}
                    placeholder="es. CARTIERE CARRARA..."
                    className="h-8 w-full rounded border border-transparent hover:border-[var(--border)] focus:border-sky-500/60 bg-transparent hover:bg-[var(--background)]/70 focus:bg-[var(--background)] px-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/40 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all"
                  />
                </div>

                {/* Colonna: Note */}
                <div className="w-48 sm:w-64 shrink-0 px-1">
                  <input
                    type="text"
                    value={d.note || ""}
                    onChange={(e) => handleUpdateRow(index, "note", e.target.value)}
                    placeholder="es. Scarico retro..."
                    className="h-8 w-full rounded border border-transparent hover:border-[var(--border)] focus:border-sky-500/60 bg-transparent hover:bg-[var(--background)]/70 focus:bg-[var(--background)] px-2 text-xs text-[var(--muted-foreground)] focus:text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/40 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all"
                  />
                </div>

                {/* Colonna: Azioni (Elimina) */}
                <div className="w-12 shrink-0 flex items-center justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteRow(index)}
                    className="h-7 w-7 p-0 text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 opacity-70 group-hover:opacity-100 transition-all"
                    title="Elimina destinazione"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}

          {/* RIGA INFERIORE VUOTA PER INSERIMENTO IMMEDIATO (Stile DDT) */}
          <div className="flex items-center px-2 py-2 bg-sky-500/[0.04] border-t-2 border-dashed border-sky-500/20 hover:bg-sky-500/[0.07] transition-colors">
            {/* Indicatore Nuova Riga */}
            <div
              className="w-16 sm:w-20 shrink-0 flex items-center justify-center gap-1 text-sky-400"
              title="Nuova riga: compila e premi Invio"
            >
              <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center">
                <Plus className="w-3 h-3" />
              </div>
            </div>

            {/* Input Nuova Sigla */}
            <div className="w-44 sm:w-52 shrink-0 px-1">
              <input
                ref={draftCittaRef}
                type="text"
                value={draftCitta}
                onChange={(e) => setDraftCitta(e.target.value)}
                onKeyDown={handleDraftKeyDown}
                placeholder="+ Nuova sigla / cantiere..."
                className="h-8 w-full rounded border border-sky-500/30 focus:border-sky-500 bg-[var(--background)] px-2 text-xs font-semibold text-[var(--foreground)] placeholder:text-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all"
              />
            </div>

            {/* Input Nuovo Luogo */}
            <div className="flex-1 min-w-[200px] px-1">
              <input
                type="text"
                value={draftLuogo}
                onChange={(e) => setDraftLuogo(e.target.value)}
                onKeyDown={handleDraftKeyDown}
                placeholder="Luogo o destinatario... (Invio per salvare)"
                className="h-8 w-full rounded border border-sky-500/20 focus:border-sky-500 bg-[var(--background)] px-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all"
              />
            </div>

            {/* Input Nuove Note */}
            <div className="w-48 sm:w-64 shrink-0 px-1">
              <input
                type="text"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                onKeyDown={handleDraftKeyDown}
                placeholder="Note consegna... (Invio)"
                className="h-8 w-full rounded border border-sky-500/20 focus:border-sky-500 bg-[var(--background)] px-2 text-xs text-[var(--muted-foreground)] focus:text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/40 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all"
              />
            </div>

            {/* Tasto veloce Aggiungi */}
            <div className="w-12 shrink-0 flex items-center justify-center">
              <Button
                type="button"
                variant={isDraftFilled ? "primary" : "ghost"}
                size="sm"
                onClick={handleCommitDraft}
                disabled={!isDraftFilled}
                className={`h-7 w-7 p-0 transition-all ${
                  isDraftFilled
                    ? "bg-sky-500 text-white hover:bg-sky-600 shadow-sm"
                    : "text-[var(--muted-foreground)] opacity-40 cursor-not-allowed"
                }`}
                title="Aggiungi destinazione (o premi Invio)"
              >
                <Check className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
