/**
 * Composable rule builder for the Strike Selector Engine.
 *
 * CE and PE can be configured with different rules (default) or share the
 * same rule via the "Mirror CE → PE" toggle.
 *
 * Wire each rule to the backend /strike-selector/evaluate to get live
 * candidates per side.
 */
import { useEffect, useState } from "react";
import { Plus, X, Save, Zap, Filter as FilterIcon, Target, Link2, Link2Off } from "lucide-react";
import FormModal from "./FormModal";
import { toast } from "./Toast";

type Filter = {
  id: string;
  label: string;
  params_schema: Record<string, string>;
};

type RuleLeaf = { filter: string; params: Record<string, any> };
type RuleNode = RuleLeaf | { all_of: RuleNode[] } | { any_of: RuleNode[] } | { not: RuleNode };

// NOTE: Premium-based filters are intentionally NOT here — they live in the
// separate Premium Trigger module below the Strike Selector. Selecting
// strikes is a structural decision (distance / delta / OI / spread / regime),
// while premium thresholds are a live entry gate. Auto-trade requires BOTH
// to be satisfied.
const FILTERS: Filter[] = [
  {id:"DISTANCE_POINTS",       label:"Distance from spot (pts)", params_schema:{min:"int|null", max:"int|null"}},
  {id:"DISTANCE_PERCENT",      label:"Distance from spot (%)",   params_schema:{min:"float|null", max:"float|null"}},
  {id:"DELTA",                 label:"Absolute delta band",      params_schema:{min:"float|null", max:"float|null"}},
  {id:"OI_MIN",                label:"Min open interest",        params_schema:{min:"int"}},
  {id:"OI_WALL_BEHIND",        label:"Beyond top-N OI wall",     params_schema:{top_n:"int"}},
  {id:"BID_ASK_SPREAD_PCT",    label:"Max bid-ask spread (%)",   params_schema:{max:"float"}},
  {id:"MIN_VOLUME",            label:"Min volume",               params_schema:{min:"int"}},
  {id:"IV_RANK",               label:"IV rank (percentile)",     params_schema:{min:"float|null", max:"float|null"}},
  {id:"DAYS_TO_EXPIRY",        label:"Days to expiry",           params_schema:{min:"int|null", max:"int|null"}},
  {id:"CUSHION_RATIO",         label:"Cushion × expected move",  params_schema:{min:"float"}},
  {id:"PCR_REGIME",            label:"OI PCR regime gate",       params_schema:{allow:"list[str]"}},
  {id:"VIX_REGIME",            label:"VIX regime gate",          params_schema:{allow:"list[str]"}},
  {id:"TIME_WINDOW",           label:"Intraday time window",     params_schema:{from:"HH:MM", to:"HH:MM"}},
];

const PRESETS: Array<{name: string; rule: RuleNode}> = [
  { name: "Deep OTM Classic",
    rule: {all_of: [
      {filter:"DISTANCE_PERCENT", params:{min:3}},
      {filter:"OI_MIN", params:{min:50000}},
      {filter:"BID_ASK_SPREAD_PCT", params:{max:5}},
    ]}},
  { name: "Conservative Expiry Day",
    rule: {all_of: [
      {filter:"DISTANCE_POINTS", params:{min:300}},
      {filter:"VIX_REGIME", params:{allow:["calm"]}},
      {filter:"TIME_WINDOW", params:{from:"09:30", to:"10:30"}},
    ]}},
  { name: "Points-based Strangle",
    rule: {all_of: [
      {filter:"DISTANCE_POINTS", params:{min:800}},
      {filter:"BID_ASK_SPREAD_PCT", params:{max:5}},
      {filter:"OI_MIN", params:{min:25000}},
    ]}},
];

const DEFAULT_RULE: RuleNode = {all_of: [
  {filter: "DISTANCE_PERCENT", params: {min: 2.5}},
  {filter: "OI_MIN", params: {min: 50000}},
]};

