import React, { useEffect, useState } from "react";
import {
  Landmark,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  Loader2,
} from "lucide-react";
import {
  type RibaDeadlineInfo,
  prepareAndSendRibaEmail,
} from "../services/ribaService";
import { getEmailSettings, type EmailSettings } from "@/features/settings/emailSettingsRepository";

interface RibaModalProps {
  isOpen: boolean;
  onClose: () => void;
  ribaInfo: RibaDeadlineInfo | null;
  onStatusUpdated: (updatedInfo: Partial<RibaDeadlineInfo>) => void;
}

export const RibaModal: React.FC<RibaModalProps> = ({
  isOpen,
  onClose,
  ribaInfo,
  onStatusUpdated,
}) => {
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void (async () => {
        try {
          const s = await getEmailSettings();
          setEmailSettings(s);
        } catch (err) {
          console.warn("[RibaModal] Impossibile caricare impostazioni email:", err);
        }
      })();
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !sending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, sending]);

  if (!isOpen || !ribaInfo) return null;

  const isPaid = ribaInfo.isPaid;
  const isUrgent = ribaInfo.daysToDeadline <= 5 && !isPaid;
  const bankTo = emailSettings?.bank_to?.trim() || "rachele.neri@bpc.bcc.it";
  const bankCc = emailSettings?.bank_cc?.trim() || "capannori@bpc.bcc.it";

  const handleSendEmail = async () => {
    setSending(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await prepareAndSendRibaEmail({
        deadlineStr: ribaInfo.deadlineStr,
        deadlineKey: ribaInfo.deadlineKey,
      });

      if (res.success && res.sentAt) {
        setSuccessMsg("Email preparata e aperta in Outlook con successo! Stato salvato su Supabase.");
        onStatusUpdated({
          isPaid: true,
          sentAt: res.sentAt,
        });
        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        setError(res.error || "Impossibile aprire Outlook o salvare lo stato su Supabase.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden w-full max-w-md animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]/70">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isPaid
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : isUrgent
                  ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                  : "bg-sky-500/15 text-sky-400 border-sky-500/30"
              }`}
            >
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[var(--foreground)] tracking-tight">
                Scadenza Ri.Ba.
              </h2>
              <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">
                Autorizzazione Pagamento Banca BCC
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--border)]/50 transition-colors cursor-pointer"
            title="Chiudi (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-4">
          {/* Box Scadenza */}
          <div className="p-4 rounded-xl border border-[var(--border)]/70 bg-[var(--background)]/50 flex flex-col items-center justify-center gap-2">
            <span className="text-[11px] font-extrabold text-[var(--muted-foreground)] uppercase tracking-wider">
              Prossima Scadenza
            </span>
            <span className="text-3xl font-black font-mono tracking-tight text-white">
              {ribaInfo.deadlineStr}
            </span>
            <div className="flex items-center gap-2 mt-1">
              {/* Badge Giorni */}
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                  isPaid
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : isUrgent
                    ? "bg-rose-500/25 text-rose-300 border border-rose-500/50"
                    : "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                }`}
              >
                {ribaInfo.daysToDeadline === 0
                  ? "Scade Oggi"
                  : ribaInfo.daysToDeadline < 0
                  ? "Scaduta"
                  : `Fra ${ribaInfo.daysToDeadline} giorn${ribaInfo.daysToDeadline === 1 ? "o" : "i"}`}
              </span>

              {/* Badge Stato */}
              <span
                className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                  isPaid
                    ? "bg-emerald-500 text-white shadow-xs"
                    : isUrgent
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                }`}
              >
                {isPaid && <CheckCircle2 className="w-3.5 h-3.5" />}
                {isPaid ? "PAGATA" : "NON PAGATA"}
              </span>
            </div>
          </div>

          {/* Dettagli Stato */}
          <div className="text-center text-xs">
            {isPaid ? (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1.5">
                <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Email alla banca già preparata per questa scadenza</span>
                </div>
                {ribaInfo.sentAt && (
                  <div className="text-[11px] text-emerald-300/80 font-medium flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Inviata / Registrata il: <strong className="text-emerald-200">{ribaInfo.sentAt}</strong></span>
                  </div>
                )}
                <div className="text-[10px] text-emerald-400/60 font-semibold uppercase tracking-wider">
                  ☁️ Sincronizzato con Supabase
                </div>
              </div>
            ) : isUrgent ? (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-semibold space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-rose-400 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>La scadenza è imminente!</span>
                </div>
                <p className="text-[11px]">
                  È necessario inviare l'email di autorizzazione al pagamento alla banca.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-[var(--background)]/30 border border-[var(--border)] text-[var(--muted-foreground)]">
                Puoi preparare in anticipo l'email di autorizzazione al pagamento per la banca.
              </div>
            )}
          </div>

          {/* Dati Email Banca */}
          <div className="p-3 rounded-xl bg-[var(--background)]/40 border border-[var(--border)]/70 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--muted-foreground)] font-semibold">Banca Destinatario:</span>
              <span className="font-mono text-white font-bold">{bankTo}</span>
            </div>
            {bankCc && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--muted-foreground)] font-semibold">In Copia (CC):</span>
                <span className="font-mono text-slate-300 font-medium">{bankCc}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--border)]/40">
              <span className="text-[var(--muted-foreground)] font-semibold">Oggetto:</span>
              <span className="font-medium text-slate-200 truncate ml-2">
                Autorizzazione pagamento Ri.Ba. scadenza {ribaInfo.deadlineStr}
              </span>
            </div>
          </div>

          {/* Feedback Messaggi */}
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="p-4 border-t border-[var(--border)]/70 bg-[var(--background)]/30 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--border)]/50 transition-colors cursor-pointer"
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={handleSendEmail}
            disabled={sending}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isPaid
                ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40"
                : isUrgent
                ? "bg-rose-600 hover:bg-rose-500 shadow-rose-950/40"
                : "bg-sky-600 hover:bg-sky-500 shadow-sky-950/40"
            }`}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Apertura Outlook...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>{isPaid ? "Prepara di nuovo l'email" : "Prepara Email Banca"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
