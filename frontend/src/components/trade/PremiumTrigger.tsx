/**
 * Premium Trigger — separate module from Strike Selector.
 *
 * 4 modes (mutually exclusive):
 *   - Combined ∑ : sum of CE + PE bid ≥ threshold
 *   - Per ₹1Cr  : (sum × lotSize) / margin × 1Cr ≥ threshold (yield-on-margin)
 *   - Per-leg   : each leg's bid ≥ its Trade Price (single source of truth)
 *   - Enter now : bypass trigger, enter at current LIMIT prices
 *
 * Auto-trades fire only when strike rule ✓ AND premium trigger ✓.
 * Combined and Per-Cr modes lock to 2 legs (CE + PE strangle).
 *
 * See HANDOFF §2.3 for the full spec.
 */
import { Activity } from "lucide-react";

export type TriggerMode = "COMBINED" | "PER_CR" | "SEPARATE" | "NONE";
export type LegIndependence = "linked" | "independent";

type Leg = {
  id: string;
  type: "CE" | "PE" | "FUT";
  strike: number;
  price: number;
};

type Props = {
  // mode + setter (parent handles leg trim on COMBINED/PER_CR)
  triggerMode: TriggerMode;
  onModeChange: (m: TriggerMode) => void;

  // Combined ∑
  combinedTrigger: string;
  setCombinedTrigger: (v: string) => void;
  combinedLive: number;
  legsInTrigger: number;

  // Per ₹1Cr
  perCrTrigger: string;
  setPerCrTrigger: (v: string) => void;
  perCrLive: number;

  // Per-leg
  legs: Leg[];
  legIndependence: LegIndependence;
  setLegIndependence: (v: LegIndependence) => void;

  // shared
  triggerMet: boolean;
  legCount: number;        // for the Combined help text
  lotSize: number;         // for Per-Cr formula text
  strikeMode: "manual" | "auto";
  restrictByTime: boolean;
  entryFrom: string;
  entryTo: string;
};

export default function PremiumTrigger(p: Props) {
  return (
    <section className="card space-y-3">
      <Header {...p} />
      {p.triggerMode === "COMBINED" && <CombinedBody {...p} />}
      {p.triggerMode === "PER_CR" && <PerCrBody {...p} />}
      {p.triggerMode === "SEPARATE" && <SeparateBody {...p} />}
      {p.triggerMode === "NONE" && (
        <div className="text-sm text-[var(--muted)]">
          Strategy enters immediately at current LIMIT prices (subject to pre-trade RMS + margin check).
        </div>
      )}
    </section>
  );
}

function Header(p: Props) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 className="font-semibold">Premium Trigger</h2>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">
          Live entry gate — combined CE+PE or per-leg threshold.
          {p.strikeMode === "auto" && <> Auto-trades fire only when <b>strike rule</b> ✓ <b>and</b> <b>premium trigger</b> ✓.</>}
          {p.restrictByTime && <> Active only between <b>{p.entryFrom}</b>–<b>{p.entryTo}</b> IST.</>}
        </p>
      </div>
      <div className="inline-flex rounded-lg p-0.5 border" style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
        {(["COMBINED", "PER_CR", "SEPARATE", "NONE"] as const).map((m) => (
          <button key={m} type="button" onClick={() => p.onModeChange(m)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold transition"
                  style={p.triggerMode === m
                    ? { background: "var(--panel)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }
                    : { background: "transparent", color: "var(--muted)" }}>
            {m === "COMBINED" ? "Combined ∑" : m === "PER_CR" ? "Per ₹1Cr" : m === "SEPARATE" ? "Per-leg" : "Enter now"}
          </button>
        ))}
      </div>
    </div>
  );
}

function CombinedBody(p: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="label">Combined ≥ ₹ (sum of ∑-marked legs)</label>
          <input className="input font-mono w-40" value={p.combinedTrigger}
                 onChange={(e) => p.setCombinedTrigger(e.target.value)} />
        </div>
        <Stat label={`Live sum of ${p.legsInTrigger} legs`}
              value={`₹${p.combinedLive.toFixed(2)}`}
              highlighted={p.triggerMet} animate={p.triggerMet} />
        <Stat label="Threshold" value={`₹${p.combinedTrigger}`} />
        <StatusChip met={p.triggerMet} />
      </div>
      <div className="text-xs text-[var(--muted)]">
        Formula: Σ(SELL leg bid) − Σ(BUY leg ask) for all ∑-marked legs.
        {p.legCount > 2 && " Toggle the ∑ column on each leg above to pick which legs combine."}
      </div>
    </div>
  );
}

