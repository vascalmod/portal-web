import { Route, Routes } from "react-router-dom";
import AdminLayout from "./admin/AdminLayout";
import Dashboard from "./admin/Dashboard";
import Logs from "./admin/Logs";
import VoucherDetail from "./admin/VoucherDetail";
import Vouchers from "./admin/Vouchers";

/* Admin hub — direct Supabase, no Railway, no login in v1 (spec §16).
 * Customer pages (Home/Voucher) still use the Railway /portal/* API. */
export default function Admin() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="vouchers" element={<Vouchers />} />
        <Route path="vouchers/:code" element={<VoucherDetail />} />
        <Route path="logs" element={<Logs />} />
      </Route>
    </Routes>
  );
}
