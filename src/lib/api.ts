/* Typed client for the Railway voucher API (portal-voucher/cloud/api.py).
 * Customer surface (/portal/*) ships with Phase 0 backend work; admin
 * surface (/admin/api/*) is live. VOUCHER_PSK never enters the browser. */

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

function base(): string {
  if (!BASE) throw new ApiError(0, "Missing VITE_API_URL — see .env.example");
  return BASE;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base() + path, init);
  } catch {
    throw new ApiError(0, "Server unreachable. Check connection and try again.");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON: fall through to generic error */
  }
  if (!res.ok) {
    const msg =
      (body as { error?: string } | null)?.error ??
      (res.status === 403 ? "Not authorized." : `Request failed (${res.status}).`);
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

const form = (data: Record<string, string>) =>
  Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

function postForm<T>(path: string, data: Record<string, string>, key?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (key) headers["X-PSK"] = key;
  return req<T>(path, { method: "POST", headers, body: form(data) });
}

/* ---------- shared ---------- */
export interface Tier { total_secs: number; price_php: number | null; sold: number; unsold: number; revenue_php: number; }

/* ---------- customer (/portal/*) — Phase 0 backend ---------- */
export interface RateTier { total_secs: number; price_php: number; label: string }
export interface PortalStatus { active: boolean; paused: boolean; remaining_seconds: number }
export interface PortalAction { ok: boolean; remaining_seconds?: number; error?: string }

export const portalRates = (): Promise<{ tiers: RateTier[] }> => req("/portal/rates");
export const portalStatus = (code: string): Promise<PortalStatus> =>
  postForm("/portal/status", { code });
export const portalPause = (code: string): Promise<PortalAction> =>
  postForm("/portal/pause", { code });
export const portalResume = (code: string): Promise<PortalAction> =>
  postForm("/portal/resume", { code });

/* ---------- admin (/admin/api/*) — live ---------- */
export type VoucherState = "NEW" | "ACTIVE" | "PAUSED" | "EXPIRED" | "DISABLED";
export interface AdminStats {
  revenue_php: number; sold: number; unsold: number;
  by_tier: Tier[]; by_state: Partial<Record<VoucherState, number>>;
  liability_secs: number; active_now: number;
}
export interface VoucherRow {
  code: string; state: VoucherState; total_secs: number; used_secs: number;
  remaining_secs: number; price_php: number | null;
  bound_mac: string | null; last_ip: string | null;
  first_seen: string | null; last_auth: string | null;
}
export interface AdminEvent {
  id: number; code: string; mac: string | null; decision: string; reason: string;
  remaining_secs: number | null; created_at: string | null;
}

const adminGet = <T,>(path: string, key: string): Promise<T> =>
  req<T>(`${path}?psk=${encodeURIComponent(key)}`, { headers: { "X-PSK": key } });

export const adminStats = (key: string): Promise<AdminStats> => adminGet("/admin/api/stats", key);
export const adminVouchers = (key: string, p: { state?: string; q?: string; limit?: number; offset?: number }): Promise<{ total: number; rows: VoucherRow[] }> => {
  const qs = new URLSearchParams({ state: p.state ?? "", q: p.q ?? "", limit: String(p.limit ?? 25), offset: String(p.offset ?? 0) });
  return adminGet(`/admin/api/vouchers?${qs.toString()}`, key);
};
export const adminEvents = (key: string, limit = 50): Promise<{ rows: AdminEvent[] }> =>
  adminGet(`/admin/api/events?limit=${limit}`, key);
export const adminCreate = (key: string, code: string, total_secs: number) =>
  postForm<{ ok: boolean; code?: string; total_secs?: number; price_php?: number | null; error?: string }>("/admin/api/create", { code, total_secs: String(total_secs) }, key);
export const adminSetState = (key: string, code: string, state: "NEW" | "DISABLED") =>
  postForm<{ ok: boolean; state?: string; noop?: boolean; error?: string }>("/admin/api/set_state", { code, state }, key);
export const adminRelease = (key: string, code: string) =>
  postForm<{ ok: boolean; noop?: boolean; error?: string }>("/admin/api/release", { code }, key);
export const adminExtend = (key: string, code: string, add_secs: number) =>
  postForm<{ ok: boolean; total_secs?: number; state?: string; error?: string }>("/admin/api/extend", { code, add_secs: String(add_secs) }, key);
export const adminDelete = (key: string, code: string) =>
  postForm<{ ok: boolean; error?: string }>("/admin/api/delete", { code }, key);

/* ---------- formatting ---------- */
export function fmtSecs(s: number): string {
  s = Math.max(0, Math.round(s));
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) { const h = s / 3600; return `${h % 1 ? h.toFixed(1) : h}h`; }
  const d = s / 86400; return `${d % 1 ? d.toFixed(1) : d}d`;
}
export function fmtPeso(n: number): string { return "₱" + n.toLocaleString("en-PH"); }
