type OpenDdtListener = (ddtId: string) => void;

const EVENT_NAME = "last:ddt-open-request";
let pendingDdtId: string | null = null;

export function requestOpenDdt(ddtId: string): void {
  pendingDdtId = ddtId;
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeToOpenDdt(listener: OpenDdtListener): () => void {
  const consume = () => {
    if (!pendingDdtId) return;
    const id = pendingDdtId;
    pendingDdtId = null;
    listener(id);
  };
  window.addEventListener(EVENT_NAME, consume);
  consume();
  return () => window.removeEventListener(EVENT_NAME, consume);
}
