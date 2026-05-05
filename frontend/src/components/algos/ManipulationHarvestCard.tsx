/**
 * Manipulation Harvest — SENSEX Thursday E-0 multi-phase algo.
 *
 * Empirical basis: 212 detected late-day premium spikes across 40 of 53
 * SENSEX expiry days (1-yr sample). The algo runs in 4 phases between
 * 14:00 and 15:25 IST harvesting the manipulation via:
 *   Phase 1  margin recycling + Play D long basket
 *   Phase 2  pre-placed SELL LIMITs + take-profits on Phase 1 longs
 *   Phase 3  spike-monitor (alerts only; orders fill passively)
 *   Phase 4  settle, cancel unfilled, log P&L
 *
 * UI is hardcoded today — params are editable but the phase structure is
 * fixed. A Custom Algo Builder will let traders compose multi-phase algos
 * from the same primitives (see CustomAlgoBuilderProposal.tsx for spec).
 *
 * See docs/algo_specs/manipulation_harvest_v1.md for the full spec.
 */
import { useState } from "react";
import { Activity, AlertCircle, Calendar, Clock, Info, Play, Power } from "lucide-react";

type Status = "off" | "scheduled" | "running";

const PHASES = [
  { name: "PREP",    range: "14:00 – 14:30", desc: "Margin recycle (close 20% of qualifying shorts) · Play D long basket" },
  { name: "DEPLOY",  range: "14:30 – 15:00", desc: "Pre-placed SELL LIMITs at multiplier · take-profits on Phase 1 longs" },
  { name: "CATCH",   range: "15:00 – 15:25", desc: "Spike monitor (poll 30s) · pre-placed orders fill passively" },
  { name: "SETTLE",  range: "≥ 15:25",       desc: "Cancel unfilled · settle longs · journal P&L to log" },
];

