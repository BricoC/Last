import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  RotateCw,
  Plus,
  Hash,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";
import { OrRow, getOrStatus } from "./types/orNumbers";
import { OrNumbersRepository } from "./services/orNumbersRepository";
import { OrTable } from "./components/OrTable";
import { OrAssignModal } from "./components/OrAssignModal";
import { DDTQuickViewModal } from "@/features/ddt-studio/components/DDTQuickViewModal";
import { ddtRepository } from "@/features/ddt-studio/services/ddtRepository";
import { requestOpenDdt } from "@/features/ddt-studio/services/ddtNavigation";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { DdtDocument } from "@/features/ddt-studio/models/ddt";
import { DDTA4Document } from "@/features/ddt-studio/document/DDTA4Document";
import { generatePdfBytesFromElements, formatDdtPdfFilename } from "@/features/ddt-studio/utils/ddtExportManager";
import { cn } from "@/shared/utils/cn";

const MESI = [
  { value: 1, label: "01. Gennaio" },
  { value: 2, label: "02. Febbraio" },
  { value: 3, label: "03. Marzo" },
  { value: 4, label: "04. Aprile" },
  { value: 5, label: "05. Maggio" },
  { value: 6, label: "06. Giugno" },
  { value: 7, label: "07. Luglio" },
  { value: 8, label: "08. Agosto" },
  { value: 9, label: "09. Settembre" },
  { value: 10, label: "10. Ottobre" },
  { value: 11, label: "11. Novembre" },
  { value: 12, label: "12. Dicembre" },
];

const ANNI = Array.from({ length: 7 }, (_, i) => 2024 + i);

interface OrNumbersPageProps {
  windowId?: string;
}

