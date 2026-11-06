import type Database from "@tauri-apps/plugin-sql";

export async function migrateEmailSettingsSchemaV20(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS email_settings (
      id TEXT PRIMARY KEY,
      carrara_to TEXT NOT NULL DEFAULT '',
      carrara_cc TEXT NOT NULL DEFAULT '',
      wepa_salanetti_to TEXT NOT NULL DEFAULT '',
      wepa_salanetti_cc TEXT NOT NULL DEFAULT '',
      wepa_ralletta_to TEXT NOT NULL DEFAULT '',
      wepa_ralletta_cc TEXT NOT NULL DEFAULT '',
      bank_to TEXT NOT NULL DEFAULT '',
      bank_cc TEXT NOT NULL DEFAULT '',
      accountant_to TEXT NOT NULL DEFAULT '',
      accountant_cc TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );
  `);

  const existing = await db.select<{ id: string }[]>(
    "SELECT id FROM email_settings WHERE id = 'email_config'"
  );
  if (existing.length === 0) {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO email_settings (
        id, carrara_to, carrara_cc, wepa_salanetti_to, wepa_salanetti_cc,
        wepa_ralletta_to, wepa_ralletta_cc, bank_to, bank_cc,
        accountant_to, accountant_cc,
        created_at, updated_at, updated_by, deleted_at, sync_status
      ) VALUES (
        'email_config',
        'alessio.piccinini@cartierecarrara.com',
        'federica.bianchi@cartierecarrara.com',
        'Roberto.Lazzareschi@wepa.eu',
        'Massimiliano.Giusti@wepa.eu',
        'Davide.Petrucci@wepa.eu',
        'Massimiliano.Giusti@wepa.eu',
        'rachele.neri@bpc.bcc.it',
        'capannori@bpc.bcc.it',
        'contabilita@studiotaddeucci.it',
        '',
        $1, $1, 'system', NULL, 'pending'
      )`,
      [now]
    );
  }
}

