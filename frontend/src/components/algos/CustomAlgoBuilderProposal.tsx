/**
 * Custom Algo Builder — UX proposal panel (read-only sketch for now).
 *
 * Goal: let traders compose multi-phase algos like Manipulation Harvest
 * out of the same primitives they already use in /trade. This panel shows
 * the proposed builder layout and the building blocks that will compose
 * any phased algo. No state today — when greenlit, this becomes a real
 * <CustomAlgoBuilder> with state + persistence.
 *
 * Building blocks (all already exist in the codebase, just need to be
 * recombinable):
 *   - Schedule         (day-of-week + entry/exit time window)
 *   - Strike Selector  (% / points / delta + advanced filters)
 *   - Premium Trigger  (4 modes — combined ∑ / per ₹1Cr / per-leg / now)
 *   - Order Recipe     (BUY basket OR SELL limit basket OR margin recycle)
 *   - Phase            (sequence of recipes with a timed start)
 *   - Algo             (n phases stitched together with global skip rules)
 */
import { ArrowDown, Calendar, Clock, Filter, Layers, Lightbulb, Sparkles } from "lucide-react";

const BLOCKS = [
  {
    icon: Calendar,
    name: "Schedule",
    summary: "Day-of-week × time windows × instrument",
    examples: "Every Thursday SENSEX E-0 · 14:00–15:25 IST",
    reuses: "EntryTimeWindow primitives + new day-of-week selector",
  },
  {
    icon: Filter,
    name: "Strike Selector",
    summary: "Pick the basket — % / points / delta + filters",
    examples: "4.5% ≤ dist ≤ 5.5% · OI ≤ 20L · LTP ∈ [0.05, 0.50]",
    reuses: "StrikeSelectorBuilder (already supports CE/PE independent rules)",
  },
  {
    icon: Sparkles,
    name: "Premium Trigger",
    summary: "When does this phase fire? — 4 modes",
    examples: "Per-leg fires when bid ≥ 12× phase-start LTP",
    reuses: "PremiumTrigger component + new 'multiplier of baseline' mode",
  },
  {
    icon: Layers,
    name: "Order Recipe",
    summary: "What to do — BUY basket / SELL basket / Recycle / Take-profit",
    examples: "BUY 5 strikes for ₹2.5K each · OR · SELL LIMIT @ 12× LTP",
    reuses: "Trade-page order builder + new BuyBasket and TakeProfit recipes",
  },
];

const PHASE_TEMPLATE = [
  { phase: "PREP",   range: "14:00 – 14:30", recipes: ["Margin recycle 20%", "BUY basket (Play D)"] },
  { phase: "DEPLOY", range: "14:30 – 15:00", recipes: ["SELL LIMITs @ 12× LTP", "Take-profits @ 10× buy avg"] },
  { phase: "CATCH",  range: "15:00 – 15:25", recipes: ["Spike monitor (alerts only)", "Emergency exit on spot move"] },
  { phase: "SETTLE", range: "≥ 15:25",       recipes: ["Cancel unfilled", "Close all longs", "Journal P&L"] },
];

