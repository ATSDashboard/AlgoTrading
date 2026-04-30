/**
 * Exit Rules & Kill Switches.
 * Default rules apply to every running strategy; trailing SL + lock-in
 * are opt-in toggles. Dead-man is hidden under "Advanced" because the
 * SL + MTM-DD + square-off combination already covers our intraday use
 * case (see HANDOFF §2.6).
 */
import { ReactNode } from "react";

type Props = {
  sl: string;            setSl: (v: string) => void;
  target: string;        setTarget: (v: string) => void;
  sqoff: string;         setSqoff: (v: string) => void;
  mtmDdKill: number;     setMtmDdKill: (v: number) => void;

  trailingEnabled: boolean; setTrailingEnabled: (v: boolean) => void;
  trailingTrigger: string;  setTrailingTrigger: (v: string) => void;
  trailingStep: string;     setTrailingStep: (v: string) => void;

  lockinEnabled: boolean;   setLockinEnabled: (v: boolean) => void;
  lockinAmount: string;     setLockinAmount: (v: string) => void;

  // Spot-vs-strike defensive exit (e.g. "exit CE when spot within 150pts of strike")
  spotProximityEnabled: boolean;     setSpotProximityEnabled: (v: boolean) => void;
  spotProximityMode: "points" | "percent"; setSpotProximityMode: (v: "points" | "percent") => void;
  spotProximityValue: string;        setSpotProximityValue: (v: string) => void;
  spotProximityScope: "leg" | "both"; setSpotProximityScope: (v: "leg" | "both") => void;

  deadman: number;       setDeadman: (v: number) => void;
};

export default function ExitRules(p: Props) {
  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Exit Rules & Kill Switches</h2>
        <span className="text-xs text-[var(--muted)]">Defaults from Settings → Risk</span>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Stop Loss (₹)"><input className="input font-mono" value={p.sl} onChange={(e) => p.setSl(e.target.value)} /></Field>
        <Field label="Target (₹)"><input className="input font-mono" value={p.target} onChange={(e) => p.setTarget(e.target.value)} /></Field>
        <Field label="Square-off time (IST)"><input className="input font-mono" value={p.sqoff} onChange={(e) => p.setSqoff(e.target.value)} /></Field>
        <Field label="MTM DD kill (% from peak)">
          <input type="number" className="input font-mono" value={p.mtmDdKill} onChange={(e) => p.setMtmDdKill(+e.target.value)} />
        </Field>
      </div>

      <ToggleRow label="Trailing SL" enabled={p.trailingEnabled} onChange={p.setTrailingEnabled}>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <Field label="Activate after profit ₹">
            <input className="input font-mono" value={p.trailingTrigger} onChange={(e) => p.setTrailingTrigger(e.target.value)} />
          </Field>
          <Field label="Step ₹">
            <input className="input font-mono" value={p.trailingStep} onChange={(e) => p.setTrailingStep(e.target.value)} />
          </Field>
        </div>
      </ToggleRow>

      <ToggleRow label="Lock-in profits" enabled={p.lockinEnabled} onChange={p.setLockinEnabled}>
        <Field label="When profit ≥ ₹, move SL to breakeven">
          <input className="input font-mono" value={p.lockinAmount} onChange={(e) => p.setLockinAmount(e.target.value)} />
        </Field>
      </ToggleRow>

      <ToggleRow label="Exit when spot approaches strike"
                 enabled={p.spotProximityEnabled} onChange={p.setSpotProximityEnabled}>
        <div className="grid md:grid-cols-3 gap-3 mt-2 items-end">
          <div>
            <label className="label">Distance type</label>
            <div className="inline-flex rounded-lg p-0.5 border" style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
              {(["points", "percent"] as const).map((m) => (
                <button key={m} type="button" onClick={() => p.setSpotProximityMode(m)}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold transition"
                        style={p.spotProximityMode === m
                          ? { background: "var(--panel)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }
                          : { background: "transparent", color: "var(--muted)" }}>
                  {m === "points" ? "Points" : "%"}
                </button>
              ))}
            </div>
          </div>

          <Field label={p.spotProximityMode === "points"
            ? "Exit when |spot − strike| ≤ (pts)"
            : "Exit when |spot − strike| ÷ strike ≤ (%)"}>
            <div className="flex items-center gap-2">
              <input type="number" step={p.spotProximityMode === "points" ? "10" : "0.05"}
                     className="input font-mono"
                     placeholder={p.spotProximityMode === "points" ? "150" : "0.5"}
                     value={p.spotProximityValue}
                     onChange={(e) => p.setSpotProximityValue(e.target.value)} />
              <span className="text-xs text-[var(--muted)]">{p.spotProximityMode === "points" ? "pts" : "%"}</span>
            </div>
          </Field>

          <div>
            <label className="label">When triggered</label>
            <div className="inline-flex rounded-lg p-0.5 border" style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
              {(["leg", "both"] as const).map((m) => (
                <button key={m} type="button" onClick={() => p.setSpotProximityScope(m)}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold transition"
                        style={p.spotProximityScope === m
                          ? { background: "var(--panel)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }
                          : { background: "transparent", color: "var(--muted)" }}>
                  {m === "leg" ? "Exit that leg only" : "Exit both legs"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-[var(--muted)] mt-3 leading-relaxed">
          <b>Example:</b> Sold CE 25,600 with proximity = 150 pts (leg-only). If spot rises
          to 25,450, this leg auto-exits.&nbsp;
          {p.spotProximityScope === "both" && (
            <>If <b>Exit both</b> is selected, the PE side closes too — protects the strangle as one unit.</>
          )}
        </p>
      </ToggleRow>

      <details className="text-xs">
        <summary className="cursor-pointer text-[var(--muted)] hover:text-[var(--ink)]">
          Advanced — Dead-man switch <span className="text-[10px]">(usually off · for HFT/compliance only)</span>
        </summary>
        <div className="mt-3 max-w-sm">
          <Field label="Dead-man switch heartbeat (s, min 60)">
            <input type="number" className="input font-mono" min={60}
                   value={p.deadman} onChange={(e) => p.setDeadman(+e.target.value)} />
          </Field>
          <p className="text-[11px] text-[var(--muted)] mt-2 leading-relaxed">
            Auto-flattens positions if no heartbeat is received within this window.
            <b> Not recommended for Deep OTM strangle</b> — your SL, MTM-DD kill,
            and square-off time already cover unattended cases without false triggers
            from network blips or laptop sleep. Set 0 to disable.
          </p>
        </div>
      </details>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}

function ToggleRow({ label, enabled, onChange, children }:
  { label: string; enabled: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="font-medium text-sm">{label}</span>
      </label>
      {enabled && children}
    </div>
  );
}
