import { useState } from "react";
import { Sparkles, Target, Save, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Tier = 1 | 2 | 3 | 4;
const TIER_LABEL: Record<Tier, string> = {
  1: "Almost Sure Shot", 2: "Very Deep", 3: "Balanced", 4: "Aggressive",
};
const TIER_PROB: Record<Tier, string> = { 1: ">95%", 2: ">90%", 3: ">80%", 4: ">70%" };

// Mock data (replace with /analytics/deep-otm call)
const MARKET = {
  nifty: 24812.40, vix: 13.24, vix_chg: -1.8, pcr: 1.11, max_pain: 24800,
  expected_move_weekly: 185.6, dte: 1,
};
const RECS: Array<{
  tier: Tier; ce?: {strike: number; premium: number; oi: number; cushion: number; score: number};
  pe?: {strike: number; premium: number; oi: number; cushion: number; score: number};
  combined_per_lot: number; margin_per_lot: number; probability: number; notes: string[];
}> = [
  { tier: 1,
    ce: {strike: 25500, premium:  9.95, oi: 2_094_000, cushion: 3.71, score: 6},
    pe: {strike: 22000, premium: 37.00, oi: 1_842_000, cushion: 4.53, score: 6},
    combined_per_lot: 3055, margin_per_lot: 109000, probability: 0.96,
    notes: ["Both strikes behind top-3 OI walls", "VIX calm (13.2)"]},
  { tier: 2,
    ce: {strike: 25000, premium: 36.45, oi: 3_966_000, cushion: 1.01, score: 5},
    pe: {strike: 22500, premium: 71.85, oi: 3_722_000, cushion: 2.49, score: 5},
    combined_per_lot: 7040, margin_per_lot: 112000, probability: 0.90,
    notes: ["CE strike IS top-OI wall", "PE has fresh writing +68%"]},
  { tier: 3,
    ce: {strike: 24900, premium: 58.20, oi: 2_880_000, cushion: 0.47, score: 4},
    pe: {strike: 22800, premium: 98.00, oi: 2_410_000, cushion: 1.62, score: 4},
    combined_per_lot: 10153, margin_per_lot: 116000, probability: 0.82,
    notes: ["Balanced — monitor closely in last 30 min"]},
];

export default function Analytics() {
  const [mode, setMode] = useState<"weekly"|"monthly">("weekly");
  const [underlying, setUnderlying] = useState<"NIFTY"|"SENSEX">("NIFTY");
  const nav = useNavigate();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles size={20} className="text-[var(--accent)]"/> Deep OTM Analytics
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Strike recommendations with volatility-adjusted cushion · tiered by probability of expiring OTM
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border overflow-hidden" style={{borderColor:"var(--border)"}}>
            {(["NIFTY","SENSEX"] as const).map((u) => (
              <button key={u} onClick={() => setUnderlying(u)}
                      className={`px-3 py-1.5 text-xs font-semibold ${underlying===u?"text-[var(--accent)]":"text-[var(--muted)]"}`}
                      style={underlying===u?{background:"color-mix(in srgb,var(--accent) 15%,transparent)"}:{}}>{u}</button>
            ))}
          </div>
          <div className="flex rounded-lg border overflow-hidden" style={{borderColor:"var(--border)"}}>
            {(["weekly","monthly"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                      className={`px-3 py-1.5 text-xs capitalize ${mode===m?"text-[var(--accent)]":"text-[var(--muted)]"}`}
                      style={mode===m?{background:"color-mix(in srgb,var(--accent) 15%,transparent)"}:{}}>{m}</button>
            ))}
          </div>
          <button className="btn-ghost flex items-center gap-1 btn-sm"><RefreshCw size={12}/>Refresh</button>
        </div>
      </div>

      {/* Market snapshot */}
      <div className="grid md:grid-cols-6 gap-3">
        <Snap l={`${underlying} Spot`}   v={MARKET.nifty.toLocaleString("en-IN")} />
        <Snap l="VIX"          v={`${MARKET.vix}  ${MARKET.vix_chg<0?"▼":"▲"}${Math.abs(MARKET.vix_chg)}%`} tone={MARKET.vix>=25?"danger":"ok"}/>
        <Snap l="OI PCR"       v={MARKET.pcr.toString()} hint={MARKET.pcr>1.3?"Bullish bias":MARKET.pcr<0.8?"Bearish bias":"Neutral"}/>
        <Snap l="Max Pain"     v={MARKET.max_pain.toLocaleString("en-IN")} hint={`Δ ${MARKET.nifty - MARKET.max_pain} pts`}/>
        <Snap l="Expected Move" v={`±${MARKET.expected_move_weekly}`} hint={`${MARKET.dte} DTE`}/>
        <Snap l="Safety Band" v={mode==="weekly"?"1.5x":"2.0x"} hint={`${mode} multiplier`}/>
      </div>

      {/* Risk flags */}
      <div className="card flex items-start gap-3" style={{background:"color-mix(in srgb,var(--warn) 8%,transparent)",
                                                             borderColor:"color-mix(in srgb,var(--warn) 30%,transparent)"}}>
        <AlertTriangle size={18} className="text-[var(--warn)] shrink-0 mt-0.5"/>
        <div className="text-sm">
          <b>Context:</b> Expiry day · last-hour gamma risk high · VIX calm at 13.2 — premiums compressed ·
          FII net seller yday (-₹842Cr). Size smaller on Tier-3/4 today.
        </div>
      </div>

      {/* Recommendations */}
      <div className="space-y-3">
        {RECS.map((r) => (
          <div key={r.tier} className={`card tier-${r.tier} space-y-3`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className={`chip-${r.tier===1?"green":r.tier===2?"blue":r.tier===3?"yellow":"red"} !text-sm !px-3`}>
                  Tier {r.tier} · {TIER_LABEL[r.tier]}
                </span>
                <span className="text-xs text-[var(--muted)]">Hit rate {TIER_PROB[r.tier]}</span>
              </div>
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <MetricPill k="Credit/lot" v={`₹${r.combined_per_lot.toLocaleString("en-IN")}`} tone="green"/>
                <MetricPill k="Margin/lot" v={`₹${(r.margin_per_lot/1000).toFixed(0)}k`} />
                <MetricPill k="ROI/lot" v={`${((r.combined_per_lot/r.margin_per_lot)*100).toFixed(2)}%`} tone="green"
                             hint="Credit / margin · per expiry"/>
                <MetricPill k="Per ₹1Cr" v={`₹${Math.round((r.combined_per_lot/r.margin_per_lot)*10000000).toLocaleString("en-IN")}`}
                             hint="Premium captured per ₹1Cr margin deployed"/>
                <MetricPill k="P(OTM)" v={`${(r.probability*100).toFixed(0)}%`}/>
                <button onClick={() => nav("/strategy/new")}
                        className="btn-primary btn-sm flex items-center gap-1">
                  <Target size={12}/> Use in Strategy
                </button>
                <button className="btn-ghost btn-sm flex items-center gap-1"><Save size={12}/>Save Rule</button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <LegCard side="CE" d={r.ce} walls="25500, 25000, 25100"/>
              <LegCard side="PE" d={r.pe} walls="22500, 22000, 22800"/>
            </div>

            {r.notes.length > 0 && (
              <div className="text-xs text-[var(--muted)] flex flex-wrap gap-2 pt-2 border-t" style={{borderColor:"var(--border)"}}>
                {r.notes.map((n) => <span key={n}>• {n}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Saved rules */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Save size={16}/> Saved Strategy Rules
          </h2>
          <button className="btn-ghost btn-sm">+ New Rule Set</button>
        </div>
        <table className="w-full">
          <thead><tr>
            <th className="table-th">Name</th><th className="table-th">Kind</th>
            <th className="table-th">Min Tier</th><th className="table-th">SL/Target</th>
            <th className="table-th">Last Used</th><th className="table-th"></th>
          </tr></thead>
          <tbody>
            <tr className="hover-row">
              <td className="table-td font-medium">Expiry Day — Tier 1 Strangle</td>
              <td className="table-td"><span className="chip-gray">SHORT_STRANGLE</span></td>
              <td className="table-td">Tier 1</td><td className="table-td font-mono">3000 / 2000</td>
              <td className="table-td text-[var(--muted)]">Yesterday</td>
              <td className="table-td text-right"><button className="text-[var(--accent)] text-sm">Apply →</button></td>
            </tr>
            <tr className="hover-row">
              <td className="table-td font-medium">Monthly Deep OTM — Tier 2</td>
              <td className="table-td"><span className="chip-gray">SHORT_STRANGLE</span></td>
              <td className="table-td">Tier 2</td><td className="table-td font-mono">6000 / 4000</td>
              <td className="table-td text-[var(--muted)]">5d ago</td>
              <td className="table-td text-right"><button className="text-[var(--accent)] text-sm">Apply →</button></td>
            </tr>
            <tr className="hover-row">
              <td className="table-td font-medium">Iron Condor — Expiry Week</td>
              <td className="table-td"><span className="chip-gray">IRON_CONDOR</span></td>
              <td className="table-td">Tier 2</td><td className="table-td font-mono">5000 / 3500</td>
              <td className="table-td text-[var(--muted)]">2w ago</td>
              <td className="table-td text-right"><button className="text-[var(--accent)] text-sm">Apply →</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricPill({k, v, tone, hint}: {k: string; v: string; tone?: "green"; hint?: string}) {
  const col = tone === "green" ? "var(--success)" : "var(--ink)";
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-md border" style={{borderColor:"var(--border)"}} title={hint}>
      <span className="text-[var(--muted)] text-xs">{k}</span>
      <span className="font-mono text-sm font-semibold" style={{color: col}}>{v}</span>
    </div>
  );
}

function Snap({l, v, hint, tone}: {l: string; v: string; hint?: string; tone?: "ok"|"danger"}) {
  return (
    <div className="card-compact">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{l}</div>
      <div className={`mt-1 font-mono text-lg font-bold ${tone==="danger"?"text-[var(--danger)]":""}`}>{v}</div>
      {hint && <div className="text-[10px] text-[var(--muted)] mt-0.5">{hint}</div>}
    </div>
  );
}

function LegCard({side, d, walls}:
  {side: "CE"|"PE"; d?: {strike: number; premium: number; oi: number; cushion: number; score: number}; walls: string}) {
  if (!d) return <div className="card-compact text-[var(--muted)] text-sm">No {side} recommendation this tier</div>;
  return (
    <div className="card-compact">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">
          <span className={`chip-${side==="CE"?"red":"blue"} mr-2`}>SELL {side}</span>
          <span className="font-mono text-lg">{d.strike}</span>
        </div>
        <span className="chip-gray text-[10px]">score {d.score}/7</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-[var(--muted)]">Premium</dt><dd className="font-mono text-right">₹{d.premium.toFixed(2)}</dd>
        <dt className="text-[var(--muted)]">OI</dt><dd className="font-mono text-right">{(d.oi/1_00_000).toFixed(1)}L</dd>
        <dt className="text-[var(--muted)]">Cushion</dt><dd className="font-mono text-right">{d.cushion.toFixed(2)}x</dd>
        <dt className="text-[var(--muted)]">Top-3 walls</dt><dd className="font-mono text-right text-[10px]">{walls}</dd>
      </dl>
    </div>
  );
}