export default function CustomAlgoBuilderProposal() {
  return (
    <section className="card space-y-4" style={{ borderStyle: "dashed" }}>
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb size={16} className="text-[var(--accent)]" />
          <h2 className="font-semibold">Custom Algo Builder</h2>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide"
                style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
            PROPOSAL
          </span>
        </div>
        <span className="text-[10px] text-[var(--muted)]">
          For when you want to compose a Manipulation-Harvest-like algo from scratch
        </span>
      </header>

      <p className="text-sm text-[var(--muted)] leading-relaxed">
        Manipulation Harvest is hardcoded today. The same algo can be expressed as a
        composition of <b>4 building blocks</b> the trader already uses in <code>/trade</code>.
        A <i>Custom Algo Builder</i> would let you stack phases like LEGO and save the result
        as a reusable algo template.
      </p>

      {/* Building blocks */}
      <div>
        <div className="text-xs font-semibold mb-2 text-[var(--ink)]">Building blocks</div>
        <div className="grid md:grid-cols-2 gap-2">
          {BLOCKS.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.name} className="rounded-lg border p-3"
                   style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-[var(--accent)]" />
                  <span className="font-semibold text-sm">{b.name}</span>
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-1">{b.summary}</div>
                <div className="text-[11px] text-[var(--ink)] font-mono mt-1.5">{b.examples}</div>
                <div className="text-[10px] text-[var(--muted)] mt-1.5 italic">Reuses: {b.reuses}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* How a Phase composes */}
      <div>
        <div className="text-xs font-semibold mb-2 text-[var(--ink)]">A Phase = Schedule + Selector + Trigger + Recipe</div>
        <div className="rounded-lg p-3 font-mono text-[11px] leading-relaxed"
             style={{ background: "var(--panel-2)" }}>
          <div className="text-[var(--muted)]"># Phase 1 of Manipulation Harvest, expressed as building blocks:</div>
          <div>schedule:    <span className="text-[var(--accent)]">Thursday SENSEX E-0 · 14:00–14:30 IST</span></div>
          <div>selector:    <span className="text-[var(--accent)]">4.5% ≤ dist ≤ 5.5% · OI ≤ 20L · LTP ∈ [0.05, 0.50]</span></div>
          <div>trigger:     <span className="text-[var(--accent)]">enter immediately within window</span></div>
          <div>recipe:      <span className="text-[var(--accent)]">BUY 5 strikes · ₹2,500 each · LIMIT = ask + 0.05</span></div>
        </div>
      </div>

      {/* The composed algo as a phase stack */}
      <div>
        <div className="text-xs font-semibold mb-2 text-[var(--ink)]">An Algo = stack of phases (manipulation_harvest_v1)</div>
        <div className="space-y-1">
          {PHASE_TEMPLATE.map((p, i) => (
            <div key={p.phase}>
              <div className="rounded-lg border p-2.5 flex items-center gap-3"
                   style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
                <span className="text-[10px] font-bold w-14 text-[var(--muted)]">PHASE {i + 1}</span>
                <span className="text-xs font-semibold w-16">{p.phase}</span>
                <span className="text-[10px] text-[var(--muted)] font-mono w-24">{p.range}</span>
                <span className="text-[11px] text-[var(--ink)] flex-1">
                  {p.recipes.map((r, j) => (
                    <span key={j}>
                      {j > 0 && <span className="text-[var(--muted)]"> + </span>}
                      <span className="font-mono">{r}</span>
                    </span>
                  ))}
                </span>
              </div>
              {i < PHASE_TEMPLATE.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ArrowDown size={12} className="text-[var(--muted)]" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Proposed UI */}
      <div>
        <div className="text-xs font-semibold mb-2 text-[var(--ink)]">Proposed UI flow</div>
        <ol className="text-[11px] text-[var(--muted)] space-y-1.5 pl-5 list-decimal leading-relaxed">
          <li>
            <b>"+ New Algo"</b> button at the top of the Algos page → modal asks for name + instrument.
          </li>
          <li>
            <b>Schedule editor:</b> day-of-week picker + start/end time inputs (reuses
            <code className="text-[10px] mx-1">EntryTimeWindow</code>).
          </li>
          <li>
            <b>Add Phase</b> button → for each phase, pick: time within the schedule,
            an order recipe (Buy basket / Sell basket / Recycle / Take-profit / Spike monitor),
            a strike selector (reuses <code className="text-[10px] mx-1">StrikeSelectorBuilder</code>),
            and a trigger (reuses <code className="text-[10px] mx-1">PremiumTrigger</code> + new
            <i> baseline-multiplier</i> mode).
          </li>
          <li>
            <b>Phases drag-reorderable</b> in the canvas; the linear timeline rolls up at the top
            of the algo card so you can always see the whole stack.
          </li>
          <li>
            <b>Hard rules:</b> shared at the algo level — capital cap, VIX skip, spot emergency exit,
            no-orders-after time. (Same panel as today's hardcoded card.)
          </li>
          <li>
            <b>Save as algo template</b> → appears in the Algos list alongside Manipulation Harvest.
            Activate / Schedule / Run today the same way.
          </li>
          <li>
            <b>Test pane:</b> a "Replay against last N Thursdays" button surfaces a backtest summary
            (win rate, mean / median P&L, worst day) before the user activates it live.
          </li>
        </ol>
      </div>

      {/* Footer */}
      <div className="rounded-lg border p-3 text-[11px] text-[var(--muted)] flex items-start gap-2"
           style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
        <Clock size={12} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <div>
          <b>Phasing:</b> ship this builder after at least 4–6 live Thursdays of Manipulation Harvest
          have validated the EV. Any additional algo modes (e.g. baseline-multiplier trigger) discovered
          during live runs become first-class building blocks before the builder ships — that way the
          builder doesn't lock in a stale set of primitives.
        </div>
      </div>
    </section>
  );
}
