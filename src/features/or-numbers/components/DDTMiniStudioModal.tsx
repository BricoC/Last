import React, { useState, useEffect, useMemo } from "react";
import { X, Plus, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { DdtDocument, DdtItem } from "@/features/ddt-studio/models/ddt";
import { ddtRepository } from "@/features/ddt-studio/services/ddtRepository";
import { safeMoney, money } from "@/shared/domain/monetaryValue";
import { calculateRowAmounts } from "@/features/ddt-studio/utils/ddtCalculations";

interface DDTMiniStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  ddtId: string | null;
  onSaved: () => void;
}

interface EditableRow {
  id: string;
  row_index: number;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  discount_pct: string;
  vat_rate: string;
  purchase_price: string;
}

export const DDTMiniStudioModal: React.FC<DDTMiniStudioModalProps> = ({
  isOpen,
  onClose,
  ddtId,
  onSaved,
}) => {
  const [doc, setDoc] = useState<DdtDocument | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Campi Testata Editabili
  const [docNumber, setDocNumber] = useState<string>("");
  const [docDate, setDocDate] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [destinationName, setDestinationName] = useState<string>("");
  const [destinationAddress, setDestinationAddress] = useState<string>("");
  const [orderReference, setOrderReference] = useState<string>("");
  const [transportReason, setTransportReason] = useState<string>("");
  const [carriageTerms, setCarriageTerms] = useState<string>("");
  const [goodsAppearance, setGoodsAppearance] = useState<string>("");
  const [carrier, setCarrier] = useState<string>("");

  // Righe Editabili
  const [rows, setRows] = useState<EditableRow[]>([]);

  // Caricamento dati iniziali
  useEffect(() => {
    if (!isOpen || !ddtId) {
      setDoc(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const loaded = await ddtRepository.getDdtById(ddtId);
        if (!isMounted) return;
        if (!loaded) {
          setError("Documento non trovato.");
          return;
        }

        setDoc(loaded);
        setDocNumber(loaded.doc_number ? String(loaded.doc_number) : "");
        setDocDate(loaded.doc_date || "");
        setClientName(loaded.client_name || "");
        setDestinationName(loaded.destination_name || "");
        setDestinationAddress(loaded.destination_address || "");
        setOrderReference(loaded.order_reference || "");
        setTransportReason(loaded.transport_reason || "Vendita");
        setCarriageTerms(loaded.carriage_terms || "Franco stabilimento");
        setGoodsAppearance(loaded.goods_appearance || "A vista");
        setCarrier(loaded.carrier || "Nessuno");

        // Popolamento righe
        const initialRows: EditableRow[] = (loaded.items || []).map((it, idx) => ({
          id: it.id || crypto.randomUUID(),
          row_index: it.row_index || idx + 1,
          description: it.description || "",
          quantity: it.quantity ? String(it.quantity) : "1",
          unit: it.unit || "PZ",
          unit_price: it.unit_price ? it.unit_price.formatIT(false, 2, 2) : "0,00",
          discount_pct: it.discount_pct ? String(it.discount_pct) : "",
          vat_rate: it.vat_rate !== undefined && it.vat_rate !== null ? String(it.vat_rate) : "22",
          purchase_price: it.purchase_price ? it.purchase_price.formatIT(false, 2, 2) : "",
        }));

        setRows(initialRows.length > 0 ? initialRows : [createEmptyRow(1)]);
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Errore caricamento DDT in Mini Studio:", err);
        setError("Impossibile caricare il documento.");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, ddtId]);

  // Gestione tasto Escape per chiusura immediata
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const createEmptyRow = (index: number): EditableRow => ({
    id: crypto.randomUUID(),
    row_index: index,
    description: "",
    quantity: "1",
    unit: "PZ",
    unit_price: "0,00",
    discount_pct: "",
    vat_rate: "22",
    purchase_price: "",
  });

  const handleAddRow = () => {
    setRows((prev) => [...prev, createEmptyRow(prev.length + 1)]);
  };

  const handleRemoveRow = (index: number) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((r, i) => ({ ...r, row_index: i + 1 }));
    });
  };

  const handleUpdateRow = (index: number, field: keyof EditableRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Calcolo Totali live in tempo reale
  const totals = useMemo(() => {
    let totImponibile = money(0);
    let totIva = money(0);

    for (const r of rows) {
      if (!r.description.trim()) continue;
      const cleanPrice = r.unit_price.replace("€", "").trim();
      const { netAmount, vatAmount } = calculateRowAmounts(
        r.quantity,
        cleanPrice,
        r.discount_pct,
        r.vat_rate
      );
      totImponibile = totImponibile.plus(netAmount);
      totIva = totIva.plus(vatAmount);
    }

    const totDoc = totImponibile.plus(totIva);
    return {
      imponibile: totImponibile.formatIT2(true),
      iva: totIva.formatIT2(true),
      totale: totDoc.formatIT2(true),
    };
  }, [rows]);

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    setError("");

    try {
      // 1. Prepara Documento parziale
      const updatedDoc: Partial<DdtDocument> = {
        ...doc,
        doc_number: docNumber.trim() ? parseInt(docNumber.trim(), 10) : doc.doc_number,
        doc_date: docDate,
        client_name: clientName.trim(),
        destination_name: destinationName.trim() || undefined,
        destination_address: destinationAddress.trim() || undefined,
        order_reference: orderReference.trim() || undefined,
        transport_reason: transportReason.trim(),
        carriage_terms: carriageTerms.trim(),
        goods_appearance: goodsAppearance.trim(),
        carrier: carrier.trim(),
      };

      // 2. Prepara Righe parziali
      const validRows = rows.filter((r) => r.description.trim().length > 0);
      const updatedItems: Partial<DdtItem>[] = validRows.map((r, idx) => {
        const cleanPrice = r.unit_price.replace("€", "").trim();
        const p = safeMoney(cleanPrice);
        const { netAmount } = calculateRowAmounts(
          r.quantity,
          cleanPrice,
          r.discount_pct,
          r.vat_rate
        );

        return {
          id: r.id,
          ddt_id: doc.id,
          row_index: idx + 1,
          row_kind: "item",
          description: r.description.trim(),
          unit: r.unit.trim() || "PZ",
          quantity: r.quantity.trim() || "1",
          unit_price: p,
          discount_pct: r.discount_pct.trim() || "",
          vat_rate: parseFloat(r.vat_rate.replace(",", ".")) || 0,
          net_amount: netAmount,
          purchase_price: safeMoney(r.purchase_price),
        };
      });

      // 3. Salva su SQLite e prepara sincronizzazione
      await ddtRepository.saveDraft(updatedDoc, updatedItems);

      onSaved();
      onClose();
    } catch (err: any) {
      console.error("Errore salvataggio modifiche DDT:", err);
      setError(err?.message || "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none overflow-hidden"
      onClick={onClose}
    >
      <div
        className="bg-[#0f172a] border border-[#1e3a5f] rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl h-[88vh] text-white relative animate-in zoom-in-95 duration-150 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modale */}
        <div className="px-5 py-3.5 border-b border-[#1e3a5f] bg-[#1e293b]/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold text-sm">
              DDT
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>DDT {docNumber || "Bozza"}</span>
                <span className="text-slate-400 text-xs font-normal">del {docDate}</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                  {clientName}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Modifica rapida testata, articoli e numero d'ordine (Premi Esc per uscire senza salvare)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 transition-colors cursor-pointer"
            >
              Annulla (Esc)
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loading}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 shadow-md shadow-emerald-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvataggio...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Salva Modifiche</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
              title="Chiudi (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corpo Centrale Scrollabile */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            <span className="text-xs">Caricamento documento in corso...</span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3.5">
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* SEZIONE 1: TESTATA EDITABILE */}
            <div className="bg-[#1e293b]/60 border border-slate-700/60 rounded-xl p-3 shrink-0 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* Rif. Ordine (In evidenza) */}
              <div className="col-span-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Riferimento Ordine (OR) *
                </label>
                <input
                  type="text"
                  placeholder="Es. 4500125437 del 05.10.2026"
                  value={orderReference}
                  onChange={(e) => setOrderReference(e.target.value)}
                  className="w-full bg-[#0f172a] border border-emerald-500/40 rounded px-2.5 py-1 text-xs text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
              </div>

              {/* Data Documento */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Data Documento
                </label>
                <input
                  type="date"
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Destinazione / Consegna */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Destinazione Consegna
                </label>
                <input
                  type="text"
                  placeholder="Es. CV2, ROGIO, Salanetti"
                  value={destinationAddress || destinationName}
                  onChange={(e) => {
                    setDestinationAddress(e.target.value);
                    setDestinationName(e.target.value);
                  }}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Causale Trasporto */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Causale Trasporto
                </label>
                <input
                  type="text"
                  value={transportReason}
                  onChange={(e) => setTransportReason(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Porto */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Porto
                </label>
                <input
                  type="text"
                  value={carriageTerms}
                  onChange={(e) => setCarriageTerms(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Vettore */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Vettore
                </label>
                <input
                  type="text"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Aspetto Beni */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Aspetto Beni
                </label>
                <input
                  type="text"
                  value={goodsAppearance}
                  onChange={(e) => setGoodsAppearance(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* SEZIONE 2: GRIGLIA ARTICOLI EDITABILE */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#1e293b]/40 border border-slate-700/60 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-[#1e293b]/80 border-b border-slate-700 flex items-center justify-between shrink-0">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Righe Articoli / Prestazioni ({rows.filter((r) => r.description.trim()).length})
                </span>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Aggiungi Riga</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-[#0f172a] border-b border-slate-700 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="py-2 px-2 w-8 text-center">#</th>
                      <th className="py-2 px-3">Descrizione Articolo / Prestazione *</th>
                      <th className="py-2 px-2 w-20 text-center">Q.tà</th>
                      <th className="py-2 px-2 w-16 text-center">U.M.</th>
                      <th className="py-2 px-2 w-24 text-right">Prezzo €</th>
                      <th className="py-2 px-2 w-20 text-center">Sc. %</th>
                      <th className="py-2 px-2 w-24 text-right">Importo €</th>
                      <th className="py-2 px-2 w-16 text-center">IVA %</th>
                      <th className="py-2 px-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rows.map((row, idx) => {
                      const cleanPrice = row.unit_price.replace("€", "").trim();
                      const { netAmount } = calculateRowAmounts(
                        row.quantity,
                        cleanPrice,
                        row.discount_pct,
                        row.vat_rate
                      );

                      return (
                        <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-1.5 px-2 text-center text-slate-500 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) => handleUpdateRow(idx, "description", e.target.value)}
                              placeholder="Inserisci descrizione..."
                              className="w-full bg-[#0f172a] border border-slate-700/80 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.quantity}
                              onChange={(e) => handleUpdateRow(idx, "quantity", e.target.value)}
                              className="w-full bg-[#0f172a] border border-slate-700/80 rounded px-1.5 py-1 text-xs text-center text-white focus:outline-none focus:border-blue-500 font-mono"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.unit}
                              onChange={(e) => handleUpdateRow(idx, "unit", e.target.value)}
                              className="w-full bg-[#0f172a] border border-slate-700/80 rounded px-1 py-1 text-xs text-center text-white focus:outline-none focus:border-blue-500"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.unit_price}
                              onChange={(e) => handleUpdateRow(idx, "unit_price", e.target.value)}
                              className="w-full bg-[#0f172a] border border-slate-700/80 rounded px-2 py-1 text-xs text-right text-white focus:outline-none focus:border-blue-500 font-mono"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.discount_pct}
                              onChange={(e) => handleUpdateRow(idx, "discount_pct", e.target.value)}
                              placeholder="0"
                              className="w-full bg-[#0f172a] border border-slate-700/80 rounded px-1 py-1 text-xs text-center text-amber-300 focus:outline-none focus:border-blue-500 font-mono"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-200">
                            {netAmount.formatIT2(true)}
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.vat_rate}
                              onChange={(e) => handleUpdateRow(idx, "vat_rate", e.target.value)}
                              className="w-full bg-[#0f172a] border border-slate-700/80 rounded px-1 py-1 text-xs text-center text-white focus:outline-none focus:border-blue-500 font-mono"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(idx)}
                              disabled={rows.length <= 1}
                              className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-20 cursor-pointer"
                              title="Elimina riga"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SEZIONE 3: FOOTER TOTALI LIVE */}
            <div className="bg-[#1e293b]/70 border border-slate-700/60 rounded-xl p-3 shrink-0 flex items-center justify-between text-xs">
              <div className="text-slate-400 text-[11px]">
                Totali calcolati automaticamente ad ogni modifica
              </div>
              <div className="flex items-center gap-6 font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Imponibile:</span>
                  <span className="font-bold text-white text-sm">{totals.imponibile}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">IVA:</span>
                  <span className="font-bold text-white text-sm">{totals.iva}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-lg">
                  <span className="text-emerald-400 font-bold">Totale DDT:</span>
                  <span className="font-black text-emerald-300 text-base">{totals.totale}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
