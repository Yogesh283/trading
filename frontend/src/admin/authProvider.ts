import { getBackendHttpOriginLocalAdmin } from "../backendOrigin";
import { ADMIN_TOKEN_LS_KEY } from "./authStorage";

function apiUrl(path: string): string {
  const base = getBackendHttpOriginLocalAdmin().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

function isAdminRole(role: unknown): boolean {
  return String(role ?? "").toLowerCase() === "admin";
}

export const adminAuthProvider = {
  login: async ({ username, password }: { username?: string; password?: string }) => {
    const email = String(username ?? "").trim().toLowerCase();
    const pw = String(password ?? "");
    if (!email || !pw) {
      throw new Error("Email aur password dono daalein");
    }
    const res = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = (await res.json().catch(() => null)) as {
      user?: { role?: string };
      token?: string;
      message?: string;
    } | null;
    if (!res.ok) {
      throw new Error(data?.message ?? "Login failed");
    }
    if (!data?.token) {
      throw new Error("Server ne token nahi diya");
    }
    /** DB se fresh role (login body purane server par role na bheje to bhi theek) */
    const meRes = await fetch(apiUrl("/api/auth/me"), {
      headers: { Authorization: `Bearer ${data.token}`, Accept: "application/json" }
    });
    const me = (await meRes.json().catch(() => null)) as { user?: { role?: string; email?: string } } | null;
    if (!meRes.ok) {
      throw new Error(
        `/api/auth/me failed (${meRes.status}). Local test: npm run dev → http://localhost:3000/admin.html — ` +
          "VITE_API_URL wali build localhost par live server ko mat bulao."
      );
    }
    if (!isAdminRole(me?.user?.role)) {
      const safeEmail = JSON.stringify(email);
      const current = me?.user?.role ?? "(missing)";
      throw new Error(
        [
          `Server ne role='${current}' bheja — admin ke liye 'admin' chahiye.`,
          "",
          "1) Exact email DB se (typo mat):",
          `   npm run promote-admin -- ${email}`,
          "   npm run promote-admin -- --list   → role=admin dikhe",
          "",
          "2) phpMyAdmin:",
          "   UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER(" + safeEmail + ");",
          "",
          "Local: admin panel hamesha isi machine ki API use karega (localhost fix). " +
            "Phir bhi user nahi mile to pehle Register karo usi email se."
        ].join("\n")
      );
    }
    localStorage.setItem(ADMIN_TOKEN_LS_KEY, data.token);
    return Promise.resolve();
  },
  logout: () => {
    localStorage.removeItem(ADMIN_TOKEN_LS_KEY);
    return Promise.resolve();
  },
  checkError: (error: { status?: number }) => {
    const status = error?.status;
    if (status === 401 || status === 403) {
      localStorage.removeItem(ADMIN_TOKEN_LS_KEY);
      return Promise.reject();
    }
    return Promise.resolve();
  },
  checkAuth: () =>
    localStorage.getItem(ADMIN_TOKEN_LS_KEY) ? Promise.resolve() : Promise.reject(),
  getPermissions: () => Promise.resolve("admin")
};
