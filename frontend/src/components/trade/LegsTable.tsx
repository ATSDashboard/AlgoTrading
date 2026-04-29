/**
 * Legs Table — multi-leg row builder + expanded live quote panel + footer.
 *
 * Row columns (centred where relevant):
 *   ∑ · B/S · Expiry · Strike±  · Type · Lots · Order · LTP · Trade Price · Actions
 *
 * Trade Price is editable when triggerMode is "SEPARATE" or "NONE";
 * disabled in Combined ∑ / Per ₹1Cr modes (whole-strangle math).
 *
 * Add Leg button is gated to 2 legs in Combined / Per-Cr modes.
 *
 * State stays in the page; this component is a controlled view.
 */
import { BarChart2, Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Leg, OrderKind } from "./types";

type Props = {
  legs: Leg[];
  underlying: "NIFTY" | "SENSEX";
  lotSize: number;

  triggerMode: "COMBINED" | "PER_CR" | "SEPARATE" | "NONE";

  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;

  update: (id: string, patch: Partial<Leg>) => void;
  addLeg: () => void;
  removeLeg: (id: string) => void;
  duplicateLeg: (id: string) => void;
  resetPrices: () => void;

  legsInTrigger: number;
  totalUnits: number;
  creditDebit: number;
  needsSlice: boolean;
  slices: number;
};

const GRID = "grid grid-cols-[32px_60px_120px_140px_72px_64px_104px_72px_96px_96px] gap-2";

export default function LegsTable(p: Props) {
  const lockedTo2 = p.triggerMode === "COMBINED" || p.triggerMode === "PER_CR";

  return (
    <section className="card space-y-3">
      <Header legCount={p.legs.length} addLeg={p.addLeg} lockedTo2={lockedTo2} triggerMode={p.triggerMode} />
      <ColumnHeaders />

      {p.legs.map((l) => (
        <LegRow key={l.id} leg={l}
                expanded={p.expandedIds.has(l.id)}
                onToggleExpand={() => p.toggleExpanded(l.id)}
                onUpdate={(patch) => p.update(l.id, patch)}
                onDuplicate={() => p.duplicateLeg(l.id)}
                onRemove={() => p.removeLeg(l.id)}
                canRemove={p.legs.length > 1}
                underlying={p.underlying}
                lotSize={p.lotSize}
                triggerMode={p.triggerMode} />
      ))}

      <AdjustRow />
      <Footer legsInTrigger={p.legsInTrigger} totalLegs={p.legs.length}
              totalUnits={p.totalUnits} creditDebit={p.creditDebit}
              needsSlice={p.needsSlice} slices={p.slices}
              resetPrices={p.resetPrices} />
    </section>
  );
}

function Header({ legCount, addLeg, lockedTo2, triggerMode }:
  { legCount: number; addLeg: () => void; lockedTo2: boolean; triggerMode: Props["triggerMode"] }) {
  const disabledAdd = lockedTo2 && legCount >= 2;
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="font-semibold">Legs ({legCount})</h2>
        <div className="text-xs text-[var(--muted)] mt-0.5">
          Click row to expand bid/ask/qty · ☑ column = include in combined trigger
        </div>
      </div>
      <button onClick={addLeg} disabled={disabledAdd}
              title={disabledAdd
                ? `${triggerMode === "COMBINED" ? "Combined ∑" : "Per ₹1Cr"} mode is locked to 2 legs (CE + PE). Switch trigger mode to add more.`
                : undefined}
              className="btn-primary btn-sm flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
        <Plus size={12} />Add Leg
      </button>
    </div>
  );
}

function ColumnHeaders() {
  return (
    <div className={`${GRID} text-[10px] uppercase tracking-wide text-[var(--muted)] px-2`}>
      <span className="text-center" title="Include in combined trigger">∑</span>
      <span className="text-center">B/S</span>
      <span className="text-center">Expiry</span>
      <span className="text-center">Strike</span>
      <span className="text-center">Type</span>
      <span className="text-center">Lots</span>
      <span className="text-center">Order</span>
      <span className="text-center">LTP</span>
      <span className="text-center" title="Per-leg LIMIT price; in Per-leg trigger mode this IS the per-leg premium threshold.">Trade Price</span>
      <span className="text-right pr-1">Actions</span>
    </div>
  );
}

