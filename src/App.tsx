import { Link, NavLink, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Wifi } from "lucide-react";
import Admin from "./pages/Admin";
import Home from "./pages/Home";
import Voucher from "./pages/Voucher";
import { cn } from "./lib/utils";

function navCls(active: boolean) {
  return cn("rounded-md px-3 py-2 text-sm font-medium",
    active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground");
}

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between p-3">
            <Link to="/" className="flex items-center gap-2 font-bold">
              <Wifi className="size-5 text-primary" /> WI-FI E-VOUCHER
            </Link>
            <nav className="flex gap-1">
              <NavLink to="/" end className={({ isActive }) => navCls(isActive)}>Rates</NavLink>
              <NavLink to="/voucher" className={({ isActive }) => navCls(isActive)}>My voucher</NavLink>
              <NavLink to="/admin" className={({ isActive }) => navCls(isActive)}>Admin</NavLink>
            </nav>
          </div>
        </header>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/voucher" element={<Voucher />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </Router>
  );
}
