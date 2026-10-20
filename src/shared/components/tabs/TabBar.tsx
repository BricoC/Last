import React from "react";
import { useTabStore } from "@/shared/stores/useTabStore";
import { X, Columns, Plus } from "lucide-react";
import { cn } from "@/shared/utils/cn";

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, isSplit, splitTabId, setActiveTab, closeTab, toggleSplit, openTab } = useTabStore();

  return (
    <div className="h-10 border-b border-[var(--border)] bg-slate-950 flex items-center px-2 select-none justify-between">
      {/* Schede aperte */}
      <div className="flex items-center space-x-1 overflow-x-auto flex-1 h-full pt-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isSecondarySplit = isSplit && tab.id === splitTabId;

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "group relative h-9 px-3 flex items-center space-x-2 text-xs font-medium rounded-t-[var(--radius)] cursor-pointer transition-all border-t-2",
                isActive
                  ? "bg-[var(--card)] text-white border-t-[var(--primary)]"
                  : isSecondarySplit
                  ? "bg-slate-900 text-blue-300 border-t-blue-400"
                  : "bg-transparent text-slate-400 hover:bg-slate-900 border-t-transparent hover:text-slate-200"
              )}
            >
              <span className="truncate max-w-[140px]">{tab.title}</span>

              {isSecondarySplit && (
                <span className="text-[10px] px-1 bg-blue-950 text-blue-400 rounded">split</span>
              )}

              {tab.closable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="p-0.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        {/* Pulsante rapido per aprire una nuova tab di test */}
        <button
          type="button"
          onClick={() =>
            openTab({
              id: `tab-${Date.now()}`,
              title: `Nuova Scheda`,
              componentId: "demo",
            })
          }
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors ml-1"
          title="Apri nuova scheda"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Controlli layout (Split-Screen toggle) */}
      <div className="flex items-center space-x-2 pl-2">
        <button
          type="button"
          onClick={() => toggleSplit()}
          className={cn(
            "p-1.5 rounded flex items-center space-x-1 text-xs transition-colors",
            isSplit
              ? "bg-[var(--primary)] text-white"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          )}
          title={isSplit ? "Chiudi affiancamento schermate" : "Affianca una scheda"}
        >
          <Columns className="w-4 h-4" />
          <span className="hidden md:inline">{isSplit ? "Singola" : "Affianca"}</span>
        </button>
      </div>
    </div>
  );
};
