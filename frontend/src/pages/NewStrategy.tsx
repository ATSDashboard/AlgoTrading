import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle, Plus, Trash2, Copy, Shield, Sparkles, Save, RotateCcw, Calculator,
  ChevronDown, BarChart2, Activity, Zap, Rocket,
} from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import { toast } from "@/components/Toast";
import StrikeSelectorBuilder from "@/components/StrikeSelectorBuilder";
import MarginStatusStrip from "@/components/trade/MarginStatusStrip";
import BrokerDematPicker, { ALL_BROKERS, BROKER_DEMATS } from "@/components/trade/BrokerDematPicker";
import EntryTimeWindow from "@/components/trade/EntryTimeWindow";
import ExitRules from "@/components/trade/ExitRules";
import DefaultStrategyCTA from "@/components/trade/DefaultStrategyCTA";
import PremiumTrigger from "@/components/trade/PremiumTrigger";
import LegsTable from "@/components/trade/LegsTable";
import { KV2 } from "@/components/trade/shared";

import type { Leg, OptType } from "@/components/trade/types";

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
  const [triggerMode, setTriggerMode] = useState<"COMBINED"|"PER_CR"|"SEPARATE"|"NONE">("COMBINED");
  const [combinedTrigger, setCombinedTrigger] = useState("80");
  const [perCrTrigger, setPerCrTrigger] = useState("5000");  // ₹/Cr
  // SEPARATE mode: per-leg thresholds live ON the leg (l.price = Trade Price = threshold).
  // legIndependence = should each leg fire independently or both at once?
  const [legIndependence, setLegIndependence] = useState<"linked"|"independent">("linked");

  // Broker + demat selection (linked to RMS access control per trader)
  const [selectedBroker, setSelectedBroker] = useState("zerodha");
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>(["zerodha"]);
  const [selectedDemats, setSelectedDemats] = useState<string[]>(["ZD12345"]);
  const [multiDematMode, setMultiDematMode] = useState(false);
  const [multiBrokerMode, setMultiBrokerMode] = useState(false);

  function toggleBroker(id: string) {
    setSelectedBrokers(prev => {
      const next = prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id];
      const allowed = new Set(next.flatMap(b => (BROKER_DEMATS[b] ?? []).map(d => d.id)));
      setSelectedDemats(d => d.filter(x => allowed.has(x)));
      return next;
    });
  }

  function toggleDemat(id: string) {
    setSelectedDemats(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  }

  // ── Margin allocation (simple) ────────────────────────────────────
  // "Deploy ₹X total · keep ₹Y or Z% free in each demat"
  // System always pulls weighted by available — no split mode picker.
  const [budgetCr,    setBudgetCr]    = useState<number>(0);     // 0 = use full available
  const [cushionPct,  setCushionPct]  = useState<number>(5);
  const [cushionMin,  setCushionMin]  = useState<number>(500000);

  // Strike selection mode
  const [strikeMode, setStrikeMode] = useState<"manual"|"auto">("manual");

  // Confirmation modals
  const [confirmOpen, setConfirmOpen] = useState<null | "start" | "execute-now" | "save-draft" | "cancel" | "load-default">(null);
  const [pendingDefaultLots, setPendingDefaultLots] = useState<number>(1);
  const [pendingExecuteAfterLoad, setPendingExecuteAfterLoad] = useState<boolean>(false);

  // ── Entry time window ────────────────────────────────────────────
  const [entryFrom, setEntryFrom] = useState("09:30");
  const [entryTo, setEntryTo] = useState("10:30");
  const [restrictByTime, setRestrictByTime] = useState(true);

  // ── "Default-only" trader mode (set by admin in Settings → Users) ─
  // Reads localStorage flag for now; backend integration later.
  const defaultOnly = typeof window !== "undefined" &&
    localStorage.getItem("tg-default-only") === "1";

  // ── Margin snapshot (mock — backend will provide live values) ─────
  const totalMargin    = 10_00_000;       // ₹10L gross account margin
  const usedByActive   = 3_25_000;        // tied up by other active strategies
  const blockedByOrders =   45_000;       // pending orders / awaiting fills
  const freeMargin     = totalMargin - usedByActive - blockedByOrders;

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

  // Margin required for THIS strategy = sum of (margin per lot) per leg
  // (selling options has standardised SPAN+ELM margin per lot, simplified here)
  const marginRequired = useMemo(() => {
    return legs.reduce((acc, l) => acc + (marginPerLot * l.lots), 0);
  }, [legs, marginPerLot]);

  const marginGap = freeMargin - marginRequired;       // negative = over budget
  const marginPctUsed = freeMargin > 0 ? Math.min(100, (marginRequired / freeMargin) * 100) : 100;
  const marginExceeded = marginGap < 0;
  const marginNearLimit = !marginExceeded && marginPctUsed >= 80;
  const legsInTrigger = legs.filter((l) => l.inCombinedTrigger).length;
  // Live combined-premium per ₹1Cr margin: (combined ₹ × lotSize × marginPerLot⁻¹ × 1Cr)
  // Approx: combined-credit / margin-required × 1Cr  (in ₹ per Cr)
  const perCrLive = marginRequired > 0 ? (combinedLive * lotSize * legs.reduce((s,l)=>l.inCombinedTrigger?s+l.lots:s,0)) / marginRequired * 1_00_00_000 : 0;
  const triggerMet =
    (triggerMode === "COMBINED" && combinedLive >= +combinedTrigger) ||
    (triggerMode === "PER_CR"   && perCrLive   >= +perCrTrigger);

  return (
    <div className="max-w-5xl space-y-6">
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
      <BrokerDematPicker
        selectedBroker={selectedBroker} setSelectedBroker={setSelectedBroker}
        selectedBrokers={selectedBrokers} toggleBroker={toggleBroker}
        selectedDemats={selectedDemats} setSelectedDemats={setSelectedDemats} toggleDemat={toggleDemat}
        multiDematMode={multiDematMode} setMultiDematMode={setMultiDematMode}
        multiBrokerMode={multiBrokerMode} setMultiBrokerMode={setMultiBrokerMode}
        budgetCr={budgetCr} setBudgetCr={setBudgetCr}
        cushionPct={cushionPct} setCushionPct={setCushionPct}
        cushionMin={cushionMin} setCushionMin={setCushionMin}
      />

      {/* ── Margin Status — only the FREE margin is usable for new trades ──── */}
      <MarginStatusStrip totalMargin={totalMargin} usedByActive={usedByActive}
                         blockedByOrders={blockedByOrders} freeMargin={freeMargin}/>

      {defaultOnly && (
        <div className="card border-2 !py-2.5"
             style={{borderColor:"var(--warn)", background:"color-mix(in srgb, var(--warn) 8%, var(--panel))"}}>
          <div className="flex items-center gap-2 text-xs">
            <Shield size={14} className="text-[var(--warn)]"/>
            <span><b>Restricted mode:</b> your account has access to <b>Default Strategy only</b>.
              Manual leg builder, custom triggers, and rule editor are disabled. Contact admin for elevated access.</span>
          </div>
        </div>
      )}

      {/* ── Default Strategy CTA — one-click safe entry ────────────────── */}
      <DefaultStrategyCTA
        underlying={underlying} setUnderlying={setUnderlying}
        spot={spot} lotSize={lotSize} strikeGrid={strikeGrid} marginPerLot={marginPerLot}
        defaultStrikesPreview={defaultStrikesPreview}
        selectedBroker={selectedBroker} selectedDemats={selectedDemats}
        distancePct={DEFAULT_DISTANCE_PCT} targetPerCr={DEFAULT_TARGET_PER_CR}
        onLoadOnly={(lots) => { setPendingDefaultLots(lots); setPendingExecuteAfterLoad(false); setConfirmOpen("load-default"); }}
        onLoadAndExecute={(lots) => { setPendingDefaultLots(lots); setPendingExecuteAfterLoad(true); setConfirmOpen("load-default"); }}
      />

      {/* ── Manual builder (hidden in default-only mode) ──────────── */}
      {defaultOnly ? null : <>
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
      <LegsTable
        legs={legs} underlying={underlying} lotSize={lotSize}
        triggerMode={triggerMode}
        expandedIds={expandedIds} toggleExpanded={toggleExpanded}
        update={update} addLeg={addLeg} removeLeg={removeLeg} duplicateLeg={duplicateLeg}
        resetPrices={() => {
          setLegs(legs.map(l => ({...l, price: 0, ...mockQuote(l.strike, l.type)})));
          toast("info", "Prices refreshed from live chain");
        }}
        legsInTrigger={legsInTrigger} totalUnits={totalUnits}
        creditDebit={creditDebit} needsSlice={needsSlice} slices={slices}
      />

      {/* Entry Time Window — gates entries to a chosen intraday window */}
      <EntryTimeWindow
        entryFrom={entryFrom} setEntryFrom={setEntryFrom}
        entryTo={entryTo} setEntryTo={setEntryTo}
        restrictByTime={restrictByTime} setRestrictByTime={setRestrictByTime}
      />

      {/* Premium Trigger (separate module — pairs with Strike Selector for auto trades) */}
      <PremiumTrigger
        triggerMode={triggerMode}
        onModeChange={(m) => {
          setTriggerMode(m);
          if ((m === "COMBINED" || m === "PER_CR") && legs.length > 2) {
            setLegs((L) => L.slice(0, 2));
            toast("info", "Trimmed to 2 legs",
              `${m === "COMBINED" ? "Combined ∑" : "Per ₹1Cr"} mode uses one CE + one PE only.`);
          }
        }}
        combinedTrigger={combinedTrigger} setCombinedTrigger={setCombinedTrigger}
        combinedLive={combinedLive} legsInTrigger={legsInTrigger}
        perCrTrigger={perCrTrigger} setPerCrTrigger={setPerCrTrigger} perCrLive={perCrLive}
        legs={legs} legIndependence={legIndependence} setLegIndependence={setLegIndependence}
        triggerMet={triggerMet} legCount={legs.length} lotSize={lotSize}
        strikeMode={strikeMode} restrictByTime={restrictByTime}
        entryFrom={entryFrom} entryTo={entryTo}
      />

      {/* Exit / Kill */}
      <ExitRules
        sl={sl} setSl={setSl}
        target={target} setTarget={setTarget}
        sqoff={sqoff} setSqoff={setSqoff}
        mtmDdKill={mtmDdKill} setMtmDdKill={setMtmDdKill}
        trailingEnabled={trailingEnabled} setTrailingEnabled={setTrailingEnabled}
        trailingTrigger={trailingTrigger} setTrailingTrigger={setTrailingTrigger}
        trailingStep={trailingStep} setTrailingStep={setTrailingStep}
        lockinEnabled={lockinEnabled} setLockinEnabled={setLockinEnabled}
        lockinAmount={lockinAmount} setLockinAmount={setLockinAmount}
        deadman={deadman} setDeadman={setDeadman}
      />

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
      </>}
      {/* ── End manual builder ─────────────────────────────────────── */}

      {/* Live margin gauge — appears just above the action bar */}
      {!defaultOnly && (
        <section className={`card !py-3 ${marginExceeded ? "!border-[var(--danger)]" : marginNearLimit ? "!border-[var(--warn)]" : ""}`}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">This strategy will use</div>
              <div className={`text-xl font-mono font-bold ${
                marginExceeded ? "text-[var(--danger)]" : marginNearLimit ? "text-[var(--warn)]" : "text-[var(--ink)]"
              }`}>
                ₹{(marginRequired/100000).toFixed(2)}L
                <span className="text-xs text-[var(--muted)] font-normal ml-2">
                  of ₹{(freeMargin/100000).toFixed(2)}L free
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-[180px]">
              <div className="w-full h-2.5 rounded-full overflow-hidden" style={{background:"var(--panel-2)"}}>
                <div className="h-full transition-all" style={{
                  width: `${marginPctUsed}%`,
                  background: marginExceeded ? "var(--danger)" : marginNearLimit ? "var(--warn)" : "var(--success)"
                }}/>
              </div>
              <div className="flex justify-between text-[10px] mt-1">
                <span className={marginExceeded ? "text-[var(--danger)] font-semibold" : "text-[var(--muted)]"}>
                  {marginPctUsed.toFixed(0)}% of free margin
                </span>
                <span className={`font-mono ${marginExceeded ? "text-[var(--danger)] font-semibold" : marginGap < 100000 ? "text-[var(--warn)]" : "text-[var(--success)]"}`}>
                  {marginExceeded
                    ? `OVER by ₹${(Math.abs(marginGap)/100000).toFixed(2)}L`
                    : `₹${(marginGap/100000).toFixed(2)}L will remain`}
                </span>
              </div>
            </div>
          </div>
          {marginExceeded && (
            <div className="mt-2 pt-2 border-t flex items-start gap-2 text-xs" style={{borderColor:"var(--border)"}}>
              <AlertCircle size={14} className="text-[var(--danger)] shrink-0 mt-0.5"/>
              <div>
                <b className="text-[var(--danger)]">Margin exceeded.</b> Reduce lots, change strikes, or wait for active strategies to close.
                Pre-trade RMS will reject this order. Submit buttons are disabled.
              </div>
            </div>
          )}
          {marginNearLimit && !marginExceeded && (
            <div className="mt-2 pt-2 border-t text-[11px]" style={{borderColor:"var(--border)"}}>
              <span className="text-[var(--warn)]">⚠ Using {marginPctUsed.toFixed(0)}% of free margin.</span>
              <span className="text-[var(--muted)]"> Little room for slippage / margin spikes.</span>
            </div>
          )}
        </section>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 -mx-6 px-6 py-3 border-t flex gap-2 justify-between items-center"
           style={{borderColor:"var(--border)", background:"color-mix(in srgb, var(--bg) 92%, transparent)", backdropFilter:"blur(6px)"}}>
        <div className="text-xs text-[var(--muted)]">
          {legs.length} legs · {totalUnits}u · {creditDebit >= 0 ? "Credit" : "Debit"} ₹{Math.abs(Math.round(creditDebit)).toLocaleString("en-IN")} · {
            triggerMode === "COMBINED" ? (triggerMet ? "Combined trigger MET ✓" : "Waiting for combined trigger")
            : triggerMode === "PER_CR" ? (triggerMet ? "Per-Cr trigger MET ✓" : "Waiting for per-Cr trigger")
            : triggerMode === "NONE" ? "No trigger — direct entry"
            : "Per-leg trigger"
          }
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setConfirmOpen("cancel")}>Cancel</button>
          {!defaultOnly && (
            <>
              <button className="btn-ghost btn-sm flex items-center gap-1" onClick={() => setConfirmOpen("save-draft")}>
                <Save size={14}/>Save Draft
              </button>
              {triggerMode === "NONE" ? (
                <button className="btn-danger btn-sm flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={marginExceeded}
                        title={marginExceeded ? `Required ₹${(marginRequired/100000).toFixed(2)}L exceeds free margin ₹${(freeMargin/100000).toFixed(2)}L` : undefined}
                        onClick={() => setConfirmOpen("execute-now")}>
                  <Zap size={14}/>Execute Now
                </button>
              ) : (
                <button className="btn-primary btn-sm flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={marginExceeded}
                        title={marginExceeded ? `Required ₹${(marginRequired/100000).toFixed(2)}L exceeds free margin ₹${(freeMargin/100000).toFixed(2)}L` : undefined}
                        onClick={() => setConfirmOpen("start")}>
                  <Sparkles size={14}/>Start (Monitor)
                </button>
              )}
            </>
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
                  {triggerMode === "PER_CR"   && `≥ ₹${(+perCrTrigger).toLocaleString("en-IN")} per ₹1Cr margin`}
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
              <li>Exit rules from <b>Exit Rules & Kill Switches</b> section apply</li>
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
