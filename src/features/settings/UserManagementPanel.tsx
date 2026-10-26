import React, { useState, useEffect } from "react";
import { useUserStore } from "@/shared/stores/useUserStore";
import { AppUser } from "@/shared/services/appUserService";
import { Users, Shield, ShieldAlert, Monitor, Plus, Check, Trash2, KeyRound } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export const UserManagementPanel: React.FC = () => {
  const { users, currentUser, loadUsers, switchUser, createUser, updateUser, deleteUser } =
    useUserStore();

  const [newName, setNewName] = useState("");
  const [newStation, setNewStation] = useState("");
  const [newCanSettings, setNewCanSettings] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await createUser({
        name: newName.trim(),
        station_name: newStation.trim() || "Postazione Generica",
        can_access_settings: newCanSettings,
        can_access_ddt: true,
        can_access_price_lists: true,
      });
      setNewName("");
      setNewStation("");
      setNewCanSettings(false);
      setMessage({ type: "success", text: "Nuovo utente / postazione creato con successo!" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Errore durante la creazione dell'utente" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleSettingsPermission = async (user: AppUser) => {
    try {
      await updateUser({
        ...user,
        can_access_settings: !user.can_access_settings,
      });
      setMessage({
        type: "success",
        text: `Permessi aggiornati per ${user.name}: Accesso Impostazioni ${!user.can_access_settings ? "ABILITATO" : "DISABILITATO"}`,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Errore aggiornamento permessi" });
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
        setMessage({ type: "success", text: `Utente ${user.name} eliminato con successo.` });
      } catch (err: any) {
        setMessage({ type: "error", text: err.message || "Errore durante l'eliminazione" });
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Card Postazione Attiva su Questo Computer */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-semibold">
                  Postazione PC Attiva su questo Computer
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  ATTIVA ORA
                </span>
              </div>
              <h2 className="text-lg font-bold text-[var(--foreground)]">
                {currentUser ? currentUser.name : "Caricamento..."}
              </h2>
              {currentUser?.station_name && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Dispositivo: {currentUser.station_name}
                </p>
              )}
            </div>
          </div>

          {/* Switcher rapido utente */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-[var(--muted-foreground)]">Seleziona Postazione:</span>
            <select
              value={currentUser?.id || ""}
              onChange={(e) => switchUser(e.target.value)}
              className="bg-[var(--background)] border border-[var(--border)] text-xs rounded-md px-3 py-1.5 font-semibold text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
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
            Ogni postazione/utente salva in modo completamente indipendente le proprie preferenze: dimensioni delle finestre di ricerca, posizioni, altezze e larghezze personalizzate. Modifiche su un PC non influenzeranno mai gli altri computer della rete.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "p-3 rounded-lg text-xs font-semibold flex items-center justify-between border",
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-red-500/10 text-red-400 border-red-500/30"
          )}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-[var(--muted-foreground)] hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Elenco Utenti & Configurazione Permessi */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            Gestione Utenti & Privilegi di Accesso
          </h3>
          <p className="text-xs text-[var(--muted-foreground)]">
            Configura chi può visualizzare e modificare le Impostazioni di sistema
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--background)]/50 text-[var(--muted-foreground)] font-semibold uppercase text-[10.5px]">
                <th className="py-2.5 px-3">Nome Utente / Cassa</th>
                <th className="py-2.5 px-3">Nome Postazione PC</th>
                <th className="py-2.5 px-3 text-center">Accesso Impostazioni</th>
                <th className="py-2.5 px-3 text-center">Stato PC Locale</th>
                <th className="py-2.5 px-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {users.map((u) => {
                const isCurrent = currentUser?.id === u.id;
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
                      <button
                        type="button"
                        onClick={() => handleToggleSettingsPermission(u)}
                        disabled={u.is_admin}
                        className={cn(
                          "px-2.5 py-1 rounded text-[11px] font-bold inline-flex items-center space-x-1.5 transition-colors cursor-default border",
                          u.can_access_settings
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                            : "bg-red-500/15 border-red-500/30 text-red-400",
                          u.is_admin ? "opacity-75 cursor-not-allowed" : "hover:brightness-110"
                        )}
                        title={
                          u.is_admin
                            ? "L'amministratore ha sempre accesso a tutte le sezioni"
                            : "Clicca per abilitare o disabilitare l'accesso ai Settings per questo utente"
                        }
                      >
                        {u.can_access_settings ? (
                          <>
                            <Shield className="w-3 h-3" />
                            <span>ABILITATO</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="w-3 h-3" />
                            <span>BLOCCATO</span>
                          </>
                        )}
                      </button>
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
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)]"
                        >
                          Seleziona su questo PC
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {!u.is_admin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(u)}
                          className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                          title="Elimina utente"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Aggiungi Nuovo Utente / Postazione */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center space-x-2">
            <Plus className="w-4 h-4 text-[var(--primary)]" />
            <span>Crea Nuovo Utente / Postazione Cassa</span>
          </h3>
          <p className="text-xs text-[var(--muted-foreground)]">
            Aggiungi un nuovo operatore o un nuovo terminale PC per isolare preferenze e permessi
          </p>
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--foreground)] mb-1">
              Nome Utente / Operatore *
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Es. Banco 3, Mario, Ufficio 2..."
              className="w-full px-3 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[var(--foreground)] mb-1">
              Nome Terminale PC (Opzionale)
            </label>
            <input
              type="text"
              value={newStation}
              onChange={(e) => setNewStation(e.target.value)}
              placeholder="Es. Postazione Magazzino..."
              className="w-full px-3 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div className="flex items-center space-x-3 pt-1">
            <label className="flex items-center space-x-2 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={newCanSettings}
                onChange={(e) => setNewCanSettings(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border)] bg-[var(--background)] text-[var(--primary)] focus:ring-0"
              />
              <span className="font-semibold text-[var(--foreground)]">Accesso Settings</span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting || !newName.trim()}
              className="flex-1 px-4 py-1.5 rounded-md bg-[var(--primary)] text-white font-semibold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crea Utente</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
