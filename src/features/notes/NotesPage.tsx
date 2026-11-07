import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  StickyNote,
  Plus,
  Search,
  X,
  Pin,
  PinOff,
  Trash2,
  Archive,
  ArchiveRestore,
  Printer,
  Check,
  Loader2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Minus,
  RemoveFormatting,
  Undo,
  Redo,
  Highlighter,
  Palette,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  Copy,
} from "lucide-react";
import { notesRepository } from "./services/notesRepository";
import { notesSyncService } from "./services/notesSyncService";
import { NotesTrashModal } from "./components/NotesTrashModal";
import type { NoteRecord } from "./types/note";
import { matchesFragmentSearch } from "@/shared/hooks/useFragmentSearch";
import { useUserStore } from "@/shared/stores/useUserStore";
import { cn } from "@/shared/utils/cn";

interface NotesPageProps {
  windowId?: string;
}

const TEXT_COLORS = [
  { name: "Predefinito", value: "inherit" },
  { name: "Nero", value: "#0f172a" },
  { name: "Grigio", value: "#64748b" },
  { name: "Rosso", value: "#ef4444" },
  { name: "Arancione", value: "#f97316" },
  { name: "Ambra", value: "#d97706" },
  { name: "Verde", value: "#16a34a" },
  { name: "Smeraldo", value: "#059669" },
  { name: "Blu", value: "#2563eb" },
  { name: "Indaco", value: "#4f46e5" },
  { name: "Viola", value: "#9333ea" },
  { name: "Rosa", value: "#db2777" },
];

const HIGHLIGHT_COLORS = [
  { name: "Nessuno", value: "transparent" },
  { name: "Giallo fluo", value: "#fef08a" },
  { name: "Verde fluo", value: "#bbf7d0" },
  { name: "Azzurro fluo", value: "#bae6fd" },
  { name: "Rosa fluo", value: "#fbcfe8" },
  { name: "Arancione chiaro", value: "#fed7aa" },
  { name: "Viola chiaro", value: "#e9d5ff" },
  { name: "Grigio chiaro", value: "#e2e8f0" },
];

