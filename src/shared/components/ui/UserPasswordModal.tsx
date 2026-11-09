import React, { useState, useEffect, useRef } from "react";
import { Lock, Eye, EyeOff, X, AlertCircle, ArrowRight, User } from "lucide-react";
import { AppUser } from "@/shared/services/appUserService";

export interface UserPasswordModalProps {
  targetUser: AppUser | null;
  isOpen: boolean;
  isStartupLock?: boolean;
  availableUsers?: AppUser[];
  onSelectUser?: (userId: string) => void;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<boolean>;
}

export const UserPasswordModal: React.FC<UserPasswordModalProps> = ({
  targetUser,
  isOpen,
  isStartupLock = false,
  availableUsers = [],
  onSelectUser,
  onCancel,
  onConfirm,
}) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setShowPassword(false);
      setError(null);
      setIsVerifying(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
    }
  }, [isOpen, targetUser?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen || !targetUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Inserisci la password di accesso.");
      return;
    }
    setIsVerifying(true);
    setError(null);
    try {
      const ok = await onConfirm(password);
      if (!ok) {
        setError("Password non corretta. Riprova.");
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    } catch {
      setError("Errore durante la verifica della password.");
    } finally {
      setIsVerifying(false);
    }
  };

  const alternativeUsers = availableUsers.filter((u) => u.id !== targetUser.id);
  const unprotectedUser = alternativeUsers.find((u) => !u.require_password || !u.password_hash);

  // 1. Schermata di blocco all'avvio / F5 (overlay solido a tutto schermo, zero dati visibili dietro)
  if (isStartupLock) {
    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#090d16] p-4 text-[var(--foreground)] select-none animate-in fade-in duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-title"
      >
        <div className="flex flex-col items-center mb-6 text-center">
          <img
            src="/logo.svg"
            alt="Last Logo"
            className="w-14 h-14 drop-shadow-[0_0_24px_rgba(59,130,246,0.35)] mb-2.5 transition-transform hover:scale-105"
          />
          <h1 className="text-xl font-black tracking-widest text-white uppercase">Last</h1>
          <p className="text-xs text-slate-400 mt-0.5">Piattaforma Gestionale Brico Class</p>
        </div>

        <section className="w-full max-w-sm rounded-2xl border border-slate-700/60 bg-slate-900/95 p-6 text-slate-100 shadow-2xl backdrop-blur animate-in zoom-in-95 duration-150">
          <div className="flex items-start gap-3.5 pb-4 border-b border-slate-800">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <Lock className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h2 id="lock-title" className="text-base font-bold text-white">
                Accesso Protetto
              </h2>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Postazione: <strong className="text-blue-300 font-semibold">{targetUser.name}</strong>{" "}
                {targetUser.station_name ? (
                  <span className="text-slate-400">({targetUser.station_name})</span>
                ) : null}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Inserisci password..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 pr-10 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                title={showPassword ? "Nascondi password" : "Mostra password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg animate-in fade-in duration-100">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifying || !password}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <span>{isVerifying ? "Verifica in corso..." : "Sblocca ed Entra"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Cambio postazione rapido all'avvio se sono presenti altri utenti */}
          {alternativeUsers.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-800">
              <p className="text-[11px] font-semibold text-slate-400 mb-2">
                Oppure accedi con un'altra postazione:
              </p>
              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                {alternativeUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => onSelectUser?.(u.id)}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-400 shrink-0" />
                      <span className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                        {u.name}
                      </span>
                      {u.station_name && (
                        <span className="text-[10px] text-slate-400 truncate">
                          ({u.station_name})
                        </span>
                      )}
                    </div>
                    {!u.require_password || !u.password_hash ? (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                        Libero
                      </span>
                    ) : (
                      <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {unprotectedUser && (
            <div className="mt-4 pt-3 text-center">
              <button
                type="button"
                onClick={onCancel}
                className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4 cursor-pointer transition-colors"
              >
                Accedi senza password come &quot;{unprotectedUser.name}&quot;
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  // 2. Modale classico per cambio postazione manuale durante l'uso del programma
  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100"
      role="presentation"
      onClick={onCancel}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwd-modal-title"
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--foreground)] shadow-2xl overflow-hidden select-none animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400">
            <Lock className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="pwd-modal-title" className="text-base font-semibold text-[var(--foreground)]">
                Accesso Protetto
              </h2>
              <button
                type="button"
                onClick={onCancel}
                className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                title="Annulla"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)] leading-relaxed">
              La postazione <strong className="text-[var(--foreground)]">{targetUser.name}</strong>{" "}
              {targetUser.station_name ? `(${targetUser.station_name})` : ""} richiede la password di accesso:
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="relative">
            <input
              ref={inputRef}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Inserisci password..."
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 pr-10 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-all font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 cursor-pointer"
              title={showPassword ? "Nascondi password" : "Mostra password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-md animate-in fade-in duration-100">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onCancel}
              disabled={isVerifying}
              className="rounded-md border border-[var(--border)] bg-transparent px-3.5 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isVerifying || !password}
              className="rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {isVerifying ? "Verifica..." : "Accedi"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
