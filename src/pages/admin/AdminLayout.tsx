import { NavLink, Outlet } from "react-router-dom";
import { useAdminUser } from "@/hooks/useAdminUser";
import { cn } from "@/lib/utils";

function tabCls(active: boolean) {
  return cn("rounded-md px-3 py-2 text-sm font-medium",
    active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground");
}

export default function AdminLayout() {
  const { ready } = useAdminUser();
  if (!ready) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Admin Dashboard</h1>
        <nav className="flex gap-1">
          <NavLink to="/admin" end className={({ isActive }) => tabCls(isActive)}>Dashboard</NavLink>
          <NavLink to="/admin/vouchers" className={({ isActive }) => tabCls(isActive)}>Vouchers</NavLink>
          <NavLink to="/admin/logs" className={({ isActive }) => tabCls(isActive)}>Logs</NavLink>
        </nav>
      </div>
      <Outlet />
      <p className="text-center text-[11px] text-muted-foreground">
        Dev build: no login yet and anon-key access — do not expose publicly. Direct Supabase; Worker/Railway untouched.
      </p>
    </div>
  );
}
