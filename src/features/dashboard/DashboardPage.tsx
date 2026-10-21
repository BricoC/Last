import React from "react";
import { useWindowStore } from "@/shared/stores/useWindowStore";
import { Tag, FileSpreadsheet, PlusCircle } from "lucide-react";

export const DashboardPage: React.FC = () => {
  const { openWindow } = useWindowStore();

  return (
    <div className="w-full h-full p-8 flex flex-col items-center justify-center text-center select-none">
      <div className="max-w-md space-y-4">
        {/* Icona e titolo pulito senza dati fittizi */}
        <div className="w-12 h-12 mx-auto rounded-xl bg-[#2c3038] border border-[#3e4350] flex items-center justify-center text-slate-400">
          <PlusCircle className="w-6 h-6" />
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white">Dashboard</h2>
          <p className="text-xs text-slate-400 mt-1">
            Nessun dato attivo. Le metriche e le statistiche verranno generate automaticamente dai movimenti reali.
          </p>
        </div>

        {/* Scorciatoie di apertura rapida moduli */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() =>
              openWindow({
                id: "price-lists",
                title: "Listino Generale",
                componentId: "price-lists",
              })
            }
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#2c3038] border border-[#3e4350] text-xs text-slate-200 hover:text-white hover:bg-[#353a44] transition-colors cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5 text-emerald-400" />
            <span>Apri Listino</span>
          </button>

          <button
            type="button"
            onClick={() =>
              openWindow({
                id: "ddt-studio",
                title: "DDT Studio",
                componentId: "ddt-studio",
              })
            }
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold hover:bg-blue-600 transition-colors shadow-sm cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Nuovo DDT</span>
          </button>
        </div>
      </div>
    </div>
  );
};
