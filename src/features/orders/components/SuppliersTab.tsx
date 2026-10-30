import React, { useState, useMemo, useCallback } from "react";
import { Supplier, OrderItem } from "@/features/orders/types/order";
import { orderRepository } from "@/features/orders/services/orderRepository";
import { orderEmailService } from "@/features/orders/services/orderEmailService";
import { getFornitoreColor } from "@/features/orders/utils/constants";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  Plus,
  Trash2,
  Search,
  Send,
  X,
  Edit2,
} from "lucide-react";

interface SuppliersTabProps {
  suppliers: Supplier[];
  currentUser?: string;
  onRefreshSuppliers: () => void;
  onRefreshOrders?: () => void;
}

export const SuppliersTab: React.FC<SuppliersTabProps> = ({
  suppliers,
  currentUser = "Operatore",
  onRefreshSuppliers,
  onRefreshOrders,
}) => {
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [pendingOrders, setPendingOrders] = useState<OrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formRep, setFormRep] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formVat, setFormVat] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadPendingOrdersForSupplier = useCallback(async (supplierName: string) => {
    setLoadingOrders(true);
    try {
      const active = await orderRepository.getOrders("attivi");
      const filtered = active.filter(
        (o: OrderItem) =>
          (o.supplier_name || "").trim().toLowerCase() === supplierName.trim().toLowerCase() &&
          !o.ordered_date
      );
      setPendingOrders(filtered);
    } catch {
      setPendingOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const handleSelectSupplier = (sup: Supplier) => {
    setSelectedSupplier(sup);
    void loadPendingOrdersForSupplier(sup.name);
  };

  const handleOpenAddModal = (sup?: Supplier) => {
    if (sup) {
      setEditingSupplier(sup);
      setFormName(sup.name || "");
      setFormRep(sup.representative || "");
      setFormEmail(sup.email || "");
      setFormPhone(sup.phone || "");
      setFormAddress(sup.address || "");
      setFormVat(sup.vat_number || "");
      setFormNotes(sup.notes || "");
    } else {
      setEditingSupplier(null);
      setFormName("");
      setFormRep("");
      setFormEmail("");
      setFormPhone("");
      setFormAddress("");
      setFormVat("");
      setFormNotes("");
    }
    setShowAddModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast("Il nome dell'azienda è obbligatorio");
      return;
    }

    const id = editingSupplier?.id || "sup_" + Date.now();
    try {
      await orderRepository.upsertSupplier(
        {
          id,
          name: formName.trim(),
          representative: formRep.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim(),
          address: formAddress.trim(),
          vat_number: formVat.trim(),
          notes: formNotes.trim(),
        },
        currentUser
      );

      setShowAddModal(false);
      onRefreshSuppliers();
      showToast(editingSupplier ? "Fornitore aggiornato!" : "Fornitore aggiunto con successo!");
    } catch {
      showToast("Errore durante il salvataggio del fornitore");
    }
  };

  const handleDeleteSupplier = async (id: string, name: string) => {
    if (window.confirm(`Eliminare il fornitore "${name}"?`)) {
      await orderRepository.deleteSupplier(id, currentUser);
      if (selectedSupplier?.id === id) {
        setSelectedSupplier(null);
      }
      onRefreshSuppliers();
      showToast("Fornitore eliminato");
    }
  };

  const handleSendOrderFromCard = async () => {
    if (!selectedSupplier || pendingOrders.length === 0) return;

    const res = await orderEmailService.sendOrderEmail({
      supplierName: selectedSupplier.name,
      items: pendingOrders,
      supplier: selectedSupplier,
      currentUser,
    });

    if (res.success) {
      showToast(`Ordine inviato con successo a ${selectedSupplier.name}!`);
      void loadPendingOrdersForSupplier(selectedSupplier.name);
      if (onRefreshOrders) onRefreshOrders();
    } else {
      showToast(`Errore invio ordine: ${res.error}`);
    }
  };

  const filteredSuppliers = useMemo(() => {
    if (!searchText.trim()) return suppliers;
    const q = searchText.toLowerCase().trim();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.representative && s.representative.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q))
    );
  }, [suppliers, searchText]);

  return (
    <div className="flex h-full w-full select-none text-[var(--foreground)] bg-[var(--background)]">
      {/* Colonna Sinistra: Lista Fornitori */}
      <div className="w-1/2 flex flex-col border-r border-[var(--border)] bg-[var(--card)]">
        {/* Toolbar Fornitori */}
        <div className="p-3 border-b border-[var(--border)] flex items-center justify-between gap-2 bg-[var(--background)]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--muted-foreground)] pointer-events-none" />
            <input
              type="text"
              placeholder="Cerca fornitore o referente..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--primary)] font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            {toastMessage && (
              <span className="px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                {toastMessage}
              </span>
            )}
            <button
              onClick={() => handleOpenAddModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer shadow-xs transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuovo Fornitore</span>
            </button>
          </div>
        </div>

        {/* Lista Elenco */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
          {filteredSuppliers.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
              Nessun fornitore trovato.
            </div>
          ) : (
            filteredSuppliers.map((sup) => {
              const color = getFornitoreColor(sup.name);
              const isSelected = selectedSupplier?.id === sup.id;

              return (
                <div
                  key={sup.id || sup.name}
                  onClick={() => handleSelectSupplier(sup)}
                  className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[var(--accent)]/15 border-l-4 border-[var(--primary)]"
                      : "hover:bg-[var(--background)]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      style={{
                        backgroundColor: color?.bg || "rgba(59,130,246,0.15)",
                        color: color?.text || "#93c5fd",
                        borderColor: color?.border || "#3b82f6",
                      }}
                      className="w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-xs flex-shrink-0"
                    >
                      {sup.name.substring(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-[var(--foreground)] truncate">
                        {sup.name}
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)] truncate flex items-center gap-2">
                        {sup.representative && <span>{sup.representative}</span>}
                        {sup.email && (
                          <span className="flex items-center gap-0.5">
                            <Mail className="w-2.5 h-2.5" />
                            {sup.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenAddModal(sup)}
                      className="p-1 rounded hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      title="Modifica"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                      className="p-1 rounded hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-400"
                      title="Elimina"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Colonna Destra: Dettagli Fornitore & Ordini in sospeso */}
      <div className="w-1/2 flex flex-col bg-[var(--background)]">
        {selectedSupplier ? (
          <div className="flex flex-col h-full overflow-y-auto p-5 space-y-5">
            {/* Scheda Anagrafica */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 shadow-xs">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">
                    {selectedSupplier.name}
                  </h3>
                  {selectedSupplier.representative && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      Referente: <strong className="text-[var(--foreground)]">{selectedSupplier.representative}</strong>
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleOpenAddModal(selectedSupplier)}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--border)] transition-colors"
                >
                  Modifica Scheda
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-[var(--border)] text-xs">
                <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                  <Mail className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[var(--foreground)] font-medium">
                    {selectedSupplier.email || "Nessuna email registrata"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[var(--foreground)] font-medium">
                    {selectedSupplier.phone || "Nessun recapito"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                  <MapPin className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-[var(--foreground)] font-medium">
                    {selectedSupplier.address || "Indirizzo non inserito"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                  <FileText className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[var(--foreground)] font-medium">
                    {selectedSupplier.vat_number ? `P.IVA: ${selectedSupplier.vat_number}` : "P.IVA non inserita"}
                  </span>
                </div>
              </div>

              {selectedSupplier.notes && (
                <div className="mt-3 p-2.5 rounded bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  <strong>Note:</strong> {selectedSupplier.notes}
                </div>
              )}
            </div>

            {/* Sezione Ordini in Sospeso per questo Fornitore */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 shadow-xs flex-1 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[var(--primary)]" />
                  <h4 className="text-xs font-bold text-[var(--foreground)]">
                    Materiale da Ordinare ({pendingOrders.length} articol{pendingOrders.length === 1 ? "o" : "i"})
                  </h4>
                </div>

                {pendingOrders.length > 0 && (
                  <button
                    onClick={handleSendOrderFromCard}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-blue-600 text-white hover:bg-blue-500 shadow-xs cursor-pointer transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Invia Ordine Adesso</span>
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)] mt-2">
                {loadingOrders ? (
                  <div className="p-6 text-center text-xs text-[var(--muted-foreground)]">
                    Caricamento ordini in sospeso...
                  </div>
                ) : pendingOrders.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--muted-foreground)]">
                    Nessun articolo in attesa per questo fornitore.
                  </div>
                ) : (
                  pendingOrders.map((ord) => (
                    <div key={ord.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-mono font-bold text-[var(--foreground)]">
                          {ord.article_code}
                        </div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">
                          {ord.description}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[var(--foreground)]">
                          Qtà: {ord.quantity || "1"}
                        </div>
                        {ord.price && (
                          <div className="text-[11px] text-emerald-400 font-mono">
                            € {ord.price}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-[var(--muted-foreground)]">
            <Building2 className="w-12 h-12 mb-3 opacity-30" />
            <h3 className="text-sm font-bold text-[var(--foreground)]">Nessun fornitore selezionato</h3>
            <p className="text-xs max-w-xs mt-1">
              Seleziona un fornitore dalla lista a sinistra per visualizzarne la scheda e inviare gli ordini.
            </p>
          </div>
        )}
      </div>

      {/* Modal Aggiunta/Modifica Fornitore */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[9999] p-4">
          <form
            onSubmit={handleSaveSupplier}
            className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
              <h3 className="text-sm font-bold text-[var(--foreground)]">
                {editingSupplier ? "Modifica Fornitore" : "Nuovo Fornitore"}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block text-[var(--muted-foreground)] mb-1 font-semibold">
                  Ragione Sociale / Nome Fornitore *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Es: Arexons, Knipex, Siliconi..."
                  className="w-full px-3 py-1.5 bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--primary)] font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--muted-foreground)] mb-1 font-semibold">
                    Referente / Agente
                  </label>
                  <input
                    type="text"
                    value={formRep}
                    onChange={(e) => setFormRep(e.target.value)}
                    placeholder="Nome e cognome"
                    className="w-full px-3 py-1.5 bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--muted-foreground)] mb-1 font-semibold">
                    Email per Ordini
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="ordini@fornitore.it"
                    className="w-full px-3 py-1.5 bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--muted-foreground)] mb-1 font-semibold">
                    Telefono
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="Numero di telefono"
                    className="w-full px-3 py-1.5 bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--muted-foreground)] mb-1 font-semibold">
                    Partita IVA / Cod. Fiscale
                  </label>
                  <input
                    type="text"
                    value={formVat}
                    onChange={(e) => setFormVat(e.target.value)}
                    placeholder="P.IVA"
                    className="w-full px-3 py-1.5 bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[var(--muted-foreground)] mb-1 font-semibold">
                  Indirizzo Sede
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Via, Città, CAP"
                  className="w-full px-3 py-1.5 bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--muted-foreground)] mb-1 font-semibold">
                  Note Interne
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Note, orari di apertura, porto franco..."
                  className="w-full px-3 py-1.5 bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--primary)] resize-none"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--background)] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[var(--card)] hover:bg-[var(--border)] text-[var(--foreground)]"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[var(--primary)] text-white hover:opacity-90"
              >
                Salva Fornitore
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
