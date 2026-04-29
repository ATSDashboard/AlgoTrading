import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle, Plus, Trash2, Copy, Shield, Sparkles, Save, RotateCcw, Calculator,
  ChevronDown, BarChart2, Activity, Zap, Rocket,
} from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import { toast } from "@/components/Toast";
import StrikeSelectorBuilder from "@/components/StrikeSelectorBuilder";

type Side = "B" | "S";
type OptType = "CE" | "PE";
type OrderKind = "LIMIT" | "LIMIT_WITH_BUFFER" | "MARKET";

interface Leg {
  id: string;
  side: Side;
  expiry: string;
  strike: number;
  type: OptType;
  lots: number;
  price: number;
  orderKind: OrderKind;
  inCombinedTrigger: boolean;
  singleThreshold: number | null;
  // Live quote + intraday anchors
  ltp: number; bid: number; ask: number; bidQty: number; askQty: number; oi: number; vol: number;
  high: number; low: number; open: number; close: number;
  p_0920: number; p_0945: number; p_1030: number; p_1100: number; p_1200: number;
}

const TEMPLATES: Array<{name: string; kind: string; legs: Partial<Leg>[]}> = [
  { name: "Short Strangle", kind: "NEUTRAL",
    legs: [{side: "S", expiry: "2026-04-17", strike: 25000, type: "CE", lots: 1},
           {side: "S", expiry: "2026-04-17", strike: 24500, type: "PE", lots: 1}]},
  { name: "Iron Condor", kind: "NEUTRAL",
    legs: [{side: "S", expiry: "2026-04-17", strike: 25000, type: "CE", lots: 1},
           {side: "B", expiry: "2026-04-17", strike: 25300, type: "CE", lots: 1},
           {side: "S", expiry: "2026-04-17", strike: 24500, type: "PE", lots: 1},
           {side: "B", expiry: "2026-04-17", strike: 24200, type: "PE", lots: 1}]},
  { name: "Bull Put Spread", kind: "BULLISH",
    legs: [{side: "S", expiry: "2026-04-17", strike: 24500, type: "PE", lots: 1},
           {side: "B", expiry: "2026-04-17", strike: 24200, type: "PE", lots: 1}]},
  { name: "Calendar Spread", kind: "NEUTRAL",
    legs: [{side: "S", expiry: "2026-04-17", strike: 24800, type: "CE", lots: 1},
           {side: "B", expiry: "2026-04-24", strike: 24800, type: "CE", lots: 1}]},
];

// Deterministic mock quote — replace with live fetch from /data/quote
function mockQuote(strike: number, type: OptType) {
  const intrinsic = type === "CE" ? Math.max(0, 24812 - strike) : Math.max(0, strike - 24812);
  const distance = Math.abs(strike - 24812);
  const time = Math.max(0.5, 60 * Math.exp(-Math.pow(distance / 400, 2)));
  const ltp = Math.max(0.05, intrinsic + time);
  const spread = Math.max(0.1, ltp * 0.02);
  // Synthetic intraday prices (in a real impl these come from NSE/broker tick archive)
  const decay = (hour: number) => Math.max(0.1, ltp * (1 + (hour - 10) * 0.05));
  return {
    ltp: +ltp.toFixed(2),
    bid: +(ltp - spread/2).toFixed(2),
    ask: +(ltp + spread/2).toFixed(2),
    bidQty: 650, askQty: 650,
    oi: Math.max(50_000, 3_000_000 - distance * 500), vol: 12500,
    high: +(ltp * 1.18).toFixed(2),
    low:  +(ltp * 0.82).toFixed(2),
    open: +(ltp * 1.05).toFixed(2),
    close: +(ltp * 1.02).toFixed(2),
    p_0920: +decay(9.33).toFixed(2),
    p_0945: +decay(9.75).toFixed(2),
    p_1030: +decay(10.5).toFixed(2),
    p_1100: +decay(11).toFixed(2),
    p_1200: +decay(12).toFixed(2),
  };
}

let _id = 1;
const newLegId = () => `leg-${_id++}`;
function fullLeg(p: Partial<Leg>): Leg {
  const strike = p.strike ?? 25000;
  const type = p.type ?? "CE";
  return {
    id: newLegId(), side: "S", expiry: "2026-04-17", strike, type, lots: 1,
    price: 0, orderKind: "LIMIT_WITH_BUFFER",
    inCombinedTrigger: true, singleThreshold: null,
    ...mockQuote(strike, type), ...p,
  };
}

