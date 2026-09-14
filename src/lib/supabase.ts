import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Direct-Supabase client for the admin dashboard. Anon key only — the
 * service_role key must never appear in frontend code. RLS/grants are the
 * only gate (see Phase 0 SQL); auth plugs in later via useAdminUser. */

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see .env.example");
  }
  client = createClient(url, anon);
  return client;
}

export const T_VOUCHERS = "vouchers";
export const T_EVENTS = "events";

export const VOUCHER_COLS =
  "code,state,total_secs,used_secs,bound_mac,last_ip,last_token,first_seen,last_auth,resume_ts,created_at";

export const EVENT_COLS = "id,code,mac,ip,token,decision,reason,remaining_secs,created_at";

export const STATES = ["NEW", "ACTIVE", "PAUSED", "EXPIRED", "DISABLED"] as const;
export type VoucherState = (typeof STATES)[number];

/* Duration presets for the create form: portal tiers + spec examples + custom. */
export const DURATION_PRESETS: { label: string; secs: number | null }[] = [
  { label: "₱5 — 8 Hours", secs: 28800 },
  { label: "₱10 — 18 Hours", secs: 64800 },
  { label: "₱20 — 1 Day 16 Hours", secs: 144000 },
  { label: "₱30 — 2 Days 16 Hours", secs: 230400 },
  { label: "₱40 — 4 Days", secs: 345600 },
  { label: "₱50 — 5 Days", secs: 432000 },
  { label: "₱80 — 8 Days 8 Hours", secs: 720000 },
  { label: "₱100 — 11 Days", secs: 950400 },
  { label: "₱120 — 13 Days 8 Hours", secs: 1152000 },
  { label: "6 Hours — 21600", secs: 21600 },
  { label: "12 Hours — 43200", secs: 43200 },
  { label: "15 Hours — 54000", secs: 54000 },
  { label: "Custom seconds…", secs: null },
];
