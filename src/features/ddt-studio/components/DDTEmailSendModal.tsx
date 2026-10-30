import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Mail, LoaderCircle, X, Paperclip, CheckCircle2 } from "lucide-react";
import { DdtDocument } from "../models/ddt";
import { ddtRepository } from "../services/ddtRepository";
import { clientRepository } from "@/features/clients/services/clientRepository";
import { DDTA4Document } from "../document/DDTA4Document";
import { generatePdfBytesFromElements, formatDdtPdfFilename } from "../utils/ddtExportManager";

export interface DDTEmailSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDdtIds: string[];
  onSuccess?: () => void;
}

export const DDTEmailSendModal: React.FC<DDTEmailSendModalProps> = ({
  isOpen,
  onClose,
  selectedDdtIds,
  onSuccess,
}) => {
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docs, setDocs] = useState<DdtDocument[]>([]);
  const [toEmail, setToEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");

  // Stato per la generazione batch dei PDF tramite portale offscreen
  const [batchRenderDoc, setBatchRenderDoc] = useState<DdtDocument | null>(null);
  const [generatingProgress, setGeneratingProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Caricamento documenti selezionati e precompilazione email
  useEffect(() => {
    if (!isOpen || selectedDdtIds.length === 0) return;

    let active = true;
    setLoadingDocs(true);
    setErrorMessage("");

    (async () => {
      try {
        const loaded: DdtDocument[] = [];
        for (const id of selectedDdtIds) {
          const doc = await ddtRepository.getDdtById(id);
          if (doc) loaded.push(doc);
        }

        if (!active) return;
        setDocs(loaded);

        if (loaded.length > 0) {
          const first = loaded[0];
          const clientName = first.client_name || "Cliente";

          // Cerca se esiste un'email nell'anagrafica cliente
          let destTo = "";
          let destCc = "";

          // Controlli speciali per clienti noti o anagrafica
          if (clientName.toUpperCase().includes("CARRARA")) {
            destTo = "alessio.piccinini@cartierecarrara.com";
            destCc = "federica.bianchi@cartierecarrara.com";
          } else if (clientName.toUpperCase().includes("WEPA")) {
            destTo = "alessio.piccinini@cartierecarrara.com"; // default fallback
          } else if (first.client_id) {
            const clientObj = await clientRepository.getClientById(first.client_id);
            if (clientObj?.email) {
              destTo = clientObj.email;
            }
          }

          setToEmail(destTo);
          setCcEmail(destCc);

          const docNumbersStr = loaded
            .map((d) => `DDT ${d.doc_number ?? "Bozza"}`)
            .join(", ");

          setSubject(`Invio ${docNumbersStr} — Brico Class`);

          const now = new Date();
          const timeVal = now.getHours() * 100 + now.getMinutes();
          const greeting = timeVal > 0 && timeVal <= 1230 ? "Buongiorno." : "Buonasera.";

          const ddtLines = loaded
            .map((d) => `• DDT ${d.doc_number ?? "Bozza"} del ${d.doc_date || ""} ${d.destination_address ? `(${d.destination_address})` : ""}`)
            .join("\n");

          setBodyText(
            `${greeting}\n\nIn allegato i seguenti DDT in formato PDF:\n${ddtLines}\n\nRestiamo a disposizione per qualsiasi chiarimento.\n\nCordiali saluti,\nBrico Class S.r.l.`
          );
        }
      } catch (err) {
        if (!active) return;
        console.error("Errore caricamento DDT per email:", err);
        setErrorMessage("Errore nel caricamento dei dati dei DDT selezionati.");
      } finally {
        if (active) setLoadingDocs(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, selectedDdtIds]);

  if (!isOpen) return null;

  const handleSendViaOutlook = async () => {
    if (docs.length === 0) return;
    setErrorMessage("");

    try {
      const generatedPaths: string[] = [];
      const total = docs.length;

      for (let i = 0; i < total; i++) {
        const doc = docs[i];
        const filename = formatDdtPdfFilename(doc);

        setGeneratingProgress({
          current: i + 1,
          total,
          filename,
        });

        // 1. Monta il documento nel portale invisibile
        setBatchRenderDoc(doc);

        // 2. Attendi 60ms per il rendering DOM A4
        await new Promise((r) => setTimeout(r, 65));

        // 3. Rileva le pagine A4 renderizzate
        const portalPages = document.querySelectorAll("#ddt-email-batch-portal .ddt-a4-page");
        const pagesArray = Array.from(portalPages) as HTMLElement[];

        if (pagesArray.length === 0) {
          throw new Error(`Impossibile renderizzare le pagine per ${filename}`);
        }

        // 4. Genera i byte del PDF
        const pdfBytes = await generatePdfBytesFromElements(pagesArray);

        // 5. Salva in cartella temporanea
        const savedPath = await invoke<string>("save_temp_file", {
          filename,
          bytes: Array.from(pdfBytes),
        });

        generatedPaths.push(savedPath);
      }

      setBatchRenderDoc(null);
      setGeneratingProgress(null);

      // 6. Converte il body text in formato HTML semplice per Outlook
      const formattedHtmlBody = bodyText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");

      // 7. Chiama il comando Rust per aprire Outlook con gli allegati
      await invoke("send_email_with_attachments", {
        to: toEmail.trim(),
        cc: ccEmail.trim() || null,
        subject: subject.trim(),
        body: `<div style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.5;">${formattedHtmlBody}</div>`,
        attachments: generatedPaths,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error("Errore generazione/invio email:", err);
      setBatchRenderDoc(null);
      setGeneratingProgress(null);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Errore durante la preparazione dell'email."
      );
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn select-none"
        onClick={onClose}
      >
        <div
          className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl max-w-xl w-full text-[var(--foreground)] relative flex flex-col max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--background)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--foreground)]">
                  Invia DDT via Email (Outlook)
                </h3>
                <span className="text-[11px] text-[var(--muted-foreground)]">
                  {docs.length} document{docs.length === 1 ? "o" : "i"} selezionat{docs.length === 1 ? "o" : "i"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={Boolean(generatingProgress)}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto space-y-4 text-xs">
            {loadingDocs ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-[var(--muted-foreground)]">
                <LoaderCircle className="w-6 h-6 animate-spin text-blue-500" />
                <span>Caricamento dati DDT...</span>
              </div>
            ) : (
              <>
                {/* Destinatari */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-[var(--muted-foreground)] mb-1">
                      A (Destinatario)
                    </label>
                    <input
                      type="text"
                      value={toEmail}
                      onChange={(e) => setToEmail(e.target.value)}
                      placeholder="es. acquisti@cliente.it"
                      disabled={Boolean(generatingProgress)}
                      className="w-full px-2.5 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-xs text-[var(--foreground)] focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-[var(--muted-foreground)] mb-1">
                      Cc (Copia Conoscenza)
                    </label>
                    <input
                      type="text"
                      value={ccEmail}
                      onChange={(e) => setCcEmail(e.target.value)}
                      placeholder="es. contabile@cliente.it"
                      disabled={Boolean(generatingProgress)}
                      className="w-full px-2.5 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-xs text-[var(--foreground)] focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* Oggetto */}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[var(--muted-foreground)] mb-1">
                    Oggetto Email
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={Boolean(generatingProgress)}
                    className="w-full px-2.5 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-xs font-semibold text-[var(--foreground)] focus:border-blue-500 outline-none"
                  />
                </div>

                {/* Testo Messaggio */}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[var(--muted-foreground)] mb-1">
                    Testo del Messaggio
                  </label>
                  <textarea
                    rows={5}
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    disabled={Boolean(generatingProgress)}
                    className="w-full px-2.5 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-xs text-[var(--foreground)] focus:border-blue-500 outline-none font-sans resize-y"
                  />
                </div>

                {/* Elenco Allegati PDF che verranno generati */}
                <div className="bg-[var(--background)]/60 border border-[var(--border)] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--foreground)] mb-2">
                    <Paperclip className="w-3.5 h-3.5 text-blue-400" />
                    <span>Allegati PDF generati automaticamente ({docs.length}):</span>
                  </div>
                  <div className="max-h-28 overflow-y-auto divide-y divide-[var(--border)]/30 text-[11px] font-mono">
                    {docs.map((d) => (
                      <div key={d.id} className="py-1 flex items-center justify-between text-[var(--muted-foreground)]">
                        <span className="text-[var(--foreground)] font-semibold truncate">
                          {formatDdtPdfFilename(d)}
                        </span>
                        <span className="text-emerald-400 font-sans text-[10px] flex items-center gap-1 shrink-0 ml-2">
                          <CheckCircle2 className="w-3 h-3" /> Pronto
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {errorMessage && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs">
                    {errorMessage}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--muted-foreground)]">
              {generatingProgress
                ? `Generazione PDF (${generatingProgress.current}/${generatingProgress.total}): ${generatingProgress.filename}...`
                : "Verrà aperta l'applicazione Outlook con i PDF allegati."}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={Boolean(generatingProgress)}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[var(--foreground)] transition-colors cursor-pointer disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSendViaOutlook}
                disabled={loadingDocs || docs.length === 0 || Boolean(generatingProgress)}
                className="px-4 py-1.5 rounded text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingProgress ? (
                  <>
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                    <span>Elaborazione...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5" />
                    <span>Apri in Outlook</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Portale invisibile per renderizzare i DDT in A4 ed estrarre i byte PDF */}
      {batchRenderDoc &&
        createPortal(
          <div
            id="ddt-email-batch-portal"
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
            <DDTA4Document
              ddt={batchRenderDoc}
              items={batchRenderDoc.items || []}
              isPrintOnly={true}
            />
          </div>,
          document.body
        )}
    </>
  );
};

