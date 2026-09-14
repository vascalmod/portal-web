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

export function fmtPeso(n: number): string {
  return "₱" + n.toLocaleString("en-PH");
}

export function fmtStamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

/* Canonical price tiers (mirror the portal price card + backend RATE_TIERS).
 * Sold = bound_mac IS NOT NULL (first claim binds = sale). Non-tier totals
 * are custom: tracked, priced unknown. */
export const TIER_PRICES: Record<number, number> = {
  28800: 5, 57600: 10, 129600: 20, 345600: 50,
  777600: 100, 1641600: 200, 2592000: 500,
};

export function tierPrice(totalSecs: number): number | null {
  return TIER_PRICES[totalSecs] ?? null;
}

export interface TierStat { total_secs: number; price_php: number | null; sold: number; unsold: number; revenue_php: number }

export async function salesStats(): Promise<{ revenue: number; sold: number; unsold: number; tiers: TierStat[] }> {
  const db = supabase();
  const totals = (await db.from(T_VOUCHERS).select("total_secs").limit(5000)).data ?? [];
  const secs = [...new Set(totals.map((r) => Number(r.total_secs)))].sort((a, b) => a - b);
  const tiers: TierStat[] = await Promise.all(secs.map(async (t) => {
    const [{ count: s }, { count: u }] = await Promise.all([
      db.from(T_VOUCHERS).select("code", { count: "exact", head: true }).eq("total_secs", t).not("bound_mac", "is", null),
      db.from(T_VOUCHERS).select("code", { count: "exact", head: true }).eq("total_secs", t).is("bound_mac", null),
    ]);
    const price = tierPrice(t);
    const ts = s ?? 0, tu = u ?? 0;
    return { total_secs: t, price_php: price, sold: ts, unsold: tu, revenue_php: (price ?? 0) * ts };
  }));
  tiers.sort((a, b) => a.total_secs - b.total_secs);
  let revenue = 0, sold = 0, unsold = 0;
  for (const t of tiers) { revenue += t.revenue_php; sold += t.sold; unsold += t.unsold; }
  return { revenue, sold, unsold, tiers };
}

export async function recentSales(limit = 8): Promise<Voucher[]> {
  const { data, error } = await supabase().from(T_VOUCHERS)
    .select("code,state,total_secs,used_secs,bound_mac,last_auth,created_at,first_seen")
    .not("bound_mac", "is", null)
    .order("first_seen", { ascending: false, nullsFirst: false }).limit(limit);
  if (error) err(error, "Failed to load sales.");
  return (data ?? []) as Voucher[];
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

/* ---------- bulk generation + printable slips ---------- */

// Unambiguous alphabets (no 0/O, 1/I/L) so printed slips can't be misread.
// Numbers-only uses 2–9 (no leading-zero or glyph issues at any length).
const BULK_MIXED = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const BULK_DIGITS = "23456789";
export const BULK_MAX = 200;
export type BulkFormat = "mixed" | "numbers";
const PREFIX_RE = /^[A-Z0-9-]{1,15}$/;

function randFrom(alphabet: string, len: number): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[buf[i] % alphabet.length];
  return s;
}

export interface BulkOpts { format: BulkFormat; totalLen: number; onProgress?: (done: number, total: number) => void }

/* Prefix is optional: empty = plain random code (e.g. 10 digits).
 * Everything stays UPPERCASE (mixed alphabet is upper-only by construction). */
export function bulkPlan(prefix: string, format: BulkFormat, totalLen: number): { ok: boolean; randLen: number; head: string; error: string } {
  const p = prefix.trim().toUpperCase();
  if (p && !PREFIX_RE.test(p)) return { ok: false, randLen: 0, head: "", error: "Prefix: A–Z 0–9 -, 1–15 chars (or leave empty)." };
  if (!Number.isInteger(totalLen) || totalLen < 8 || totalLen > 20) {
    return { ok: false, randLen: 0, head: "", error: "Total length: 8–20 chars (voucher limit)." };
  }
  const randLen = p ? totalLen - p.length - 1 : totalLen;
  if (randLen < 4) {
    return { ok: false, randLen: 0, head: "", error: p
      ? `Too short: prefix takes ${p.length + 1}, need ≥ 4 random chars (total ≥ ${p.length + 5}).`
      : "Too short: need ≥ 4 chars without a prefix." };
  }
  void format;
  return { ok: true, randLen, head: p ? `${p}-` : "", error: "" };
}

export interface BulkResult { created: string[]; requested: number; total_secs: number }

export async function bulkCreateVouchers(
  prefix: string, count: number, totalSecs: number, opts: BulkOpts,
): Promise<BulkResult> {
  const plan = bulkPlan(prefix, opts.format, opts.totalLen);
  if (!plan.ok) throw new DbError(plan.error);
  if (!Number.isInteger(count) || count < 1 || count > BULK_MAX) {
    throw new DbError(`Count must be 1–${BULK_MAX}.`);
  }
  if (!Number.isInteger(totalSecs) || totalSecs <= 0) throw new DbError("Pick a duration.");
  const alphabet = opts.format === "numbers" ? BULK_DIGITS : BULK_MIXED;
  const space = Math.pow(alphabet.length, plan.randLen);
  if (space < count * 10) {
    throw new DbError(
      `Too crowded: ${space.toLocaleString()} possible codes for ${count} vouchers. Lengthen the code or shorten the prefix.`);
  }
  const db = supabase();
  const fresh = new Set<string>();
  const mk = () => plan.head + randFrom(alphabet, plan.randLen);
  // Collision-safe top-up rounds against live codes (incl. other batches).
  for (let round = 0; round < 6 && fresh.size < count; round++) {
    const need = new Set<string>();
    while (need.size < count - fresh.size) need.add(mk());
    const cands = [...need].filter((c) => !fresh.has(c));
    if (!cands.length) break;
    const { data, error } = await db.from(T_VOUCHERS).select("code").in("code", cands);
    if (error) err(error, "Failed to check existing codes.");
    const taken = new Set((data ?? []).map((r) => String(r.code)));
    for (const c of cands) if (!taken.has(c)) fresh.add(c);
    opts.onProgress?.(fresh.size, count);
  }
  const codes = [...fresh];
  if (!codes.length) throw new DbError("Could not mint unique codes — try another prefix.");
  const { error } = await db.from(T_VOUCHERS).insert(
    codes.map((code) => ({
      code, total_secs: totalSecs, used_secs: 0, state: "NEW",
      bound_mac: null, last_ip: null, last_token: null,
      first_seen: null, last_auth: null, resume_ts: null,
    })));
  if (error) err(error, "Failed to insert batch.");
  opts.onProgress?.(codes.length, count);
  return { created: codes.sort(), requested: count, total_secs: totalSecs };
}

export interface SlipBatch {
  prefix: string; total_secs: number; price_php: number | null;
  codes: string[]; created_at: string;
}

const BATCH_KEY = "voucher_slip_batch";

export function saveBatch(b: SlipBatch): void {
  try { sessionStorage.setItem(BATCH_KEY, JSON.stringify(b)); } catch { /* private mode */ }
}

export function loadBatch(): SlipBatch | null {
  try {
    const raw = sessionStorage.getItem(BATCH_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as SlipBatch;
    return Array.isArray(b.codes) && b.codes.length ? b : null;
  } catch { return null; }
}

export function batchToCSV(b: SlipBatch): string {
  const lines = ["code,price_php,total_secs,state"];
  for (const c of b.codes) lines.push([c, b.price_php ?? "", b.total_secs, "NEW"].join(","));
  return lines.join("\n") + "\n";
}

export function downloadFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
