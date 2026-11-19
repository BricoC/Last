import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  connectSupabase, forgetSupabaseSession, getSupabaseSessionEmail, subscribeSupabaseSession,
} from "@/shared/services/supabaseSession";

export function SupabaseStationLogin() {
  const connectedEmail = useSyncExternalStore(subscribeSupabaseSession, getSupabaseSessionEmail);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputClass = "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await connectSupabase(email.trim(), password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Accesso Supabase non riuscito.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  };

  if (connectedEmail) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span>Postazione connessa ({connectedEmail})</span>
        <Button type="button" variant="secondary" size="sm" onClick={() => void forgetSupabaseSession()}>Disconnetti</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 text-xs">
      <label className="block space-y-1">
        <span>Email della postazione Supabase</span>
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" className={inputClass} />
      </label>
      <label className="block space-y-1">
        <span>Password della postazione Supabase</span>
        <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className={inputClass} />
      </label>
      <Button type="submit" size="sm" disabled={busy}>{busy ? "Accesso in corso…" : "Accedi a Supabase"}</Button>
      {error && <p role="alert" className="text-[var(--destructive)]">{error}</p>}
    </form>
  );
}