export default function NewStrategy() {
  const nav = useNavigate();
  const [underlying, setUnderlying] = useState<"NIFTY" | "SENSEX">("NIFTY");
  const [name, setName] = useState("Short Strangle · NIFTY 17-Apr");
  const [legs, setLegs] = useState<Leg[]>([
    fullLeg({side:"S", strike:25000, type:"CE", price:42}),
    fullLeg({side:"S", strike:24500, type:"PE", price:38}),
  ]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Trigger
  const [triggerMode, setTriggerMode] = useState<"COMBINED"|"SEPARATE"|"NONE">("COMBINED");
  const [combinedTrigger, setCombinedTrigger] = useState("80");
  // SEPARATE mode: do legs execute independently (each fires on its own when met)
  // or do both legs need to be in-threshold simultaneously?
  const [legIndependence, setLegIndependence] = useState<"linked"|"independent">("linked");
  const [perLegCe, setPerLegCe] = useState("");
  const [perLegPe, setPerLegPe] = useState("");

  // Broker + demat selection (linked to RMS access control per trader)
  const [selectedBroker, setSelectedBroker] = useState("zerodha");
  const [selectedDemats, setSelectedDemats] = useState<string[]>(["ZD12345"]);
  const [multiDematMode, setMultiDematMode] = useState(false);

  const BROKER_DEMATS: Record<string, Array<{id: string; label: string; cap: string; assigned: boolean}>> = {
    paper:    [{id:"PAPER-001", label:"Paper Account", cap:"Unlimited", assigned: true}],
    axis:     [{id:"1234567890", label:"Rohan Individual", cap:"₹5L/day", assigned: true},
               {id:"9876543210", label:"Rohan HUF", cap:"₹2L/day", assigned: true}],
    zerodha:  [{id:"ZD12345", label:"Rohan Kite", cap:"₹3L/day", assigned: true},
               {id:"ZD67890", label:"Navin HUF", cap:"₹4L/day", assigned: true}],
    monarch:  [{id:"MN98765", label:"Rohan Monarch", cap:"₹5L/day", assigned: true}],
    jm:       [{id:"JM45678", label:"Rohan JM Blink", cap:"₹2L/day", assigned: false}],
  };

  function toggleDemat(id: string) {
    setSelectedDemats(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  }

  // Strike selection mode
  const [strikeMode, setStrikeMode] = useState<"manual"|"auto">("manual");

  // Confirmation modals
  const [confirmOpen, setConfirmOpen] = useState<null | "start" | "execute-now" | "save-draft" | "cancel" | "load-default">(null);
  const [pendingDefaultLots, setPendingDefaultLots] = useState<number>(1);
  const [pendingExecuteAfterLoad, setPendingExecuteAfterLoad] = useState<boolean>(false);

  // Exit/RMS
  const [sl, setSl] = useState("3000");
  const [target, setTarget] = useState("2000");
  const [trailingEnabled, setTrailingEnabled] = useState(false);
  const [trailingTrigger, setTrailingTrigger] = useState("1000");
  const [trailingStep, setTrailingStep] = useState("500");
  const [lockinEnabled, setLockinEnabled] = useState(false);
  const [lockinAmount, setLockinAmount] = useState("1500");
  const [sqoff, setSqoff] = useState("15:15");
  const [deadman, setDeadman] = useState(120);
  const [mtmDdKill, setMtmDdKill] = useState(40);

  const lotSize = underlying === "NIFTY" ? 65 : 20;
  const freeze = underlying === "NIFTY" ? 1800 : 1000;
  const strikeGrid = underlying === "NIFTY" ? 50 : 100;
  // Live spot — TODO replace with /data/quote feed. Keep in sync with mockQuote().
  const spot = underlying === "NIFTY" ? 24812 : 81204;
  // Rough margin per 1 lot short strangle (₹). Overridden by /data/margin in prod.
  const marginPerLot = underlying === "NIFTY" ? 105_000 : 145_000;

  // ── Default Strategy rule ────────────────────────────────────────────
  // Rule: sell CE + PE, both at MIN 2.5% OTM, rounded to nearest grid AWAY
  // from spot (more OTM, never closer). Target P&L: ₹5,000 per ₹1Cr margin.
  const DEFAULT_DISTANCE_PCT = 2.5;
  const DEFAULT_TARGET_PER_CR = 5_000;

  function defaultStrikes(): {ce: number; pe: number} {
    const ceRaw = spot * (1 + DEFAULT_DISTANCE_PCT / 100);
    const peRaw = spot * (1 - DEFAULT_DISTANCE_PCT / 100);
    return {
      ce: Math.ceil(ceRaw / strikeGrid) * strikeGrid,   // round away (up)
      pe: Math.floor(peRaw / strikeGrid) * strikeGrid,  // round away (down)
    };
  }

  function applyDefaultStrategy(lots = 1) {
    const { ce, pe } = defaultStrikes();
    const ceQ = mockQuote(ce, "CE");
    const peQ = mockQuote(pe, "PE");
    setLegs([
      fullLeg({side:"S", strike:ce, type:"CE", lots, price: ceQ.bid}),
      fullLeg({side:"S", strike:pe, type:"PE", lots, price: peQ.bid}),
    ]);
    setName(`Default Deep OTM · ${underlying} · ${ce}CE / ${pe}PE`);
    // Target = ₹5K per Cr × (lots × marginPerLot / 1Cr). Combined credit ≈ target.
    const totalMargin = lots * marginPerLot;
    const target = Math.round(DEFAULT_TARGET_PER_CR * totalMargin / 1_00_00_000);
    const combined = Math.round((ceQ.bid + peQ.bid) * lotSize * lots);
    setTarget(String(Math.max(target, combined > 0 ? Math.round(combined * 0.6) : target)));
    setSl(String(Math.round(target * 1.5)));  // 1.5× SL to target ratio default
    setTriggerMode("NONE");                    // direct entry — trader just executes
    toast("info", "Default strategy loaded",
          `${ce}CE + ${pe}PE · ${lots} lot · target ₹${target.toLocaleString("en-IN")}. Edit if needed, then Execute.`);
  }

  const defaultStrikesPreview = useMemo(() => defaultStrikes(), [underlying, spot]);

  function addLeg() {
    const last = legs[legs.length - 1];
    setLegs((L) => [...L, fullLeg({
      side: "S", expiry: last?.expiry ?? "2026-04-17", strike: last?.strike ?? 25000,
      type: "CE", lots: 1,
    })]);
  }
  function removeLeg(id: string) { setLegs((L) => L.filter((x) => x.id !== id)); }
  function duplicateLeg(id: string) {
    setLegs((L) => { const s = L.find(x=>x.id===id); return s ? [...L, fullLeg({...s})] : L; });
  }
  function update(id: string, patch: Partial<Leg>) {
    setLegs((L) => L.map((x) => {
      if (x.id !== id) return x;
      const merged = {...x, ...patch};
      // Re-pull quote if strike/type changed
      if (patch.strike !== undefined || patch.type !== undefined) {
        return {...merged, ...mockQuote(merged.strike, merged.type)};
      }
      return merged;
    }));
  }
  function toggleExpanded(id: string) {
    setExpandedIds((S) => { const N = new Set(S); N.has(id) ? N.delete(id) : N.add(id); return N; });
  }
  function applyTemplate(name: string) {
    const t = TEMPLATES.find((x) => x.name === name); if (!t) return;
    setLegs(t.legs.map((l) => fullLeg(l)));
    setName(`${t.name} · ${underlying}`);
  }

  // Live combined premium from currently-included legs
  const combinedLive = useMemo(() => {
    let sum = 0;
    for (const l of legs) {
      if (!l.inCombinedTrigger) continue;
      sum += (l.side === "S" ? l.bid : -l.ask);
    }
    return sum;
  }, [legs]);

  const { creditDebit, totalUnits, needsSlice, slices } = useMemo(() => {
    let credit = 0, units = 0;
    for (const l of legs) {
      const sign = l.side === "S" ? +1 : -1;
      credit += sign * l.price * l.lots * lotSize;
      units += l.lots * lotSize;
    }
    const needsSlice = legs.some((l) => l.lots * lotSize > freeze);
    const slices = legs.reduce((s, l) => s + Math.ceil((l.lots * lotSize) / freeze), 0);
    return { creditDebit: credit, totalUnits: units, needsSlice, slices };
  }, [legs, lotSize, freeze]);

  const maxLots = Math.max(...legs.map((l) => l.lots), 0);
  const needsApproval = maxLots >= 5;
  const legsInTrigger = legs.filter((l) => l.inCombinedTrigger).length;
  const triggerMet = triggerMode === "COMBINED" && combinedLive >= +combinedTrigger;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Trade</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Multi-leg builder · select broker & demat · combined or per-leg trigger</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost flex items-center gap-2"
                  onClick={() => toast("success","Saved as template","Find it in Templates page")}>
            <Save size={14}/>Save as Template
          </button>
          <select className="input w-48" onChange={(e) => e.target.value && applyTemplate(e.target.value)} defaultValue="">
            <option value="" disabled>Load Template…</option>
            {TEMPLATES.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.kind})</option>)}
          </select>
        </div>
      </div>

      {/* ── Broker & Demat — GLOBAL: applies to every strategy on this page ─── */}
      <section className="card space-y-3"
               style={{borderTop:"3px solid var(--accent)"}}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-[var(--accent)]"/>
            <h2 className="font-semibold">Broker & Demat</h2>
            <span className="chip-blue text-[10px]">APPLIES TO ALL · DEFAULT + MANUAL</span>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={multiDematMode}
                   onChange={(e) => setMultiDematMode(e.target.checked)}/>
            Multi-demat (SOR across accounts)
          </label>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Broker</label>
            <select className="input" value={selectedBroker}
                    onChange={(e) => {
                      setSelectedBroker(e.target.value);
                      const first = BROKER_DEMATS[e.target.value]?.find(d => d.assigned);
                      setSelectedDemats(first ? [first.id] : []);
                    }}>
              <option value="paper">Paper Broker (mock)</option>
              <option value="axis">Axis Direct (RAPID)</option>
              <option value="zerodha">Zerodha (Kite Connect)</option>
              <option value="monarch">Monarch Networth</option>
              <option value="jm">JM Financial (Blink)</option>
            </select>
          </div>
          <div>
            <label className="label">Demat Account{multiDematMode ? "s (select multiple)" : ""}</label>
            {multiDematMode ? (
              <div className="space-y-2">
                {(BROKER_DEMATS[selectedBroker] ?? []).map(d => (
                  <label key={d.id}
                         className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition"
                         style={{borderColor: selectedDemats.includes(d.id) ? "var(--accent)" : "var(--border)",
                                 background: selectedDemats.includes(d.id) ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
                                 opacity: d.assigned ? 1 : 0.4, cursor: d.assigned ? "pointer" : "not-allowed"}}>
                    <input type="checkbox" checked={selectedDemats.includes(d.id)}
                           disabled={!d.assigned}
                           onChange={() => d.assigned && toggleDemat(d.id)}/>
                    <div className="flex-1">
                      <div className="text-sm font-mono">{d.id}</div>
                      <div className="text-xs text-[var(--muted)]">{d.label}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[var(--muted)]">Daily cap</div>
                      <div className="text-xs font-mono">{d.cap}</div>
                    </div>
                    {!d.assigned && <span className="chip-red">Not assigned</span>}
                  </label>
                ))}
                <div className="text-[10px] text-[var(--muted)]">
                  Orders will be split across selected demats by free margin (Smart Order Routing). Admin assigns demat access in Settings → Users.
                </div>
              </div>
            ) : (
              <select className="input" value={selectedDemats[0] ?? ""}
                      onChange={(e) => setSelectedDemats([e.target.value])}>
                {(BROKER_DEMATS[selectedBroker] ?? []).filter(d => d.assigned).map(d => (
                  <option key={d.id} value={d.id}>{d.id} — {d.label} (cap {d.cap})</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="text-[10px] text-[var(--muted)] flex items-center gap-1.5 pt-1 border-t" style={{borderColor:"var(--border)"}}>
          <AlertCircle size={11}/>
          This selection routes <b>every order</b> placed from this page — Default Strategy, manual legs, Execute Now, and trigger-based starts.
        </div>
      </section>

      {/* ── Default Strategy CTA — one-click safe entry ────────────────── */}
      <section className="card border-2"
               style={{borderColor:"color-mix(in srgb, var(--accent) 50%, transparent)",
                       background:"color-mix(in srgb, var(--accent) 6%, var(--panel))"}}>
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Rocket size={18} className="text-[var(--accent)]"/>
              <h2 className="font-semibold text-base">Default Strategy · Deep OTM Strangle</h2>
              <span className="chip-blue">RECOMMENDED</span>
              <span className="text-[10px] text-[var(--muted)] ml-auto">
                Routes via <b className="text-[var(--ink)] font-mono">{selectedBroker.toUpperCase()}</b> · {selectedDemats.length === 1 ? selectedDemats[0] : `${selectedDemats.length} demats (SOR)`}
              </span>
            </div>
            <div className="text-xs text-[var(--muted)] leading-relaxed">
              Sell CE + PE at <b>min {DEFAULT_DISTANCE_PCT}% OTM</b>, strikes <b>rounded further from spot</b> (CE↑, PE↓ on the {strikeGrid}-pt grid — never closer than the rule).
              Target <b>₹{DEFAULT_TARGET_PER_CR.toLocaleString("en-IN")} per ₹1Cr margin</b>.
              One click, no manual entry — eliminates strike/qty mistakes.
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs flex-wrap">
              <span className="text-[var(--muted)]">Spot</span>
              <span className="font-mono">{spot.toLocaleString("en-IN")}</span>
              <span className="text-[var(--muted)]">→ CE</span>
              <span className="font-mono font-semibold">{defaultStrikesPreview.ce}</span>
              <span className="text-[var(--muted)]">PE</span>
              <span className="font-mono font-semibold">{defaultStrikesPreview.pe}</span>
              <span className="text-[var(--muted)]">·</span>
              <span className="text-[var(--muted)]">Lot</span>
              <span className="font-mono">{lotSize}u</span>
              <span className="text-[var(--muted)]">·</span>
              <span className="text-[var(--muted)]">Margin/lot</span>
              <span className="font-mono">~₹{(marginPerLot/1000).toFixed(0)}K</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 items-stretch min-w-[220px]">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--muted)] whitespace-nowrap">Symbol</label>
              <select className="input !py-1.5 text-sm font-mono flex-1"
                      value={underlying} onChange={(e) => setUnderlying(e.target.value as "NIFTY" | "SENSEX")}>
                <option value="NIFTY">NIFTY · spot 24,812 · lot 65 · grid 50</option>
                <option value="SENSEX">SENSEX · spot 81,204 · lot 20 · grid 100</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--muted)] whitespace-nowrap">Lots</label>
              <select id="default-lots" defaultValue="1"
                      className="input !py-1.5 text-sm font-mono flex-1">
                {[1,2,3,5,10,15,20].map(n => <option key={n} value={n}>{n} lot{n>1?"s":""} ({(n*lotSize)}u)</option>)}
              </select>
            </div>
            <button className="btn-primary flex items-center justify-center gap-2 py-2.5"
                    onClick={() => {
                      const sel = document.getElementById("default-lots") as HTMLSelectElement;
                      setPendingDefaultLots(+(sel?.value ?? "1"));
                      setPendingExecuteAfterLoad(false);
                      setConfirmOpen("load-default");
                    }}>
              <Rocket size={14}/> Load Default Strategy
            </button>
            <button className="btn-danger btn-sm flex items-center justify-center gap-1"
                    onClick={() => {
                      const sel = document.getElementById("default-lots") as HTMLSelectElement;
                      setPendingDefaultLots(+(sel?.value ?? "1"));
                      setPendingExecuteAfterLoad(true);
                      setConfirmOpen("load-default");
                    }}>
              <Zap size={14}/> Load + Execute Now
            </button>
            <div className="text-[10px] text-[var(--muted)] text-center">
              Pre-fills legs below — edit before execute if needed
            </div>
          </div>
        </div>
      </section>

      {/* Strategy basics */}
      <section className="card space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="label">Strategy Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}/>
          </div>
          <div>
            <label className="label">Portfolio <span className="text-[var(--danger)]">*</span></label>
            <select className="input">
              <option value="1">Weekly Strangles (LIVE)</option>
              <option value="2">Monthly Iron Condors (LIVE)</option>
              <option value="3">Paper Testing (PAPER)</option>
              <option value="">+ Create new portfolio…</option>
            </select>
            <div className="text-[10px] text-[var(--muted)] mt-1">All P&L reports roll up by portfolio.</div>
          </div>
          <div>
            <label className="label">Underlying</label>
            <div className="flex gap-2">
              {(["NIFTY","SENSEX"] as const).map((u) => (
                <button key={u} type="button" onClick={() => setUnderlying(u)}
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm transition ${underlying===u?"text-[var(--accent)]":"text-[var(--muted)]"}`}
                        style={{borderColor: underlying===u?"var(--accent)":"var(--border)",
                                background: underlying===u?"color-mix(in srgb, var(--accent) 10%, transparent)":"transparent"}}>
                  {u}
                  <div className="text-[10px] text-[var(--muted)] mt-0.5">lot {u==="NIFTY"?65:20} · freeze {u==="NIFTY"?1800:1000}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Strike selection mode toggle */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Strike Selection</h2>
          <div className="flex rounded-md border overflow-hidden" style={{borderColor:"var(--border)"}}>
            <button onClick={() => setStrikeMode("manual")}
                    className={`px-4 py-1.5 text-xs font-semibold ${strikeMode==="manual"?"text-white":"text-[var(--muted)]"}`}
                    style={{background: strikeMode==="manual"?"var(--accent)":"transparent"}}>Manual</button>
            <button onClick={() => setStrikeMode("auto")}
                    className={`px-4 py-1.5 text-xs font-semibold ${strikeMode==="auto"?"text-white":"text-[var(--muted)]"}`}
                    style={{background: strikeMode==="auto"?"var(--accent)":"transparent"}}>Automatic (Rule Builder)</button>
          </div>
        </div>
        {strikeMode === "auto" && <StrikeSelectorBuilder/>}
        {strikeMode === "manual" && (
          <div className="text-xs text-[var(--muted)]">
            You'll pick strikes yourself below. Switch to Automatic to use combinable rules.
          </div>
        )}
      </section>

      {/* Legs */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Legs ({legs.length})</h2>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Click row to expand bid/ask/qty · ☑ column = include in combined trigger
            </div>
          </div>
          <button onClick={addLeg} className="btn-primary btn-sm flex items-center gap-1"><Plus size={12}/>Add Leg</button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[24px_56px_110px_128px_72px_72px_96px_80px_96px_84px] gap-2 text-[10px] uppercase tracking-wide text-[var(--muted)] px-1">
          <span title="Include in combined trigger">∑</span>
          <span>B/S</span><span>Expiry</span><span>Strike</span><span>Type</span><span>Lots</span>
          <span>Order</span><span>LTP</span><span>Price</span><span className="text-right pr-1">Actions</span>
        </div>

        {legs.map((l, i) => {
          const expanded = expandedIds.has(l.id);
          return (
            <div key={l.id}
                 className={`rounded-lg border overflow-hidden ${
                   l.side === "S" ? "border-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
                                   : "border-[color-mix(in_srgb,var(--success)_20%,transparent)]"
                 }`}
                 style={{background: "var(--panel-2)"}}>

              <div className="grid grid-cols-[24px_56px_110px_128px_72px_72px_96px_80px_96px_84px] gap-2 items-center p-2">
                {/* Include in combined */}
                <input type="checkbox" checked={l.inCombinedTrigger}
                       onChange={(e) => update(l.id, {inCombinedTrigger: e.target.checked})}
                       title="Include this leg in the combined-premium trigger" className="cursor-pointer"/>

                {/* B/S */}
                <div className="flex rounded-md overflow-hidden border" style={{borderColor:"var(--border)"}}>
                  {(["B","S"] as const).map((s) => (
                    <button key={s} type="button" onClick={() => update(l.id, {side: s})}
                            className={`flex-1 py-1 text-xs font-semibold ${l.side === s ? "text-white" : "text-[var(--muted)]"}`}
                            style={{background: l.side === s ? (s === "B" ? "var(--success)" : "var(--danger)") : "transparent"}}>
                      {s}
                    </button>
                  ))}
                </div>

                {/* Expiry */}
                <select className="input !py-1.5 text-sm" value={l.expiry}
                        onChange={(e) => update(l.id, {expiry: e.target.value})}>
                  <option value="2026-04-17">17 Apr (0d)</option>
                  <option value="2026-04-24">24 Apr (7d)</option>
                  <option value="2026-05-01">01 May (14d)</option>
                  <option value="2026-05-29">29 May (M)</option>
                </select>

                {/* Strike */}
                <div className="flex items-center rounded-md border" style={{borderColor:"var(--border)", background:"var(--panel)"}}>
                  <button type="button" className="px-2 text-[var(--muted)] hover:text-[var(--ink)]"
                          onClick={() => update(l.id, {strike: l.strike - (underlying==="NIFTY"?50:100)})}>−</button>
                  <input type="number" className="flex-1 text-center bg-transparent text-sm font-mono py-1 focus:outline-none text-[var(--ink)]"
                         value={l.strike} onChange={(e) => update(l.id, {strike: +e.target.value})}/>
                  <button type="button" className="px-2 text-[var(--muted)] hover:text-[var(--ink)]"
                          onClick={() => update(l.id, {strike: l.strike + (underlying==="NIFTY"?50:100)})}>+</button>
                </div>

                {/* Type */}
                <div className="flex rounded-md overflow-hidden border" style={{borderColor:"var(--border)"}}>
                  {(["CE","PE"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => update(l.id, {type: t})}
                            className={`flex-1 py-1 text-xs font-semibold transition ${l.type === t ? "text-white" : "text-[var(--muted)]"}`}
                            style={{background: l.type === t
                              ? (t === "CE" ? "color-mix(in srgb, var(--danger) 60%, transparent)"
                                             : "color-mix(in srgb, var(--accent) 60%, transparent)")
                              : "transparent"}}>
                      {t}
                    </button>
                  ))}
                </div>

                {/* Lots (qty = lots × lotSize, enforced — no raw-units input) */}
                <select className="input !py-1.5 text-sm font-mono" value={l.lots}
                        onChange={(e) => update(l.id, {lots: +e.target.value})}
                        title={`1 lot = ${lotSize} units (${underlying} exchange). Total qty auto-snaps to lot multiples.`}>
                  {Array.from({length: 30}).map((_, n) => <option key={n+1} value={n+1}>{n+1}</option>)}
                </select>

                {/* Order kind */}
                <select className="input !py-1.5 text-xs" value={l.orderKind}
                        onChange={(e) => update(l.id, {orderKind: e.target.value as OrderKind})}
                        title="MARKET disabled on options for safety (SEBI + wide spreads)">
                  <option value="LIMIT">LIMIT</option>
                  <option value="LIMIT_WITH_BUFFER">LIMIT+buf</option>
                  <option value="MARKET" disabled>MARKET (off)</option>
                </select>

                {/* LTP only inline (bid/ask in expanded view) */}
                <div className="text-sm font-mono font-semibold text-[var(--ink)] whitespace-nowrap">
                  {l.ltp.toFixed(2)}
                </div>

                {/* Target price (for LIMIT) */}
                <input type="number" step="0.05" value={l.price}
                       disabled={l.orderKind === "MARKET"}
                       onChange={(e) => update(l.id, {price: +e.target.value})}
                       className="input !py-1.5 text-sm font-mono disabled:opacity-50"/>

                <div className="flex gap-0.5 justify-end items-center">
                  <button type="button" title={expanded ? "Hide details" : "Show quote details"}
                          className={`p-1.5 rounded-md transition ${expanded ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
                          style={expanded ? {background:"color-mix(in srgb, var(--accent) 15%, transparent)"} : {}}
                          onClick={() => toggleExpanded(l.id)}>
                    <BarChart2 size={14}/>
                  </button>
                  <button type="button" title="Duplicate leg" className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--ink)]"
                          onClick={() => duplicateLeg(l.id)}><Copy size={13}/></button>
                  <button type="button" title="Remove leg" disabled={legs.length <= 1}
                          className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-30"
                          onClick={() => removeLeg(l.id)}><Trash2 size={13}/></button>
                </div>
              </div>

              {/* Expanded live-quote panel */}
              {expanded && (
                <div className="border-t p-4 space-y-4" style={{borderColor:"var(--border)", background:"var(--panel)"}}>
                  {/* Row 1: core quote */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">Live Quote</div>
                    <div className="grid grid-cols-7 gap-3">
                      <QuoteStat label="Bid" v={l.bid} tone="success"/>
                      <QuoteStat label="Ask" v={l.ask} tone="danger"/>
                      <QuoteStat label="Bid Qty" v={l.bidQty}/>
                      <QuoteStat label="Ask Qty" v={l.askQty}/>
                      <QuoteStat label="Spread %" v={+(((l.ask-l.bid)/l.ltp)*100).toFixed(2)}/>
                      <QuoteStat label="OI" v={`${(l.oi/1_00_000).toFixed(1)}L`}/>
                      <QuoteStat label="Volume" v={l.vol.toLocaleString("en-IN")}/>
                    </div>
                  </div>

                  {/* Row 2: Open / High / Low / Close */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">Today's Range</div>
                    <div className="grid grid-cols-8 gap-3">
                      <QuoteStat label="Open" v={l.open}/>
                      <QuoteStat label="High" v={l.high} tone="success"/>
                      <QuoteStat label="Low" v={l.low} tone="danger"/>
                      <QuoteStat label="Prev Close" v={l.close}/>
                      <QuoteStat label="% Chg" v={`${(((l.ltp-l.close)/l.close)*100).toFixed(2)}%`}
                                 tone={l.ltp >= l.close ? "success" : "danger"}/>
                      <QuoteStat label="IV" v="16.5%"/>
                      <QuoteStat label="Delta" v="0.12"/>
                      <QuoteStat label="Theta" v="-0.85"/>
                    </div>
                  </div>

                  {/* Row 3: Intraday price anchors */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">Intraday Snapshots (IST)</div>
                    <div className="grid grid-cols-5 gap-3">
                      <QuoteStat label="09:20" v={l.p_0920}/>
                      <QuoteStat label="09:45" v={l.p_0945}/>
                      <QuoteStat label="10:30" v={l.p_1030}/>
                      <QuoteStat label="11:00" v={l.p_1100}/>
                      <QuoteStat label="12:00" v={l.p_1200}/>
                    </div>
                  </div>

                  {/* Per-leg threshold when SEPARATE trigger mode */}
                  {triggerMode === "SEPARATE" && (
                    <div className="flex items-center gap-2 pt-3 border-t" style={{borderColor:"var(--border)"}}>
                      <span className="text-[var(--muted)] text-xs">Per-leg trigger: this leg's bid ≥ ₹</span>
                      <input type="number" step="0.05" className="input !py-1 !w-28 text-sm font-mono"
                             value={l.singleThreshold ?? ""} placeholder="auto"
                             onChange={(e) => update(l.id, {singleThreshold: e.target.value ? +e.target.value : null})}/>
                      <span className="text-[var(--muted)] text-xs">(fires when threshold met)</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap gap-4 pt-2 border-t" style={{borderColor:"var(--border)"}}>
          <Adjust label="Shift"/><Adjust label="Width"/><Adjust label="Hedge"/>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-[var(--muted)]">Multiplier</span>
            <select className="input !py-1.5 !w-20 text-sm font-mono">
              {[1,2,3,5,10].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t text-sm" style={{borderColor:"var(--border)"}}>
          <div className="flex gap-5 flex-wrap">
            <span className="text-[var(--muted)]">Legs in ∑</span><span className="font-mono">{legsInTrigger}/{legs.length}</span>
            <span className="text-[var(--muted)]">Net Qty</span><span className="font-mono">{totalUnits}u</span>
            <span className="text-[var(--muted)]">{creditDebit >= 0 ? "Credit" : "Debit"}</span>
            <span className={`font-mono font-semibold ${creditDebit >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
              ₹{Math.abs(Math.round(creditDebit)).toLocaleString("en-IN")}
            </span>
            {needsSlice && <span className="chip-yellow">iceberg {slices} orders</span>}
          </div>
          <button className="btn-ghost btn-sm flex items-center gap-1"
                  onClick={() => {
                    setLegs(legs.map(l => ({...l, price: 0, ...mockQuote(l.strike, l.type)})));
                    toast("info","Prices refreshed from live chain");
                  }}>
            <RotateCcw size={12}/>Reset Prices
          </button>
        </div>
      </section>

      {/* Premium Trigger (separate module — pairs with Strike Selector for auto trades) */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold">Premium Trigger</h2>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">
              Live entry gate — combined CE+PE or per-leg threshold.
              {strikeMode === "auto" && <> Auto-trades fire only when <b>strike rule</b> ✓ <b>and</b> <b>premium trigger</b> ✓.</>}
            </p>
          </div>
          <div className="flex gap-2">
            {(["COMBINED","SEPARATE","NONE"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setTriggerMode(m)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition ${
                        triggerMode === m ? "text-[var(--accent)]" : "text-[var(--muted)]"
                      }`}
                      style={{borderColor: triggerMode===m?"var(--accent)":"var(--border)",
                              background: triggerMode===m?"color-mix(in srgb, var(--accent) 10%, transparent)":"transparent"}}>
                {m === "COMBINED" ? "Combined ∑" : m === "SEPARATE" ? "Per-leg" : "Enter now"}
              </button>
            ))}
          </div>
        </div>

        {triggerMode === "COMBINED" && (
          <div className="space-y-2">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <label className="label">Combined ≥ ₹ (sum of ∑-marked legs)</label>
                <input className="input font-mono w-40" value={combinedTrigger}
                       onChange={(e) => setCombinedTrigger(e.target.value)}/>
              </div>
              <div className="pt-5">
                <div className="text-xs text-[var(--muted)]">Live sum of {legsInTrigger} legs</div>
                <div className={`font-mono text-xl font-bold ${triggerMet ? "text-[var(--success)]" : ""}`}>
                  ₹{combinedLive.toFixed(2)}
                  {triggerMet && <Activity size={16} className="inline ml-2 animate-pulse"/>}
                </div>
              </div>
              <div className="pt-5">
                <div className="text-xs text-[var(--muted)]">Threshold</div>
                <div className="font-mono text-xl">₹{combinedTrigger}</div>
              </div>
              <div className="pt-5">
                <div className="text-xs text-[var(--muted)]">Status</div>
                <div>{triggerMet ? <span className="chip-green">MET</span> : <span className="chip-yellow">Waiting</span>}</div>
              </div>
            </div>
            <div className="text-xs text-[var(--muted)]">
              Formula: Σ(SELL leg bid) − Σ(BUY leg ask) for all ∑-marked legs.
              {legs.length > 2 && " Toggle the ∑ column on each leg above to pick which legs combine."}
            </div>
          </div>
        )}

        {triggerMode === "SEPARATE" && (
          <div className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-2.5 rounded-lg border"
                   style={{borderColor:"var(--border)", background:"var(--panel-2)"}}>
                <span className="px-2 py-0.5 rounded text-xs font-bold text-white"
                      style={{background:"var(--danger)"}}>CE</span>
                <span className="text-xs text-[var(--muted)]">premium ≥ ₹</span>
                <input type="number" step="0.05" className="input !py-1 !w-24 text-sm font-mono"
                       value={perLegCe} onChange={(e) => setPerLegCe(e.target.value)} placeholder="3.00"/>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg border"
                   style={{borderColor:"var(--border)", background:"var(--panel-2)"}}>
                <span className="px-2 py-0.5 rounded text-xs font-bold text-white"
                      style={{background:"var(--accent)"}}>PE</span>
                <span className="text-xs text-[var(--muted)]">premium ≥ ₹</span>
                <input type="number" step="0.05" className="input !py-1 !w-24 text-sm font-mono"
                       value={perLegPe} onChange={(e) => setPerLegPe(e.target.value)} placeholder="2.00"/>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-[var(--muted)]">Execution:</span>
              <div className="flex rounded-md border overflow-hidden" style={{borderColor:"var(--border)"}}>
                {(["linked","independent"] as const).map(m => (
                  <button key={m} onClick={() => setLegIndependence(m)}
                          className="px-3 py-1.5 text-xs font-semibold"
                          style={{background: legIndependence===m ? "var(--accent)" : "transparent",
                                  color: legIndependence===m ? "white" : "var(--muted)"}}>
                    {m === "linked" ? "Both legs together" : "Each leg independent"}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-[var(--muted)]">
                {legIndependence === "linked"
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
        )}

        {triggerMode === "NONE" && (
          <div className="text-sm text-[var(--muted)]">
            Strategy enters immediately at current LIMIT prices (subject to pre-trade RMS + margin check).
          </div>
        )}
      </section>

      {/* Exit / Kill */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Exit Rules & Kill Switches</h2>
          <span className="text-xs text-[var(--muted)]">Defaults from Settings → Risk</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Stop Loss (₹)"><input className="input font-mono" value={sl} onChange={(e) => setSl(e.target.value)}/></Field>
          <Field label="Target (₹)"><input className="input font-mono" value={target} onChange={(e) => setTarget(e.target.value)}/></Field>
          <Field label="Square-off time (IST)"><input className="input font-mono" value={sqoff} onChange={(e) => setSqoff(e.target.value)}/></Field>
          <Field label="MTM DD kill (% from peak)">
            <input type="number" className="input font-mono" value={mtmDdKill} onChange={(e) => setMtmDdKill(+e.target.value)}/></Field>
          <Field label="Dead-man switch (s, min 60)">
            <input type="number" className="input font-mono" min={60} value={deadman} onChange={(e) => setDeadman(+e.target.value)}/></Field>
        </div>

        <ToggleRow label="Trailing SL" enabled={trailingEnabled} onChange={setTrailingEnabled}>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Activate after profit ₹">
              <input className="input font-mono" value={trailingTrigger} onChange={(e) => setTrailingTrigger(e.target.value)}/></Field>
            <Field label="Step ₹">
              <input className="input font-mono" value={trailingStep} onChange={(e) => setTrailingStep(e.target.value)}/></Field>
          </div>
        </ToggleRow>

        <ToggleRow label="Lock-in profits" enabled={lockinEnabled} onChange={setLockinEnabled}>
          <Field label="When profit ≥ ₹, move SL to breakeven">
            <input className="input font-mono" value={lockinAmount} onChange={(e) => setLockinAmount(e.target.value)}/></Field>
        </ToggleRow>
      </section>

      {/* Preview */}
      <section className="card space-y-3" style={{background:"var(--panel-2)"}}>
        <h2 className="font-semibold flex items-center gap-2"><Calculator size={16}/> Pre-trade Preview</h2>
        <ul className="text-sm space-y-1">
          <li>• <b>{legs.length} legs</b>: {legs.map(l => `${l.side}${l.lots}× ${l.strike}${l.type}`).join(" + ")}</li>
          <li>• {creditDebit >= 0 ? "Net credit" : "Net debit"}: <span className="font-mono">₹{Math.abs(Math.round(creditDebit)).toLocaleString("en-IN")}</span> · Margin required: <span className="font-mono">₹1,05,000</span> (available ₹8,45,000)</li>
          <li>• ROI estimate: <span className="font-mono text-[var(--success)]">{(creditDebit/105000*100).toFixed(2)}%</span> · Per ₹1Cr: <span className="font-mono text-[var(--success)]">₹{Math.round(creditDebit/105000*1e7).toLocaleString("en-IN")}</span></li>
          {needsSlice && <li className="text-[var(--warn)]">• Iceberg: {slices} child orders across legs, {freeze} units max, 100ms apart (configurable in Settings→Execution)</li>}
          <li>• SEBI algo-ID tagged on every order · OTR monitored · order-rate cap 8/sec</li>
        </ul>
        {needsApproval && (
          <div className="flex items-start gap-2 text-sm text-[var(--warn)] rounded-lg p-3 border"
               style={{background:"color-mix(in srgb, var(--warn) 10%, transparent)",
                       borderColor:"color-mix(in srgb, var(--warn) 30%, transparent)"}}>
            <AlertCircle size={16} className="mt-0.5"/>
            <div><b>Two-person approval required</b> — {maxLots} lots ≥ 5 threshold.</div>
          </div>
        )}
      </section>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 -mx-6 px-6 py-3 border-t flex gap-2 justify-between items-center"
           style={{borderColor:"var(--border)", background:"color-mix(in srgb, var(--bg) 92%, transparent)", backdropFilter:"blur(6px)"}}>
        <div className="text-xs text-[var(--muted)]">
          {legs.length} legs · {totalUnits}u · {creditDebit >= 0 ? "Credit" : "Debit"} ₹{Math.abs(Math.round(creditDebit)).toLocaleString("en-IN")} · {triggerMode === "COMBINED" ? (triggerMet ? "Trigger MET ✓" : "Waiting for trigger") : triggerMode === "NONE" ? "No trigger — direct entry" : "Per-leg trigger"}
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setConfirmOpen("cancel")}>Cancel</button>
          <button className="btn-ghost btn-sm flex items-center gap-1" onClick={() => setConfirmOpen("save-draft")}>
            <Save size={14}/>Save Draft
          </button>
          {triggerMode === "NONE" ? (
            <button className="btn-danger btn-sm flex items-center gap-1"
                    onClick={() => setConfirmOpen("execute-now")}>
              <Zap size={14}/>Execute Now
            </button>
          ) : (
            <button className="btn-primary btn-sm flex items-center gap-1"
                    onClick={() => setConfirmOpen("start")}>
              <Sparkles size={14}/>Start (Monitor)
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      <ConfirmModal
        open={confirmOpen === "start"}
        title="Start Strategy?"
        tone="info"
        confirmLabel="Start Monitoring"
        body={
          <div className="space-y-2">
            <p>The engine will poll live quotes every 2s and place orders when your trigger condition is met.</p>
            <div className="rounded-md p-3 text-xs space-y-1" style={{background:"var(--panel-2)"}}>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Underlying</span><span className="font-mono">{underlying}</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Broker · Demat</span><span className="font-mono">{selectedBroker.toUpperCase()} · {selectedDemats.join(", ")}</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Strategy</span><span className="font-mono">{name}</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Trigger</span>
                <span className="font-mono">
                  {triggerMode === "COMBINED" && `Combined ≥ ₹${combinedTrigger}`}
                  {triggerMode === "SEPARATE" && `Per-leg (${legIndependence})`}
                  {triggerMode === "NONE" && `Enter immediately`}
                </span></div>
            </div>
            <div className="rounded-md p-3 text-xs font-mono space-y-1" style={{background:"var(--panel-2)"}}>
              {legs.map(l => <div key={l.id}>{l.side === "S" ? "SELL" : "BUY"} {l.lots}× ({l.lots*lotSize}u) {l.strike}{l.type} @ ₹{l.price}</div>)}
            </div>
            <ul className="text-xs text-[var(--muted)] list-disc pl-5">
              <li>{legs.length} legs · {totalUnits} units</li>
              <li>Estimated {creditDebit >= 0 ? "credit" : "debit"}: ₹{Math.abs(Math.round(creditDebit)).toLocaleString("en-IN")}</li>
              <li>Margin required ₹1,05,000 · available ₹8,45,000</li>
              <li>Exit: SL ₹{stopLoss} · Target ₹{target} · Square-off {squareOff} IST</li>
              {needsApproval && <li className="text-[var(--warn)]">⚠ Two-person approval will be requested ({maxLots} lots ≥ 5)</li>}
            </ul>
          </div>
        }
        onConfirm={() => { setConfirmOpen(null); toast("success", "Strategy started", "Monitoring for trigger condition"); nav("/"); }}
        onCancel={() => setConfirmOpen(null)}
      />

      <ConfirmModal
        open={confirmOpen === "execute-now"}
        title="Execute Now — place orders immediately?"
        tone="danger"
        confirmLabel="Execute"
        typeToConfirm="EXECUTE"
        body={
          <div className="space-y-2">
            <p>This bypasses the trigger and places all leg orders <b>right now</b> at LIMIT prices. Real money.</p>
            <div className="rounded-md p-3 text-xs space-y-1" style={{background:"var(--panel-2)"}}>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Underlying</span><span className="font-mono">{underlying}</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Broker · Demat</span><span className="font-mono">{selectedBroker.toUpperCase()} · {selectedDemats.join(", ")}</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Strategy</span><span className="font-mono">{name}</span></div>
            </div>
            <div className="rounded-md p-3 text-xs font-mono space-y-1" style={{background:"var(--panel-2)"}}>
              {legs.map(l => <div key={l.id}>{l.side === "S" ? "SELL" : "BUY"} {l.lots}× ({l.lots*lotSize}u) {l.strike}{l.type} @ ₹{l.price}</div>)}
            </div>
            <ul className="text-xs text-[var(--muted)] list-disc pl-5">
              <li>Estimated {creditDebit >= 0 ? "credit" : "debit"}: ₹{Math.abs(Math.round(creditDebit)).toLocaleString("en-IN")}</li>
              <li>Pre-trade RMS, SEBI rate limit (8/s), iceberg slicing will apply</li>
              <li>You can still use PAUSE / EXIT / KILL after entry</li>
            </ul>
          </div>
        }
        onConfirm={() => { setConfirmOpen(null); toast("success", "Orders submitted", "3 orders queued · SEBI rate bucket 3/8"); nav("/strategy/42"); }}
        onCancel={() => setConfirmOpen(null)}
      />

      <ConfirmModal
        open={confirmOpen === "load-default"}
        title={pendingExecuteAfterLoad ? "Default Strategy — Execute Now?" : "Load Default Strategy?"}
        tone={pendingExecuteAfterLoad ? "danger" : "info"}
        confirmLabel={pendingExecuteAfterLoad ? "Load + Execute" : "Load configuration"}
        typeToConfirm={pendingExecuteAfterLoad ? "EXECUTE" : undefined}
        body={
          <div className="space-y-2">
            <p>
              {pendingExecuteAfterLoad
                ? <>Pre-fills the legs and <b>places orders right now</b>. Real money.</>
                : <>Pre-fills the {underlying} legs below. Review then click <b>Start (Monitor)</b> or <b>Execute Now</b> to actually trade.</>}
            </p>
            <div className="rounded-md p-3 text-xs space-y-1" style={{background:"var(--panel-2)"}}>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Underlying</span><span className="font-mono font-semibold">{underlying}</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Broker · Demat</span><span className="font-mono">{selectedBroker.toUpperCase()} · {selectedDemats.join(", ")}</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Spot</span><span className="font-mono">{spot.toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Distance</span><span className="font-mono">≥ {DEFAULT_DISTANCE_PCT}% OTM (rounded away)</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Strikes</span>
                <span className="font-mono font-semibold">{defaultStrikesPreview.ce} CE / {defaultStrikesPreview.pe} PE</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Lots</span>
                <span className="font-mono">{pendingDefaultLots} × {lotSize}u = <b>{pendingDefaultLots*lotSize}u per leg</b></span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Premium target</span><span className="font-mono">₹{DEFAULT_TARGET_PER_CR.toLocaleString("en-IN")}/Cr margin</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Margin (approx)</span><span className="font-mono">~₹{(marginPerLot * pendingDefaultLots / 1000).toFixed(0)}K</span></div>
            </div>
            <ul className="text-xs text-[var(--muted)] list-disc pl-5">
              <li>SELL {defaultStrikesPreview.ce} CE × {pendingDefaultLots} lot{pendingDefaultLots>1?"s":""}</li>
              <li>SELL {defaultStrikesPreview.pe} PE × {pendingDefaultLots} lot{pendingDefaultLots>1?"s":""}</li>
              {pendingExecuteAfterLoad && <li className="text-[var(--warn)]">⚠ Orders submit immediately after confirm</li>}
            </ul>
          </div>
        }
        onConfirm={() => {
          applyDefaultStrategy(pendingDefaultLots);
          setConfirmOpen(null);
          if (pendingExecuteAfterLoad) {
            setTimeout(() => setConfirmOpen("execute-now"), 150);
          } else {
            toast("success", "Default loaded", `${defaultStrikesPreview.ce} CE / ${defaultStrikesPreview.pe} PE · ${pendingDefaultLots} lot${pendingDefaultLots>1?"s":""}`);
          }
        }}
        onCancel={() => setConfirmOpen(null)}
      />

      <ConfirmModal
        open={confirmOpen === "save-draft"}
        title="Save as Draft?"
        tone="info"
        confirmLabel="Save Draft"
        body={<p>Your strategy will be saved with <b>{name}</b> in DRAFT state. You can come back and start it anytime before expiry.</p>}
        onConfirm={() => { setConfirmOpen(null); toast("success", "Draft saved", `"${name}" in your Drafts`); }}
        onCancel={() => setConfirmOpen(null)}
      />

      <ConfirmModal
        open={confirmOpen === "cancel"}
        title="Discard changes?"
        tone="warn"
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        body={<p>You'll lose the {legs.length}-leg configuration. Are you sure?</p>}
        onConfirm={() => { setConfirmOpen(null); nav(-1); }}
        onCancel={() => setConfirmOpen(null)}
      />
    </div>
  );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return <div><label className="label">{label}</label>{children}</div>;
}

function QuoteStat({label, v, tone}: {label: string; v: string|number; tone?: "success"|"danger"}) {
  const col = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--ink)";
  return (
    <div>
      <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">{label}</div>
      <div className="font-mono font-semibold" style={{color: col}}>{v}</div>
    </div>
  );
}

function Adjust({label}: {label: string}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <div className="flex items-center rounded-md border" style={{borderColor:"var(--border)"}}>
        <button type="button" className="px-2 py-1 text-[var(--muted)] hover:text-[var(--ink)]">−</button>
        <span className="px-2 font-mono text-xs w-8 text-center">—</span>
        <button type="button" className="px-2 py-1 text-[var(--muted)] hover:text-[var(--ink)]">+</button>
      </div>
    </div>
  );
}

function ToggleRow({label, enabled, onChange, children}:
  {label: string; enabled: boolean; onChange: (v: boolean) => void; children?: React.ReactNode}) {
  return (
    <div>
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-sm font-medium">{label}</span>
        <button type="button" onClick={() => onChange(!enabled)}
                className="w-10 h-6 rounded-full relative transition"
                style={{background: enabled ? "var(--accent)" : "var(--border)"}}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${enabled ? "translate-x-4" : ""}`}/>
        </button>
      </label>
      {enabled && <div className="mt-3 pl-1">{children}</div>}
    </div>
  );
}
