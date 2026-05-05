/**
 * Algos page — pre-built multi-phase algorithmic strategies.
 *
 * Today: Manipulation Harvest (SENSEX Thursday E-0). The page also hosts
 * the Custom Algo Builder PROPOSAL panel as the design preview for the
 * dynamic version of this product.
 */
import ManipulationHarvestCard from "@/components/algos/ManipulationHarvestCard";
import CustomAlgoBuilderProposal from "@/components/algos/CustomAlgoBuilderProposal";

export default function Algos() {
  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-xl font-bold">Algos</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Pre-built multi-phase algorithmic strategies. Each algo runs on its own schedule
          (e.g. SENSEX Thursdays only) with full configurability of capital, multipliers, and skip rules.
        </p>
      </header>

      {/* Hardcoded algo */}
      <ManipulationHarvestCard />

      {/* Dynamic builder — proposal panel */}
      <CustomAlgoBuilderProposal />
    </div>
  );
}
