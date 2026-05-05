/**
 * Algos page — pre-built multi-phase algorithmic strategies.
 *
 * Today: Manipulation Harvest (SENSEX Thursday E-0). The page also hosts
 * the Custom Algo Builder PROPOSAL panel as the design preview for the
 * dynamic version of this product.
 */
import { useState } from "react";
import ManipulationHarvestCard from "@/components/algos/ManipulationHarvestCard";
import CustomAlgoBuilder from "@/components/algos/CustomAlgoBuilder";

export default function Algos() {
  const [tab, setTab] = useState<"prebuilt" | "custom">("prebuilt");

  return (
    <div className="max-w-5xl space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Algos</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Pre-built multi-phase algorithmic strategies, plus a custom builder
            for composing your own from typed primitives.
          </p>
        </div>
        <div className="inline-flex rounded-lg p-0.5 border"
             style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
          {([
            { k: "prebuilt", label: "Pre-built" },
            { k: "custom",   label: "Custom builder" },
          ] as const).map((o) => (
            <button key={o.k} type="button" onClick={() => setTab(o.k)}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold transition"
                    style={tab === o.k
                      ? { background: "var(--panel)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }
                      : { background: "transparent", color: "var(--muted)" }}>
              {o.label}
            </button>
          ))}
        </div>
      </header>

      {tab === "prebuilt" && <ManipulationHarvestCard />}
      {tab === "custom"   && <CustomAlgoBuilder />}
    </div>
  );
}
