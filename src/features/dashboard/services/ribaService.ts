import { supabaseFetch } from "@/shared/services/supabaseSession";
import { invoke } from "@tauri-apps/api/core";
import { getEmailSettings } from "@/features/settings/emailSettingsRepository";
import { createCachedSupabaseConfigLoader } from "@/shared/services/supabaseConfigCache";
import { getDatabase } from "@/shared/data-layer/database";

export interface RibaDeadlineInfo {
  deadlineDate: Date;
  deadlineStr: string; // "DD/MM/YYYY"
  deadlineKey: string; // "riba_DD_MM_YYYY"
  daysToDeadline: number;
  isPaid: boolean;
  sentAt?: string;
}

export interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
}

export const getSupabaseCredentials = createCachedSupabaseConfigLoader("ribaService");

/**
 * Calcola la prossima scadenza Ri.Ba. a partire da una data di riferimento (default: oggi).
 * Le scadenze avvengono il 10 del mese e l'ultimo giorno del mese (fine mese).
 */
export function calculateNextRibaDeadline(baseDate: Date = new Date()): {
  deadlineDate: Date;
  deadlineStr: string;
  deadlineKey: string;
  daysToDeadline: number;
} {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const todayStart = new Date(year, month, baseDate.getDate(), 0, 0, 0, 0);

  const candidateDates: Date[] = [];

  for (let offset = 0; offset <= 3; offset++) {
    const curYear = year + Math.floor((month + offset) / 12);
    const curMonth = (month + offset) % 12;

    // 10 del mese (fine giornata)
    candidateDates.push(new Date(curYear, curMonth, 10, 23, 59, 59, 999));

    // Ultimo giorno del mese (giorno 0 del mese successivo)
    candidateDates.push(new Date(curYear, curMonth + 1, 0, 23, 59, 59, 999));
  }

  // Trova la prima scadenza maggiore o uguale ad oggi
  let chosenDate = candidateDates[0];
  for (const candidate of candidateDates) {
    if (candidate.getTime() >= todayStart.getTime()) {
      chosenDate = candidate;
      break;
    }
  }

  const dDay = String(chosenDate.getDate()).padStart(2, "0");
  const dMonth = String(chosenDate.getMonth() + 1).padStart(2, "0");
  const dYear = chosenDate.getFullYear();

  const deadlineStr = `${dDay}/${dMonth}/${dYear}`;
  const deadlineKey = `riba_${dDay}_${dMonth}_${dYear}`;

  const chosenStart = new Date(chosenDate.getFullYear(), chosenDate.getMonth(), chosenDate.getDate(), 0, 0, 0, 0);
  const diffMs = chosenStart.getTime() - todayStart.getTime();
  const daysToDeadline = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return {
    deadlineDate: chosenDate,
    deadlineStr,
    deadlineKey,
    daysToDeadline,
  };
}

export interface RemoteRibaRecord {
  deadline_key: string;
  deadline_date: string;
  is_paid: boolean;
  sent_at: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Recupera lo stato del pagamento per una determinata scadenza direttamente da Supabase.
 */
export async function fetchRemoteRibaStatus(
  deadlineKey: string
): Promise<{ isPaid: boolean; sentAt?: string } | null> {
  try {
    const creds = await getSupabaseCredentials();
    if (!creds) return null;

    const url = `${creds.projectUrl}/rest/v1/riba_pagamenti?deadline_key=eq.${encodeURIComponent(deadlineKey)}&select=*`;
    const res = await supabaseFetch(url, {
      method: "GET",
      headers: {
        apikey: creds.anonKey,
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        console.warn("[ribaService] Tabella riba_pagamenti non ancora creata su Supabase.");
      }
      return null;
    }

    const data: RemoteRibaRecord[] = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0]) {
      const item = data[0];
      return {
        isPaid: !!item.is_paid,
        sentAt: item.sent_at,
      };
    }

    return { isPaid: false };
  } catch (err) {
    console.warn("[ribaService] Errore connessione Supabase fetchRemoteRibaStatus:", err);
    return null;
  }
}

const LOCAL_RIBA_PREFIX = "riba_paid_status_v1_";

