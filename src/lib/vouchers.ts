import { supabase, T_VOUCHERS, T_EVENTS, VOUCHER_COLS, EVENT_COLS, type VoucherState } from "./supabase";

export type { VoucherState };

export interface Voucher {
  code: string; state: VoucherState; total_secs: number; used_secs: number;
  bound_mac: string | null; last_ip: string | null; last_token: string | null;
  first_seen: string | null; last_auth: string | null; resume_ts: string | null;
  created_at: string;
}

export interface VoucherEvent {
  id: number; code: string; mac: string | null; ip: string | null;
  token: string | null; decision: string; reason: string;
  remaining_secs: number | null; created_at: string;
}

export class DbError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function err(e: { message?: string; code?: string } | null, fallback: string): never {
  if (!e) throw new DbError(fallback);
  if (e.code === "23505") throw new DbError("Voucher already exists.", e.code);
  if (e.code === "23514") throw new DbError("Invalid values (time/state constraint).", e.code);
  if (e.code === "42501" || e.message?.includes("permission")) {
    throw new DbError("Database refused access — run the Phase 0 grants.", e.code);
  }
  throw new DbError(e.message || fallback, e.code);
}

/* Live remaining for ACTIVE rows with an open interval, capped at the
 * previous balance — pure port of the backend settle rule. READ-ONLY:
 * viewing never writes used_secs; the Worker owns timing. */
export function liveRemaining(v: Voucher, nowMs = Date.now()): number {
  const balance = Math.max(0, v.total_secs - v.used_secs);
  if (v.state !== "ACTIVE" || !v.resume_ts) return balance;
  const anchor = Date.parse(v.resume_ts);
  if (Number.isNaN(anchor)) return balance;
  const elapsed = Math.max(0, Math.floor((nowMs - anchor) / 1000));
  return Math.max(0, balance - Math.min(elapsed, balance));
}

export function fmtDur(totalSecs: number): string {
  const s = Math.max(0, Math.round(totalSecs));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return sec > 0 && h === 0 && s < 3600 ? `${m}m ${sec}s` : `${m}m`;
  return `${sec}s`;
}

export function fmtStamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

/* ---------- reads (paginated, column-limited) ---------- */

export async function countByState(state: VoucherState): Promise<number> {
  const { count, error } = await supabase().from(T_VOUCHERS)
    .select("code", { count: "exact", head: true }).eq("state", state);
  if (error) err(error, "Failed to load counts.");
  return count ?? 0;
}

export interface VoucherQuery { q?: string; state?: VoucherState | ""; limit?: number; offset?: number }

export async function listVouchers({ q = "", state = "", limit = 25, offset = 0 }: VoucherQuery = {}): Promise<{ total: number; rows: Voucher[] }> {
  let query = supabase().from(T_VOUCHERS).select(VOUCHER_COLS, { count: "exact" });
  if (state) query = query.eq("state", state);
  const needle = q.trim().toUpperCase().replace(/[%_]/g, "");
  if (needle) query = query.ilike("code", `%${needle}%`);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) err(error, "Failed to load vouchers.");
  return { total: count ?? 0, rows: (data ?? []) as Voucher[] };
}

export async function getVoucher(code: string): Promise<Voucher | null> {
  const { data, error } = await supabase().from(T_VOUCHERS).select(VOUCHER_COLS)
    .eq("code", code.trim().toUpperCase()).maybeSingle();
  if (error) err(error, "Failed to load voucher.");
  return (data ?? null) as Voucher | null;
}

export interface EventQuery { q?: string; code?: string; decision?: string; limit?: number; offset?: number }

export async function listEvents({ q = "", code = "", decision = "", limit = 25, offset = 0 }: EventQuery = {}): Promise<{ total: number; rows: VoucherEvent[] }> {
  let query = supabase().from(T_EVENTS).select(EVENT_COLS, { count: "exact" });
  if (code) query = query.eq("code", code.trim().toUpperCase());
  if (decision) query = query.eq("decision", decision);
  const needle = q.trim().replace(/[%_]/g, "");
  if (needle) query = query.or(`code.ilike.%${needle}%,mac.ilike.%${needle}%,ip.ilike.%${needle}%,reason.ilike.%${needle}%`);
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
  if (error) err(error, "Failed to load logs.");
  return { total: count ?? 0, rows: (data ?? []) as VoucherEvent[] };
}

export async function recentVouchers(order: "created_at" | "last_auth", limit = 8): Promise<Voucher[]> {
  const { data, error } = await supabase().from(T_VOUCHERS).select("code,state,total_secs,used_secs,bound_mac,last_auth,created_at")
    .order(order, { ascending: false, nullsFirst: false }).limit(limit);
  if (error) err(error, "Failed to load recent vouchers.");
  return (data ?? []) as Voucher[];
}

/* ---------- writes ---------- */

const CODE_RE = /^[A-Z0-9-]{4,20}$/;

export async function createVoucher(code: string, totalSecs: number): Promise<Voucher> {
  const c = code.trim().toUpperCase();
  if (!CODE_RE.test(c)) throw new DbError("Code must be A–Z 0–9 -, 4–20 chars.");
  if (!Number.isInteger(totalSecs) || totalSecs <= 0) throw new DbError("Duration must be positive seconds.");
  const { data, error } = await supabase().from(T_VOUCHERS).insert({
    code: c, total_secs: totalSecs, used_secs: 0, state: "NEW",
    bound_mac: null, last_ip: null, last_token: null,
    first_seen: null, last_auth: null, resume_ts: null,
  }).select(VOUCHER_COLS).single();
  if (error) err(error, "Failed to create voucher.");
  return data as Voucher;
}

export async function updateVoucher(code: string, patch: { total_secs?: number; state?: VoucherState }): Promise<Voucher> {
  const c = code.trim().toUpperCase();
  if (patch.total_secs !== undefined && (!Number.isInteger(patch.total_secs) || patch.total_secs <= 0)) {
    throw new DbError("Duration must be positive seconds.");
  }
  // Guard the used_secs <= total_secs constraint client-side (DB re-checks).
  if (patch.total_secs !== undefined) {
    const cur = await getVoucher(c);
    if (!cur) throw new DbError("Voucher not found.");
    if (patch.total_secs < cur.used_secs) {
      throw new DbError(`Total cannot go below used time (${fmtDur(cur.used_secs)}).`);
    }
  }
  const { data, error } = await supabase().from(T_VOUCHERS).update(patch)
    .eq("code", c).select(VOUCHER_COLS).single();
  if (error) err(error, "Failed to update voucher.");
  return data as Voucher;
}

export async function deleteVoucher(code: string): Promise<void> {  const { error, count } = await supabase().from(T_VOUCHERS)
    .delete({ count: "exact" }).eq("code", code.trim().toUpperCase());
  if (error) err(error, "Failed to delete voucher.");
  if (!count) throw new DbError("Voucher not found.");
  // events rows reference code as plain text (no FK) — history is kept.
}

export async function releaseBinding(code: string): Promise<void> {
  const c = code.trim().toUpperCase();
  const cur = await getVoucher(c);
  if (!cur) throw new DbError("Voucher not found.");
  if (cur.state === "ACTIVE") throw new DbError("Pause it first — live sessions keep their binding.");
  if (!cur.bound_mac) return;
  const { error } = await supabase().from(T_VOUCHERS)
    .update({ bound_mac: null, last_ip: null, last_token: null }).eq("code", c);
  if (error) err(error, "Failed to release binding.");
}
