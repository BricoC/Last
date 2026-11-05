import React, { useState, useEffect } from "react";
import { useUserStore } from "@/shared/stores/useUserStore";
import {
  AppUser,
  ALL_APP_PAGE_MODULES,
  DEFAULT_ALLOWED_PAGES,
} from "@/shared/services/appUserService";
import {
  Users,
  Shield,
  Monitor,
  Plus,
  Check,
  Trash2,
  KeyRound,
  Edit2,
  Palette,
  LayoutGrid,
  Sliders,
  CheckSquare,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";

export const UserManagementPanel: React.FC = () => {
  const {
    users,
    currentUser,
    loadUsers,
    switchUser,
    createUser,
    updateUser,
    deleteUser,
  } = useUserStore();

  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state per nuovo utente
  const [newName, setNewName] = useState("");
  const [newStation, setNewStation] = useState("");
  const [newCanSettings, setNewCanSettings] = useState(false);
  const [newCanEditPrices, setNewCanEditPrices] = useState(false);
  const [newCanEditOr, setNewCanEditOr] = useState(false);
  const [newTheme, setNewTheme] = useState<"grigio" | "nero-oled" | "avorio">("grigio");
  const [newAllowedPages, setNewAllowedPages] = useState<string[]>([...DEFAULT_ALLOWED_PAGES]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Gestione apertura form creazione
  const handleOpenCreate = () => {
    setEditingUser(null);
    setNewName("");
    setNewStation("");
    setNewCanSettings(false);
    setNewCanEditPrices(false);
    setNewCanEditOr(false);
    setNewTheme("grigio");
    setNewAllowedPages(DEFAULT_ALLOWED_PAGES.filter((p) => p !== "settings"));
    setIsCreating(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await createUser({
        name: newName.trim(),
        station_name: newStation.trim() || "Postazione Cassa",
        can_access_settings: newCanSettings,
        can_edit_price_lists: newCanEditPrices,
        can_edit_or_numbers: newCanEditOr,
        can_access_ddt: true,
        can_access_price_lists: true,
        allowed_pages: newAllowedPages,
        theme_preset: newTheme,
        theme_brightness: newTheme === "nero-oled" ? 1 : newTheme === "avorio" ? 3 : 4,
      });
      setIsCreating(false);
      setMessage({ type: "success", text: `Utente / postazione "${newName.trim()}" creato con successo!` });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Errore durante la creazione dell'utente" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Gestione salvataggio modifiche utente esistente
  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await updateUser(editingUser);
      setEditingUser(null);
      setMessage({ type: "success", text: `Permessi e configurazione di "${editingUser.name}" salvati con successo!` });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Errore durante il salvataggio dell'utente" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (user: AppUser) => {
    if (user.is_admin) {
      setMessage({ type: "error", text: "Impossibile eliminare l'account Amministratore principale." });
      return;
    }
    if (confirm(`Sei sicuro di voler eliminare l'utente / postazione "${user.name}"?`)) {
      try {
        await deleteUser(user.id);
        if (editingUser?.id === user.id) setEditingUser(null);
        setMessage({ type: "success", text: `Utente ${user.name} eliminato con successo.` });
      } catch (err: any) {
        setMessage({ type: "error", text: err.message || "Errore durante l'eliminazione" });
      }
    }
  };

  const togglePageInEditing = (pageId: string) => {
    if (!editingUser) return;
    const current = editingUser.allowed_pages || [];
    const next = current.includes(pageId)
      ? current.filter((p) => p !== pageId)
      : [...current, pageId];
    setEditingUser({ ...editingUser, allowed_pages: next });
  };

  const selectAllPagesEditing = () => {
    if (!editingUser) return;
    setEditingUser({ ...editingUser, allowed_pages: [...DEFAULT_ALLOWED_PAGES] });
  };

  const deselectAllPagesEditing = () => {
    if (!editingUser) return;
    setEditingUser({ ...editingUser, allowed_pages: [] });
  };

  const togglePageInNew = (pageId: string) => {
    setNewAllowedPages((prev) =>
      prev.includes(pageId) ? prev.filter((p) => p !== pageId) : [...prev, pageId]
    );
  };

  const selectAllPagesNew = () => setNewAllowedPages([...DEFAULT_ALLOWED_PAGES]);
  const deselectAllPagesNew = () => setNewAllowedPages([]);

  return (
    <div className="space-y-6">
      {/* 1. Card Postazione Attiva su Questo Computer */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-semibold">
                  Postazione Attiva su questo Terminale
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  IN USO ORA
                </span>
              </div>
              <h2 className="text-lg font-bold text-[var(--foreground)]">
                {currentUser ? currentUser.name : "Caricamento..."}
              </h2>
              {currentUser?.station_name && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Dispositivo: <span className="font-mono">{currentUser.station_name}</span> · Tema:{" "}
                  <span className="font-semibold capitalize text-[var(--foreground)]">
                    {currentUser.theme_preset || "Grigio"}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Switcher rapido utente */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-[var(--muted-foreground)]">Cambia Postazione:</span>
            <select
              value={currentUser?.id || ""}
              onChange={(e) => switchUser(e.target.value)}
              className="bg-[var(--background)] border border-[var(--border)] text-xs rounded-md px-3 py-1.5 font-semibold text-[var(--foreground)] outline-none focus:border-[var(--primary)] cursor-pointer"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.station_name ? `(${u.station_name})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-3 bg-[var(--background)]/60 border border-[var(--border)] rounded-lg text-xs text-[var(--muted-foreground)] flex items-start space-x-2.5">
          <KeyRound className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Ogni postazione/utente ha preferenze e permessi totalmente indipendenti: tema visivo personale (bianco, nero o grigio), pagine abilitate nella barra superiore e autorizzazioni per la modifica dei prezzi o degli OR Numbers.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "p-3 rounded-lg text-xs font-semibold flex items-center justify-between border animate-in fade-in duration-150",
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-red-500/10 text-red-400 border-red-500/30"
          )}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-[var(--muted-foreground)] hover:text-white ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Modale / Pannello Modifica Utente Selezionato */}
      {editingUser && (
        <div className="bg-[var(--card)] border-2 border-[var(--primary)]/60 rounded-xl p-5 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div className="flex items-center space-x-2.5">
              <Sliders className="w-5 h-5 text-[var(--primary)]" />
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)]">
                  Configura Permessi & Tema: {editingUser.name}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Personalizza quali pagine può vedere e le sue autorizzazioni operative
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleEditSave} className="space-y-5">
            {/* Campi Nome e Postazione */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  Nome Utente / Cassa *
                </label>
                <input
                  type="text"
                  required
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  Nome Terminale / Postazione PC
                </label>
                <input
                  type="text"
                  value={editingUser.station_name}
                  onChange={(e) => setEditingUser({ ...editingUser, station_name: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>
            </div>

            {/* Selezione Tema Personale Utente */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--foreground)] flex items-center space-x-2">
                <Palette className="w-4 h-4 text-[var(--primary)]" />
                <span>Tema Visivo Personale</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    id: "grigio" as const,
                    name: "Grigio Titanio",
                    desc: "Toni scuri bilanciati per lavoro continuo",
                    bg: "#22242a",
                    border: "#3e4350",
                    text: "#f3f4f6",
                  },
                  {
                    id: "nero-oled" as const,
                    name: "Nero Assoluto (OLED)",
                    desc: "Nero profondo #000000 e massimo contrasto",
                    bg: "#000000",
                    border: "#222222",
                    text: "#ffffff",
                  },
                  {
                    id: "avorio" as const,
                    name: "Bianco Avorio",
                    desc: "Tema chiaro luminoso con testo carbone nitido",
                    bg: "#f7f5ef",
                    border: "#d6d1c5",
                    text: "#1f2937",
                  },
                ].map((th) => {
                  const isSelected = editingUser.theme_preset === th.id;
                  return (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => setEditingUser({ ...editingUser, theme_preset: th.id })}
                      className={cn(
                        "p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer relative",
                        isSelected
                          ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30 shadow-md"
                          : "border-[var(--border)] hover:border-[var(--primary)]/50 bg-[var(--background)]/50"
                      )}
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <span className="text-xs font-bold text-[var(--foreground)]">{th.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[var(--primary)]" />}
                      </div>
                      <div
                        className="h-7 w-full rounded border flex items-center justify-center text-[10px] font-semibold mb-2"
                        style={{ backgroundColor: th.bg, borderColor: th.border, color: th.text }}
                      >
                        Anteprima Colore
                      </div>
                      <span className="text-[10px] text-[var(--muted-foreground)] leading-tight">{th.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selezione Pagine Visibili per questo Utente */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[var(--foreground)] flex items-center space-x-2">
                  <LayoutGrid className="w-4 h-4 text-[var(--primary)]" />
                  <span>Pagine & Moduli Visibili nella Barra Superiore</span>
                  <span className="text-[11px] font-normal text-[var(--muted-foreground)]">
                    ({editingUser.allowed_pages?.length || 0} su {ALL_APP_PAGE_MODULES.length})
                  </span>
                </label>
                <div className="flex items-center space-x-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllPagesEditing}
                    className="text-[11px] font-semibold text-[var(--primary)] hover:underline flex items-center space-x-1"
                  >
                    <CheckSquare className="w-3 h-3" />
                    <span>Seleziona Tutte</span>
                  </button>
                  <span className="text-[var(--border)]">|</span>
                  <button
                    type="button"
                    onClick={deselectAllPagesEditing}
                    className="text-[11px] font-semibold text-[var(--muted-foreground)] hover:text-white flex items-center space-x-1"
                  >
                    <Square className="w-3 h-3" />
                    <span>Deseleziona Tutte</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-3 bg-[var(--background)]/70 border border-[var(--border)] rounded-xl">
                {ALL_APP_PAGE_MODULES.map((page) => {
                  const checked = Boolean(editingUser.allowed_pages?.includes(page.id));
                  return (
                    <label
                      key={page.id}
                      className={cn(
                        "flex items-center space-x-2 p-2 rounded-lg text-xs font-medium cursor-pointer transition-colors border select-none",
                        checked
                          ? "bg-[var(--primary)]/10 text-[var(--foreground)] border-[var(--primary)]/30 font-semibold"
                          : "bg-transparent text-[var(--muted-foreground)] border-transparent hover:bg-[var(--card)]"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePageInEditing(page.id)}
                        className="w-3.5 h-3.5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                      />
                      <span className="truncate">{page.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Permessi Operativi Speciali */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--foreground)] flex items-center space-x-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Autorizzazioni Operative</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-start space-x-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editingUser.can_access_settings}
                    disabled={editingUser.is_admin}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, can_access_settings: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 rounded border-[var(--border)] text-[var(--primary)]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--foreground)] block">
                      Accesso Impostazioni
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)] leading-tight block">
                      Permette di visualizzare e cambiare le impostazioni di sistema
                    </span>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editingUser.can_edit_price_lists}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, can_edit_price_lists: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 rounded border-[var(--border)] text-[var(--primary)]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--foreground)] block">
                      Modifica Listini Prezzi
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)] leading-tight block">
                      Autorizza la modifica, importazione e aggiornamento dei listini articoli
                    </span>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editingUser.can_edit_or_numbers}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, can_edit_or_numbers: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 rounded border-[var(--border)] text-[var(--primary)]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--foreground)] block">
                      Modifica OR Numbers
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)] leading-tight block">
                      Autorizza l'assegnazione e la modifica dei numeri d'ordine e sconti
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Pulsanti Azione Modifica */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 rounded-md border border-[var(--border)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--accent)] cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? "Salvataggio..." : "Salva Modifiche"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Form Creazione Nuovo Utente / Postazione */}
      {isCreating && (
        <div className="bg-[var(--card)] border-2 border-emerald-500/60 rounded-xl p-5 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div className="flex items-center space-x-2.5">
              <Plus className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)]">
                  Crea Nuovo Utente / Nuova Postazione
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Assegna nome, postazione, tema e permessi personalizzati
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  Nome Utente / Operatore *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Es. Banco 3, Ufficio Acquisti, Magazzino..."
                  className="w-full px-3 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  Nome Terminale PC (Opzionale)
                </label>
                <input
                  type="text"
                  value={newStation}
                  onChange={(e) => setNewStation(e.target.value)}
                  placeholder="Es. Postazione Cassa 3..."
                  className="w-full px-3 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>
            </div>

            {/* Tema per il nuovo utente */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--foreground)] flex items-center space-x-2">
                <Palette className="w-4 h-4 text-[var(--primary)]" />
                <span>Tema Visivo Iniziale</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: "grigio" as const, name: "Grigio Titanio", bg: "#22242a", border: "#3e4350", text: "#f3f4f6" },
                  { id: "nero-oled" as const, name: "Nero Assoluto (OLED)", bg: "#000000", border: "#222222", text: "#ffffff" },
                  { id: "avorio" as const, name: "Bianco Avorio", bg: "#f7f5ef", border: "#d6d1c5", text: "#1f2937" },
                ].map((th) => {
                  const isSelected = newTheme === th.id;
                  return (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => setNewTheme(th.id)}
                      className={cn(
                        "p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer",
                        isSelected
                          ? "border-emerald-500 ring-2 ring-emerald-500/30 shadow-md bg-[var(--card)]"
                          : "border-[var(--border)] hover:border-[var(--border)]/80 bg-[var(--background)]/50"
                      )}
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <span className="text-xs font-bold text-[var(--foreground)]">{th.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <div
                        className="h-6 w-full rounded border flex items-center justify-center text-[10px] font-semibold"
                        style={{ backgroundColor: th.bg, borderColor: th.border, color: th.text }}
                      >
                        Anteprima
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pagine abilitate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[var(--foreground)] flex items-center space-x-2">
                  <LayoutGrid className="w-4 h-4 text-[var(--primary)]" />
                  <span>Pagine & Moduli Visibili</span>
                  <span className="text-[11px] font-normal text-[var(--muted-foreground)]">
                    ({newAllowedPages.length} su {ALL_APP_PAGE_MODULES.length})
                  </span>
                </label>
                <div className="flex items-center space-x-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllPagesNew}
                    className="text-[11px] font-semibold text-[var(--primary)] hover:underline flex items-center space-x-1"
                  >
                    <CheckSquare className="w-3 h-3" />
                    <span>Tutte</span>
                  </button>
                  <span className="text-[var(--border)]">|</span>
                  <button
                    type="button"
                    onClick={deselectAllPagesNew}
                    className="text-[11px] font-semibold text-[var(--muted-foreground)] hover:text-white flex items-center space-x-1"
                  >
                    <Square className="w-3 h-3" />
                    <span>Nessuna</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-3 bg-[var(--background)]/70 border border-[var(--border)] rounded-xl">
                {ALL_APP_PAGE_MODULES.map((page) => {
                  const checked = newAllowedPages.includes(page.id);
                  return (
                    <label
                      key={page.id}
                      className={cn(
                        "flex items-center space-x-2 p-2 rounded-lg text-xs font-medium cursor-pointer transition-colors border select-none",
                        checked
                          ? "bg-emerald-500/10 text-[var(--foreground)] border-emerald-500/30 font-semibold"
                          : "bg-transparent text-[var(--muted-foreground)] border-transparent hover:bg-[var(--card)]"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePageInNew(page.id)}
                        className="w-3.5 h-3.5 rounded border-[var(--border)] text-emerald-500 focus:ring-0"
                      />
                      <span className="truncate">{page.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Permessi speciali per nuovo utente */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--foreground)] flex items-center space-x-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Autorizzazioni Operative</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-start space-x-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newCanSettings}
                    onChange={(e) => setNewCanSettings(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-[var(--border)] text-[var(--primary)]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--foreground)] block">
                      Accesso Impostazioni
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)] leading-tight block">
                      Accesso alle impostazioni di sistema
                    </span>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newCanEditPrices}
                    onChange={(e) => setNewCanEditPrices(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-[var(--border)] text-[var(--primary)]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--foreground)] block">
                      Modifica Listini Prezzi
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)] leading-tight block">
                      Modifica e aggiornamento listini articoli
                    </span>
                  </div>
                </label>

                <label className="flex items-start space-x-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newCanEditOr}
                    onChange={(e) => setNewCanEditOr(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-[var(--border)] text-[var(--primary)]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--foreground)] block">
                      Modifica OR Numbers
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)] leading-tight block">
                      Assegnazione numero ordine e sconti
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 rounded-md border border-[var(--border)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--accent)] cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !newName.trim()}
                className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? "Creazione in corso..." : "Crea Postazione"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Elenco Utenti & Configurazione Permessi */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Elenco Utenti & Postazioni Configurate
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Clicca su "Configura" per scegliere le pagine visibili, il tema e le autorizzazioni
            </p>
          </div>

          {!isCreating && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuovo Utente / Cassa</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--background)]/50 text-[var(--muted-foreground)] font-semibold uppercase text-[10px]">
                <th className="py-2.5 px-3">Nome Utente</th>
                <th className="py-2.5 px-3">Postazione PC</th>
                <th className="py-2.5 px-3 text-center">Tema Predefinito</th>
                <th className="py-2.5 px-3 text-center">Pagine Visibili</th>
                <th className="py-2.5 px-3 text-center">Modifica OR</th>
                <th className="py-2.5 px-3 text-center">Modifica Listini</th>
                <th className="py-2.5 px-3 text-center">Settings</th>
                <th className="py-2.5 px-3 text-center">PC Locale</th>
                <th className="py-2.5 px-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {users.map((u) => {
                const isCurrent = currentUser?.id === u.id;
                const allowedCount = u.allowed_pages?.length ?? ALL_APP_PAGE_MODULES.length;
                return (
                  <tr
                    key={u.id}
                    className={cn(
                      "transition-colors",
                      isCurrent ? "bg-[var(--primary)]/5" : "hover:bg-[var(--background)]/40"
                    )}
                  >
                    <td className="py-3 px-3 font-semibold text-[var(--foreground)]">
                      <div className="flex items-center space-x-2">
                        {u.is_admin ? (
                          <Shield className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Users className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                        )}
                        <span>{u.name}</span>
                        {u.is_admin && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold uppercase">
                            Admin
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-[var(--muted-foreground)] font-mono">
                      {u.station_name || "—"}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold border inline-flex items-center space-x-1",
                          u.theme_preset === "avorio" && "bg-amber-100 text-stone-800 border-amber-300",
                          u.theme_preset === "nero-oled" && "bg-black text-white border-zinc-700",
                          (!u.theme_preset || u.theme_preset === "grigio") &&
                            "bg-slate-800 text-slate-200 border-slate-600"
                        )}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        <span className="capitalize">{u.theme_preset || "grigio"}</span>
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center font-mono text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)]">
                        {allowedCount} / {ALL_APP_PAGE_MODULES.length}
                      </span>
                    </td>

                    {/* Permesso Modifica OR */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold border",
                          u.can_edit_or_numbers || u.is_admin
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-red-500/10 text-red-400 border-red-500/30"
                        )}
                      >
                        {u.can_edit_or_numbers || u.is_admin ? "SÌ" : "NO"}
                      </span>
                    </td>

                    {/* Permesso Modifica Listini */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold border",
                          u.can_edit_price_lists || u.is_admin
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-red-500/10 text-red-400 border-red-500/30"
                        )}
                      >
                        {u.can_edit_price_lists || u.is_admin ? "SÌ" : "NO"}
                      </span>
                    </td>

                    {/* Permesso Settings */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold border",
                          u.can_access_settings
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-red-500/10 text-red-400 border-red-500/30"
                        )}
                      >
                        {u.can_access_settings ? "SÌ" : "NO"}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center">
                      {isCurrent ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 inline-flex items-center space-x-1">
                          <Check className="w-3 h-3" />
                          <span>ATTIVO QUI</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => switchUser(u.id)}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] cursor-pointer"
                        >
                          Seleziona
                        </button>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreating(false);
                            setEditingUser({ ...u });
                          }}
                          className="p-1 rounded text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors cursor-pointer"
                          title="Configura permessi, pagine e tema"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {!u.is_admin && (
                          <button
                            type="button"
                            onClick={() => handleDelete(u)}
                            className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Elimina utente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
