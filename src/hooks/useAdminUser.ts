/* Auth seam for the admin dashboard (spec §16: no login in v1).
 * v1 returns a permanently-signed-in stub so /admin opens directly.
 * Adding Supabase Auth later = implement this hook for real (sign in/out,
 * session user) — pages consume only {user, ready} and <AdminGate>. */

export interface AdminUser {
  id: string;
  email?: string;
}

export function useAdminUser(): { user: AdminUser | null; ready: boolean } {
  return { user: { id: "local-admin" }, ready: true };
}