export default function ManipulationHarvestCard() {
  const [status, setStatus] = useState<Status>("off");

  // Configurable params (defaults from spec v1.0)
  const [budgetInr,        setBudgetInr]        = useState(12500);
  const [sellMultiplier,   setSellMultiplier]   = useState(12);
  const [tpMultiplier,     setTpMultiplier]     = useState(10);
  const [maxOiSell,        setMaxOiSell]        = useState(3_000_000);
  const [maxOiBuy,         setMaxOiBuy]         = useState(2_000_000);
  const [closeShortPct,    setCloseShortPct]    = useState(20);
  const [vixSkip,          setVixSkip]          = useState(22);
  const [spotEmergencyPct, setSpotEmergencyPct] = useState(1.0);

  return (
    <section className="card"
             style={{ background: "color-mix(in srgb, var(--warn) 5%, var(--panel))" }}>
      <Header status={status} setStatus={setStatus} />

      {/* Strategy facts row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm mt-3">
        <KV k="Instrument"   v="SENSEX" />
        <KV k="Active day"   v="Thursday (E-0)" />
        <KV k="Window"       v="14:00 – 15:25 IST" />
        <KV k="Empirical edge" v="40/53 days, 212 spikes" />
      </div>

      <p className="text-[11px] text-[var(--muted)] mt-3">
        Sells deep-OTM strikes at 10-15× LTP via pre-placed SELL LIMITs that fill passively
        when manipulation spikes hit. Layered with a small Play D long basket bought pre-window
        for asymmetric upside, plus 20% margin recycling on existing OTM shorts.
      </p>

      {/* Phase timeline */}
      <div className="mt-4 grid sm:grid-cols-4 gap-2">
        {PHASES.map((p, i) => (
          <div key={p.name} className="rounded-lg border p-2.5"
               style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[var(--muted)]">PHASE {i + 1}</span>
              <span className="text-xs font-semibold">{p.name}</span>
            </div>
            <div className="text-[10px] text-[var(--muted)] mt-1 font-mono">{p.range}</div>
            <div className="text-[11px] text-[var(--muted)] mt-1.5 leading-snug">{p.desc}</div>
          </div>
        ))}
      </div>

      {/* Configurable params — collapsed by default */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium flex items-center gap-2">
          <Info size={14} className="text-[var(--accent)]" />
          Algo parameters <span className="text-[10px] text-[var(--muted)] font-normal">(defaults from spec v1.0)</span>
        </summary>

        <div className="mt-3 grid md:grid-cols-2 gap-x-6 gap-y-3">
          <Param label="Play D long basket budget (₹)" hint="₹10K–15K typical">
            <input type="number" step="500" min={5000} max={50000}
                   className="input font-mono" value={budgetInr}
                   onChange={(e) => setBudgetInr(+e.target.value)} />
          </Param>

          <Param label="SELL LIMIT multiplier" hint="× current LTP · spec range 10–15">
            <input type="number" step="0.5" min={5} max={20}
                   className="input font-mono" value={sellMultiplier}
                   onChange={(e) => setSellMultiplier(+e.target.value)} />
          </Param>

          <Param label="Take-profit multiplier (Play D longs)" hint="× buy avg · spec range 8–15">
            <input type="number" step="0.5" min={3} max={20}
                   className="input font-mono" value={tpMultiplier}
                   onChange={(e) => setTpMultiplier(+e.target.value)} />
          </Param>

          <Param label="Margin recycle % (close existing OTM shorts)" hint="0 = disable">
            <input type="number" step="5" min={0} max={50}
                   className="input font-mono" value={closeShortPct}
                   onChange={(e) => setCloseShortPct(+e.target.value)} />
          </Param>

          <Param label="Max OI for SELL LIMIT strikes" hint="too liquid → won't get manipulated">
            <input type="number" step="100000" min={100000}
                   className="input font-mono" value={maxOiSell}
                   onChange={(e) => setMaxOiSell(+e.target.value)} />
          </Param>

          <Param label="Max OI for Play D BUY strikes" hint="must be illiquid">
            <input type="number" step="100000" min={100000}
                   className="input font-mono" value={maxOiBuy}
                   onChange={(e) => setMaxOiBuy(+e.target.value)} />
          </Param>

          <Param label="Skip if VIX above" hint="high vol = manipulators have better targets">
            <input type="number" step="0.5" min={10} max={50}
                   className="input font-mono" value={vixSkip}
                   onChange={(e) => setVixSkip(+e.target.value)} />
          </Param>

          <Param label="Emergency exit on spot move (%)" hint="abort if SENSEX moves > X% intraday">
            <input type="number" step="0.1" min={0.5} max={5}
                   className="input font-mono" value={spotEmergencyPct}
                   onChange={(e) => setSpotEmergencyPct(+e.target.value)} />
          </Param>
        </div>

        <div className="mt-3 text-[11px] text-[var(--muted)] flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>
            Strikes auto-selected from the 4.5–5.5% OTM band (Play D buys) and
            3.0–5.5% OTM band (sell limits). Strike selection biases CE / PE
            split based on max-pain vs spot — not configurable here.
          </span>
        </div>
      </details>

      {/* Risk + safeguard summary */}
      <div className="mt-4 rounded-lg border p-3 text-[11px] space-y-1.5"
           style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
        <div className="flex items-center gap-2 font-semibold text-[var(--ink)]">
          <Power size={12} /> Hard rules (non-negotiable)
        </div>
        <ul className="text-[var(--muted)] space-y-1 pl-5 list-disc">
          <li>No SL on deep-OTM positions — only spot-based emergency exit</li>
          <li>Max budget per Thursday: <b>₹{(budgetInr / 1000).toFixed(0)}K</b> (Play D buys)</li>
          <li>No new orders after <b>15:20</b> · auto-cancel unfilled at 15:25</li>
          <li>Skip if SENSEX moves &gt; {spotEmergencyPct}% intraday or VIX &gt; {vixSkip}</li>
        </ul>
      </div>

      {/* Last run summary (mock — backend will provide) */}
      <div className="mt-4 grid sm:grid-cols-4 gap-x-6 gap-y-2 text-xs pt-3 border-t"
           style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Last run</div>
          <div className="font-mono">Thu 24 Apr · settled</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">P&amp;L</div>
          <div className="font-mono font-semibold text-[var(--success)]">+₹17,820</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Fills</div>
          <div className="font-mono">3 of 12 sells · 4 of 5 TPs</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Capital used</div>
          <div className="font-mono">₹12,420</div>
        </div>
      </div>
    </section>
  );
}

function Header({ status, setStatus }: { status: Status; setStatus: (s: Status) => void }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Activity size={16} className="text-[var(--warn)]" />
        <h2 className="font-semibold text-base">Manipulation Harvest</h2>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide"
              style={{ background: "color-mix(in srgb, var(--warn) 20%, transparent)", color: "var(--warn)" }}>
          ALGO · v1.0
        </span>
        <span className="text-[10px] text-[var(--muted)] font-mono flex items-center gap-1">
          <Calendar size={10} /> SENSEX · Thu E-0
        </span>
      </div>

      <div className="flex items-center gap-2">
        <StatusBadge status={status} />
        <div className="inline-flex rounded-lg p-0.5 border"
             style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
          <ModeBtn active={status === "off"}       label="Off"        onClick={() => setStatus("off")} />
          <ModeBtn active={status === "scheduled"} label="Schedule next Thu" onClick={() => setStatus("scheduled")} />
          <ModeBtn active={status === "running"}   label="Run today" onClick={() => setStatus("running")} icon={<Play size={11} />} />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "off") {
    return <span className="text-[10px] text-[var(--muted)]">inactive</span>;
  }
  if (status === "scheduled") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
        <Clock size={10} /> scheduled · next Thu 14:00
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
          style={{ background: "color-mix(in srgb, var(--success) 15%, transparent)", color: "var(--success)" }}>
      <Activity size={10} className="animate-pulse" /> live
    </span>
  );
}

function ModeBtn({ active, label, onClick, icon }:
  { active: boolean; label: string; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
            className="px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1"
            style={active
              ? { background: "var(--panel)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }
              : { background: "transparent", color: "var(--muted)" }}>
      {icon}{label}
    </button>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{k}</div>
      <div className="font-mono font-semibold text-sm">{v}</div>
    </div>
  );
}

function Param({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium mb-1 text-[var(--muted)]">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-[var(--muted)] mt-0.5">{hint}</div>}
    </div>
  );
}
