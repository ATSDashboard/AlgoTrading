/**
 * Free-margin strip shown at the top of the Trade page.
 * Pure display — receives the live margin snapshot as props.
 *
 * Backend wiring: replace prop values with `useMarginSummary()` hook
 * once GET /broker/margin/summary is implemented (see HANDOFF §5.2).
 */
import { KV2 } from "./shared";

type Props = {
  totalMargin: number;       // ₹ — gross account margin across all demats
  usedByActive: number;      // ₹ — tied up by other running strategies
  blockedByOrders: number;   // ₹ — pending / awaiting fills
  freeMargin: number;        // ₹ — totalMargin − usedByActive − blockedByOrders
};

export default function MarginStatusStrip({
  totalMargin, usedByActive, blockedByOrders, freeMargin,
}: Props) {
  const usedPct = (usedByActive / totalMargin) * 100;
  const blockedPct = ((usedByActive + blockedByOrders) / totalMargin) * 100;
  const freePct = (freeMargin / totalMargin) * 100;

  return (
    <section className="card !py-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-3 items-center">
        <div className="md:col-span-1">
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Free margin</div>
          <div className="text-2xl font-mono font-bold text-[var(--success)] leading-tight">
            ₹{(freeMargin / 100000).toFixed(2)}
            <span className="text-sm text-[var(--muted)] ml-1">L</span>
          </div>
          <div className="text-[10px] text-[var(--muted)]">usable for new strategy</div>
        </div>
        <KV2 k="Total" v={`₹${(totalMargin / 100000).toFixed(2)}L`} />
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Used (active)</div>
          <div className="font-mono font-semibold text-[var(--warn)]">
            −₹{(usedByActive / 100000).toFixed(2)}L
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Blocked (pending)</div>
          <div className="font-mono font-semibold text-[var(--warn)]">
            −₹{(blockedByOrders / 100000).toFixed(2)}L
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-1">
            {freePct.toFixed(0)}% free
          </div>
          <div className="w-full h-2.5 rounded-full overflow-hidden relative" style={{ background: "var(--panel-2)" }}>
            <div className="absolute inset-y-0 left-0"
                 style={{ width: `${blockedPct}%`, background: "color-mix(in srgb, var(--warn) 35%, transparent)" }} />
            <div className="absolute inset-y-0 left-0"
                 style={{ width: `${usedPct}%`, background: "var(--warn)" }} />
          </div>
        </div>
      </div>
      <div className="text-[10px] text-[var(--muted)] mt-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
        New strategies are sized only against <b>free margin</b>. Pre-trade RMS rejects orders that exceed it.
      </div>
    </section>
  );
}
