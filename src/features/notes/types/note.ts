export interface NoteRecord {
  id: string;
  supabase_id?: number | null;
  title: string;
  content_html: string;
  content_text: string;
  is_pinned: number; // 0 or 1
  is_archived: number; // 0 or 1
  color?: string; // 'default' | 'amber' | 'blue' | 'emerald' | 'purple' | 'rose'
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  sync_status?: string;
}

export interface TrashNoteRow extends NoteRecord {
  deleted_at: string;
  deleted_by?: string;
}

