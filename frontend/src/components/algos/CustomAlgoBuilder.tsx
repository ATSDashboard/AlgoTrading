/**
 * Custom Algo Builder — interactive composer for multi-step algorithmic strategies.
 *
 * An algo is a stack of typed steps. Each step has:
 *   - A name and time-window within the algo's daily window
 *   - A recipe: BUY_BASKET / SELL_LIMITS / MARGIN_RECYCLE / TAKE_PROFIT / SPIKE_MONITOR / SETTLE
 *   - (For BUY_BASKET / SELL_LIMITS) a Selector that picks strikes
 *   - Recipe-specific params
 *
 * Pre-loaded with the Manipulation Harvest template (6 steps) so the user
 * sees a working example. They can clone, tweak, and save as a new algo.
 *
 * State stays in this component for now; persistence + backend hooks are
 * Phase D — the JSON shape in `types.ts` is the contract.
 */
import { useState } from "react";
import {
  ArrowDown, Calendar, Clock, Copy, Layers, Plus, RotateCcw, Save, Sparkles, Trash2, Zap,
} from "lucide-react";
import {
  ALL_DAYS, AlgoConfig, RECIPE_LABELS, RECIPE_TYPES, Recipe, RecipeType, Selector, Step,
  blankRecipe, manipulationHarvestTemplate, newStepId,
} from "./types";
import { toast } from "@/components/Toast";

