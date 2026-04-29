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

export default function StrikeSelectorBuilder() {
  const [ceRule, setCeRule] = useState<RuleNode>(DEFAULT_RULE);
  const [peRule, setPeRule] = useState<RuleNode>(DEFAULT_RULE);
  const [mirror, setMirror] = useState(true);
  const [activeSide, setActiveSide] = useState<"CE" | "PE">("CE");
  const [saveOpen, setSaveOpen] = useState<null | "CE" | "PE" | "BOTH">(null);

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
            Separate rules for CE & PE. Toggle <b>Mirror</b> to keep them in sync.
            <span className="block mt-0.5">
              <b>Strike selection only</b> — premium thresholds live in the <b>Premium Trigger</b> section. Auto-entry requires both to pass.
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

      {/* Mode tabs (mobile-friendly) — desktop shows side-by-side */}
      <div className="md:hidden flex rounded-md border overflow-hidden" style={{borderColor:"var(--border)"}}>
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
        {/* CE Rule (always shown desktop; mobile shows only active) */}
        <div className={`${activeSide === "CE" ? "" : "hidden md:block"}`}>
          <SideHeader side="CE" mirror={mirror}
                      onLoadPreset={(n) => applyPresetTo("CE", n)}
                      onSave={() => setSaveOpen("CE")}/>
          <div className="card mt-2">
            <RuleEditor rule={ceRule} onChange={setCeRule} depth={0}/>
          </div>
        </div>

        {/* PE Rule — hidden when mirror is ON (no point editing twice) */}
        {!mirror && (
          <div className={`${activeSide === "PE" ? "" : "hidden md:block"}`}>
            <SideHeader side="PE" mirror={mirror}
                        onLoadPreset={(n) => applyPresetTo("PE", n)}
                        onSave={() => setSaveOpen("PE")}/>
            <div className="card mt-2">
              <RuleEditor rule={peRule} onChange={setPeRule} depth={0}/>
            </div>
          </div>
        )}
      </div>

      {mirror && (
        <div className="text-[11px] text-[var(--muted)] flex items-center gap-1.5">
          <Link2 size={11}/>
          PE rule mirrors CE. Click <b>Mirror</b> above to break and edit each side independently.
        </div>
      )}

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
{JSON.stringify({ce: ceRule, pe: peRule, mirror}, null, 2)}
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
        <div className="space-y-3">
          <SidePreview side="CE" rows={[
            {strike:"25500 CE", price:"₹24.10", oi:"1.2M", pass:true},
            {strike:"25800 CE", price:"₹12.50", oi:"850K", pass:true},
            {strike:"25000 CE", price:"₹58.30", oi:"2.1M", pass:false},
          ]}/>
          <SidePreview side="PE" rows={[
            {strike:"22000 PE", price:"₹22.85", oi:"980K", pass:true},
            {strike:"21700 PE", price:"₹14.20", oi:"540K", pass:true},
            {strike:"22500 PE", price:"₹50.00", oi:"1.6M", pass:false},
          ]}/>
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
