/**
 * Composable rule builder for the Strike Selector Engine.
 *
 * Wire the JSON rule to the backend /strike-selector/evaluate to get live
 * candidates. Same rule works for entry + exit.
 */
import { useState } from "react";
import { Plus, X, Save, Zap, Filter as FilterIcon, Target } from "lucide-react";

type Filter = {
  id: string;
  label: string;
  params_schema: Record<string, string>;
};

type RuleLeaf = { filter: string; params: Record<string, any> };
type RuleNode = RuleLeaf | { all_of: RuleNode[] } | { any_of: RuleNode[] } | { not: RuleNode };

const FILTERS: Filter[] = [
  {id:"DISTANCE_POINTS",       label:"Distance from spot (pts)", params_schema:{min:"int|null", max:"int|null"}},
  {id:"DISTANCE_PERCENT",      label:"Distance from spot (%)",   params_schema:{min:"float|null", max:"float|null"}},
  {id:"DELTA",                 label:"Absolute delta band",      params_schema:{min:"float|null", max:"float|null"}},
  {id:"PREMIUM_PER_LEG",       label:"Premium per leg (₹)",      params_schema:{min:"float|null", max:"float|null"}},
  {id:"COMBINED_PREMIUM",      label:"Combined premium CE+PE (₹)",params_schema:{min:"float"}},
  {id:"PREMIUM_PER_CR_MARGIN", label:"Premium per ₹1Cr margin (₹)",params_schema:{min:"int"}},
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
      {filter:"PREMIUM_PER_CR_MARGIN", params:{min:5000}},
      {filter:"PREMIUM_PER_LEG", params:{min:0.8}},
      {filter:"OI_MIN", params:{min:50000}},
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
      {filter:"PREMIUM_PER_LEG", params:{min:0.8}},
      {filter:"BID_ASK_SPREAD_PCT", params:{max:5}},
    ]}},
];

export default function StrikeSelectorBuilder() {
  const [rule, setRule] = useState<RuleNode>({all_of: [
    {filter: "DISTANCE_PERCENT", params: {min: 3}},
    {filter: "PREMIUM_PER_LEG", params: {min: 0.8}},
  ]});
  const [name, setName] = useState("My Rule v1");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Target size={16} className="text-[var(--accent)]"/> Rule Builder
          </h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Build combinable rules. Same rule drives entry strike selection + exit triggers.
          </p>
        </div>
        <div className="flex gap-2">
          <select className="input !w-52 !py-1.5 text-sm"
                  onChange={(e) => {
                    const p = PRESETS.find(x => x.name === e.target.value);
                    if (p) setRule(p.rule);
                  }}
                  defaultValue="">
            <option value="">Load preset…</option>
            {PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <button className="btn-ghost btn-sm flex items-center gap-1"><Save size={12}/>Save</button>
          <button className="btn-primary btn-sm flex items-center gap-1"><Zap size={12}/>Preview</button>
        </div>
      </div>

      <div className="card">
        <RuleEditor rule={rule} onChange={setRule} depth={0}/>
      </div>

      {/* JSON debug (hide in prod) */}
      <details className="text-xs">
        <summary className="cursor-pointer text-[var(--muted)]">Rule JSON (for dev/API)</summary>
        <pre className="mt-2 p-3 rounded font-mono overflow-x-auto" style={{background:"var(--panel-2)"}}>
          {JSON.stringify(rule, null, 2)}
        </pre>
      </details>

      {/* Live preview area */}
      <div className="card" style={{background:"var(--panel-2)"}}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">Live Preview</h4>
          <span className="text-xs text-[var(--muted)]">NIFTY · 17-Apr · pair mode</span>
        </div>
        <div className="text-sm space-y-2">
          <PreviewRow strikes="25500 CE + 22000 PE" combined="₹46.95" cushion="3.71×" per_cr="₹28.4L" pass/>
          <PreviewRow strikes="25000 CE + 22500 PE" combined="₹108.30" cushion="1.01×" per_cr="₹65.2L" pass={false}/>
          <PreviewRow strikes="25800 CE + 21700 PE" combined="₹18.50" cushion="4.53×" per_cr="₹11.2L" pass/>
          <div className="text-[var(--muted)] text-xs pt-2 border-t" style={{borderColor:"var(--border)"}}>
            <b>2 of 3</b> candidates pass. Use top pass in Trade (the first row) or pick another manually.
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleEditor({rule, onChange, depth}: {rule: RuleNode; onChange: (r: RuleNode) => void; depth: number}) {
  if ("all_of" in rule || "any_of" in rule) {
    const key = "all_of" in rule ? "all_of" : "any_of";
    const children = (rule as any)[key];
    const op = key === "all_of" ? "ALL" : "ANY";
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
    <div className="flex items-center gap-2 p-2 rounded-lg border"
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
    <div className="flex items-center gap-2 flex-1">
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

function PreviewRow({strikes, combined, cushion, per_cr, pass}:
  {strikes: string; combined: string; cushion: string; per_cr: string; pass: boolean}) {
  return (
    <div className="flex items-center gap-3 text-sm" style={{opacity: pass ? 1 : 0.45}}>
      <span className={pass ? "chip-green" : "chip-gray"}>{pass ? "PASS" : "FAIL"}</span>
      <span className="font-mono flex-1">{strikes}</span>
      <span className="text-[var(--muted)]">combined</span><span className="font-mono">{combined}</span>
      <span className="text-[var(--muted)]">cushion</span><span className="font-mono">{cushion}</span>
      <span className="text-[var(--muted)]">per ₹1Cr</span><span className="font-mono text-[var(--success)]">{per_cr}</span>
      {pass && <button className="btn-primary btn-sm !text-[10px]">Use</button>}
    </div>
  );
}
