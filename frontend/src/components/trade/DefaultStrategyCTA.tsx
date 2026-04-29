/**
 * Default Strategy CTA — one-click safe entry.
 *
 * Sells deep-OTM strangle (≥ 2.5% OTM, strikes rounded away from spot,
 * target ₹5,000 premium per ₹1Cr margin). The trader picks symbol + lots
 * and confirms; everything else is fixed by product rules. This is the
 * recommended path for traders who shouldn't make manual decisions.
 *
 * See HANDOFF §2.1 for the full spec.
 */
import { Rocket, Zap } from "lucide-react";
import { KV2 } from "./shared";

type Props = {
  // underlying + spot/lot/grid (derived from underlying)
  underlying: "NIFTY" | "SENSEX";
  setUnderlying: (v: "NIFTY" | "SENSEX") => void;
  spot: number;
  lotSize: number;
  strikeGrid: number;
  marginPerLot: number;

  // computed default strikes (CE rounded up, PE rounded down)
  defaultStrikesPreview: { ce: number; pe: number };

  // routing (read-only; controlled by BrokerDematPicker above)
  selectedBroker: string;
  selectedDemats: string[];

  // CTA constants
  distancePct: number;
  targetPerCr: number;

  // CTA actions — page wires these to confirm flow
  onLoadOnly: (lots: number) => void;
  onLoadAndExecute: (lots: number) => void;
};

const LOT_OPTIONS = [1, 2, 3, 5, 10, 15, 20];

export default function DefaultStrategyCTA(p: Props) {
  function readLots(): number {
    const sel = document.getElementById("default-lots") as HTMLSelectElement | null;
    return +(sel?.value ?? "1");
  }

  return (
    <section className="card" style={{ background: "color-mix(in srgb, var(--accent) 5%, var(--panel))" }}>
      <div className="grid md:grid-cols-[1fr_240px] gap-5 items-center">
        {/* Left — title + key-value strip */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Rocket size={16} className="text-[var(--accent)]" />
            <h2 className="font-semibold text-base">Default Strategy · Deep OTM Strangle</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
            <KV2 k="Spot" v={p.spot.toLocaleString("en-IN")} />
            <KV2 k="CE strike" v={String(p.defaultStrikesPreview.ce)} accent />
            <KV2 k="PE strike" v={String(p.defaultStrikesPreview.pe)} accent />
            <KV2 k="Distance" v={`≥ ${p.distancePct}% OTM`} />
            <KV2 k="Lot size" v={`${p.lotSize}u`} />
            <KV2 k="Margin/lot" v={`~₹${(p.marginPerLot / 1000).toFixed(0)}K`} />
            <KV2 k="Target" v={`₹${(p.targetPerCr / 1000).toFixed(0)}K/Cr`} />
            <KV2 k="Routes via" v={`${p.selectedBroker.toUpperCase()} · ${p.selectedDemats[0] ?? "—"}`} />
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-3">
            Strikes round <b>further from spot</b> on the {p.strikeGrid}-pt grid — never closer than the rule.
          </div>
        </div>

        {/* Right — pickers + actions */}
        <div className="flex flex-col gap-2 md:max-w-[220px] md:mx-auto md:w-full">
          <select className="input !py-2 text-sm"
                  value={p.underlying}
                  onChange={(e) => p.setUnderlying(e.target.value as "NIFTY" | "SENSEX")}>
            <option value="NIFTY">NIFTY · lot 65</option>
            <option value="SENSEX">SENSEX · lot 20</option>
          </select>
          <select id="default-lots" defaultValue="1" className="input !py-2 text-sm font-mono">
            {LOT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} lot{n > 1 ? "s" : ""} · {n * p.lotSize}u/leg</option>
            ))}
          </select>
          <button className="btn-primary flex items-center justify-center gap-2 py-2.5"
                  onClick={() => p.onLoadOnly(readLots())}>
            <Rocket size={14} /> Load Strategy
          </button>
          <button className="btn-danger btn-sm flex items-center justify-center gap-1"
                  onClick={() => p.onLoadAndExecute(readLots())}>
            <Zap size={14} /> Load + Execute
          </button>
        </div>
      </div>
    </section>
  );
}
