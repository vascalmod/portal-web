import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { StateBadge } from "@/components/StateBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  BULK_MAX, bulkCreateVouchers, bulkPlan, createVoucher, deleteVoucher, fmtDur, fmtStamp,
  listVouchers, liveRemaining, saveBatch, tierPrice,
  type BulkFormat, type Voucher, type VoucherState,
} from "@/lib/vouchers";
import { DURATION_PRESETS, STATES } from "@/lib/supabase";

const PSZ = 25;

export default function Vouchers() {
  const [rows, setRows] = useState<Voucher[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [params] = useSearchParams();
  const initialState = ((params.get("state") ?? "") as VoucherState | "");
  const [fstate, setFstate] = useState<VoucherState | "">(
    (["NEW", "ACTIVE", "PAUSED", "EXPIRED", "DISABLED"] as string[]).includes(initialState) ? initialState : "");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const nav = useNavigate();

  const load = useCallback(async (p: number, query: string, st: VoucherState | "") => {
    setLoading(true);
    try {
      const r = await listVouchers({ q: query, state: st, limit: PSZ, offset: p * PSZ });
      setRows(r.rows); setTotal(r.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load vouchers.");
    } finally { setLoading(false); }
  }, []);

  const fstateRef = useRef(fstate);
  useEffect(() => { void load(0, "", fstateRef.current); }, [load]);

  function search() { setPage(0); void load(0, q, fstate); }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Search code…" value={q} autoComplete="off" className="uppercase"
          onChange={(e) => setQ(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }} />
        <select value={fstate} onChange={(e) => setFstate(e.target.value as VoucherState | "")}
          className="h-10 max-w-[130px] rounded-md border border-input bg-background px-2 text-sm">
          <option value="">All</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={search}>Search</Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button variant="outline" className="flex-1">+ Create</Button></DialogTrigger>
          <CreateDialog
            onDone={(c) => { setCreateOpen(false); setQ(c); setFstate(""); setPage(0); void load(0, c, ""); }}
            onBatch={() => { setCreateOpen(false); nav("/admin/vouchers/batch"); }} />
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No vouchers found.</CardContent></Card>
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-[13px]">
              <thead className="sticky top-14 bg-card"><tr className="text-left text-xs text-muted-foreground">
                <th className="py-2">Code</th><th>Status</th><th>Total</th><th>Used</th><th>Left</th><th>MAC</th><th>Last IP</th><th>Last auth</th>
              </tr></thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.code} className="border-t">
                    <td className="py-2 font-bold"><Link className="text-primary" to={`/admin/vouchers/${encodeURIComponent(v.code)}`}>{v.code}</Link></td>
                    <td><StateBadge state={v.state} /></td>
                    <td>{fmtDur(v.total_secs)}</td><td>{fmtDur(v.used_secs)}</td>
                    <td className="font-semibold">{fmtDur(liveRemaining(v))}</td>
                    <td>{v.bound_mac ?? "—"}</td><td>{v.last_ip ?? "—"}</td>
                    <td className="whitespace-nowrap">{fmtStamp(v.last_auth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* mobile cards */}
          <div className="grid gap-2 md:hidden">
            {rows.map((v) => (
              <Link key={v.code} to={`/admin/vouchers/${encodeURIComponent(v.code)}`}>
                <Card><CardContent className="flex items-center justify-between pt-4">
                  <span><span className="font-bold">{v.code}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {fmtDur(liveRemaining(v))} left · {v.bound_mac ?? "unbound"}
                    </span></span>
                  <StateBadge state={v.state} />
                </CardContent></Card>
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={page === 0}
              onClick={() => { const p = page - 1; setPage(p); void load(p, q, fstate); }}>‹ Prev</Button>
            <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.max(1, Math.ceil(total / PSZ))} ({total})</span>
            <Button variant="outline" disabled={(page + 1) * PSZ >= total}
              onClick={() => { const p = page + 1; setPage(p); void load(p, q, fstate); }}>Next ›</Button>
          </div>
        </>
      )}
    </div>
  );
}

export function CreateDialog({ onDone, onBatch }: { onDone: (code: string) => void; onBatch: () => void }) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [code, setCode] = useState("");
  const [preset, setPreset] = useState<string>(String(DURATION_PRESETS[0].secs));
  const [custom, setCustom] = useState("");
  const [prefix, setPrefix] = useState("");
  const [count, setCount] = useState("50");
  const [format, setFormat] = useState<BulkFormat>("mixed");
  const [totalLen, setTotalLen] = useState("12");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const plan = bulkPlan(prefix || "PREFIX", format, Number(totalLen));

  function secsOf(): number {
    return preset === "custom" ? Number(custom) : Number(preset);
  }

  async function submitSingle() {
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const v = await createVoucher(code, secsOf());
      toast.success(`Created ${v.code} (${fmtDur(v.total_secs)}).`);
      onDone(v.code);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create voucher.");
    } finally { setBusy(false); }
  }

  async function submitBulk() {
    const n = Number(count);
    if (busy) return;
    setBusy(true); setProgress("");
    try {
      const r = await bulkCreateVouchers(prefix, n, secsOf(), {
        format, totalLen: Number(totalLen),
        onProgress: (d, t) => setProgress(`${d}/${t}`),
      });
      saveBatch({
        prefix: prefix.trim().toUpperCase(), total_secs: r.total_secs,
        price_php: tierPrice(r.total_secs), codes: r.created,
        created_at: new Date().toISOString(),
      });
      const short = r.created.length < r.requested ? ` (${r.requested - r.created.length} skipped as duplicates)` : "";
      toast.success(`Created ${r.created.length} vouchers${short}.`);
      onBatch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk create failed.");
    } finally { setBusy(false); setProgress(""); }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create vouchers</DialogTitle>
        <DialogDescription>State NEW, zero usage, unbound. Created timestamp is automatic.</DialogDescription>
      </DialogHeader>
      <div className="flex gap-1.5">
        {(["single", "bulk"] as const).map((m) => (
          <Button key={m} variant={mode === m ? "default" : "outline"} className="flex-1"
            onClick={() => setMode(m)}>{m === "single" ? "Single" : `Bulk (up to ${BULK_MAX})`}</Button>
        ))}
      </div>
      {mode === "single" ? (
        <div className="space-y-3">
          <Input placeholder="GUEST-001" value={code} maxLength={20} autoComplete="off"
            className="uppercase" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <DurationPick preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} />
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[13px] font-semibold" htmlFor="bk-prefix">Prefix (optional — empty = plain code)</label>
            <Input id="bk-prefix" placeholder="GUEST or empty" value={prefix} maxLength={15} autoComplete="off"
              className="uppercase" onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 block text-[13px] font-semibold">Code style</span>
              <div className="flex gap-1.5">
                {(["mixed", "numbers"] as const).map((f) => (
                  <Button key={f} variant={format === f ? "default" : "outline"} className="flex-1 px-1 text-xs"
                    onClick={() => setFormat(f)}>{f === "mixed" ? "Letters+123" : "123 only"}</Button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold" htmlFor="bk-len">Total length</label>
              <Input id="bk-len" inputMode="numeric" value={totalLen}
                onChange={(e) => setTotalLen(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} />
            </div>
          </div>
          <div className="rounded-md bg-secondary px-3 py-2 font-mono text-sm">
            {(prefix.trim() ? prefix.trim().toUpperCase() + "-" : "")
              + (format === "numbers" ? "4" : "X").repeat(Math.max(0, plan.randLen))}
            <span className="ml-2 font-sans text-xs text-muted-foreground">
              {plan.ok ? `${totalLen} chars · ${plan.randLen} random · UPPERCASE` : plan.error}
            </span>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold" htmlFor="bk-count">Quantity (1–{BULK_MAX})</label>
            <Input id="bk-count" inputMode="numeric" value={count}
              onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} />
          </div>
          <DurationPick preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} />
          <p className="text-xs text-muted-foreground">Characters avoid 0/O/1/I/L so slips can't be misread. Duplicates are skipped automatically.</p>
        </div>
      )}
      <DialogFooter>
        {progress && <span className="mr-auto self-center text-xs text-muted-foreground">{progress}</span>}
        {mode === "single" ? (
          <Button className="w-full sm:w-auto" disabled={busy} onClick={() => void submitSingle()}>
            {busy ? "Creating…" : "Create"}
          </Button>
        ) : (
          <Button className="w-full sm:w-auto" disabled={busy} onClick={() => void submitBulk()}>
            {busy ? "Generating…" : "Generate batch"}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function DurationPick({ preset, setPreset, custom, setCustom }: {
  preset: string; setPreset: (v: string) => void; custom: string; setCustom: (v: string) => void;
}) {
  return (
    <>
      <select value={preset} onChange={(e) => setPreset(e.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
        {DURATION_PRESETS.map((d, i) => (
          <option key={i} value={d.secs == null ? "custom" : String(d.secs)}>{d.label}</option>
        ))}
      </select>
      {preset === "custom" && (
        <Input placeholder="Seconds, e.g. 7200" inputMode="numeric" value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))} />
      )}
    </>
  );
}

export function DeleteButton({ code, onDone }: { code: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await deleteVoucher(code);
      toast.success(`Deleted ${code}. History kept in logs.`);
      setOpen(false); onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete voucher.");
    } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="destructive">Delete</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete voucher {code}?</DialogTitle>
          <DialogDescription>This action cannot be undone. Historical log records are kept.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={() => void go()}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
