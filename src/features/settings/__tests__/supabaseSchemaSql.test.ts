import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkSupabaseSchemaInitialized,
  FULL_SUPABASE_SCHEMA_SQL,
  isSupabaseMissingTableResponse,
  SCHEMA_CHECK_TABLES,
} from "../data-import/supabaseSchemaSql";

describe("supabaseSchemaSql", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("includes all core tables and constraints in FULL_SUPABASE_SCHEMA_SQL", () => {
    const required = [
      "public.ddt",
      "ddt_anno_numero_uniq",
      "public.ddt_righe",
      "public.ddt_logs",
      "public.clienti",
      "public.listino_generale",
      "public.listini_vari",
      "public.listini_clienti",
      "public.preventivi",
      "public.fatture_elettroniche_testate",
      "public.fatture_elettroniche_righe",
      "public.ordini",
      "public.fornitori",
      "public.note",
      "public.offerte",
      "public.app_users",
      "public.email_settings",
      "public.backup_settings",
      "public.riba_pagamenti",
    ];
    for (const token of required) {
      expect(FULL_SUPABASE_SCHEMA_SQL).toContain(token);
    }
  });

  it("detects missing table responses strictly from PostgREST/Postgres schema errors", () => {
    expect(
      isSupabaseMissingTableResponse(
        404,
        JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.ddt' in the schema cache" })
      )
    ).toBe(true);
    expect(
      isSupabaseMissingTableResponse(
        400,
        JSON.stringify({ code: "42P01", message: 'relation "public.clienti" does not exist' })
      )
    ).toBe(true);

    // Offline / 5xx / Auth errors must NEVER trigger missing-table detection
    expect(isSupabaseMissingTableResponse(503, "Service Unavailable")).toBe(false);
    expect(isSupabaseMissingTableResponse(500, "Internal Server Error")).toBe(false);
    expect(isSupabaseMissingTableResponse(401, "Invalid API key")).toBe(false);
    expect(isSupabaseMissingTableResponse(404, "Not Found")).toBe(false);
  });

  it("reports missing_tables only when Supabase returns missing table errors", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: "PGRST205",
          message: "Could not find the table 'public.ddt' in the schema cache",
        }),
        { status: 404 }
      );
    }) as typeof fetch;

    const res = await checkSupabaseSchemaInitialized("https://demo.supabase.co", "anon-key");
    expect(res.status).toBe("missing_tables");
    expect(res.missingTables).toEqual([...SCHEMA_CHECK_TABLES]);
  });

  it("reports offline instead of missing_tables on network failure or 5xx error", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    const offlineRes = await checkSupabaseSchemaInitialized("https://demo.supabase.co", "anon-key");
    expect(offlineRes.status).toBe("offline");
    expect(offlineRes.missingTables).toEqual([]);

    globalThis.fetch = vi.fn(async () => new Response("Gateway Timeout", { status: 504 })) as typeof fetch;
    const errRes = await checkSupabaseSchemaInitialized("https://demo.supabase.co", "anon-key");
    expect(errRes.status).toBe("ok");
    expect(errRes.missingTables).toEqual([]);
  });

  it("reports ok when tables exist", async () => {
    globalThis.fetch = vi.fn(async () => new Response("[]", { status: 200 })) as typeof fetch;
    const res = await checkSupabaseSchemaInitialized("https://demo.supabase.co", "anon-key");
    expect(res.status).toBe("ok");
    expect(res.missingTables).toEqual([]);
  });
});
