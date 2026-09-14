import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtPeso, fmtSecs, portalRates, type RateTier } from "@/lib/api";

/* Mirrors the portal price card + RATE_TIERS. Used instantly; replaced by
 * the live /portal/rates response once the Phase 0 backend ships. */
const FALLBACK: RateTier[] = [
  { total_secs: 28800, price_php: 5, label: "8 Hours" },
  { total_secs: 57600, price_php: 10, label: "16 Hours" },
  { total_secs: 129600, price_php: 20, label: "36 Hours (1.5 Days)" },
  { total_secs: 345600, price_php: 50, label: "4 Days (96 Hours)" },
  { total_secs: 777600, price_php: 100, label: "9 Days" },
  { total_secs: 1641600, price_php: 200, label: "19 Days" },
  { total_secs: 2592000, price_php: 500, label: "30 Days (1 Month)" },
];

export default function Home() {
  const [tiers, setTiers] = useState<RateTier[]>(FALLBACK);
  useEffect(() => {
    portalRates().then((r) => { if (r.tiers?.length) setTiers(r.tiers); }).catch(() => {});
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Wi-Fi E-Voucher</CardTitle>
          <CardDescription>10 Mbps on all vouchers · pause anytime, resume without re-entering your code.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link to="/voucher" className={cn(buttonVariants())}>Check my voucher</Link>
          <Link to="/admin" className={cn(buttonVariants({ variant: "outline" }))}>Admin login</Link>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiers.map((t) => (
          <Card key={t.total_secs}>
            <CardContent className="pt-4 text-center">
              <div className="text-lg font-bold text-primary">{fmtPeso(t.price_php)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t.label}</div>
              <div className="mt-2"><Badge variant="secondary">{fmtSecs(t.total_secs)}</Badge></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">How to connect</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>1. Join the Wi-Fi network on your phone.</p>
          <p>2. Enter the code printed on your voucher.</p>
          <p>3. Pausing freezes your time — resuming needs no code.</p>
        </CardContent>
      </Card>
    </div>
  );
}
