import { useEffect, useRef } from "react";

type CloseHandler = () => void;

// Stack LIFO globale per gestire la chiusura in cascata dei modal con il tasto ESC
const modalStack: CloseHandler[] = [];

if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalStack.length > 0) {
        // Blocca la propagazione a qualsiasi altro listener
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Estrae ed esegue SOLO l'ultimo modal aperto (in cima allo stack)
        const topHandler = modalStack.pop();
        if (topHandler) {
          topHandler();
        }
      }
    },
    { capture: true } // La fase di capture intercetta il tasto prima di chiunque altro
  );
}

/**
 * Hook che registra un modal nello stack LIFO.
 * Alla pressione di ESC, chiude solo l'ultimo modal aperto in cascata.
 */
export function useEscClose(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const handler: CloseHandler = () => {
      onCloseRef.current();
    };

    modalStack.push(handler);

    return () => {
      const idx = modalStack.lastIndexOf(handler);
      if (idx !== -1) {
        modalStack.splice(idx, 1);
      }
    };
  }, [isOpen]);
}

