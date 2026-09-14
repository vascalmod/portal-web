import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { StateBadge } from "@/components/StateBadge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  countByState, fmtDur, fmtPeso, fmtStamp, listEvents, liveRemaining, recentSales,
  recentVouchers, salesStats, tierLabel,
  type TierStat, type Voucher, type VoucherEvent,
} from "@/lib/vouchers";
import { STATES } from "@/lib/supabase";

export default function Dashboard() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [events, setEvents] = useState<VoucherEvent[]>([]);
  const [created, setCreated] = useState<Voucher[]>([]);
  const [active, setActive] = useState<Voucher[]>([]);
  const [profit, setProfit] = useState<{ revenue: number; sold: number; unsold: number; tiers: TierStat[] } | null>(null);
  const [sales, setSales] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [c, ev, cr, ac, pf, sl] = await Promise.all([
          Promise.all(STATES.map(async (s) => [s, await countByState(s)] as const)),
          listEvents({ limit: 8 }),
          recentVouchers("created_at", 6),
          recentVouchers("last_auth", 6),
          salesStats(),
          recentSales(8),
        ]);
        if (!live) return;
        setCounts(Object.fromEntries(c));
        setEvents(ev.rows); setCreated(cr);
        setActive(ac.filter((v) => v.state === "ACTIVE"));
        setProfit(pf); setSales(sl);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load dashboard.");
      } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, []);

  if (loading) return <DashboardSkeleton />;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-4">
      {/* profit */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card className="col-span-2 bg-primary text-primary-foreground sm:col-span-4">
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{fmtPeso(profit?.revenue ?? 0)}</div>
            <div className="text-xs opacity-80">REVENUE (PHP)</div>
          </CardContent>
        </Card>
        {[["Sold", String(profit?.sold ?? 0)], ["Unused stock", String(profit?.unsold ?? 0)],
          ["Active now", String(active.length)], ["Total vouchers", String(total)],
        ].map(([k, v]) => (
          <Card key={k}><CardContent className="pt-4 text-center">
            <div className="text-xl font-bold">{v}</div>
            <div className="text-[11px] text-muted-foreground">{k}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Profit by tier</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground">
                <th className="py-2">Tier</th><th>Price</th><th>Sold</th><th>Stock</th><th>Revenue</th>
              </tr></thead>
              <tbody>
                {(profit?.tiers ?? []).map((t) => (
                  <tr key={t.total_secs} className="border-t">
                    <td className="py-2">{tierLabel(t.total_secs)}</td>
                    <td>{t.price_php == null ? "custom" : fmtPeso(t.price_php)}</td>
                    <td>{t.sold}</td><td>{t.unsold}</td>
                    <td className="font-semibold">{fmtPeso(t.revenue_php)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(profit?.tiers.length ?? 0) === 0 && <Empty text="No vouchers yet." />}
          </div>
        </CardContent>
      </Card>

      {/* states link into filtered management */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {STATES.map((s) => (
          <Link key={s} to={`/admin/vouchers?state=${s}`}>
            <Card className="transition-colors hover:border-primary"><CardContent className="flex items-center justify-between pt-4">
              <StateBadge state={s} />
              <span className="text-xl font-bold">{counts?.[s] ?? 0}</span>
            </CardContent></Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent sales</CardTitle>
          <Link to="/admin/vouchers" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Manage</Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {sales.length === 0 && <Empty text="No sales yet." />}
          {sales.map((v) => (
            <RowLink key={v.code} code={v.code}
              right={<span className="text-sm font-semibold">{fmtDur(v.total_secs)}</span>}
              sub={`${v.bound_mac ?? ""} · ${fmtStamp(v.first_seen)}`} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent activity</CardTitle>
          <Link to="/admin/logs" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>All logs</Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 && <Empty text="No events yet." />}
          {events.map((e) => (
            <div key={e.id} className="border-b pb-2 text-[13px] last:border-0">
              <b>{e.decision}</b> {e.reason} · <Link className="font-semibold text-primary" to={`/admin/vouchers/${encodeURIComponent(e.code)}`}>{e.code}</Link>
              <div className="text-[11px] text-muted-foreground">{fmtStamp(e.created_at)}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Recently created</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {created.length === 0 && <Empty text="No vouchers yet." />}
            {created.map((v) => (
              <RowLink key={v.code} code={v.code} right={<StateBadge state={v.state} />} sub={fmtStamp(v.created_at)} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Recently active</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {active.length === 0 && <Empty text="Nothing active right now." />}
            {active.map((v) => (
              <RowLink key={v.code} code={v.code}
                right={<span className="text-sm font-semibold">{fmtDur(liveRemaining(v))} left</span>}
                sub={v.bound_mac ?? ""} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Skeleton className="col-span-2 h-24 sm:col-span-4" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-32" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-center text-sm text-muted-foreground">{text}</p>;
}

function RowLink({ code, right, sub }: { code: string; right: ReactNode; sub: string }) {
  return (
    <Link to={`/admin/vouchers/${encodeURIComponent(code)}`} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
      <span><span className="font-bold">{code}</span>{sub && <span className="block text-[11px] text-muted-foreground">{sub}</span>}</span>
      {right}
    </Link>
  );
}
