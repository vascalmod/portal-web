import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { StateBadge } from "@/components/StateBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DeleteButton } from "./Vouchers";
import {
  fmtDur, fmtStamp, getVoucher, listEvents, liveRemaining, releaseBinding,
  updateVoucher, type Voucher, type VoucherEvent, type VoucherState,
} from "@/lib/vouchers";
import { STATES } from "@/lib/supabase";

export default function VoucherDetail() {
  const { code = "" } = useParams();
  const nav = useNavigate();
  const [v, setV] = useState<Voucher | null>(null);
  const [events, setEvents] = useState<VoucherEvent[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const row = await getVoucher(code);
      setV(row);
      if (row) setEvents((await listEvents({ code: row.code, limit: 20 })).rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load voucher.");
    } finally { setLoading(false); }
  }, [code]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  if (!v) return (
    <Card><CardContent className="space-y-3 py-8 text-center">
      <p className="text-sm text-muted-foreground">Voucher not found.</p>
      <Button variant="outline" onClick={() => nav("/admin/vouchers")}>Back to list</Button>
    </CardContent></Card>
  );

  async function toggle() {
    const row = v;
    if (!row) return;
    // Direct-DB admin: raw state flip (spec §7). The Worker re-derives
    // everything from the row on the next claim/pause transition.
    try {
      await updateVoucher(row.code, { state: row.state === "DISABLED" ? "NEW" : "DISABLED" });
      toast.success(row.state === "DISABLED" ? "Enabled." : "Disabled.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update state.");
    }
  }

  async function release() {
    const row = v;
    if (!row) return;
    if (!confirm(`Release device binding on ${row.code}? Next claim rebinds.`)) return;
    try {
      await releaseBinding(row.code);
      toast.success("Binding released.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to release binding.");
    }
  }

  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" onClick={() => nav("/admin/vouchers")}>‹ Vouchers</Button>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{v.code}</CardTitle>
          <StateBadge state={v.state} />
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Section title="Voucher">
            <KV k="Total time" v={fmtDur(v.total_secs)} />
            <KV k="Used time" v={fmtDur(v.used_secs)} />
            <KV k="Remaining" v={fmtDur(liveRemaining(v))} strong />
          </Section>
          <Section title="Device">
            <KV k="Bound MAC" v={v.bound_mac ?? "—"} />
            <KV k="Last IP" v={v.last_ip ?? "—"} />
            <KV k="Last token" v={v.last_token || "—"} />
          </Section>
          <Section title="Timestamps">
            <KV k="First seen" v={fmtStamp(v.first_seen)} />
            <KV k="Last auth" v={fmtStamp(v.last_auth)} />
            <KV k="Resume at" v={fmtStamp(v.resume_ts)} />
            <KV k="Created" v={fmtStamp(v.created_at)} />
          </Section>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
            <Button size="sm" variant="outline" onClick={() => void toggle()}>
              {v.state === "DISABLED" ? "Enable" : "Disable"}
            </Button>
            {v.bound_mac && v.state !== "ACTIVE" && (
              <Button size="sm" variant="outline" onClick={() => void release()}>Release device</Button>
            )}
            {v.state === "NEW" && !v.bound_mac && (
              <DeleteButton code={v.code} onDone={() => nav("/admin/vouchers")} />
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Events for {v.code}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 && <p className="text-sm text-muted-foreground">No events recorded.</p>}
          {events.map((e) => (
            <div key={e.id} className="border-b pb-2 text-[13px] last:border-0">
              <b>{e.decision}</b> {e.reason}
              <div className="text-[11px] text-muted-foreground">
                {fmtStamp(e.created_at)} · {e.mac ?? "—"} · {e.ip ?? "—"}
                {e.remaining_secs != null ? ` · left ${fmtDur(e.remaining_secs)}` : ""}
                {e.token ? ` · ${e.token}` : ""}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <EditDialog v={v} onDone={() => { setEditOpen(false); void load(); }} />
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className={strong ? "font-bold" : ""}>{v}</span>
    </div>
  );
}

function EditDialog({ v, onDone }: { v: Voucher; onDone: () => void }) {
  const [total, setTotal] = useState(String(v.total_secs));
  const [state, setState] = useState<VoucherState>(v.state);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = Number(total);
    if (!Number.isInteger(t) || t <= 0) { toast.error("Duration must be positive seconds."); return; }
    if (t < v.used_secs) { toast.error(`Total cannot go below used time (${fmtDur(v.used_secs)}).`); return; }
    setBusy(true);
    try {
      await updateVoucher(v.code, { total_secs: t, state });
      toast.success("Voucher updated.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update voucher.");
    } finally { setBusy(false); }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit {v.code}</DialogTitle>
        <DialogDescription>Used so far: {fmtDur(v.used_secs)} — total cannot go below that.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[13px] font-semibold" htmlFor="ed-t">Total duration (seconds)</label>
          <Input id="ed-t" inputMode="numeric" value={total}
            onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, ""))} />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-semibold" htmlFor="ed-s">State</label>
          <select id="ed-s" value={state} onChange={(e) => setState(e.target.value as VoucherState)}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <DialogFooter>
        <Button className="w-full sm:w-auto" disabled={busy} onClick={() => void submit()}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
