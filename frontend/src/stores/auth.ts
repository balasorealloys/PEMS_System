// Auth state for the whole app: who is logged in, and the login/logout actions.
// The session itself lives in an HttpOnly cookie set by the backend — this store
// only holds the user profile and the auth status the UI branches on.
import { create } from "zustand";
import { api, type AuthUser } from "../api";

type Status = "loading" | "authed" | "anon";

interface AuthState {
  status: Status;
  user: AuthUser | null;
  check: () => Promise<void>;
  login: (empid: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  check: async () => {
    try {
      const { user } = await api.me();
      set({ status: "authed", user });
    } catch {
      set({ status: "anon", user: null });
    }
  },
  login: async (empid, password) => {
    const { user } = await api.login(empid, password);
    set({ status: "authed", user });
  },
  logout: async () => {
    try { await api.logout(); } catch { /* ignore */ }
    set({ status: "anon", user: null });
  },
}));
