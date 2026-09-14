import { Badge } from "@/components/ui/badge";
import type { VoucherState } from "@/lib/vouchers";

const MAP: Record<VoucherState, "default" | "success" | "warning" | "secondary" | "destructive"> = {
  NEW: "default", ACTIVE: "success", PAUSED: "warning", EXPIRED: "secondary", DISABLED: "destructive",
};

export function StateBadge({ state }: { state: VoucherState }) {
  return <Badge variant={MAP[state]}>{state}</Badge>;
}