type DistanceType = "percent" | "points" | "delta";

export default function StrikeSelectorBuilder() {
  // ── Primary distance criteria — the focal point ────────────────────
  const [distType, setDistType] = useState<DistanceType>("percent");
  const [shared, setShared] = useState(true);  // single value vs CE/PE-specific
  const [ceVal, setCeVal] = useState<number>(3);
  const [peVal, setPeVal] = useState<number>(3);

  // ── Advanced filters (rule tree) ──────────────────────────────────
  const [ceRule, setCeRule] = useState<RuleNode>(DEFAULT_RULE);
  const [peRule, setPeRule] = useState<RuleNode>(DEFAULT_RULE);
  const [mirror, setMirror] = useState(true);
  const [activeSide, setActiveSide] = useState<"CE" | "PE">("CE");
  const [saveOpen, setSaveOpen] = useState<null | "CE" | "PE" | "BOTH">(null);

  const distMeta: Record<DistanceType, {label: string; unit: string; step: string; placeholder: string}> = {
    percent: {label: "% away from spot",   unit: "%",   step: "0.1", placeholder: "3.0"},
    points:  {label: "Points away from spot", unit: "pts", step: "50",  placeholder: "1500"},
    delta:   {label: "Absolute delta",      unit: "Δ",   step: "0.01", placeholder: "0.15"},
  };
  const dm = distMeta[distType];

  // When mirror is on, edits to either side propagate to the other
  useEffect(() => {
    if (mirror) setPeRule(ceRule);
  }, [ceRule, mirror]);

  function applyPresetTo(side: "CE" | "PE" | "BOTH", presetName: string) {
    const p = PRESETS.find(x => x.name === presetName); if (!p) return;
    if (side === "CE" || side === "BOTH" || mirror) setCeRule(p.rule);
    if (side === "PE" || side === "BOTH" || mirror) setPeRule(p.rule);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Target size={16} className="text-[var(--accent)]"/> Rule Builder
          </h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Pick distance metric (% / points / delta) — same for both legs or independent CE/PE.
            <span className="block mt-0.5">
              Premium thresholds live in the <b>Premium Trigger</b> section below. Auto-entry requires <b>both</b> to pass.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setMirror(m => !m)}
                  className="btn-ghost btn-sm flex items-center gap-1.5"
                  title={mirror ? "CE & PE rules are kept in sync" : "CE & PE rules are independent"}
                  style={mirror ? {color: "var(--accent)", borderColor: "var(--accent)"} : {}}>
            {mirror ? <Link2 size={13}/> : <Link2Off size={13}/>}
            {mirror ? "Mirror CE ↔ PE (ON)" : "Independent CE / PE"}
          </button>
          <button className="btn-primary btn-sm flex items-center gap-1"
                  onClick={() => toast("info","Re-evaluating against live chain…","CE: 3 candidates · PE: 2 candidates")}>
            <Zap size={12}/>Preview
          </button>
        </div>
      </div>

      {/* ── Primary Distance Criteria ────────────────────────────────── */}
      <div className="card space-y-3" style={{borderTop:"3px solid var(--accent)"}}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 className="font-semibold text-sm">Primary criteria · Distance from spot</h4>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">
              Pick the metric, then set value{shared ? "" : "s"} for {shared ? "both legs" : "CE and PE separately"}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Distance type radio */}
            <div className="flex rounded-md border overflow-hidden" style={{borderColor:"var(--border)"}}>
              {(["percent","points","delta"] as const).map(t => (
                <button key={t} onClick={() => setDistType(t)}
                        className="px-3 py-1.5 text-xs font-semibold"
                        style={{background: distType===t ? "var(--accent)" : "transparent",
                                color: distType===t ? "white" : "var(--muted)"}}>
                  {t === "percent" ? "% away" : t === "points" ? "Points" : "Delta"}
                </button>
              ))}
            </div>
            {/* Same / Independent toggle */}
            <button onClick={() => setShared(s => !s)}
                    className="btn-ghost btn-sm flex items-center gap-1.5"
                    style={shared ? {color: "var(--accent)", borderColor: "var(--accent)"} : {}}>
              {shared ? <Link2 size={13}/> : <Link2Off size={13}/>}
              {shared ? "Same for CE & PE" : "Independent CE / PE"}
            </button>
          </div>
        </div>

        <div className={`grid gap-3 ${shared ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
          {shared ? (
            <PrimaryInput side="BOTH" label={dm.label} unit={dm.unit} step={dm.step}
                          placeholder={dm.placeholder} value={ceVal}
                          onChange={(v) => { setCeVal(v); setPeVal(v); }}/>
          ) : (
            <>
              <PrimaryInput side="CE" label={`CE ${dm.label}`} unit={dm.unit} step={dm.step}
                            placeholder={dm.placeholder} value={ceVal} onChange={setCeVal}/>
              <PrimaryInput side="PE" label={`PE ${dm.label}`} unit={dm.unit} step={dm.step}
                            placeholder={dm.placeholder} value={peVal} onChange={setPeVal}/>
            </>
          )}
        </div>

        <div className="text-[11px] text-[var(--muted)] space-y-1 pt-1 border-t" style={{borderColor:"var(--border)"}}>
          <div className="flex items-center gap-1.5">
            <FilterIcon size={11}/>
            Strike selector chooses strikes by this rule. <b>Premium trigger</b> below decides when to enter.
          </div>
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5">⤴</span>
            <span>
              <b>Rounding rule:</b> strike always snaps to the next available grid <b>further from spot</b>.
              CE rounds <b>up</b> (e.g. 3% = 24,535 → <span className="font-mono text-[var(--ink)]">24,600 CE</span>),
              PE rounds <b>down</b> (e.g. 21,230 → <span className="font-mono text-[var(--ink)]">21,200 PE</span>).
              Never closer than the rule asks for.
            </span>
          </div>
        </div>
      </div>

      {/* ── Advanced filters (rule tree) — collapsed by default ──────── */}
      <details className="card" open={false}>
        <summary className="cursor-pointer flex items-center justify-between text-sm font-semibold py-1">
          <span className="flex items-center gap-2">
            <FilterIcon size={14}/> Advanced filters
            <span className="text-[10px] text-[var(--muted)] font-normal">
              (OI, spread, volume, IV rank, regime, time window…)
            </span>
          </span>
          <button onClick={(e) => { e.preventDefault(); setMirror(m => !m); }}
                  className="btn-ghost btn-sm flex items-center gap-1.5"
                  style={mirror ? {color: "var(--accent)", borderColor: "var(--accent)"} : {}}>
            {mirror ? <Link2 size={13}/> : <Link2Off size={13}/>}
            {mirror ? "Mirror CE ↔ PE" : "Independent CE / PE"}
          </button>
        </summary>

        <div className="mt-3">
          <div className="md:hidden flex rounded-md border overflow-hidden mb-2" style={{borderColor:"var(--border)"}}>
            {(["CE","PE"] as const).map(s => (
              <button key={s} onClick={() => setActiveSide(s)}
                      className="flex-1 px-4 py-2 text-xs font-semibold"
                      style={{background: activeSide===s ? "var(--accent)" : "transparent",
                              color: activeSide===s ? "white" : "var(--muted)"}}>
                {s} Rule
              </button>
            ))}
          </div>

          <div className={`grid gap-4 ${mirror ? "" : "md:grid-cols-2"}`}>
            <div className={`${activeSide === "CE" ? "" : "hidden md:block"}`}>
              <SideHeader side="CE" mirror={mirror}
                          onLoadPreset={(n) => applyPresetTo("CE", n)}
                          onSave={() => setSaveOpen("CE")}/>
              <div className="mt-2">
                <RuleEditor rule={ceRule} onChange={setCeRule} depth={0}/>
              </div>
            </div>
            {!mirror && (
              <div className={`${activeSide === "PE" ? "" : "hidden md:block"}`}>
                <SideHeader side="PE" mirror={mirror}
                            onLoadPreset={(n) => applyPresetTo("PE", n)}
                            onSave={() => setSaveOpen("PE")}/>
                <div className="mt-2">
                  <RuleEditor rule={peRule} onChange={setPeRule} depth={0}/>
                </div>
              </div>
            )}
          </div>
        </div>
      </details>

      {/* Save modal */}
      <FormModal open={saveOpen !== null} title={`Save ${saveOpen === "BOTH" ? "rule pair" : `${saveOpen} rule`} as preset`}
        fields={[
          {name:"name", label:"Preset name", type:"text", required:true, placeholder:"My Deep OTM Rule v2"},
          {name:"description", label:"Notes (optional)", type:"textarea"},
          {name:"applies_to", label:"Use for", type:"select", required:true,
           options:["Entry rule","Exit rule","Both entry and exit"], defaultValue:"Entry rule"},
        ]}
        submitLabel="Save preset"
        onSubmit={(v) => {setSaveOpen(null); toast("success","Preset saved", v.name);}}
        onCancel={() => setSaveOpen(null)}/>

      {/* JSON debug (hide in prod) */}
      <details className="text-xs">
        <summary className="cursor-pointer text-[var(--muted)]">Rule JSON (for dev/API)</summary>
        <pre className="mt-2 p-3 rounded font-mono overflow-x-auto" style={{background:"var(--panel-2)"}}>
{JSON.stringify({
  primary: {distance_type: distType, shared, ce_value: ceVal, pe_value: peVal},
  advanced: {ce: ceRule, pe: peRule, mirror},
}, null, 2)}
        </pre>
      </details>

      {/* Live preview */}
      <div className="card" style={{background:"var(--panel-2)"}}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">Live Preview</h4>
          <span className="text-xs text-[var(--muted)]">
            NIFTY · 17-Apr · {mirror ? "shared rule" : "split CE/PE rules"}
          </span>
        </div>
        <div className="text-[11px] text-[var(--muted)] mb-2">
          Spot 24,812 · {distType === "percent" ? `${ceVal}%` : distType === "points" ? `${ceVal}pts` : `Δ${ceVal}`} away
          {!shared && ` (CE) / ${distType === "percent" ? `${peVal}%` : distType === "points" ? `${peVal}pts` : `Δ${peVal}`} (PE)`}
          · strikes rounded <b>away from spot</b> (CE↑, PE↓)
        </div>
        <div className="space-y-3">
          <SidePreview side="CE" rows={[
            {strike:"25600 CE", price:"₹18.40", oi:"1.2M", pass:true},
            {strike:"25700 CE", price:"₹14.10", oi:"850K", pass:true},
            {strike:"25500 CE", price:"₹24.85", oi:"2.1M", pass:false},
          ]}/>
          <SidePreview side="PE" rows={[
            {strike:"24050 PE", price:"₹22.85", oi:"980K", pass:true},
            {strike:"23950 PE", price:"₹17.40", oi:"540K", pass:true},
            {strike:"24150 PE", price:"₹31.20", oi:"1.6M", pass:false},
          ]}/>
        </div>
      </div>
    </div>
  );
}

function PrimaryInput({side, label, unit, step, placeholder, value, onChange}:
  {side: "CE"|"PE"|"BOTH"; label: string; unit: string; step: string;
   placeholder: string; value: number; onChange: (v: number) => void}) {
  const tone = side === "CE" ? "var(--danger)" : side === "PE" ? "var(--accent)" : "var(--ink)";
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border"
         style={{borderColor:"var(--border)", background:"var(--panel-2)"}}>
      {side !== "BOTH" && (
        <span className="px-2 py-0.5 rounded text-xs font-bold text-white"
              style={{background: tone}}>{side}</span>
      )}
      <div className="flex-1">
        <label className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</label>
        <div className="flex items-center gap-2 mt-1">
          <input type="number" step={step} placeholder={placeholder}
                 value={value} onChange={(e) => onChange(+e.target.value)}
                 className="input !py-1.5 !w-32 font-mono text-base font-semibold"/>
          <span className="text-sm text-[var(--muted)]">{unit}</span>
          <span className="text-[10px] text-[var(--muted)] ml-auto">
            min · away from spot
          </span>
        </div>
      </div>
    </div>
  );
}

function SideHeader({side, mirror, onLoadPreset, onSave}:
  {side: "CE" | "PE"; mirror: boolean; onLoadPreset: (n: string) => void; onSave: () => void}) {
  const isCe = side === "CE";
  const tone = isCe ? "var(--danger)" : "var(--accent)";
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded text-xs font-bold text-white"
              style={{background: tone}}>{side}</span>
        <span className="text-sm font-medium">
          {isCe ? "Call (upside) leg" : "Put (downside) leg"}
        </span>
        {mirror && <span className="text-[10px] text-[var(--muted)]">· mirrored</span>}
      </div>
      <div className="flex gap-1">
        <select className="input !w-44 !py-1 text-xs" defaultValue=""
                onChange={(e) => { if (e.target.value) { onLoadPreset(e.target.value); e.target.value = ""; }}}>
          <option value="">Load preset…</option>
          {PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <button className="btn-ghost btn-sm flex items-center gap-1" onClick={onSave}>
          <Save size={11}/>Save
        </button>
      </div>
    </div>
  );
}

function SidePreview({side, rows}:
  {side: "CE" | "PE"; rows: Array<{strike: string; price: string; oi: string; pass: boolean}>}) {
  const tone = side === "CE" ? "var(--danger)" : "var(--accent)";
  const passCount = rows.filter(r => r.pass).length;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 rounded text-xs font-bold text-white"
              style={{background: tone}}>{side}</span>
        <span className="text-xs text-[var(--muted)]">{passCount}/{rows.length} pass</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-3 text-sm" style={{opacity: r.pass ? 1 : 0.45}}>
            <span className={r.pass ? "chip-green" : "chip-gray"}>{r.pass ? "PASS" : "FAIL"}</span>
            <span className="font-mono flex-1">{r.strike}</span>
            <span className="text-[var(--muted)]">price</span><span className="font-mono">{r.price}</span>
            <span className="text-[var(--muted)]">OI</span><span className="font-mono">{r.oi}</span>
            {r.pass && <button className="btn-primary btn-sm !text-[10px]"
                               onClick={() => toast("success",`${side} leg loaded`, r.strike)}>Use</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RuleEditor({rule, onChange, depth}: {rule: RuleNode; onChange: (r: RuleNode) => void; depth: number}) {
  if ("all_of" in rule || "any_of" in rule) {
    const key = "all_of" in rule ? "all_of" : "any_of";
    const children = (rule as any)[key];
    const opColor = key === "all_of" ? "var(--success)" : "var(--warn)";

    const setChildren = (newChildren: RuleNode[]) =>
      onChange({[key]: newChildren} as RuleNode);

    return (
      <div className="space-y-2 rounded-lg p-3 border"
           style={{borderColor: depth > 0 ? "var(--border)" : "transparent",
                   background: depth > 0 ? "var(--panel-2)" : "transparent"}}>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border" style={{borderColor:"var(--border)"}}>
            <button onClick={() => onChange({all_of: children})}
                    className="px-3 py-1 text-xs font-semibold"
                    style={{background: key === "all_of" ? "var(--success)" : "transparent",
                            color: key === "all_of" ? "white" : "var(--muted)"}}>ALL of</button>
            <button onClick={() => onChange({any_of: children})}
                    className="px-3 py-1 text-xs font-semibold"
                    style={{background: key === "any_of" ? "var(--warn)" : "transparent",
                            color: key === "any_of" ? "white" : "var(--muted)"}}>ANY of</button>
          </div>
          <span className="text-xs text-[var(--muted)]">{children.length} condition{children.length!==1?"s":""}</span>
        </div>
        <div className="space-y-2 pl-3 border-l-2" style={{borderColor: opColor}}>
          {children.map((child: RuleNode, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <RuleEditor rule={child} depth={depth + 1}
                            onChange={(newChild) => {
                              const newChildren = [...children];
                              newChildren[i] = newChild;
                              setChildren(newChildren);
                            }}/>
              </div>
              <button onClick={() => setChildren(children.filter((_: any, j: number) => j !== i))}
                      className="p-1.5 text-[var(--muted)] hover:text-[var(--danger)] rounded">
                <X size={14}/>
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1 pl-3">
          <button onClick={() => setChildren([...children, {filter: "DISTANCE_POINTS", params: {min: 300}}])}
                  className="btn-ghost btn-sm flex items-center gap-1 !text-xs">
            <Plus size={11}/>Add filter
          </button>
          <button onClick={() => setChildren([...children, {all_of: []}])}
                  className="btn-ghost btn-sm flex items-center gap-1 !text-xs">
            <Plus size={11}/>Add group
          </button>
        </div>
      </div>
    );
  }

  if ("not" in rule) {
    return (
      <div className="flex items-center gap-2">
        <span className="chip-red !text-[10px]">NOT</span>
        <div className="flex-1"><RuleEditor rule={rule.not} depth={depth+1}
                                               onChange={(r) => onChange({not: r})}/></div>
      </div>
    );
  }

  // Leaf
  const leaf = rule as RuleLeaf;
  const def = FILTERS.find(f => f.id === leaf.filter);
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border flex-wrap"
         style={{borderColor:"var(--border)", background:"var(--panel)"}}>
      <FilterIcon size={12} className="text-[var(--muted)]"/>
      <select className="input !py-1 !w-56 text-xs" value={leaf.filter}
              onChange={e => onChange({filter: e.target.value, params: {}})}>
        {FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <ParamsEditor filter={def} params={leaf.params}
                    onChange={params => onChange({filter: leaf.filter, params})}/>
    </div>
  );
}

function ParamsEditor({filter, params, onChange}:
  {filter?: Filter; params: Record<string, any>; onChange: (p: Record<string, any>) => void}) {
  if (!filter) return null;
  return (
    <div className="flex items-center gap-2 flex-1 flex-wrap">
      {Object.entries(filter.params_schema).map(([key, type]) => {
        if (type.includes("list")) {
          return (
            <div key={key} className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--muted)]">{key}</span>
              <input className="input !py-1 !w-36 text-xs font-mono"
                     placeholder="bullish,neutral"
                     value={(params[key] ?? []).join(",")}
                     onChange={e => onChange({...params, [key]: e.target.value.split(",").map(s => s.trim()).filter(Boolean)})}/>
            </div>
          );
        }
        if (type.startsWith("HH")) {
          return (
            <div key={key} className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--muted)]">{key}</span>
              <input type="time" className="input !py-1 !w-24 text-xs font-mono"
                     value={params[key] ?? ""}
                     onChange={e => onChange({...params, [key]: e.target.value})}/>
            </div>
          );
        }
        const isFloat = type.includes("float");
        return (
          <div key={key} className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--muted)]">{key}</span>
            <input type="number" step={isFloat ? "0.01" : "1"}
                   className="input !py-1 !w-24 text-xs font-mono"
                   value={params[key] ?? ""}
                   onChange={e => onChange({...params, [key]: e.target.value === "" ? null : +e.target.value})}/>
          </div>
        );
      })}
    </div>
  );
}
