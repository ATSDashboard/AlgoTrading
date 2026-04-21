/**
 * React Query hooks wired to the backend.
 *
 * Convention: one hook per endpoint. Components import the hook, call it, get
 * { data, isLoading, error }. Mutations return { mutate, mutateAsync, isPending }.
 *
 * All requests go through `api` (axios instance with JWT + /api prefix).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { useAuth } from "@/stores/auth";
import { toast } from "@/components/Toast";

// ── Types (mirror backend pydantic schemas) ─────────────────────────────────

export interface User { id: number; username: string; email: string; role: string; totp_enabled: boolean; last_login_at: string | null }

export interface Market {
  nifty_spot: number; sensex_spot: number; vix: number; vix_change_pct: number;
  oi_pcr_nifty: number; max_pain_nifty: number; max_pain_sensex: number;
  breadth_advance_decline: string; fii_dii_net: string;
  expected_move_weekly: number; news_headlines: Array<{t: string; src: string; text: string}>;
}

export interface Recommendation {
  tier: number; tier_label: string;
  ce_strike: number | null; ce_premium: number | null; ce_oi: number | null; ce_cushion_ratio: number | null;
  pe_strike: number | null; pe_premium: number | null; pe_oi: number | null; pe_cushion_ratio: number | null;
  combined_premium_per_lot: number; probability_otm_estimate: number;
  score_ce: number; score_pe: number; notes: string[];
}

export interface Strategy {
  id: number; state: string; underlying: string; expiry_date: string;
  ce_strike: number; pe_strike: number; quantity_lots: number;
  hedge_enabled: boolean; trigger_mode: string; combined_threshold: number | null;
  sl_amount: number; target_amount: number | null; squareoff_time: string;
  final_pnl: number | null; exit_reason: string | null;
  created_at: string; started_at: string | null; entered_at: string | null; closed_at: string | null;
}

export interface BrokerHealth { [broker: string]: boolean }
export interface Health { status: string; brokers: BrokerHealth; env: string; ts: string }

// ── Queries ─────────────────────────────────────────────────────────────────

export function useMe() {
  const token = useAuth((s) => s.token);
  return useQuery<User>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/auth/me")).data,
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useHealth() {
  return useQuery<Health>({
    queryKey: ["health"],
    queryFn: async () => (await api.get("/health/readyz")).data,
    refetchInterval: 15_000,
  });
}

export function useMarket() {
  const token = useAuth((s) => s.token);
  return useQuery<Market>({
    queryKey: ["market"],
    queryFn: async () => (await api.get("/analytics/market")).data,
    enabled: !!token,
    refetchInterval: 10_000,
  });
}

export function useDeepOTM(underlying: "NIFTY" | "SENSEX", isMonthly: boolean = false) {
  const token = useAuth((s) => s.token);
  return useQuery<Recommendation[]>({
    queryKey: ["deep-otm", underlying, isMonthly],
    queryFn: async () => (await api.post("/analytics/deep-otm", { underlying, is_monthly: isMonthly })).data,
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useStrategies(activeOnly: boolean = false) {
  const token = useAuth((s) => s.token);
  return useQuery<Strategy[]>({
    queryKey: ["strategies", activeOnly],
    queryFn: async () => (await api.get("/strategy", { params: { active_only: activeOnly } })).data,
    enabled: !!token,
    refetchInterval: activeOnly ? 5_000 : false,
  });
}

export function useStrategy(id: number | null) {
  const token = useAuth((s) => s.token);
  return useQuery<Strategy>({
    queryKey: ["strategy", id],
    queryFn: async () => (await api.get(`/strategy/${id}`)).data,
    enabled: !!token && id !== null,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useLogin() {
  const setAuth = useAuth((s) => s.setAuth);
  return useMutation({
    mutationFn: async (p: { username: string; password: string; totp_code?: string }) => {
      const r = await api.post("/auth/login", p);
      return r.data;
    },
    onSuccess: (data, vars) => {
      setAuth(data.access_token, data.refresh_token, {
        id: data.user_id, username: vars.username, role: data.role,
        totp_enabled: data.totp_enrolled,
      });
      toast("success", "Signed in");
    },
    onError: (e: any) => {
      toast("error", "Login failed", e.response?.data?.detail ?? "Check credentials");
    },
  });
}

export function useStartStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.post(`/strategy/${id}/start`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      toast("success", "Strategy started");
    },
    onError: (e: any) => toast("error", "Start failed", e.response?.data?.detail),
  });
}

export function useExitStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.post(`/strategy/${id}/exit`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      toast("success", "Exit initiated");
    },
    onError: (e: any) => toast("error", "Exit failed", e.response?.data?.detail),
  });
}

export function useKillStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.post(`/strategy/${id}/kill`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      toast("error", "Kill switch activated");
    },
  });
}

export function useCreateStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: any) => (await api.post("/strategy", body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      toast("success", "Strategy created");
    },
    onError: (e: any) => toast("error", "Create failed", e.response?.data?.detail),
  });
}

// ── Heartbeat (dead-man switch source) ──────────────────────────────────────
/** Frontend should start this on mount and leave running. */
export function useHeartbeat() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ["heartbeat"],
    queryFn: async () => (await api.post("/health/heartbeat")).data,
    enabled: !!token,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    retry: false,
  });
}