export const NotesPage: React.FC<NotesPageProps> = () => {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "pinned" | "archived">("all");
  const [loading, setLoading] = useState(true);

  // Stato Editor corrente
  const [title, setTitle] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");

  // Stato sincronizzazione Supabase
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSupabaseTableMissing, setIsSupabaseTableMissing] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Stato Cestino Note (max 10 elementi)
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [trashCount, setTrashCount] = useState(0);

  const loadTrashCount = useCallback(async () => {
    try {
      const count = await notesRepository.getTrashCount();
      setTrashCount(count);
    } catch (err) {
      console.warn("[NotesPage] Errore conteggio cestino:", err);
    }
  }, []);

  // Palette dropdowns
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [showHighlightPalette, setShowHighlightPalette] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInternalChangeRef = useRef(false);
  const isSavingDraftRef = useRef(false);

  const activeNoteIdRef = useRef<string | null>(activeNoteId);
  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  const currentUser = useUserStore((s) => s.currentUser?.name) || "Operatore";

  // Caricamento lista note
  const loadNotes = useCallback(async (selectId?: string) => {
    try {
      const data = await notesRepository.getNotes(true);
      setNotes(data);
      if (selectId) {
        setActiveNoteId(selectId);
      }
      // Nota: di default NON selezioniamo automaticamente una nota esistente,
      // lasciando il foglio su una nuova nota vuota come richiesto!
    } catch (err) {
      console.error("[NotesPage] Errore caricamento note:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotes();
    void loadTrashCount();
  }, [loadNotes, loadTrashCount]);

  // Sincronizzazione con Supabase
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await notesSyncService.sync();
      if (res.success) {
        setIsSupabaseTableMissing(false);
        setSyncMessage(`Sincronizzato: +${res.pushed} inviati, +${res.pulled} scaricati`);
        void loadNotes();
        setTimeout(() => setSyncMessage(null), 3500);
      } else if (res.error) {
        if (
          res.error.includes("public.note") ||
          res.error.includes("Could not find the table") ||
          res.error.includes("PGRST205") ||
          res.error.includes("404")
        ) {
          setIsSupabaseTableMissing(true);
        } else {
          setSyncMessage(`Errore sync: ${res.error}`);
          setTimeout(() => setSyncMessage(null), 5000);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("public.note") || msg.includes("404")) {
        setIsSupabaseTableMissing(true);
      }
    } finally {
      setSyncing(false);
    }
  }, [loadNotes]);

  useEffect(() => {
    void handleSync();
  }, [handleSync]);

  useEffect(() => {
    const handleUpdate = () => {
      void loadNotes();
    };
    window.addEventListener("notes-data-updated", handleUpdate);
    return () => window.removeEventListener("notes-data-updated", handleUpdate);
  }, [loadNotes]);

  const copySupabaseSql = () => {
    const sql = `-- Tabella note per Supabase Cloud
CREATE TABLE IF NOT EXISTS public.note (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  local_id TEXT UNIQUE,
  title TEXT NOT NULL DEFAULT 'Nuova Nota',
  content_html TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  color TEXT DEFAULT 'default',
  created_by TEXT DEFAULT 'Operatore',
  updated_by TEXT DEFAULT 'Operatore',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS per consentire la sincronizzazione dal gestionale
ALTER TABLE public.note ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Accesso note per tutti" ON public.note;
CREATE POLICY "Accesso note per tutti" ON public.note FOR ALL TO anon USING (true) WITH CHECK (true);`;

    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  // Focus immediato sul titolo all'avvio per poter scrivere subito
  useEffect(() => {
    const t = setTimeout(() => {
      titleInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, []);

  // Sincronizzazione contenuto quando cambia la nota attiva
  const activeNote = notes.find((n) => n.id === activeNoteId) || null;

  useEffect(() => {
    if (activeNote) {
      setTitle(activeNote.title || "");
      if (editorRef.current) {
        isInternalChangeRef.current = true;
        editorRef.current.innerHTML = activeNote.content_html || "";
        isInternalChangeRef.current = false;
      }
      setSaveStatus("saved");
    } else {
      setTitle("");
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
      }
      setSaveStatus("saved");
    }
  }, [activeNoteId]);

  // Salvataggio ritardato automatico (Debounce 400ms)
  const triggerAutoSave = useCallback(
    (newTitle: string, newHtml: string) => {
      setSaveStatus("saving");
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = newHtml;
          const textOnly = tempDiv.innerText || tempDiv.textContent || "";

          // Se entrambi i campi sono vuoti e non c'è una nota salvata, non creare record vuoti
          if (!activeNoteIdRef.current && !newTitle.trim() && !textOnly.trim()) {
            setSaveStatus("saved");
            return;
          }

          let currentId = activeNoteIdRef.current;
          if (!currentId) {
            if (isSavingDraftRef.current) return;
            isSavingDraftRef.current = true;
            try {
              const created = await notesRepository.createNote({
                title: newTitle.trim() || "Nuova Nota",
                created_by: currentUser,
              });
              currentId = created.id;
              activeNoteIdRef.current = created.id;
              setActiveNoteId(created.id);
              setNotes((prev) => [created, ...prev]);
            } finally {
              isSavingDraftRef.current = false;
            }
          }

          if (!currentId) return;

          await notesRepository.saveNote({
            id: currentId,
            title: newTitle.trim() || "Nuova Nota",
            content_html: newHtml,
            content_text: textOnly.trim(),
            updated_by: currentUser,
          });

          // Aggiorna stato locale lista note
          setNotes((prev) =>
            prev.map((n) =>
              n.id === currentId
                ? {
                    ...n,
                    title: newTitle.trim() || "Nuova Nota",
                    content_html: newHtml,
                    content_text: textOnly.trim(),
                    updated_at: new Date().toISOString(),
                  }
                : n
            )
          );
          setSaveStatus("saved");
          // Sincronizzazione automatica cloud in background
          void notesSyncService.sync();
        } catch (err) {
          console.error("[NotesPage] Errore salvataggio automatico:", err);
          setSaveStatus("unsaved");
        }
      }, 400);
    },
    [currentUser]
  );

  // Modifica del titolo
  const handleTitleChange = (val: string) => {
    setTitle(val);
    const html = editorRef.current?.innerHTML || "";
    triggerAutoSave(val, html);
  };

  // Modifica del testo nel foglio Word
  const handleEditorInput = () => {
    if (isInternalChangeRef.current) return;
    const html = editorRef.current?.innerHTML || "";
    triggerAutoSave(title, html);
  };

  // Selezione nota dall'elenco laterale con salvataggio al volo della precedente se necessario
  const handleSelectNote = (id: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      const html = editorRef.current?.innerHTML || "";
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      const textOnly = tempDiv.innerText || tempDiv.textContent || "";
      if (activeNoteIdRef.current && (title.trim() || textOnly.trim())) {
        void notesRepository.saveNote({
          id: activeNoteIdRef.current,
          title: title.trim() || "Nuova Nota",
          content_html: html,
          content_text: textOnly.trim(),
          updated_by: currentUser,
        });
      }
    }
    setActiveNoteId(id);
  };

  // Creazione nuova nota / foglio vuoto pronto per scrivere
  const handleCreateNewNote = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      const html = editorRef.current?.innerHTML || "";
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      const textOnly = tempDiv.innerText || tempDiv.textContent || "";
      if (activeNoteIdRef.current && (title.trim() || textOnly.trim())) {
        void notesRepository.saveNote({
          id: activeNoteIdRef.current,
          title: title.trim() || "Nuova Nota",
          content_html: html,
          content_text: textOnly.trim(),
          updated_by: currentUser,
        });
      }
    }
    setActiveNoteId(null);
    activeNoteIdRef.current = null;
    setTitle("");
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
    setSaveStatus("saved");
    titleInputRef.current?.focus();
  };

  // Fissa / Rimuovi fissato
  const handleTogglePin = async (id: string, currentPinned: number) => {
    const nextPinned = currentPinned === 1 ? false : true;
    try {
      await notesRepository.togglePin(id, nextPinned);
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_pinned: nextPinned ? 1 : 0 } : n))
      );
      void notesSyncService.sync();
    } catch (err) {
      console.error("[NotesPage] Errore toggle pin:", err);
    }
  };

  // Archivia / Ripristina
  const handleToggleArchive = async (id: string, currentArchived: number) => {
    const nextArchived = currentArchived === 1 ? false : true;
    try {
      await notesRepository.toggleArchive(id, nextArchived);
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_archived: nextArchived ? 1 : 0 } : n))
      );
      void notesSyncService.sync();
    } catch (err) {
      console.error("[NotesPage] Errore toggle archive:", err);
    }
  };

  // Sposta nota nel Cestino (senza popup di conferma)
  const handleDeleteNote = async (id: string) => {
    try {
      await notesRepository.moveToTrash(id, currentUser);
      const remaining = notes.filter((n) => n.id !== id);
      setNotes(remaining);
      if (activeNoteId === id) {
        handleCreateNewNote();
      }
      void loadTrashCount();
      void notesSyncService.sync();
    } catch (err) {
      console.error("[NotesPage] Errore spostamento nota nel cestino:", err);
    }
  };

  // Esecuzione comandi Word Toolbar
  const formatDoc = (command: string, value: string | undefined = undefined) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  // Filtraggio note a sinistra con ricerca multi-parola
  const filteredNotes = useMemo(() => {
    const isSearching = Boolean(search.trim());
    return notes.filter((n) => {
      if (filterMode === "pinned" && n.is_pinned !== 1) return false;
      if (filterMode === "archived" && n.is_archived !== 1) return false;
      // In modalità "Tutte": se non c'è ricerca mostra solo le attive non archiviate.
      // Se c'è ricerca, permette di trovare le note su tutto l'archivio.
      if (filterMode === "all" && !isSearching && n.is_archived === 1) return false;

      if (!isSearching) return true;
      const cleanText = n.content_text || n.content_html?.replace(/<[^>]*>/g, " ") || "";
      return matchesFragmentSearch([n.title, cleanText], search);
    });
  }, [notes, filterMode, search]);

  const formatDateLabel = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return `Oggi, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
      }
      return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return isoDate;
    }
  };

  return (
    <div className="flex w-full h-full overflow-hidden bg-[var(--background)] text-[var(--foreground)] select-none">
      {/* ─── 1. BARRA LATERALE ELENCO NOTE (Pannello Sinistro) ─── */}
      <div className="w-72 shrink-0 border-r border-[var(--border)] bg-[var(--card)]/80 flex flex-col h-full">
        {/* Header Pannello Sinistro */}
        <div className="p-3 border-b border-[var(--border)] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <StickyNote className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white tracking-wide">Note</h2>
                <span className="text-[10.5px] text-[var(--muted-foreground)]">
                  {notes.filter((n) => n.is_archived === 0).length} note attive
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setShowTrashModal(true)}
                className="p-1.5 hover:text-white rounded hover:bg-slate-800 text-slate-400 relative transition-colors"
                title="Cestino Note (ultime 10 eliminate)"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-400" />
                {trashCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 min-w-[14px] h-[14px] rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                    {trashCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleSync()}
                className="p-1.5 hover:text-white rounded hover:bg-slate-800 text-slate-400 transition-colors"
                title="Sincronizza note con Supabase"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin text-amber-400")} />
              </button>
              <button
                type="button"
                onClick={handleCreateNewNote}
                className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center space-x-1 shadow-sm transition-all"
                title="Crea una nuova nota"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nuova</span>
              </button>
            </div>
          </div>

          {/* Campo Ricerca Note */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca nelle note..."
              className="w-full pl-8 pr-7 py-1 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                title="Cancella ricerca"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filtri Scheda */}
          <div className="flex items-center space-x-1 pt-1 text-[11px]">
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={cn(
                "px-2 py-0.5 rounded transition-colors",
                filterMode === "all"
                  ? "bg-slate-800 text-white font-semibold"
                  : "text-slate-400 hover:text-white"
              )}
            >
              Tutte
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("pinned")}
              className={cn(
                "px-2 py-0.5 rounded transition-colors flex items-center space-x-1",
                filterMode === "pinned"
                  ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Pin className="w-3 h-3" />
              <span>Fissate</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("archived")}
              className={cn(
                "px-2 py-0.5 rounded transition-colors flex items-center space-x-1",
                filterMode === "archived"
                  ? "bg-slate-800 text-slate-300 font-semibold"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Archive className="w-3 h-3" />
              <span>Archivio</span>
            </button>
          </div>
        </div>

        {/* Lista Note Scrollabile */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span>Caricamento note...</span>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 italic">
              {search ? "Nessuna nota trovata per la ricerca" : "Nessuna nota presente. Clicca su '+ Nuova'"}
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isActive = note.id === activeNoteId;
              const isPinned = note.is_pinned === 1;

              return (
                <div
                  key={note.id}
                  onClick={() => handleSelectNote(note.id)}
                  className={cn(
                    "p-2.5 rounded-lg text-left transition-all group relative cursor-pointer border",
                    isActive
                      ? "bg-[#1e293b] border-amber-500/50 shadow-sm"
                      : "bg-slate-900/40 hover:bg-slate-900/80 border-transparent text-slate-300"
                  )}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span
                      className={cn(
                        "text-xs font-bold truncate flex-1",
                        isActive ? "text-amber-300" : "text-slate-200"
                      )}
                    >
                      {note.title || "Senza titolo"}
                    </span>
                    {note.is_archived === 1 && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                        Archivio
                      </span>
                    )}
                    {isPinned && (
                      <Pin className="w-3 h-3 text-amber-400 shrink-0 fill-amber-400" />
                    )}
                  </div>

                  {/* Anteprima Testo */}
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-1.5 font-normal">
                    {note.content_text || "Nota vuota"}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>{formatDateLabel(note.updated_at)}</span>

                    {/* Azioni rapide al passaggio del mouse */}
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleTogglePin(note.id, note.is_pinned);
                        }}
                        title={isPinned ? "Rimuovi fissaggio" : "Fissa in alto"}
                        className="p-1 hover:text-amber-400 rounded hover:bg-slate-800"
                      >
                        {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteNote(note.id);
                        }}
                        title="Elimina nota"
                        className="p-1 hover:text-red-400 rounded hover:bg-slate-800"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── 2. AREA LAVORO FOGLIO WORD (Pannello Centrale / Destro) ─── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950/70">
        {/* Banner se la tabella Supabase manca */}
        {isSupabaseTableMissing && (
          <div className="bg-amber-950/80 border-b border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Tabella Supabase:</strong> La tabella <code className="bg-black/50 px-1 py-0.5 rounded font-mono text-amber-300">note</code> non è ancora presente nel cloud. Le note sono salvate localmente.
              </span>
            </div>
            <button
              type="button"
              onClick={copySupabaseSql}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
            >
              {copiedSql ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>SQL Copiato! Incollalo in Supabase SQL Editor</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copia SQL Tabella</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Notifica Rapida Sync */}
        {syncMessage && (
          <div className="bg-blue-950/60 border-b border-blue-500/30 px-3 py-1 text-[11px] text-blue-300 flex items-center justify-between animate-in fade-in duration-150 shrink-0">
            <span>{syncMessage}</span>
            <button type="button" onClick={() => setSyncMessage(null)} className="text-blue-400 hover:text-white cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* ─── BARRA DEGLI STRUMENTI IN STILE WORD (Top Toolbar) ─── */}
        <div className="shrink-0 border-b border-slate-800 bg-[#0f172a] p-2 flex flex-wrap items-center justify-between gap-2 shadow-sm text-xs">
              {/* Gruppo Stili e Formattazione */}
              <div className="flex items-center flex-wrap gap-1">
                {/* Undo / Redo */}
                <button
                  type="button"
                  onClick={() => formatDoc("undo")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Annulla (Ctrl+Z)"
                >
                  <Undo className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("redo")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Ripeti (Ctrl+Y)"
                >
                  <Redo className="w-3.5 h-3.5" />
                </button>

                <div className="w-px h-4 bg-slate-700 mx-1" />

                {/* Heading / Stile Paragrafo */}
                <select
                  onChange={(e) => formatDoc("formatBlock", e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-amber-500"
                  defaultValue="p"
                >
                  <option value="p">Testo Normale</option>
                  <option value="h1">Titolo 1 (Grande)</option>
                  <option value="h2">Titolo 2 (Medio)</option>
                  <option value="h3">Titolo 3 (Piccolo)</option>
                  <option value="blockquote">Citazione</option>
                </select>

                <div className="w-px h-4 bg-slate-700 mx-1" />

                {/* Grassetto, Corsivo, Sottolineato, Barrato */}
                <button
                  type="button"
                  onClick={() => formatDoc("bold")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white font-bold"
                  title="Grassetto (Ctrl+B)"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("italic")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Corsivo (Ctrl+I)"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("underline")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Sottolineato (Ctrl+U)"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("strikeThrough")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Barrato"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>

                <div className="w-px h-4 bg-slate-700 mx-1" />

                {/* Colore Testo Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowColorPalette((p) => !p);
                      setShowHighlightPalette(false);
                    }}
                    className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white flex items-center space-x-0.5"
                    title="Colore del testo"
                  >
                    <Palette className="w-3.5 h-3.5 text-amber-400" />
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                  {showColorPalette && (
                    <div className="absolute top-8 left-0 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-2 grid grid-cols-4 gap-1.5 w-40">
                      {TEXT_COLORS.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => {
                            formatDoc("foreColor", c.value);
                            setShowColorPalette(false);
                          }}
                          className="w-6 h-6 rounded-md border border-slate-600 flex items-center justify-center hover:scale-110 transition-transform"
                          style={{ backgroundColor: c.value === "inherit" ? "#ffffff" : c.value }}
                          title={c.name}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Evidenziatore Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHighlightPalette((p) => !p);
                      setShowColorPalette(false);
                    }}
                    className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white flex items-center space-x-0.5"
                    title="Colore evidenziazione"
                  >
                    <Highlighter className="w-3.5 h-3.5 text-yellow-300" />
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                  {showHighlightPalette && (
                    <div className="absolute top-8 left-0 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-2 grid grid-cols-4 gap-1.5 w-40">
                      {HIGHLIGHT_COLORS.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => {
                            formatDoc("hiliteColor", c.value);
                            setShowHighlightPalette(false);
                          }}
                          className="w-6 h-6 rounded-md border border-slate-600 flex items-center justify-center hover:scale-110 transition-transform text-[9px] text-slate-950 font-bold"
                          style={{ backgroundColor: c.value === "transparent" ? "#334155" : c.value }}
                          title={c.name}
                        >
                          {c.value === "transparent" && "✕"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="w-px h-4 bg-slate-700 mx-1" />

                {/* Allineamento */}
                <button
                  type="button"
                  onClick={() => formatDoc("justifyLeft")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Allinea a sinistra"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("justifyCenter")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Allinea al centro"
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("justifyRight")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Allinea a destra"
                >
                  <AlignRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("justifyFull")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Giustifica"
                >
                  <AlignJustify className="w-3.5 h-3.5" />
                </button>

                <div className="w-px h-4 bg-slate-700 mx-1" />

                {/* Elenchi */}
                <button
                  type="button"
                  onClick={() => formatDoc("insertUnorderedList")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Elenco puntato"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("insertOrderedList")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Elenco numerato"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("insertHorizontalRule")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Linea orizzontale divisoria"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("removeFormat")}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                  title="Rimuovi formattazione"
                >
                  <RemoveFormatting className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Azioni del Documento (Destra Toolbar) */}
              <div className="flex items-center space-x-2 text-[11px]">
                {/* Indicatore Stato Salvataggio */}
                <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                  {saveStatus === "saving" ? (
                    <>
                      <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                      <span className="text-amber-300">Salvataggio...</span>
                    </>
                  ) : activeNote ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-300">Salvato</span>
                    </>
                  ) : (
                    <span className="text-amber-400/90 font-medium">Nuova nota</span>
                  )}
                </div>

                {/* Fissa in Alto */}
                <button
                  type="button"
                  disabled={!activeNote}
                  onClick={() => {
                    if (activeNote) void handleTogglePin(activeNote.id, activeNote.is_pinned);
                  }}
                  className={cn(
                    "p-1.5 rounded border transition-colors",
                    !activeNote
                      ? "opacity-40 cursor-not-allowed bg-slate-900 text-slate-500 border-slate-800"
                      : activeNote.is_pinned === 1
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                  )}
                  title={
                    !activeNote
                      ? "Fissa in alto (disponibile dopo il primo salvataggio)"
                      : activeNote.is_pinned === 1
                      ? "Rimuovi fissaggio"
                      : "Fissa in alto"
                  }
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>

                {/* Archivia */}
                <button
                  type="button"
                  disabled={!activeNote}
                  onClick={() => {
                    if (activeNote) void handleToggleArchive(activeNote.id, activeNote.is_archived);
                  }}
                  className={cn(
                    "p-1.5 rounded border transition-colors",
                    !activeNote
                      ? "opacity-40 cursor-not-allowed bg-slate-900 text-slate-500 border-slate-800"
                      : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                  )}
                  title={
                    !activeNote
                      ? "Archivia (disponibile dopo il primo salvataggio)"
                      : activeNote.is_archived === 1
                      ? "Ripristina dall'archivio"
                      : "Archivia nota"
                  }
                >
                  {activeNote?.is_archived === 1 ? (
                    <ArchiveRestore className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <Archive className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Stampa */}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-1.5 rounded bg-slate-900 text-slate-400 border border-slate-700 hover:text-white"
                  title="Stampa foglio (o salva in PDF)"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>

                {/* Elimina o Pulisci Foglio */}
                <button
                  type="button"
                  onClick={() => {
                    if (activeNote) {
                      void handleDeleteNote(activeNote.id);
                    } else {
                      handleCreateNewNote();
                    }
                  }}
                  className="p-1.5 rounded bg-slate-900 text-red-400 border border-slate-700 hover:bg-red-500/10"
                  title={activeNote ? "Elimina nota" : "Cancella foglio"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ─── FOGLIO WORD (Document Page) ─── */}
            <div className="flex-1 overflow-y-auto p-6 flex justify-center custom-scrollbar">
              <div className="w-full max-w-3xl min-h-[840px] bg-[#1e293b] border border-slate-700/80 rounded-xl shadow-2xl p-8 flex flex-col space-y-4 select-text">
                {/* Titolo Documento */}
                <input
                  ref={titleInputRef}
                  type="text"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      editorRef.current?.focus();
                    }
                  }}
                  placeholder="Titolo della nota..."
                  className="w-full text-2xl font-bold bg-transparent border-b border-slate-700 pb-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 select-text"
                />

                {/* Area di Scrittura Word ContentEditable */}
                <div
                  ref={editorRef}
                  contentEditable={true}
                  suppressContentEditableWarning={true}
                  onInput={handleEditorInput}
                  className="flex-1 text-slate-100 text-sm leading-relaxed focus:outline-none min-h-[500px] select-text font-sans empty:before:content-[attr(data-placeholder)] empty:before:text-slate-500"
                  data-placeholder="Inizia a scrivere qui la tua nota... Puoi andare a capo, formattare in grassetto, cambiare colore, evidenziare e creare elenchi come in Word."
                  style={{
                    userSelect: "text",
                    WebkitUserSelect: "text",
                    cursor: "text",
                  }}
                />
              </div>
            </div>
      </div>

      {/* Modale Cestino Note (max 10 elementi) */}
      <NotesTrashModal
        isOpen={showTrashModal}
        onClose={() => setShowTrashModal(false)}
        onNoteRestored={(restored) => {
          setNotes((prev) => [restored, ...prev.filter((n) => n.id !== restored.id)]);
          setActiveNoteId(restored.id);
          void loadTrashCount();
        }}
      />

      {/* Portale dedicato alla Stampa A4 (@media print) */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            id="note-print-portal"
            style={{
              position: "fixed",
              left: "-99999px",
              top: 0,
              width: "210mm",
              opacity: 1,
              pointerEvents: "none",
              zIndex: -99999,
            }}
          >
            {title ? <h1>{title}</h1> : <h1>Senza titolo</h1>}
            <div
              className="note-print-content"
              dangerouslySetInnerHTML={{
                __html: editorRef.current?.innerHTML || activeNote?.content_html || "",
              }}
            />
          </div>,
          document.body
        )}
    </div>
  );
};

