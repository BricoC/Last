import React, { useState } from "react";
import { CheckSquare, X, ArrowRight } from "lucide-react";

export type BulkActionType =
  | "var_acq_perc"
  | "var_acq_val"
  | "set_aumento"
  | "set_maga"
  | "var_pub_perc"
  | "var_prof_perc"
  | "var_fatt_perc"
  | "set_perc_fatt"
  | "set_cat"
  | "set_fornitore"
  | "set_iva"
  | "delete";

export interface BulkOperationPayload {
  action: BulkActionType;
  value: string | number;
}

interface BulkEditToolbarProps {
  selectedCount: number;
  totalFilteredCount: number;
  onClearSelection: () => void;
  onSelectAllFiltered: () => void;
  onApplyBulkAction: (payload: BulkOperationPayload) => Promise<void> | void;
}

export const BulkEditToolbar: React.FC<BulkEditToolbarProps> = ({
  selectedCount,
  totalFilteredCount,
  onClearSelection,
  onSelectAllFiltered,
  onApplyBulkAction,
}) => {
  const [selectedAction, setSelectedAction] = useState<BulkActionType>("var_acq_perc");
  const [inputValue, setInputValue] = useState<string>("");
  const [isApplying, setIsApplying] = useState(false);

  if (selectedCount === 0) return null;

  const handleApply = async () => {
    if (selectedAction === "delete") {
      if (!confirm(`Sei sicuro di voler eliminare ${selectedCount} articoli selezionati dal listino?`)) {
        return;
      }
      setIsApplying(true);
      try {
        await onApplyBulkAction({ action: "delete", value: "" });
      } finally {
        setIsApplying(false);
      }
      return;
    }

    if (inputValue.trim() === "") {
      alert("Inserisci un valore da applicare.");
      return;
    }

    setIsApplying(true);
    try {
      const numVal = parseFloat(inputValue.replace(",", "."));
      const finalVal = isNaN(numVal) ? inputValue.trim() : numVal;
      await onApplyBulkAction({ action: selectedAction, value: finalVal });
      setInputValue("");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="bg-indigo-950/80 border-b border-indigo-500/40 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-150 text-indigo-100 shadow-md">
      {/* Selettore e conteggio */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1.5 font-bold text-white bg-indigo-600/40 border border-indigo-400/30 px-2.5 py-1 rounded-md">
          <CheckSquare className="w-4 h-4 text-indigo-300" />
          <span>{selectedCount} selezionati</span>
        </div>

        {selectedCount < totalFilteredCount && (
          <button
            type="button"
            onClick={onSelectAllFiltered}
            className="text-[11px] underline hover:text-white cursor-pointer"
          >
            Seleziona tutti i {totalFilteredCount} filtrati
          </button>
        )}

        <button
          type="button"
          onClick={onClearSelection}
          className="text-[11px] text-indigo-300 hover:text-white flex items-center space-x-1 cursor-pointer"
        >
          <X className="w-3 h-3" />
          <span>Deseleziona</span>
        </button>
      </div>

      {/* Form di applicazione operazione massiva */}
      <div className="flex items-center space-x-2">
        <span className="text-[11px] font-semibold text-indigo-300">Azione Massiva:</span>
        <select
          value={selectedAction}
          onChange={(e) => {
            setSelectedAction(e.target.value as BulkActionType);
            setInputValue("");
          }}
          className="bg-[var(--card)] border border-indigo-500/50 rounded-md px-2 py-1 text-xs text-[var(--foreground)] font-semibold outline-none cursor-pointer"
        >
          <optgroup label="Costi & Maggiorazioni">
            <option value="var_acq_perc">Variazione Costo Acquisto (%) [es. +5, -3]</option>
            <option value="var_acq_val">Variazione Costo Acquisto (€) [es. +1.50]</option>
            <option value="set_aumento">Imposta Aumento (%) per tutti</option>
            <option value="set_maga">Imposta Magazzino (%) per tutti</option>
          </optgroup>
          <optgroup label="Ricarichi & Vendita">
            <option value="set_perc_fatt">Imposta Ricarico Fattura (%) fisso</option>
            <option value="var_fatt_perc">Aumenta/Diminuisci Prezzo Fattura (%)</option>
            <option value="var_pub_perc">Aumenta/Diminuisci Prezzo Pubblico (%)</option>
            <option value="var_prof_perc">Aumenta/Diminuisci Prezzo Prof (%)</option>
          </optgroup>
          <optgroup label="Anagrafica & Altro">
            <option value="set_cat">Assegna Categoria a tutti</option>
            <option value="set_fornitore">Assegna Fornitore a tutti</option>
            <option value="set_iva">Imposta Aliquota IVA (es. 22)</option>
            <option value="delete">Elimina tutti gli articoli selezionati</option>
          </optgroup>
        </select>

        {selectedAction !== "delete" && (
          <input
            type="text"
            list={selectedAction === "set_fornitore" ? "general-suppliers-autocomplete" : undefined}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleApply();
              }
            }}
            placeholder={
              selectedAction.includes("perc")
                ? "Valore % (es. 5 o -3)"
                : selectedAction.includes("val")
                ? "Valore € (es. 1.50)"
                : selectedAction === "set_cat"
                ? "Nome Categoria..."
                : selectedAction === "set_fornitore"
                ? "Nome Fornitore..."
                : selectedAction === "set_iva"
                ? "22 o 10 o 4"
                : "Valore..."
            }
            className="w-36 px-2.5 py-1 text-xs bg-[var(--background)] border border-indigo-500/50 rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-indigo-400 font-mono"
          />
        )}

        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={isApplying}
          className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer shadow-sm ${
            selectedAction === "delete"
              ? "bg-red-600 hover:bg-red-500 text-white"
              : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          <span>{isApplying ? "Applicazione..." : selectedAction === "delete" ? "Elimina Selezionati" : "Applica a tutti"}</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