export function getLocalRibaStatus(
  deadlineKey: string
): { isPaid: boolean; sentAt?: string } | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(`${LOCAL_RIBA_PREFIX}${deadlineKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { isPaid?: boolean; sentAt?: string };
    if (parsed && parsed.isPaid) {
      return { isPaid: true, sentAt: parsed.sentAt };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLocalRibaPaid(
  deadlineKey: string,
  deadlineStr: string,
  sentAt: string
): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(
      `${LOCAL_RIBA_PREFIX}${deadlineKey}`,
      JSON.stringify({
        deadlineKey,
        deadlineStr,
        isPaid: true,
        sentAt,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export async function getSqliteRibaStatus(
  deadlineKey: string
): Promise<{ isPaid: boolean; sentAt?: string } | null> {
  try {
    const db = await getDatabase();
    const rows = await db.select<Array<{ value: string }>>(
      "SELECT value FROM app_preferences WHERE key = $1 LIMIT 1",
      [`${LOCAL_RIBA_PREFIX}${deadlineKey}`]
    );
    if (!rows.length || !rows[0]?.value) return null;
    const parsed = JSON.parse(rows[0].value) as { isPaid?: boolean; sentAt?: string };
    if (parsed && parsed.isPaid) {
      return { isPaid: true, sentAt: parsed.sentAt };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveSqliteRibaPaid(
  deadlineKey: string,
  deadlineStr: string,
  sentAt: string
): Promise<boolean> {
  try {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const payload = JSON.stringify({
      deadlineKey,
      deadlineStr,
      isPaid: true,
      sentAt,
    });
    const result = await db.execute(
      `INSERT INTO app_preferences (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [`${LOCAL_RIBA_PREFIX}${deadlineKey}`, payload, now]
    );
    return result.rowsAffected === 1;
  } catch {
    return false;
  }
}

/**
 * Salva lo stato "PAGATA" della scadenza Ri.Ba. in locale e su Supabase.
 */
export async function saveRemoteRibaPaid(
  deadlineKey: string,
  deadlineStr: string,
  sentAt: string
): Promise<boolean> {
  try {
    const creds = await getSupabaseCredentials();
    if (!creds) return false;

    const row = {
      deadline_key: deadlineKey,
      deadline_date: deadlineStr,
      is_paid: true,
      sent_at: new Date(sentAt).toISOString(),
      updated_at: new Date().toISOString(),
    };

    const url = `${creds.projectUrl}/rest/v1/riba_pagamenti?on_conflict=deadline_key`;
    const res = await supabaseFetch(url, {
      method: "POST",
      headers: {
        apikey: creds.anonKey,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[ribaService] Errore salvataggio Supabase (${res.status}):`, errText);
      return false;
    }

    const rows = await res.json();
    return Array.isArray(rows) && rows.length === 1 && rows[0]?.deadline_key === deadlineKey && rows[0]?.is_paid === true;
  } catch (err) {
    console.warn("[ribaService] Errore rete saveRemoteRibaPaid:", err);
    return false;
  }
}

export async function registerRibaPayment(deadlineKey: string, deadlineStr: string, sentAt: string) {
  const cached = saveLocalRibaPaid(deadlineKey, deadlineStr, sentAt);
  const [sqlite, remote] = await Promise.all([
    saveSqliteRibaPaid(deadlineKey, deadlineStr, sentAt),
    saveRemoteRibaPaid(deadlineKey, deadlineStr, sentAt),
  ]);
  return { confirmed: cached || sqlite || remote, remote };
}

/**
 * Prepara l'email di autorizzazione banca e la visualizza tramite Outlook (Tauri command).
 */
export async function openRibaEmailDraft(info: {
  deadlineStr: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = await getEmailSettings();
    const to = settings.bank_to.trim();
    const cc = settings.bank_cc.trim();

    if (!to) {
      return {
        success: false,
        error: "Nessun indirizzo email configurato per la banca. Vai in Impostazioni per configurarlo.",
      };
    }
    const subject = `Autorizzazione pagamento Ri.Ba. scadenza ${info.deadlineStr}`;

    const bodyHtml = `
      <div style="font-family: Segoe UI, Arial, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.5;">
        <p>Buongiorno,</p>
        <p>Si prega di autorizzare il pagamento delle <strong>Ri.Ba.</strong> in scadenza il <strong>${info.deadlineStr}</strong>.</p>
        <br/>
        <p>Cordiali saluti,<br/><strong>Brico Class</strong></p>
      </div>
    `.trim();

    await invoke("send_email_with_attachments", {
      to,
      cc: cc || null,
      subject,
      body: bodyHtml,
      attachments: [],
    });

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ribaService] Errore openRibaEmailDraft:", msg);
    return { success: false, error: msg };
  }
}

