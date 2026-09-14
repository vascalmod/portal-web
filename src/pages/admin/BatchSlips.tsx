import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { batchToCSV, downloadFile, fmtDur, fmtPeso, loadBatch } from "@/lib/vouchers";

export default function BatchSlips() {
  const [batch] = useState(loadBatch);

  if (!batch) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">No batch in this tab — generate one from Vouchers → Create → Bulk.</p>
        <Link to="/admin/vouchers">
          <Button variant="outline">Back to vouchers</Button>
        </Link>
      </div>
    );
  }

  const csv = () => downloadFile(`vouchers-${batch.prefix}.csv`, batchToCSV(batch), "text/csv");
  const txt = () => downloadFile(`vouchers-${batch.prefix}.txt`, batch.codes.join("\n") + "\n", "text/plain");
  const copyAll = () => {
    navigator.clipboard?.writeText(batch.codes.join("\n")).then(
      () => alert("Codes copied."), () => alert("Copy failed."));
  };

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link to="/admin/vouchers"><Button size="sm" variant="ghost">‹ Vouchers</Button></Link>
        <span className="text-sm text-muted-foreground">
          {batch.codes.length} codes · {batch.prefix} · {fmtDur(batch.total_secs)}
          {batch.price_php != null ? ` · ${fmtPeso(batch.price_php)}` : ""}
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={txt}>TXT</Button>
        <Button size="sm" variant="outline" onClick={csv}>CSV</Button>
        <Button size="sm" variant="outline" onClick={copyAll}>Copy all</Button>
        <Button size="sm" onClick={() => window.print()}>Print slips</Button>
      </div>
      <div className="slips-grid grid gap-3 sm:grid-cols-2">
        {batch.codes.map((c) => (
          <div key={c} className="slip rounded-xl border-2 border-dashed p-4 text-center">
            <div className="text-xs font-bold tracking-widest text-muted-foreground">WI-FI E-VOUCHER</div>
            <div className="my-2 font-mono text-2xl font-bold tracking-wider">{c}</div>
            <div className="text-sm font-semibold text-primary">
              {batch.price_php != null ? `${fmtPeso(batch.price_php)} · ` : ""}{fmtDur(batch.total_secs)} · 10 Mbps
            </div>
            <ol className="mx-auto mt-2 max-w-[240px] space-y-0.5 text-left text-[11px] text-muted-foreground">
              <li>1. Join the WiFi network on your phone.</li>
              <li>2. Enter this code when asked.</li>
              <li>3. Pause anytime to save your time.</li>
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
