import { Link, Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Wifi } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import Admin from "./pages/Admin";

/* Voucher management console (admin only). No rates pages, no customer
 * surface — Wi-Fi clients use the EAP portal; Railway API serves the Worker. */
export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between p-3">
            <Link to="/admin" className="flex items-center gap-2 font-bold">
              <Wifi className="size-5 text-primary" /> VOUCHER ADMIN
            </Link>
            <span className="text-xs text-muted-foreground">Direct Supabase</span>
          </div>
        </header>
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
        <Toaster />
      </div>
    </Router>
  );
}
