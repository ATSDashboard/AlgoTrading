import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/stores/auth";
import { LogIn } from "lucide-react";

const BROKERS = [
  { id: "paper",    name: "Paper Broker (mock)",     tag: "always available" },
  { id: "axis",     name: "Axis Direct (RAPID)",     tag: "live" },
  { id: "zerodha",  name: "Zerodha (Kite Connect)",  tag: "live" },
  { id: "monarch",  name: "Monarch Networth",        tag: "live" },
  { id: "jm",       name: "JM Financial (Blink)",    tag: "live" },
];

const MOCK_DEMATS: Record<string, {id: string; label: string}[]> = {
  paper:   [{ id: "PAPER-001", label: "Paper Account (dev)" }],
  axis:    [{ id: "1234567890", label: "Rohan — Individual" },
            { id: "9876543210", label: "Rohan — HUF" }],
  zerodha: [{ id: "ZD12345", label: "Rohan — Kite" }],
  monarch: [{ id: "MN98765", label: "Rohan — Monarch" }],
  jm:      [{ id: "JM45678", label: "Rohan — JM Blink" }],
};

export default function ConnectBroker() {
  const nav = useNavigate();
  const setBroker = useAuth((s) => s.setBroker);
  const [broker, setB] = useState("paper");
  const [demat, setD] = useState(MOCK_DEMATS.paper[0].id);

  function onConnect() {
    // In production: call /auth/broker/connect/init, redirect to broker SSO.
    // For now (paper + UI preview): set session directly.
    setBroker({
      broker, demat,
      expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    });
    nav("/");
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-lg card space-y-5">
        <div>
          <h1 className="text-lg font-bold">Connect Broker Session</h1>
          <p className="text-sm text-muted mt-1">Link a live broker + demat to enable trading.</p>
        </div>

        <div>
          <label className="label">Broker</label>
          <select className="input" value={broker}
                  onChange={(e) => { setB(e.target.value); setD(MOCK_DEMATS[e.target.value][0].id); }}>
            {BROKERS.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <div className="mt-1 text-xs text-muted">
            {BROKERS.find((x) => x.id === broker)?.tag}
          </div>
        </div>

        <div>
          <label className="label">Demat Account</label>
          <select className="input" value={demat} onChange={(e) => setD(e.target.value)}>
            {MOCK_DEMATS[broker].map((d) => (
              <option key={d.id} value={d.id}>{d.id} — {d.label}</option>
            ))}
          </select>
        </div>

        <div className="text-xs text-muted bg-panel border border-border rounded-lg p-3">
          You'll be redirected to the broker's secure login page. Token expires in ~8h;
          you'll be asked to reconnect. Paper broker has no external redirect.
        </div>

        <button onClick={onConnect} className="btn-primary w-full flex items-center justify-center gap-2">
          <LogIn size={16}/> Connect via Broker Login
        </button>
      </div>
    </div>
  );
}
