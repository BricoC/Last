import { invoke } from "@tauri-apps/api/core";
import { getEmailSettings } from "@/features/settings/emailSettingsRepository";

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

interface ConfigStatus {
  config: SupabaseConfig | null;
  configPath: string;
}

let cachedSupabaseConfig: SupabaseConfig | null = null;

export async function getSupabaseCredentials(): Promise<SupabaseConfig | null> {
  if (cachedSupabaseConfig) return cachedSupabaseConfig;
  try {
    const status = await invoke<ConfigStatus>("load_supabase_config");
    if (status?.config?.projectUrl && status?.config?.anonKey) {
      cachedSupabaseConfig = {
        projectUrl: status.config.projectUrl.replace(/\/$/, ""),
        anonKey: status.config.anonKey.trim(),
      };
      return cachedSupabaseConfig;
    }
  } catch (err) {
    console.warn("[ribaService] Impossibile recuperare credenziali Supabase:", err);
  }
  return null;
}

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
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: creds.anonKey,
        Authorization: `Bearer ${creds.anonKey}`,
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

/**
 * Salva lo stato "PAGATA" della scadenza Ri.Ba. esclusivamente su Supabase.
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
      sent_at: sentAt,
      updated_at: new Date().toISOString(),
    };

    const url = `${creds.projectUrl}/rest/v1/riba_pagamenti`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: creds.anonKey,
        Authorization: `Bearer ${creds.anonKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[ribaService] Errore salvataggio Supabase (${res.status}):`, errText);
      return false;
    }

    return true;
  } catch (err) {
    console.warn("[ribaService] Errore rete saveRemoteRibaPaid:", err);
    return false;
  }
}

/**
 * Prepara l'email di autorizzazione banca e la visualizza tramite Outlook (Tauri command).
 * Se l'apertura ha successo, salva immediatamente lo stato pagata su Supabase.
 */
export async function prepareAndSendRibaEmail(info: {
  deadlineStr: string;
  deadlineKey: string;
}): Promise<{ success: boolean; sentAt?: string; error?: string }> {
  try {
    const settings = await getEmailSettings();
    const to = settings.bank_to.trim() || "rachele.neri@bpc.bcc.it";
    const cc = settings.bank_cc.trim() || "capannori@bpc.bcc.it";
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

    // Formattazione data odierna: DD/MM/YYYY ore HH:mm
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const sentAt = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ore ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    // Salvataggio su Supabase
    await saveRemoteRibaPaid(info.deadlineKey, info.deadlineStr, sentAt);

    return { success: true, sentAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ribaService] Errore prepareAndSendRibaEmail:", msg);
    return { success: false, error: msg };
  }
}