export const OrNumbersPage: React.FC<OrNumbersPageProps> = () => {
  const { openWindow } = useWindowStore();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const [carraraRows, setCarraraRows] = useState<OrRow[]>([]);
  const [wepaRows, setWepaRows] = useState<OrRow[]>([]);
  const [selectedCarraraIds, setSelectedCarraraIds] = useState<Set<string>>(new Set());
  const [selectedWepaIds, setSelectedWepaIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState<boolean>(true);

  // Modale Assegnazione OR
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [assignModalRow, setAssignModalRow] = useState<OrRow | null>(null);

  // Modale Quick View DDT (mini DDT Studio con Esc)
  const [quickViewDdtId, setQuickViewDdtId] = useState<string | null>(null);

  // Motore generazione PDF & invio email
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [sendingStatusText, setSendingStatusText] = useState<string>("");
  const [batchRenderDoc, setBatchRenderDoc] = useState<DdtDocument | null>(null);

  // Feedback Toast
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = useCallback((text: string, type: "success" | "error" | "info" = "info") => {
    setFeedback({ text, type });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  const getGreeting = () => {
    const d = new Date();
    const timeVal = d.getHours() * 100 + d.getMinutes();
    return timeVal > 0 && timeVal <= 1230 ? "Buongiorno." : "Buonasera.";
  };

  const getTodayFormattedIt = () => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const y = d.getFullYear();
    return `${day}/${m}/${y}`;
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [carrara, wepa] = await Promise.all([
        OrNumbersRepository.getOrRowsForMonth(selectedYear, selectedMonth, "CARRARA"),
        OrNumbersRepository.getOrRowsForMonth(selectedYear, selectedMonth, "WEPA"),
      ]);
      setCarraraRows(carrara);
      setWepaRows(wepa);
      setSelectedCarraraIds(new Set());
      setSelectedWepaIds(new Set());
    } catch (err) {
      console.error("Errore caricamento dati OR Numbers:", err);
      showToast("Errore nel caricamento dei DDT dal database locale.", "error");
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Apertura documento in DDT Studio
  const handleOpenDdtInStudio = (id: string) => {
    requestOpenDdt(id);
    openWindow({ id: "ddt-studio", title: "DDT Studio (Pro)", componentId: "ddt-studio" });
  };

  // Apertura modale assegnazione OR
  const handleOpenAssign = (row?: OrRow) => {
    setAssignModalRow(row || null);
    setIsAssignModalOpen(true);
  };

  // Helper per inviare un gruppo di DDT via Outlook
  const sendEmailGroup = async (
    targetRows: OrRow[],
    to: string,
    cc: string,
    subject: string,
    body: string,
    logStatusText: string
  ): Promise<boolean> => {
    if (targetRows.length === 0) return false;

    setIsSendingEmail(true);
    setSendingStatusText(`Caricamento ${targetRows.length} DDT in corso...`);

    try {
      const generatedPaths: string[] = [];
      const total = targetRows.length;

      for (let i = 0; i < total; i++) {
        const row = targetRows[i];
        const doc = await ddtRepository.getDdtById(row.id);
        if (!doc) {
          console.warn(`DDT ${row.id} non trovato nel database.`);
          continue;
        }

        const filename = formatDdtPdfFilename(doc);
        setSendingStatusText(`Generazione PDF (${i + 1}/${total}): ${filename}`);

        // 1. Monta il documento nel portale invisibile
        setBatchRenderDoc(doc);

        // 2. Attendi per il rendering DOM A4
        await new Promise((resolve) => setTimeout(resolve, 65));

        // 3. Rileva le pagine A4 renderizzate
        const portalPages = document.querySelectorAll("#or-numbers-batch-portal .ddt-a4-page");
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
      setSendingStatusText("Apertura messaggio in Microsoft Outlook...");

      // 6. Apertura in Outlook tramite comando Tauri nativo
      await invoke("send_email_with_attachments", {
        to: to.trim(),
        cc: cc.trim() || null,
        subject: subject.trim(),
        body: `<div style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.5;">${body}</div>`,
        attachments: generatedPaths,
      });

      // 7. Aggiornamento log per tutti i DDT inviati
      const updates: Record<string, string> = {};
      for (const r of targetRows) {
        const dateIt = r.date.split("-").reverse().join(".");
        const dateSlash = r.date.split("-").reverse().join("/");
        updates[`${r.docNumber}_${dateIt}`] = logStatusText;
        updates[`${r.docNumber}_${dateSlash}`] = logStatusText;
        updates[r.id] = logStatusText;
      }
      await OrNumbersRepository.updateLogsBatch(updates);

      return true;
    } catch (e: any) {
      console.error("Errore durante l'invio via Outlook:", e);
      showToast(e?.message || "Errore durante l'invio email con Outlook.", "error");
      return false;
    } finally {
      setBatchRenderDoc(null);
      setIsSendingEmail(false);
      setSendingStatusText("");
    }
  };

  // Azioni Cartiere Carrara
  const handleSendCarraraRed = async () => {
    const redRows = carraraRows.filter((r) => getOrStatus(r) === "red");
    if (redRows.length === 0) {
      showToast("Nessun DDT rosso (nuovo) presente in Cartiere Carrara.", "info");
      return;
    }

    const today = getTodayFormattedIt();
    const success = await sendEmailGroup(
      redRows,
      "alessio.piccinini@cartierecarrara.com",
      "federica.bianchi@cartierecarrara.com",
      "Invio DDT Multiplo (Nuovi)",
      `${getGreeting()}<br><br>In allegato i nuovi DDT.<br><br>Saluti,<br>Brico Class`,
      `Email Multipla ${today}`
    );

    if (success) {
      showToast(`Aperta email Outlook con ${redRows.length} DDT Cartiere Carrara.`, "success");
      await loadData();
    }
  };

  const handleSendCarraraYellow = async () => {
    const yellowRows = carraraRows.filter((r) => getOrStatus(r) === "yellow");
    if (yellowRows.length === 0) {
      showToast("Nessun DDT giallo (in attesa) presente in Cartiere Carrara.", "info");
      return;
    }

    const today = getTodayFormattedIt();
    const success = await sendEmailGroup(
      yellowRows,
      "alessio.piccinini@cartierecarrara.com",
      "federica.bianchi@cartierecarrara.com",
      "DDT in attesa di numero d'ordine",
      `${getGreeting()}<br><br>In allegato i DDT ancora in attesa di numero d'ordine.<br><br>Saluti,<br>Brico Class`,
      `Email Multi Gialli ${today}`
    );

    if (success) {
      showToast(`Aperto sollecito Outlook con ${yellowRows.length} DDT Cartiere Carrara.`, "success");
      await loadData();
    }
  };

  const handleSendCarraraSelected = async () => {
    const selected = carraraRows.filter((r) => selectedCarraraIds.has(r.id));
    if (selected.length === 0) {
      showToast("Seleziona prima almeno un DDT da inviare.", "info");
      return;
    }

    const today = getTodayFormattedIt();
    const success = await sendEmailGroup(
      selected,
      "alessio.piccinini@cartierecarrara.com",
      "federica.bianchi@cartierecarrara.com",
      `Invio DDT Cartiere Carrara (${selected.length} documenti)`,
      `${getGreeting()}<br><br>In allegato i DDT selezionati:<br><br>Saluti,<br>Brico Class`,
      `Email Multipla ${today}`
    );

    if (success) {
      showToast(`Aperta email Outlook con ${selected.length} DDT selezionati.`, "success");
      await loadData();
    }
  };

  // Azioni Wepa
  const handleSendWepaMulti = async () => {
    const redRows = wepaRows.filter((r) => getOrStatus(r) === "red");
    if (redRows.length === 0) {
      showToast("Nessun DDT rosso (nuovo) presente in Wepa.", "info");
      return;
    }

    const salanetti = redRows.filter((r) =>
      r.destination.toUpperCase().includes("SALANETTI")
    );
    const ralletta = redRows.filter(
      (r) =>
        r.destination.toUpperCase().includes("RALLETTA") ||
        (!r.destination.toUpperCase().includes("SALANETTI") && !r.destination.toUpperCase().includes("RALLETTA"))
    );

    const today = getTodayFormattedIt();
    let sentCount = 0;

    if (salanetti.length > 0) {
      const ok = await sendEmailGroup(
        salanetti,
        "d.gori@wepa.it",
        "m.rossi@wepa.it",
        "DDT Wepa Salanetti",
        `${getGreeting()}<br><br>In allegato i DDT richiesti:<br><br>Saluti,<br>Brico Class`,
        `Email Multipla ${today}`
      );
      if (ok) sentCount += salanetti.length;
    }

    if (ralletta.length > 0) {
      const ok = await sendEmailGroup(
        ralletta,
        "m.rossi@wepa.it",
        "d.gori@wepa.it",
        "DDT Wepa Ralletta",
        `${getGreeting()}<br><br>In allegato i DDT richiesti:<br><br>Saluti,<br>Brico Class`,
        `Email Multipla ${today}`
      );
      if (ok) sentCount += ralletta.length;
    }

    if (sentCount > 0) {
      showToast(`Aperte email Outlook per Wepa (${sentCount} DDT complessivi).`, "success");
      await loadData();
    }
  };

  const handleSendWepaSelected = async () => {
    const selected = wepaRows.filter((r) => selectedWepaIds.has(r.id));
    if (selected.length === 0) {
      showToast("Seleziona prima almeno un DDT Wepa da inviare.", "info");
      return;
    }

    const salanetti = selected.filter((r) =>
      r.destination.toUpperCase().includes("SALANETTI")
    );
    const other = selected.filter(
      (r) => !r.destination.toUpperCase().includes("SALANETTI")
    );

    const today = getTodayFormattedIt();

    if (salanetti.length > 0) {
      await sendEmailGroup(
        salanetti,
        "d.gori@wepa.it",
        "m.rossi@wepa.it",
        `DDT Wepa Salanetti (${salanetti.length} documenti)`,
        `${getGreeting()}<br><br>In allegato i DDT Wepa selezionati:<br><br>Saluti,<br>Brico Class`,
        `Email Multipla ${today}`
      );
    }

    if (other.length > 0) {
      await sendEmailGroup(
        other,
        "m.rossi@wepa.it",
        "d.gori@wepa.it",
        `DDT Wepa (${other.length} documenti)`,
        `${getGreeting()}<br><br>In allegato i DDT Wepa selezionati:<br><br>Saluti,<br>Brico Class`,
        `Email Multipla ${today}`
      );
    }

    showToast(`Email Outlook predisposte per ${selected.length} DDT Wepa.`, "success");
    await loadData();
  };

  // Invio singolo DDT
  const handleSendSingle = async (row: OrRow) => {
    const isCarrara = row.client.toUpperCase().includes("CARRARA");
    const to = isCarrara
      ? "alessio.piccinini@cartierecarrara.com"
      : row.destination.toUpperCase().includes("SALANETTI")
      ? "d.gori@wepa.it"
      : "m.rossi@wepa.it";

    const cc = isCarrara
      ? "federica.bianchi@cartierecarrara.com"
      : "info@bricoclass.com";

    const subject = `DDT ${row.docNumber ?? "Bozza"}`;
    const body = `${getGreeting()}<br><br>In allegato DDT ${row.docNumber ?? "Bozza"} del ${row.date}<br><br>Saluti,<br>Brico Class`;

    const today = getTodayFormattedIt();
    const ok = await sendEmailGroup(
      [row],
      to,
      cc,
      subject,
      body,
      `Email ${today}`
    );

    if (ok) {
      showToast(`Aperta email per DDT ${row.docNumber ?? "Bozza"}.`, "success");
      await loadData();
    }
  };

  // Master checkbox selection
  const handleToggleSelectRowCarrara = (id: string) => {
    setSelectedCarraraIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllCarrara = () => {
    if (selectedCarraraIds.size === carraraRows.length) {
      setSelectedCarraraIds(new Set());
    } else {
      setSelectedCarraraIds(new Set(carraraRows.map((r) => r.id)));
    }
  };

  const handleToggleSelectRowWepa = (id: string) => {
    setSelectedWepaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllWepa = () => {
    if (selectedWepaIds.size === wepaRows.length) {
      setSelectedWepaIds(new Set());
    } else {
      setSelectedWepaIds(new Set(wepaRows.map((r) => r.id)));
    }
  };

  // Calcolo KPI riepilogo globale
  const allRows = [...carraraRows, ...wepaRows];
  const totalDdt = allRows.length;
  const totalGreen = allRows.filter((r) => getOrStatus(r) === "green").length;
  const totalYellow = allRows.filter((r) => getOrStatus(r) === "yellow").length;
  const totalRed = allRows.filter((r) => getOrStatus(r) === "red").length;

  return (
    <div className="flex flex-col h-full w-full bg-[var(--background)] text-[var(--foreground)] p-4 select-none overflow-hidden">
      {/* Barra Superiore Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          {/* Badge Modulo */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-xs">
            <Hash className="w-4 h-4" />
            <span className="tracking-wide uppercase">OR Numbers & Spedizioni</span>
          </div>

          {/* Selettore Mese e Anno */}
          <div className="flex items-center bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden shadow-xs">
            <div className="px-2.5 py-1.5 bg-[var(--background)] border-r border-[var(--border)] text-[11px] font-bold text-[var(--muted-foreground)] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>PERIODO</span>
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent px-2.5 py-1 text-xs font-semibold text-[var(--foreground)] border-r border-[var(--border)] outline-none cursor-pointer"
            >
              {MESI.map((m) => (
                <option key={m.value} value={m.value} className="bg-slate-900 text-white">
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent px-2.5 py-1 text-xs font-semibold text-[var(--foreground)] outline-none cursor-pointer"
            >
              {ANNI.map((a) => (
                <option key={a} value={a} className="bg-slate-900 text-white">
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Pulsante Ricarica */}
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading || isSendingEmail}
            className="p-1.5 rounded-lg bg-[var(--card)] hover:bg-[var(--accent)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer disabled:opacity-50"
            title="Ricarica dati dal database locale e sincronizza"
          >
            <RotateCw className={cn("w-4 h-4", loading && "animate-spin text-blue-400")} />
          </button>
        </div>

        {/* Centro: Riepilogo Rapido KPI */}
        <div className="hidden lg:flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[var(--muted-foreground)]">Totale DDT:</span>
            <span className="font-bold text-[var(--foreground)]">{totalDdt}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Conclusi:</span>
            <span className="font-bold">{totalGreen}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>In attesa:</span>
            <span className="font-bold">{totalYellow}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span>Da richiedere:</span>
            <span className="font-bold">{totalRed}</span>
          </div>
        </div>

        {/* Pulsante Assegna OR & Sconto */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenAssign()}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-500/40 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Assegna OR & Sconto</span>
          </button>
        </div>
      </div>

      {/* Area Notifiche o Toast */}
      {feedback && (
        <div
          className={cn(
            "my-2 px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-between shrink-0 shadow-sm animate-in fade-in duration-200",
            feedback.type === "success" && "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
            feedback.type === "error" && "bg-red-500/15 text-red-300 border border-red-500/30",
            feedback.type === "info" && "bg-blue-500/15 text-blue-300 border border-blue-500/30"
          )}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {feedback.type === "error" && <AlertCircle className="w-4 h-4 text-red-400" />}
            {feedback.type === "info" && <Sparkles className="w-4 h-4 text-blue-400" />}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Banner di avanzamento invio email */}
      {isSendingEmail && (
        <div className="my-2 px-4 py-2.5 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-200 text-xs font-medium flex items-center gap-3 shrink-0 shadow-sm animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          <span>{sendingStatusText || "Elaborazione e predisposizione email Outlook in corso..."}</span>
        </div>
      )}

      {/* Doppia Tabella Affiancata */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 mt-3 overflow-hidden">
        {/* Tabella Cartiere Carrara (Sinistra) */}
        <OrTable
          title="CARTIERE CARRARA"
          type="CARRARA"
          rows={carraraRows}
          selectedIds={selectedCarraraIds}
          onToggleSelectRow={handleToggleSelectRowCarrara}
          onToggleSelectAll={handleToggleSelectAllCarrara}
          onOpenDdt={(id) => setQuickViewDdtId(id)}
          onOpenInStudio={handleOpenDdtInStudio}
          onAssignOr={handleOpenAssign}
          onSendCarraraRed={handleSendCarraraRed}
          onSendCarraraYellow={handleSendCarraraYellow}
          onSendSelected={handleSendCarraraSelected}
          onSendSingle={handleSendSingle}
          isSendingEmail={isSendingEmail}
        />

        {/* Tabella Wepa (Destra) */}
        <OrTable
          title="WEPA"
          type="WEPA"
          rows={wepaRows}
          selectedIds={selectedWepaIds}
          onToggleSelectRow={handleToggleSelectRowWepa}
          onToggleSelectAll={handleToggleSelectAllWepa}
          onOpenDdt={(id) => setQuickViewDdtId(id)}
          onOpenInStudio={handleOpenDdtInStudio}
          onAssignOr={handleOpenAssign}
          onSendWepaMulti={handleSendWepaMulti}
          onSendSelected={handleSendWepaSelected}
          onSendSingle={handleSendSingle}
          isSendingEmail={isSendingEmail}
        />
      </div>

      {/* Popup Dati Completi DDT con chiusura rapida Esc (Mini DDT Studio) */}
      <DDTQuickViewModal
        isOpen={quickViewDdtId !== null}
        onClose={() => setQuickViewDdtId(null)}
        ddtId={quickViewDdtId}
        onOpenInStudio={(id) => {
          setQuickViewDdtId(null);
          handleOpenDdtInStudio(id);
        }}
      />

      {/* Modale Assegna Numero Ordine & Sconto */}
      <OrAssignModal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false);
          setAssignModalRow(null);
        }}
        onSaved={async () => {
          showToast("Numero ordine assegnato con successo!", "success");
          await loadData();
        }}
        row={assignModalRow}
        availableRows={allRows}
      />

      {/* Portale invisibile per il rendering batch dei DDT in formato A4 */}
      {batchRenderDoc &&
        createPortal(
          <div
            id="or-numbers-batch-portal"
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
    </div>
  );
};
