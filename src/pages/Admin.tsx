import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ApiError, adminCreate, adminDelete, adminEvents, adminExtend, adminRelease,
  adminSetState, adminStats, adminVouchers, fmtPeso, fmtSecs,
  type AdminEvent, type AdminStats, type VoucherRow, type VoucherState,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const KEY = "portal_admin_key";
const PSZ = 25;
const STATES: (VoucherState | "")[] = ["", "NEW", "ACTIVE", "PAUSED", "EXPIRED", "DISABLED"];
const CREATE_TIERS: [number, number, string][] = [
  [5, 28800, "₱5 — 8 Hours"], [10, 57600, "₱10 — 16 Hours"],
  [20, 129600, "₱20 — 36 Hours"], [50, 345600, "₱50 — 4 Days"],
  [100, 777600, "₱100 — 9 Days"], [200, 1641600, "₱200 — 19 Days"],
  [500, 2592000, "₱500 — 30 Days"],
];

type Tab = "ov" | "vx" | "mk" | "ac";
const badge: Record<VoucherState, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  NEW: "default", ACTIVE: "success", PAUSED: "warning", EXPIRED: "secondary", DISABLED: "destructive",
};

export default function Admin() {
  const [key, setKey] = useState(() => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } });
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState<Tab>("ov");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [rows, setRows] = useState<VoucherRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [fstate, setFstate] = useState("");
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [mcode, setMcode] = useState("");
  const [mtier, setMtier] = useState("5:28800");
  const [msg, setMsg] = useState("");
  const [vxMsg, setVxMsg] = useState("");
  const [mkMsg, setMkMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function unlock(k?: string) {
    const v = (k ?? key).trim();
    if (!v || busy) return;
    setBusy(true); setMsg("");
    try {
      const s = await adminStats(v);
      setStats(s); setUnlocked(true);
      try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ }
      void loadAll(v);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Login failed.");
    } finally { setBusy(false); }
  }

  const loadAll = useCallback(async (k: string) => {
    try {
      const [s, ev] = await Promise.all([adminStats(k), adminEvents(k, 50)]);
      setStats(s); setEvents(ev.rows);
    } catch { /* stay on stale data; next action surfaces errors */ }
  }, []);

  async function loadVx(k: string, p: number, query: string, st: string) {
    try {
      const r = await adminVouchers(k, { q: query, state: st, limit: PSZ, offset: p * PSZ });
      setRows(r.rows); setTotal(r.total);
    } catch (e) {
      setVxMsg(e instanceof ApiError ? e.message : "Load failed.");
    }
  }

  function logout() {
    try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
    setKey(""); setUnlocked(false); setStats(null); setRows([]); setEvents([]);
  }

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, done = "Done.") {
    setVxMsg("");
    try {
      const r = await fn();
      setVxMsg(r.ok ? done : `Refused: ${r.error}`);
      await loadVx(key, page, q, fstate);
      setStats(await adminStats(key));
    } catch (e) {
      setVxMsg(e instanceof ApiError ? e.message : "Action failed.");
    }
  }

  if (!unlocked) {
    return (
      <div className="mx-auto w-full max-w-sm p-4 pt-16">
        <Card>
          <CardHeader><CardTitle className="text-xl">Admin login</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input type="password" placeholder="ADMIN_PSK value" value={key}
              autoComplete="current-password" onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void unlock(); }} />
            <Button className="w-full" disabled={busy} onClick={() => void unlock()}>
              {busy ? "Unlocking…" : "Unlock"}
            </Button>
            {msg && <p className="text-sm text-destructive">{msg}</p>}
            <p className="text-xs text-muted-foreground">Key stays in this tab only, sent per request, never logged.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tabs: [Tab, string][] = [["ov", "Overview"], ["vx", "Vouchers"], ["mk", "Create"], ["ac", "Activity"]];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Admin</h1>
        <Button size="sm" variant="outline" onClick={logout}>Logout</Button>
      </div>
      <div className="flex gap-1.5">
        {tabs.map(([t, label]) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} className="flex-1 px-1 text-[13px]"
            onClick={() => { setTab(t); if (t === "vx") void loadVx(key, page, q, fstate); }}>
            {label}
          </Button>
        ))}
      </div>

      {tab === "ov" && stats && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Card className="col-span-2 bg-primary text-primary-foreground sm:col-span-4">
              <CardContent className="pt-4 text-center">
                <div className="text-3xl font-bold">{fmtPeso(stats.revenue_php)}</div>
                <div className="text-xs opacity-80">REVENUE (PHP)</div>
              </CardContent>
            </Card>
            {[["Sold", String(stats.sold)], ["Unused stock", String(stats.unsold)],
              ["Active now", String(stats.active_now)], ["Time owed", fmtSecs(stats.liability_secs)],
            ].map(([k, v]) => (
              <Card key={k}><CardContent className="pt-4 text-center">
                <div className="text-xl font-bold">{v}</div>
                <div className="text-[11px] text-muted-foreground">{k}</div>
              </CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Per-tier profit</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2">Tier</th><th>Price</th><th>Sold</th><th>Stock</th><th>Revenue</th>
                  </tr></thead>
                  <tbody>
                    {stats.by_tier.map((t) => (
                      <tr key={t.total_secs} className="border-t">
                        <td className="py-2">{fmtSecs(t.total_secs)}</td>
                        <td>{t.price_php == null ? "custom" : fmtPeso(t.price_php)}</td>
                        <td>{t.sold}</td><td>{t.unsold}</td>
                        <td className="font-semibold">{fmtPeso(t.revenue_php)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(stats.by_state) as VoucherState[]).map((s) => (
              <Badge key={s} variant={badge[s]}>{s} {stats.by_state[s]}</Badge>
            ))}
          </div>
        </>
      )}

      {tab === "vx" && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex gap-2">
              <Input placeholder="Search code…" value={q} autoComplete="off"
                className="uppercase" onChange={(e) => setQ(e.target.value.toUpperCase())} />
              <select value={fstate} onChange={(e) => setFstate(e.target.value)}
                className="h-10 max-w-[130px] rounded-md border border-input bg-background px-2 text-sm">
                {STATES.map((s) => <option key={s} value={s}>{s || "All"}</option>)}
              </select>
            </div>
            <Button className="w-full" onClick={() => { setPage(0); void loadVx(key, 0, q, fstate); }}>Search</Button>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-[13px]">
                <thead><tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2">Code</th><th>Tier</th><th>State</th><th>Left</th><th>Device</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code} className="border-t align-top">
                      <td className="py-2 font-bold">{r.code}</td>
                      <td>{r.price_php == null ? `custom ${fmtSecs(r.total_secs)}` : fmtPeso(r.price_php)}</td>
                      <td><Badge variant={badge[r.state]}>{r.state}</Badge></td>
                      <td>{fmtSecs(r.remaining_secs)}<div className="text-[11px] text-muted-foreground">used {fmtSecs(r.used_secs)}</div></td>
                      <td>{r.bound_mac ?? "—"}<div className="text-[11px] text-muted-foreground">{r.last_ip ?? ""}</div></td>
                      <td className="whitespace-nowrap">
                        {r.bound_mac && r.state !== "ACTIVE" && (
                          <Button size="sm" variant="outline" className="mb-1 mr-1"
                            onClick={() => void act(() => adminRelease(key, r.code))}>Release</Button>)}
                        {r.state !== "DISABLED"
                          ? <Button size="sm" variant="outline" className="mb-1 mr-1"
                              onClick={() => void act(() => adminSetState(key, r.code, "DISABLED"))}>Disable</Button>
                          : <Button size="sm" variant="outline" className="mb-1 mr-1"
                              onClick={() => void act(() => adminSetState(key, r.code, "NEW"))}>Enable</Button>}
                        <Button size="sm" variant="outline" className="mb-1 mr-1"
                          onClick={() => { const v = prompt(`Add seconds to ${r.code} (min 60):`, "86400"); if (v != null) void act(() => adminExtend(key, r.code, Number(v)), "Extended."); }}>+Time</Button>
                        {r.state === "NEW" && !r.bound_mac && (
                          <Button size="sm" variant="destructive" className="mb-1"
                            onClick={() => { if (confirm(`Delete unused voucher ${r.code}?`)) void act(() => adminDelete(key, r.code), "Deleted."); }}>Delete</Button>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <p className="py-4 text-center text-sm text-muted-foreground">No matches. Hit Search.</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={page === 0}
                onClick={() => { const p = page - 1; setPage(p); void loadVx(key, p, q, fstate); }}>‹ Prev</Button>
              <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.max(1, Math.ceil(total / PSZ))} ({total})</span>
              <Button variant="outline" disabled={(page + 1) * PSZ >= total}
                onClick={() => { const p = page + 1; setPage(p); void loadVx(key, p, q, fstate); }}>Next ›</Button>
            </div>
            {vxMsg && <p className={cn("text-sm", vxMsg.startsWith("Refused") ? "text-destructive" : "text-muted-foreground")}>{vxMsg}</p>}
          </CardContent>
        </Card>
      )}

      {tab === "mk" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Create voucher</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="GUEST-001" value={mcode} maxLength={20} autoComplete="off"
              className="uppercase" onChange={(e) => setMcode(e.target.value.toUpperCase())} />
            <select value={mtier} onChange={(e) => setMtier(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
              {CREATE_TIERS.map(([p, s, l]) => <option key={s} value={`${p}:${s}`}>{l}</option>)}
            </select>
            <Button className="w-full" onClick={() => void (async () => {
              const c = mcode.trim().toUpperCase(); if (!c) return; setMkMsg("");
              try {
                const r = await adminCreate(key, c, Number(mtier.split(":")[1]));
                setMkMsg(r.ok ? `Created ${r.code}.` : `Refused: ${r.error}`);
                if (r.ok) { setMcode(""); setStats(await adminStats(key)); }
              } catch (e) { setMkMsg(e instanceof ApiError ? e.message : "Create failed."); }
            })()}>Create voucher</Button>
            {mkMsg && <p className="text-sm text-muted-foreground">{mkMsg}</p>}
          </CardContent>
        </Card>
      )}

      {tab === "ac" && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            {events.map((e) => (
              <div key={e.id} className="border-b pb-2 text-[13px] last:border-0">
                <b>{e.decision}</b> {e.reason} · {e.code}{e.mac ? ` · ${e.mac}` : ""}
                <div className="text-[11px] text-muted-foreground">{e.created_at ?? ""}
                  {e.remaining_secs != null ? ` · left ${fmtSecs(e.remaining_secs)}` : ""}</div>
              </div>
            ))}
            {!events.length && <p className="text-sm text-muted-foreground">No events yet.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
