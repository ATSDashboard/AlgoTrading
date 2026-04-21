import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/stores/auth";
import { useLogin } from "@/api/hooks";
import { ShieldCheck, Eye } from "lucide-react";

export default function Login() {
  const nav = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);
  const [form, setForm] = useState({ username: "", password: "", totp: "" });
  const login = useLogin();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data = await login.mutateAsync({
        username: form.username, password: form.password,
        totp_code: form.totp || undefined,
      });
      nav(data.must_enroll_totp ? "/settings/profile" : "/connect-broker");
    } catch { /* toast handled in hook */ }
  }
  const err = (login.error as any)?.response?.data?.detail;
  const loading = login.isPending;

  function previewMode() {
    setAuth("preview-token", "preview-refresh", {
      id: 1, username: "rohan", role: "ADMIN", totp_enabled: true,
    });
    nav("/connect-broker");
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm card space-y-5">
        <div className="text-center">
          <div className="text-xl font-bold">Theta Gainers Algo</div>
          <div className="mt-2 flex justify-center gap-2 text-xs">
            <span className="chip-yellow">PAPER MODE</span>
            <span className="chip-gray">v1.0.0</span>
          </div>
        </div>

        <div>
          <label className="label">Username</label>
          <input className="input" value={form.username}
                 onChange={(e) => setForm({...form, username: e.target.value})}
                 autoComplete="username" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={form.password}
                 onChange={(e) => setForm({...form, password: e.target.value})}
                 autoComplete="current-password" required />
        </div>
        <div>
          <label className="label">2FA Code (if enrolled)</label>
          <input className="input font-mono tracking-widest" inputMode="numeric" maxLength={6}
                 value={form.totp}
                 onChange={(e) => setForm({...form, totp: e.target.value.replace(/\D/g, "")})}
                 placeholder="123456" />
        </div>

        {err && <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">{err}</div>}

        <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={loading}>
          <ShieldCheck size={16}/> {loading ? "Signing in…" : "Sign In"}
        </button>

        <div className="relative text-center">
          <span className="relative z-10 bg-panel px-2 text-xs text-muted">or</span>
          <span className="absolute inset-x-0 top-1/2 border-t border-border"/>
        </div>

        <button type="button" onClick={previewMode}
                className="btn-ghost w-full flex items-center justify-center gap-2">
          <Eye size={16}/> Preview Mode (no backend — click-through UI)
        </button>

        <div className="text-xs text-muted text-center space-y-1">
          <div>Broker session (Axis / Zerodha / Monarch / JM) linked after login.</div>
          <div>Forgot password? Contact your admin.</div>
        </div>
      </form>
    </div>
  );
}