function PerCrBody(p: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="label">Combined premium per ₹1Cr margin ≥ ₹</label>
          <input className="input font-mono w-40" value={p.perCrTrigger}
                 onChange={(e) => p.setPerCrTrigger(e.target.value)} />
        </div>
        <Stat label="Live ratio"
              value={`₹${Math.round(p.perCrLive).toLocaleString("en-IN")} / Cr`}
              highlighted={p.triggerMet} animate={p.triggerMet} />
        <Stat label="Threshold"
              value={`₹${(+p.perCrTrigger).toLocaleString("en-IN")} / Cr`} />
        <StatusChip met={p.triggerMet} />
      </div>
      <div className="text-xs text-[var(--muted)] leading-relaxed">
        <b>Formula:</b> (Σ leg credit × {p.lotSize}) ÷ margin required × ₹1Cr.
        Strikes are still chosen by your <b>{p.strikeMode === "auto" ? "auto rule (Strike Selector)" : "manual selection"}</b> — this only gates the entry by yield-on-margin.
      </div>
    </div>
  );
}

function SeparateBody(p: Props) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3 text-xs"
           style={{
             borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
             background: "color-mix(in srgb, var(--accent) 5%, transparent)",
           }}>
        <div className="flex items-start gap-2">
          <Activity size={13} className="text-[var(--accent)] mt-0.5" />
          <div>
            <b>Thresholds = each leg's Trade Price</b> in the Legs table above.
            Edit them there; entry fires when each leg's bid ≥ its Trade Price.
            No duplicate input — single source of truth.
          </div>
        </div>
        <div className="mt-2 flex gap-3 flex-wrap pl-5">
          {p.legs.map((l) => (
            <span key={l.id} className="flex items-center gap-1.5 text-xs">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                    style={{ background: l.type === "CE" ? "var(--danger)" : "var(--accent)" }}>{l.type}</span>
              <span className="font-mono">{l.strike}</span>
              <span className="text-[var(--muted)]">≥</span>
              <span className="font-mono font-semibold">₹{l.price.toFixed(2)}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-[var(--muted)]">Execution:</span>
        <div className="flex rounded-md border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {(["linked", "independent"] as const).map((m) => (
            <button key={m} onClick={() => p.setLegIndependence(m)}
                    className="px-3 py-1.5 text-xs font-semibold"
                    style={{
                      background: p.legIndependence === m ? "var(--accent)" : "transparent",
                      color: p.legIndependence === m ? "white" : "var(--muted)",
                    }}>
              {m === "linked" ? "Both legs together" : "Each leg independent"}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-[var(--muted)]">
          {p.legIndependence === "linked"
            ? "Both CE and PE must be at threshold at the same moment to fire."
            : "Each leg fires on its own as soon as its threshold is met — other leg can wait."}
        </span>
      </div>

      <details className="text-[11px] text-[var(--muted)]">
        <summary className="cursor-pointer">Examples (click to expand)</summary>
        <ul className="mt-2 space-y-1.5 pl-4 list-disc">
          <li>CE 3% away & premium ≥ ₹3, PE 4% away & premium ≥ ₹2 → <b>Each leg independent</b></li>
          <li>CE & PE both 2000 pts away, CE prem ≥ ₹3, PE prem ≥ ₹4 → <b>Both together</b></li>
          <li>CE 4% away, PE 3% away, combined ≥ ₹7 → switch to <b>Combined ∑</b> mode</li>
        </ul>
      </details>
    </div>
  );
}

function Stat({ label, value, highlighted, animate }: { label: string; value: string; highlighted?: boolean; animate?: boolean }) {
  return (
    <div className="pt-5">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={`font-mono text-xl font-bold ${highlighted ? "text-[var(--success)]" : ""}`}>
        {value}
        {animate && <Activity size={16} className="inline ml-2 animate-pulse" />}
      </div>
    </div>
  );
}

function StatusChip({ met }: { met: boolean }) {
  return (
    <div className="pt-5">
      <div className="text-xs text-[var(--muted)]">Status</div>
      <div>{met ? <span className="chip-green">MET</span> : <span className="chip-yellow">Waiting</span>}</div>
    </div>
  );
}
