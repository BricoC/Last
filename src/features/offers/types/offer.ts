export type OfferStatus = "Da preparare" | "Inviata" | "In sospeso" | "Aggiornata";

export interface OfferRecord {
  id: string;
  supabase_id?: number | null;
  offer_date: string; // YYYY-MM-DD
  requester: string;
  contact?: string | null;
  items_text: string;
  status: OfferStatus;
  is_urgent: number; // 0 or 1
  is_archived: number; // 0 or 1
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  sync_status: "synced" | "pending" | "error";
}

export interface TrashOfferRow extends OfferRecord {
  deleted_at: string;
  deleted_by?: string;
}

export const OFFER_STATUSES: OfferStatus[] = [
  "Da preparare",
  "Inviata",
  "In sospeso",
  "Aggiornata",
];

export const OFFER_STATUS_STYLES: Record<
  OfferStatus,
  {
    bg: string;
    text: string;
    border: string;
    dot: string;
    badgeClass: string;
  }
> = {
  "Da preparare": {
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-400",
    badgeClass: "bg-red-950/60 text-red-400 border-red-500/30",
  },
  "Inviata": {
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
    badgeClass: "bg-emerald-950/60 text-emerald-400 border-emerald-500/30",
  },
  "In sospeso": {
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
    badgeClass: "bg-amber-950/60 text-amber-400 border-amber-500/30",
  },
  "Aggiornata": {
    bg: "bg-purple-500/15",
    text: "text-purple-400",
    border: "border-purple-500/30",
    dot: "bg-purple-400",
    badgeClass: "bg-purple-950/60 text-purple-400 border-purple-500/30",
  },
};

