import { create } from "zustand";
import { persist } from "zustand/middleware";

export type User = { id: number; username: string; role: string; totp_enabled: boolean };
type BrokerSession = { broker: string; demat: string; expiresAt: string } | null;

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  brokerSession: BrokerSession;
  setAuth: (t: string, rt: string, u: User) => void;
  setBroker: (b: BrokerSession) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      brokerSession: null,
      setAuth: (token, refreshToken, user) => set({ token, refreshToken, user }),
      setBroker: (brokerSession) => set({ brokerSession }),
      logout: () => set({ token: null, refreshToken: null, user: null, brokerSession: null }),
    }),
    { name: "navin-auth" }
  )
);