function LegRow({ leg, expanded, onToggleExpand, onUpdate, onDuplicate, onRemove, canRemove, underlying, lotSize, triggerMode }: {
  leg: Leg; expanded: boolean;
  onToggleExpand: () => void; onUpdate: (patch: Partial<Leg>) => void;
  onDuplicate: () => void; onRemove: () => void; canRemove: boolean;
  underlying: "NIFTY" | "SENSEX"; lotSize: number;
  triggerMode: Props["triggerMode"];
}) {
  const strikeStep = underlying === "NIFTY" ? 50 : 100;
  const priceDisabled = leg.orderKind === "MARKET" || triggerMode === "COMBINED" || triggerMode === "PER_CR";
  const priceTitle = triggerMode === "COMBINED" ? "Disabled — fires when CE+PE sum hits the combined threshold below."
    : triggerMode === "PER_CR" ? "Disabled — fires when premium-per-Cr ratio hits the threshold below."
    : triggerMode === "SEPARATE" ? "Trade price = this leg's premium threshold. Entry fires when this leg's bid ≥ this value."
    : "LIMIT price for the order.";

  return (
    <div className={`rounded-lg border overflow-hidden ${
      leg.side === "S" ? "border-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
                       : "border-[color-mix(in_srgb,var(--success)_20%,transparent)]"
    }`}
         style={{ background: "var(--panel-2)" }}>

      <div className={`${GRID} items-center p-2`}>
        {/* ∑ */}
        <div className="flex justify-center">
          <input type="checkbox" checked={leg.inCombinedTrigger}
                 onChange={(e) => onUpdate({ inCombinedTrigger: e.target.checked })}
                 title="Include this leg in the combined-premium trigger" className="cursor-pointer" />
        </div>

        {/* B/S */}
        <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          {(["B", "S"] as const).map((s) => (
            <button key={s} type="button" onClick={() => onUpdate({ side: s })}
                    className={`flex-1 py-1 text-xs font-semibold ${leg.side === s ? "text-white" : "text-[var(--muted)]"}`}
                    style={{ background: leg.side === s ? (s === "B" ? "var(--success)" : "var(--danger)") : "transparent" }}>
              {s}
            </button>
          ))}
        </div>

        {/* Expiry */}
        <select className="input !py-1.5 text-sm" value={leg.expiry}
                onChange={(e) => onUpdate({ expiry: e.target.value })}>
          <option value="2026-04-17">17 Apr (0d)</option>
          <option value="2026-04-24">24 Apr (7d)</option>
          <option value="2026-05-01">01 May (14d)</option>
          <option value="2026-05-29">29 May (M)</option>
        </select>

        {/* Strike */}
        <div className="flex items-center rounded-md border"
             style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
          <button type="button" className="px-2 text-[var(--muted)] hover:text-[var(--ink)]"
                  onClick={() => onUpdate({ strike: leg.strike - strikeStep })}>−</button>
          <input type="number"
                 className="flex-1 text-center bg-transparent text-sm font-mono py-1 focus:outline-none text-[var(--ink)]"
                 value={leg.strike} onChange={(e) => onUpdate({ strike: +e.target.value })} />
          <button type="button" className="px-2 text-[var(--muted)] hover:text-[var(--ink)]"
                  onClick={() => onUpdate({ strike: leg.strike + strikeStep })}>+</button>
        </div>

        {/* Type */}
        <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          {(["CE", "PE"] as const).map((t) => (
            <button key={t} type="button" onClick={() => onUpdate({ type: t })}
                    className={`flex-1 py-1 text-xs font-semibold transition ${leg.type === t ? "text-white" : "text-[var(--muted)]"}`}
                    style={{
                      background: leg.type === t
                        ? (t === "CE" ? "color-mix(in srgb, var(--danger) 60%, transparent)"
                                      : "color-mix(in srgb, var(--accent) 60%, transparent)")
                        : "transparent",
                    }}>
              {t}
            </button>
          ))}
        </div>

        {/* Lots */}
        <select className="input !py-1.5 text-sm font-mono text-center" value={leg.lots}
                onChange={(e) => onUpdate({ lots: +e.target.value })}
                title={`1 lot = ${lotSize} units (${underlying} exchange). Total qty auto-snaps to lot multiples.`}>
          {Array.from({ length: 30 }).map((_, n) => <option key={n + 1} value={n + 1}>{n + 1}</option>)}
        </select>

        {/* Order kind */}
        <select className="input !py-1.5 text-xs text-center" value={leg.orderKind}
                onChange={(e) => onUpdate({ orderKind: e.target.value as OrderKind })}
                title="MARKET disabled on options for safety (SEBI + wide spreads)">
          <option value="LIMIT">LIMIT</option>
          <option value="LIMIT_WITH_BUFFER">LIMIT+buf</option>
          <option value="MARKET" disabled>MARKET (off)</option>
        </select>

        {/* LTP */}
        <div className="text-sm font-mono font-semibold text-[var(--ink)] whitespace-nowrap text-center">
          {leg.ltp.toFixed(2)}
        </div>

        {/* Trade Price */}
        <input type="number" step="0.05" value={leg.price}
               disabled={priceDisabled} title={priceTitle}
               onChange={(e) => onUpdate({ price: +e.target.value })}
               className={`input !py-1.5 text-sm font-mono text-center disabled:opacity-40 disabled:cursor-not-allowed ${
                 triggerMode === "SEPARATE" ? "!border-[var(--accent)]" : ""
               }`} />

        {/* Actions */}
        <div className="flex gap-0.5 justify-end items-center">
          <button type="button" title={expanded ? "Hide details" : "Show quote details"}
                  className={`p-1.5 rounded-md transition ${expanded ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
                  style={expanded ? { background: "color-mix(in srgb, var(--accent) 15%, transparent)" } : {}}
                  onClick={onToggleExpand}>
            <BarChart2 size={14} />
          </button>
          <button type="button" title="Duplicate leg"
                  className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--ink)]"
                  onClick={onDuplicate}><Copy size={13} /></button>
          <button type="button" title="Remove leg" disabled={!canRemove}
                  className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-30"
                  onClick={onRemove}><Trash2 size={13} /></button>
        </div>
      </div>

      {expanded && <ExpandedQuote leg={leg} triggerMode={triggerMode} onUpdate={onUpdate} />}
    </div>
  );
}

function ExpandedQuote({ leg, triggerMode, onUpdate }:
  { leg: Leg; triggerMode: Props["triggerMode"]; onUpdate: (patch: Partial<Leg>) => void }) {
  const spreadPct = +(((leg.ask - leg.bid) / leg.ltp) * 100).toFixed(2);
  const chgPct = `${(((leg.ltp - leg.close) / leg.close) * 100).toFixed(2)}%`;
  return (
    <div className="border-t p-4 space-y-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
      <Section title="Live Quote">
        <div className="grid grid-cols-7 gap-3">
          <QuoteStat label="Bid" v={leg.bid} tone="success" />
          <QuoteStat label="Ask" v={leg.ask} tone="danger" />
          <QuoteStat label="Bid Qty" v={leg.bidQty} />
          <QuoteStat label="Ask Qty" v={leg.askQty} />
          <QuoteStat label="Spread %" v={spreadPct} />
          <QuoteStat label="OI" v={`${(leg.oi / 1_00_000).toFixed(1)}L`} />
          <QuoteStat label="Volume" v={leg.vol.toLocaleString("en-IN")} />
        </div>
      </Section>

      <Section title="Today's Range">
        <div className="grid grid-cols-8 gap-3">
          <QuoteStat label="Open" v={leg.open} />
          <QuoteStat label="High" v={leg.high} tone="success" />
          <QuoteStat label="Low" v={leg.low} tone="danger" />
          <QuoteStat label="Prev Close" v={leg.close} />
          <QuoteStat label="% Chg" v={chgPct} tone={leg.ltp >= leg.close ? "success" : "danger"} />
          <QuoteStat label="IV" v="16.5%" />
          <QuoteStat label="Delta" v="0.12" />
          <QuoteStat label="Theta" v="-0.85" />
        </div>
      </Section>

      <Section title="Intraday Snapshots (IST)">
        <div className="grid grid-cols-5 gap-3">
          <QuoteStat label="09:20" v={leg.p_0920} />
          <QuoteStat label="09:45" v={leg.p_0945} />
          <QuoteStat label="10:30" v={leg.p_1030} />
          <QuoteStat label="11:00" v={leg.p_1100} />
          <QuoteStat label="12:00" v={leg.p_1200} />
        </div>
      </Section>

      {triggerMode === "SEPARATE" && (
        <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
          <span className="text-[var(--muted)] text-xs">Per-leg trigger: this leg's bid ≥ ₹</span>
          <input type="number" step="0.05" className="input !py-1 !w-28 text-sm font-mono"
                 value={leg.singleThreshold ?? ""} placeholder="auto"
                 onChange={(e) => onUpdate({ singleThreshold: e.target.value ? +e.target.value : null })} />
          <span className="text-[var(--muted)] text-xs">(fires when threshold met)</span>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">{title}</div>
      {children}
    </div>
  );
}

function QuoteStat({ label, v, tone }: { label: string; v: string | number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--ink)";
  return (
    <div>
      <div className="text-[10px] text-[var(--muted)] uppercase">{label}</div>
      <div className="font-mono text-sm font-semibold" style={{ color }}>{v}</div>
    </div>
  );
}

function AdjustRow() {
  return (
    <div className="flex flex-wrap gap-4 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
      <Adjust label="Shift" />
      <Adjust label="Width" />
      <Adjust label="Hedge" />
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-xs text-[var(--muted)]">Multiplier</span>
        <select className="input !py-1.5 !w-20 text-sm font-mono">
          {[1, 2, 3, 5, 10].map((n) => <option key={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}

function Adjust({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <button className="px-2 py-0.5 rounded border text-xs" style={{ borderColor: "var(--border)" }}>−</button>
      <span className="font-mono text-xs w-6 text-center">0</span>
      <button className="px-2 py-0.5 rounded border text-xs" style={{ borderColor: "var(--border)" }}>+</button>
    </div>
  );
}

function Footer({ legsInTrigger, totalLegs, totalUnits, creditDebit, needsSlice, slices, resetPrices }: {
  legsInTrigger: number; totalLegs: number; totalUnits: number; creditDebit: number;
  needsSlice: boolean; slices: number; resetPrices: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-3 border-t text-sm" style={{ borderColor: "var(--border)" }}>
      <div className="flex gap-5 flex-wrap">
        <span className="text-[var(--muted)]">Legs in ∑</span>
        <span className="font-mono">{legsInTrigger}/{totalLegs}</span>
        <span className="text-[var(--muted)]">Net Qty</span>
        <span className="font-mono">{totalUnits}u</span>
        <span className="text-[var(--muted)]">{creditDebit >= 0 ? "Credit" : "Debit"}</span>
        <span className={`font-mono font-semibold ${creditDebit >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
          ₹{Math.abs(Math.round(creditDebit)).toLocaleString("en-IN")}
        </span>
        {needsSlice && <span className="chip-yellow">iceberg {slices} orders</span>}
      </div>
      <button className="btn-ghost btn-sm flex items-center gap-1" onClick={resetPrices}>
        <RotateCcw size={12} />Reset Prices
      </button>
    </div>
  );
}
