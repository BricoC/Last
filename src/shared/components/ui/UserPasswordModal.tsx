import React, { useState, useEffect, useRef } from "react";
import { Lock, Eye, EyeOff, X, AlertCircle } from "lucide-react";
import { AppUser } from "@/shared/services/appUserService";

export interface UserPasswordModalProps {
  targetUser: AppUser | null;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<boolean>;
}

export const UserPasswordModal: React.FC<UserPasswordModalProps> = ({
  targetUser,
  isOpen,
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
      }, 50);
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
