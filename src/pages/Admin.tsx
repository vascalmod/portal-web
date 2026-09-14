import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, adminStats, fmtPeso, fmtSecs, type AdminStats } from "@/lib/api";

const KEY = "portal_admin_key";

export default function Admin() {
  const [key, setKey] = useState(() => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } });
  const [unlocked, setUnlocked] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function unlock(k?: string) {
    const v = (k ?? key).trim();
    if (!v || busy) return;
    setBusy(true); setMsg("");
    try {
      const s = await adminStats(v);
      setStats(s); setUnlocked(true);
      try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ }
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Login failed.");
    } finally { setBusy(false); }
  }

  function logout() {
    try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
    setKey(""); setUnlocked(false); setStats(null);
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
            <p className="text-xs text-muted-foreground">Key stays in this tab only. Full manage + profit screens land in Phase 3.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Overview</h1>
        <Button size="sm" variant="outline" onClick={logout}>Logout</Button>
      </div>
      {stats && (
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
        </>
      )}
    </div>
  );
}
