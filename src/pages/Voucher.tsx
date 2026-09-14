import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, fmtSecs, portalPause, portalResume, portalStatus, type PortalStatus } from "@/lib/api";

export default function Voucher() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<PortalStatus | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: (c: string) => Promise<unknown>) {
    const c = code.trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true); setMsg("");
    try {
      const r = await fn(c);
      if ((r as PortalStatus).remaining_seconds !== undefined) setStatus(r as PortalStatus);
      else { setStatus(null); setMsg("Done. Check status to confirm."); }
    } catch (e) {
      setStatus(null);
      setMsg(e instanceof ApiError ? e.message : "Request failed.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4">
      <Card>
        <CardHeader><CardTitle className="text-xl">My voucher</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="ABCD-1234" value={code} maxLength={20} autoComplete="off"
            className="uppercase" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Button className="w-full" disabled={busy} onClick={() => run(portalStatus)}>
            {busy ? "Checking…" : "Check status"}
          </Button>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        </CardContent>
      </Card>
      {status && (
        <Card>
          <CardContent className="space-y-3 pt-5 text-center">
            <div>
              {status.active && <Badge variant="success">ACTIVE</Badge>}
              {status.paused && <Badge variant="warning">PAUSED</Badge>}
              {!status.active && !status.paused && <Badge variant="outline">NO TIME LEFT</Badge>}
            </div>
            <div className="text-3xl font-bold">{fmtSecs(status.remaining_seconds)}</div>
            <p className="text-xs text-muted-foreground">remaining</p>
            <div className="flex gap-2">
              <Button className="flex-1" variant="outline" disabled={busy || !status.active}
                onClick={() => run(portalPause)}>Pause</Button>
              <Button className="flex-1" disabled={busy || !status.paused}
                onClick={() => run(portalResume)}>Resume</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
