import type { Dispatch, SetStateAction } from "react";
import { DDTQuickViewModal } from "./DDTQuickViewModal";
import { DDTEmailSendModal } from "./DDTEmailSendModal";
import { formatDdtMoney } from "../services/ddtViewFormatting";
import { requestOpenDdt } from "../services/ddtNavigation";
import { useWindowStore } from "@/shared/stores/useWindowStore";

type Props = {
 selectedDdtId: string | null; setSelectedDdtId: Dispatch<SetStateAction<string | null>>;
 totals: { taxable: number; purchase: number; revenue: number };
 handlePrevQuickDdt: () => void; handleNextQuickDdt: () => void; hasPrevQuickDdt: boolean; hasNextQuickDdt: boolean;
 currentQuickDdtIndex: number; sortedCount: number; isEmailModalOpen: boolean;
 setIsEmailModalOpen: Dispatch<SetStateAction<boolean>>; selectedIds: Set<string>;
};

export function DdtListBottomPanel(props: Props) {
 const { selectedDdtId, setSelectedDdtId, totals, handlePrevQuickDdt, handleNextQuickDdt, hasPrevQuickDdt, hasNextQuickDdt, currentQuickDdtIndex, sortedCount, isEmailModalOpen, setIsEmailModalOpen, selectedIds } = props;
 const openWindow = useWindowStore((state) => state.openWindow);
 return (
   <>
      {/* Footer Totali */}
      <div className="flex h-7 shrink-0 items-center justify-end gap-5 border-t border-[var(--border)] px-2 text-[11px] font-semibold">
        <span>Imponibile {formatDdtMoney(totals.taxable)}</span>
        <span>Acquisto {formatDdtMoney(totals.purchase)}</span>
        <span className={totals.revenue >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
          Ricavo {formatDdtMoney(totals.revenue)}
        </span>
      </div>

      {/* Popup Dati Completi DDT con chiusura rapida Esc */}
      <DDTQuickViewModal
        isOpen={selectedDdtId !== null}
        onClose={() => setSelectedDdtId(null)}
        ddtId={selectedDdtId}
        onOpenInStudio={(id) => {
          requestOpenDdt(id);
          openWindow({ id: "ddt-studio", title: "DDT Studio (Pro)", componentId: "ddt-studio" });
        }}
        onNavigatePrev={handlePrevQuickDdt}
        onNavigateNext={handleNextQuickDdt}
        hasPrev={hasPrevQuickDdt}
        hasNext={hasNextQuickDdt}
        currentIndex={currentQuickDdtIndex}
        totalCount={sortedCount}
      />

      {/* Modale invio email con DDT allegati */}
      <DDTEmailSendModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        selectedDdtIds={Array.from(selectedIds)}
      />
   </>
 );
}
