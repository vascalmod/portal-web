import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fmtDur, fmtStamp, listEvents, type VoucherEvent } from "@/lib/vouchers";
import { supabase, T_EVENTS } from "@/lib/supabase";

const PSZ = 25;

async function distinctDecisions(): Promise<string[]> {
  // Decision vocabulary comes from the data itself — never invented.
  const { data, error } = await supabase().from(T_EVENTS)
    .select("decision").order("id", { ascending: false }).limit(200);
  if (error || !data) return [];
  return [...new Set(data.map((r) => String(r.decision)).filter(Boolean))].sort();
}

export default function Logs() {
  const [rows, setRows] = useState<VoucherEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [decision, setDecision] = useState("");
  const [decisions, setDecisions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, query: string, vc: string, dec: string) => {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([
        listEvents({ q: query, code: vc, decision: dec, limit: PSZ, offset: p * PSZ }),
        distinctDecisions(),
      ]);
      setRows(r.rows); setTotal(r.total); setDecisions(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load logs.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(0, "", "", ""); }, [load]);

  function search() { setPage(0); void load(0, q, code, decision); }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Input className="col-span-2" placeholder="Search code, MAC, IP, reason…" value={q}
          autoComplete="off" onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }} />
        <Input placeholder="Voucher code…" value={code} autoComplete="off" className="uppercase"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }} />
        <select value={decision} onChange={(e) => setDecision(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">All decisions</option>
          {decisions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <Button className="w-full" onClick={search}>Search logs</Button>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading logs…</p>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No log entries found.</CardContent></Card>
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-xs text-muted-foreground">
                <th className="py-2">ID</th><th>Code</th><th>MAC</th><th>IP</th><th>Decision</th><th>Reason</th><th>Left</th><th>At</th>
              </tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="py-2 text-muted-foreground">{e.id}</td>
                    <td className="font-bold"><Link className="text-primary" to={`/admin/vouchers/${encodeURIComponent(e.code)}`}>{e.code}</Link></td>
                    <td>{e.mac ?? "—"}</td><td>{e.ip ?? "—"}</td>
                    <td><b>{e.decision}</b></td><td>{e.reason}</td>
                    <td>{e.remaining_secs == null ? "—" : fmtDur(e.remaining_secs)}</td>
                    <td className="whitespace-nowrap">{fmtStamp(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* mobile cards */}
          <div className="grid gap-2 md:hidden">
            {rows.map((e) => (
              <Link key={e.id} to={`/admin/vouchers/${encodeURIComponent(e.code)}`}>
                <Card><CardContent className="space-y-1 pt-4 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{e.code}</span>
                    <span><b>{e.decision}</b> {e.reason}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    #{e.id} · {e.mac ?? "—"} · {fmtStamp(e.created_at)}
                    {e.remaining_secs != null ? ` · left ${fmtDur(e.remaining_secs)}` : ""}
                  </div>
                </CardContent></Card>
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={page === 0}
              onClick={() => { const p = page - 1; setPage(p); void load(p, q, code, decision); }}>‹ Prev</Button>
            <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.max(1, Math.ceil(total / PSZ))} ({total})</span>
            <Button variant="outline" disabled={(page + 1) * PSZ >= total}
              onClick={() => { const p = page + 1; setPage(p); void load(p, q, code, decision); }}>Next ›</Button>
          </div>
        </>
      )}
    </div>
  );
}