export default function CustomAlgoBuilder() {
  const [algo, setAlgo] = useState<AlgoConfig>(manipulationHarvestTemplate());

  const updateAlgo = (patch: Partial<AlgoConfig>) => setAlgo((a) => ({ ...a, ...patch }));
  const updateStep = (id: string, patch: Partial<Step>) =>
    setAlgo((a) => ({ ...a, steps: a.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const updateRecipe = (id: string, recipe: Recipe) =>
    updateStep(id, { recipe });
  const removeStep = (id: string) =>
    setAlgo((a) => ({ ...a, steps: a.steps.filter((s) => s.id !== id) }));
  const duplicateStep = (id: string) =>
    setAlgo((a) => {
      const i = a.steps.findIndex((s) => s.id === id);
      if (i < 0) return a;
      const copy: Step = { ...a.steps[i], id: newStepId(), name: a.steps[i].name + " (copy)" };
      return { ...a, steps: [...a.steps.slice(0, i + 1), copy, ...a.steps.slice(i + 1)] };
    });
  const addStep = (type: RecipeType) =>
    setAlgo((a) => ({
      ...a,
      steps: [
        ...a.steps,
        {
          id: newStepId(),
          name: RECIPE_LABELS[type],
          startTime: a.windowStart,
          endTime: a.windowEnd,
          recipe: blankRecipe(type),
        },
      ],
    }));
  const moveStep = (id: string, dir: -1 | 1) =>
    setAlgo((a) => {
      const i = a.steps.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= a.steps.length) return a;
      const next = a.steps.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...a, steps: next };
    });

  return (
    <section className="card space-y-5" style={{ borderStyle: "solid" }}>
      <Header algo={algo} updateAlgo={updateAlgo} />

      {/* Schedule */}
      <ScheduleEditor algo={algo} updateAlgo={updateAlgo} />

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5">
            <Layers size={13} className="text-[var(--accent)]" /> Steps ({algo.steps.length})
          </div>
        </div>

        <div className="space-y-1">
          {algo.steps.map((step, i) => (
            <div key={step.id}>
              <StepCard
                step={step} index={i} totalSteps={algo.steps.length}
                allSteps={algo.steps}
                onUpdate={(patch) => updateStep(step.id, patch)}
                onUpdateRecipe={(r) => updateRecipe(step.id, r)}
                onMoveUp={() => moveStep(step.id, -1)}
                onMoveDown={() => moveStep(step.id, +1)}
                onDuplicate={() => duplicateStep(step.id)}
                onRemove={() => removeStep(step.id)}
              />
              {i < algo.steps.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ArrowDown size={12} className="text-[var(--muted)]" />
                </div>
              )}
            </div>
          ))}
        </div>

        <AddStepRow onAdd={addStep} />
      </div>

      {/* Hard rules */}
      <HardRules algo={algo} updateAlgo={updateAlgo} />

      {/* Actions */}
      <div className="flex gap-2 flex-wrap pt-3 border-t" style={{ borderColor: "var(--border)" }}>
        <button className="btn-primary btn-sm flex items-center gap-1"
                onClick={() => toast("success", "Algo saved", `"${algo.name}" added to your algo library`)}>
          <Save size={13} /> Save algo
        </button>
        <button className="btn-ghost btn-sm flex items-center gap-1"
                onClick={() => toast("info", "Replay started",
                  "Backtesting against the last 8 weeks of data — this would take 30–60s in production.")}>
          <RotateCcw size={13} /> Replay vs last 8 weeks
        </button>
        <button className="btn-ghost btn-sm flex items-center gap-1"
                onClick={() => setAlgo(manipulationHarvestTemplate())}>
          <Sparkles size={13} /> Reset to template
        </button>
        <button className="btn-danger btn-sm flex items-center gap-1 ml-auto"
                onClick={() => toast("warn", "Schedule pending",
                  "Algo activation is admin-gated; you'll get a confirm modal in the wired version.")}>
          <Zap size={13} /> Activate
        </button>
      </div>
    </section>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function Header({ algo, updateAlgo }: { algo: AlgoConfig; updateAlgo: (p: Partial<AlgoConfig>) => void }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles size={16} className="text-[var(--accent)]" />
        <input className="input !py-1 !w-72 text-sm font-semibold"
               value={algo.name}
               onChange={(e) => updateAlgo({ name: e.target.value })}
               placeholder="Algo name" />
        <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide"
              style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
          CUSTOM
        </span>
      </div>
      <select className="input !py-1 !w-36 text-sm" value={algo.instrument}
              onChange={(e) => updateAlgo({ instrument: e.target.value as "NIFTY" | "SENSEX" })}>
        <option value="NIFTY">NIFTY</option>
        <option value="SENSEX">SENSEX</option>
      </select>
    </div>
  );
}

function ScheduleEditor({ algo, updateAlgo }: { algo: AlgoConfig; updateAlgo: (p: Partial<AlgoConfig>) => void }) {
  const toggleDay = (d: string) =>
    updateAlgo({ days: algo.days.includes(d) ? algo.days.filter((x) => x !== d) : [...algo.days, d] });

  return (
    <div className="rounded-lg border p-3 flex flex-wrap items-end gap-4"
         style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-[var(--muted)] mb-1.5">
          <Calendar size={10} className="inline mr-1" /> Active days
        </label>
        <div className="inline-flex rounded-md p-0.5 border" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
          {ALL_DAYS.map((d) => (
            <button key={d} type="button" onClick={() => toggleDay(d)}
                    className="px-2.5 py-1 rounded text-[11px] font-semibold transition"
                    style={algo.days.includes(d)
                      ? { background: "var(--accent)", color: "white" }
                      : { background: "transparent", color: "var(--muted)" }}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-[var(--muted)] mb-1.5">
          <Clock size={10} className="inline mr-1" /> Daily window (IST)
        </label>
        <div className="flex items-center gap-2">
          <input type="time" className="input !py-1 font-mono w-28"
                 value={algo.windowStart}
                 onChange={(e) => updateAlgo({ windowStart: e.target.value })} />
          <span className="text-[var(--muted)] text-xs">to</span>
          <input type="time" className="input !py-1 font-mono w-28"
                 value={algo.windowEnd}
                 onChange={(e) => updateAlgo({ windowEnd: e.target.value })} />
        </div>
      </div>

      <div className="text-[11px] text-[var(--muted)] ml-auto">
        Runs on <b>{algo.days.length}</b> day{algo.days.length !== 1 ? "s" : ""}/week
        between <b className="font-mono">{algo.windowStart}</b>–<b className="font-mono">{algo.windowEnd}</b>
      </div>
    </div>
  );
}

function StepCard({ step, index, totalSteps, allSteps, onUpdate, onUpdateRecipe, onMoveUp, onMoveDown, onDuplicate, onRemove }: {
  step: Step; index: number; totalSteps: number; allSteps: Step[];
  onUpdate: (p: Partial<Step>) => void;
  onUpdateRecipe: (r: Recipe) => void;
  onMoveUp: () => void; onMoveDown: () => void;
  onDuplicate: () => void; onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2.5"
         style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
      {/* Step header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold w-14 text-[var(--muted)]">STEP {index + 1}</span>
        <input className="input !py-1 !w-44 text-sm font-semibold"
               value={step.name} onChange={(e) => onUpdate({ name: e.target.value })} />
        <span className="text-[var(--muted)] text-xs">·</span>
        <input type="time" className="input !py-1 !w-24 font-mono text-xs"
               value={step.startTime} onChange={(e) => onUpdate({ startTime: e.target.value })} />
        <span className="text-[var(--muted)] text-xs">to</span>
        <input type="time" className="input !py-1 !w-24 font-mono text-xs"
               value={step.endTime} onChange={(e) => onUpdate({ endTime: e.target.value })} />
        <span className="text-[var(--muted)] text-xs">·</span>
        <select className="input !py-1 !w-44 text-xs" value={step.recipe.type}
                onChange={(e) => onUpdateRecipe(blankRecipe(e.target.value as RecipeType))}>
          {RECIPE_TYPES.map((t) => <option key={t} value={t}>{RECIPE_LABELS[t]}</option>)}
        </select>

        <div className="flex gap-0.5 ml-auto">
          <IconBtn title="Move up"  disabled={index === 0}                  icon="↑" onClick={onMoveUp} />
          <IconBtn title="Move down" disabled={index === totalSteps - 1}    icon="↓" onClick={onMoveDown} />
          <IconBtn title="Duplicate"                                         onClick={onDuplicate}><Copy size={13} /></IconBtn>
          <IconBtn title="Remove" danger                                     onClick={onRemove}><Trash2 size={13} /></IconBtn>
        </div>
      </div>

      {/* Recipe-specific editor */}
      <RecipeEditor recipe={step.recipe} onChange={onUpdateRecipe} allSteps={allSteps} currentStepId={step.id} />
    </div>
  );
}

function IconBtn({ title, onClick, disabled, danger, icon, children }: {
  title: string; onClick: () => void; disabled?: boolean; danger?: boolean;
  icon?: string; children?: React.ReactNode;
}) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick}
            className={`px-1.5 py-0.5 rounded text-xs font-mono transition disabled:opacity-30 disabled:cursor-not-allowed ${
              danger ? "text-[var(--muted)] hover:text-[var(--danger)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}>
      {children ?? icon}
    </button>
  );
}

// ─── Recipe editors ──────────────────────────────────────────────────────

function RecipeEditor({ recipe, onChange, allSteps, currentStepId }: {
  recipe: Recipe; onChange: (r: Recipe) => void; allSteps: Step[]; currentStepId: string;
}) {
  switch (recipe.type) {
    case "MARGIN_RECYCLE":
      return (
        <ParamGrid>
          <NumberParam label="Close % of qualifying shorts" value={recipe.closePct} step={5}
                       onChange={(v) => onChange({ ...recipe, closePct: v })} />
          <NumberParam label="Min distance OTM (%)" value={recipe.qualifyingMinDistPct} step={0.1}
                       onChange={(v) => onChange({ ...recipe, qualifyingMinDistPct: v })} />
          <NumberParam label="Max LTP to qualify (₹)" value={recipe.qualifyingMaxLtp} step={0.05}
                       onChange={(v) => onChange({ ...recipe, qualifyingMaxLtp: v })} />
        </ParamGrid>
      );

    case "BUY_BASKET":
      return (
        <>
          <ParamGrid>
            <NumberParam label="Basket budget (₹)" value={recipe.budgetInr} step={500}
                         onChange={(v) => onChange({ ...recipe, budgetInr: v })} />
            <NumberParam label="Number of strikes" value={recipe.nStrikes} step={1}
                         onChange={(v) => onChange({ ...recipe, nStrikes: v })} />
            <NumberParam label="Limit offset above ask (₹)" value={recipe.limitOffset} step={0.05}
                         onChange={(v) => onChange({ ...recipe, limitOffset: v })} />
          </ParamGrid>
          <SelectorEditor selector={recipe.selector}
                          onChange={(s) => onChange({ ...recipe, selector: s })} />
        </>
      );

    case "SELL_LIMITS":
      return (
        <>
          <ParamGrid>
            <NumberParam label="Multiplier × LTP at recipe start" value={recipe.multiplier} step={0.5}
                         onChange={(v) => onChange({ ...recipe, multiplier: v })} />
            <NumberParam label="Quantity per strike (lots)" value={recipe.qtyLots} step={5}
                         onChange={(v) => onChange({ ...recipe, qtyLots: v })} />
          </ParamGrid>
          <SelectorEditor selector={recipe.selector}
                          onChange={(s) => onChange({ ...recipe, selector: s })} />
        </>
      );

    case "TAKE_PROFIT":
      return (
        <ParamGrid>
          <NumberParam label="TP multiplier × buy avg" value={recipe.tpMultiplier} step={0.5}
                       onChange={(v) => onChange({ ...recipe, tpMultiplier: v })} />
          <div>
            <label className="block text-[10px] font-medium mb-1 text-[var(--muted)]">Applies to step</label>
            <select className="input !py-1 text-xs"
                    value={recipe.appliesToStepId ?? ""}
                    onChange={(e) => onChange({ ...recipe, appliesToStepId: e.target.value || null })}>
              <option value="">Any prior BUY_BASKET</option>
              {allSteps
                .filter((s) => s.id !== currentStepId && s.recipe.type === "BUY_BASKET")
                .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </ParamGrid>
      );

    case "SPIKE_MONITOR":
      return (
        <ParamGrid>
          <NumberParam label="Spike threshold × baseline" value={recipe.thresholdMultiplier} step={0.5}
                       onChange={(v) => onChange({ ...recipe, thresholdMultiplier: v })} />
          <NumberParam label="Poll interval (sec)" value={recipe.pollIntervalSec} step={5}
                       onChange={(v) => onChange({ ...recipe, pollIntervalSec: v })} />
          <div>
            <label className="block text-[10px] font-medium mb-1 text-[var(--muted)]">Baseline taken at</label>
            <input type="time" className="input !py-1 font-mono text-xs"
                   value={recipe.baselineFromTime}
                   onChange={(e) => onChange({ ...recipe, baselineFromTime: e.target.value })} />
          </div>
        </ParamGrid>
      );

    case "SETTLE":
      return (
        <div className="flex gap-4 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={recipe.cancelUnfilled}
                   onChange={(e) => onChange({ ...recipe, cancelUnfilled: e.target.checked })} />
            Cancel all unfilled orders
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={recipe.closeOpenLongs}
                   onChange={(e) => onChange({ ...recipe, closeOpenLongs: e.target.checked })} />
            Market-close any open longs
          </label>
        </div>
      );
  }
}

function SelectorEditor({ selector, onChange }: { selector: Selector; onChange: (s: Selector) => void }) {
  const unit = selector.metric === "percent" ? "%" : selector.metric === "points" ? "pts" : "Δ";
  return (
    <div className="rounded-md border p-2.5 space-y-2"
         style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] flex items-center gap-1">
        Strike selector
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select className="input !py-1 !w-28 text-xs" value={selector.metric}
                onChange={(e) => onChange({ ...selector, metric: e.target.value as Selector["metric"] })}>
          <option value="percent">% away</option>
          <option value="points">Points</option>
          <option value="delta">Delta</option>
        </select>

        <span className="text-[var(--muted)] text-xs">range</span>
        <input type="number" step="0.1" className="input !py-1 !w-20 text-xs font-mono text-center"
               value={selector.rangeMin}
               onChange={(e) => onChange({ ...selector, rangeMin: +e.target.value })} />
        <span className="text-[var(--muted)] text-xs">to</span>
        <input type="number" step="0.1" className="input !py-1 !w-20 text-xs font-mono text-center"
               value={selector.rangeMax}
               onChange={(e) => onChange({ ...selector, rangeMax: +e.target.value })} />
        <span className="text-[var(--muted)] text-xs">{unit}</span>

        <span className="text-[var(--muted)] text-xs ml-3">side</span>
        <div className="inline-flex rounded p-0.5 border" style={{ borderColor: "var(--border)" }}>
          {(["BOTH", "CE", "PE"] as const).map((s) => (
            <button key={s} type="button"
                    onClick={() => onChange({ ...selector, side: s })}
                    className="px-2 py-0.5 rounded text-[11px] font-semibold"
                    style={selector.side === s
                      ? { background: "var(--accent)", color: "white" }
                      : { color: "var(--muted)" }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-[var(--muted)]">filter</span>
        <NumberFilter label="Max OI" value={selector.maxOi} step={100000}
                      onChange={(v) => onChange({ ...selector, maxOi: v })} placeholder="off" />
        <NumberFilter label="Min LTP ₹" value={selector.minLtp} step={0.05}
                      onChange={(v) => onChange({ ...selector, minLtp: v })} placeholder="off" />
        <NumberFilter label="Max LTP ₹" value={selector.maxLtp} step={0.05}
                      onChange={(v) => onChange({ ...selector, maxLtp: v })} placeholder="off" />
      </div>
    </div>
  );
}

// ─── Param helpers ───────────────────────────────────────────────────────

function ParamGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">{children}</div>;
}

function NumberParam({ label, value, step, onChange }:
  { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-medium mb-1 text-[var(--muted)]">{label}</label>
      <input type="number" step={step} className="input !py-1 text-xs font-mono"
             value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

function NumberFilter({ label, value, step, placeholder, onChange }:
  { label: string; value: number | null; step: number; placeholder: string; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[var(--muted)]">{label}</span>
      <input type="number" step={step} className="input !py-1 !w-24 text-xs font-mono"
             value={value ?? ""} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value === "" ? null : +e.target.value)} />
    </div>
  );
}

// ─── Add Step + Hard rules ───────────────────────────────────────────────

function AddStepRow({ onAdd }: { onAdd: (t: RecipeType) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {RECIPE_TYPES.map((t) => (
        <button key={t} type="button" onClick={() => onAdd(t)}
                className="btn-ghost btn-sm flex items-center gap-1 !text-[11px]">
          <Plus size={11} /> {RECIPE_LABELS[t]}
        </button>
      ))}
    </div>
  );
}

function HardRules({ algo, updateAlgo }: { algo: AlgoConfig; updateAlgo: (p: Partial<AlgoConfig>) => void }) {
  const r = algo.hardRules;
  const set = (patch: Partial<AlgoConfig["hardRules"]>) =>
    updateAlgo({ hardRules: { ...r, ...patch } });
  return (
    <div className="rounded-lg border p-3 space-y-2"
         style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
      <div className="text-xs font-semibold flex items-center gap-1.5">
        🛡 Hard rules <span className="text-[10px] text-[var(--muted)] font-normal">(safeguards · cannot be bypassed live)</span>
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
        <NumberParam label="Max capital per run (₹)" value={r.maxCapitalInr} step={500}
                     onChange={(v) => set({ maxCapitalInr: v })} />
        <NumberParam label="Skip if VIX above" value={r.vixSkipAbove} step={0.5}
                     onChange={(v) => set({ vixSkipAbove: v })} />
        <NumberParam label="Spot emergency exit (%)" value={r.spotEmergencyPct} step={0.1}
                     onChange={(v) => set({ spotEmergencyPct: v })} />
        <div>
          <label className="block text-[10px] font-medium mb-1 text-[var(--muted)]">No new orders after</label>
          <input type="time" className="input !py-1 font-mono text-xs"
                 value={r.noNewOrdersAfter}
                 onChange={(e) => set({ noNewOrdersAfter: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
