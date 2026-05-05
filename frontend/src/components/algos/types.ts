/** Custom Algo Builder — domain types. */

export type Side = "CE" | "PE" | "BOTH";

// ─── Strike selection ────────────────────────────────────────────────────
// 5 ways to pick strikes for a BUY or SELL recipe.
//
//   manual      — explicit list of strikes ("buy 76300PE, 78330PE, 75560CE")
//   distance_pct — list of % distances ("CE +4.5%, +5.0%, +5.5%")
//   distance_pts — list of point distances ("CE +1500, +2000")
//   premium     — pick all strikes with LTP ≤ target ("everything ≤ ₹0.05")
//   range       — strike range, system fills every grid step
//                 ("CE 77000–78000, PE 85000–89000")

export type StrikeSelectionMode = "manual" | "distance_pct" | "distance_pts" | "premium" | "range";

export interface ManualStrike {
  side: "CE" | "PE";
  strike: number;
  price: number;        // entry price for this leg (buy or sell limit)
  qtyLots: number;      // optional override; 0 = use recipe default
}

export interface StrikeSelection {
  mode: StrikeSelectionMode;

  // mode=manual
  manual: ManualStrike[];

  // mode=distance_pct  (e.g. ce_values = [4.5, 5.0, 5.5])
  ce_pct: number[];
  pe_pct: number[];

  // mode=distance_pts
  ce_pts: number[];
  pe_pts: number[];

  // mode=premium (target ₹ — system selects all strikes with LTP <= target)
  premium_target: number;
  premium_side: Side;

  // mode=range — system enumerates strikes on the grid between from..to
  ce_from: number | null;
  ce_to: number | null;
  pe_from: number | null;
  pe_to: number | null;

  // For non-manual modes, a single uniform entry price applies to every strike.
  uniform_price: number;
}

export function blankStrikeSelection(opts?: Partial<StrikeSelection>): StrikeSelection {
  return {
    mode: "manual",
    manual: [],
    ce_pct: [], pe_pct: [],
    ce_pts: [], pe_pts: [],
    premium_target: 0.05,
    premium_side: "BOTH",
    ce_from: null, ce_to: null,
    pe_from: null, pe_to: null,
    uniform_price: 0.05,
    ...opts,
  };
}

// ─── Recipes ─────────────────────────────────────────────────────────────

// Just two modules — BUY and SELL. Both share the same shape; only the
// exit semantics differ (BUY takes profit, SELL covers / squares off).
export const RECIPE_TYPES = ["BUY", "SELL"] as const;
export type RecipeType = typeof RECIPE_TYPES[number];

// Exit spec — used inside BUY (TP) and SELL (cover).
export type ExitSpec =
  | { mode: "absolute"; price: number }      // exit at exact ₹ price
  | { mode: "multiplier"; x: number }        // exit at x × entry avg
  | { mode: "none" };                        // never auto-exit

export type Recipe =
  | {
      type: "BUY";
      selection: StrikeSelection;
      qtyLotsDefault: number;
      capitalCapInr: number;          // 0 = no cap
      takeProfit: ExitSpec;
    }
  | {
      type: "SELL";
      selection: StrikeSelection;
      qtyLotsDefault: number;
      capitalCapInr: number;
      cover: ExitSpec;
    };

export interface Step {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  recipe: Recipe;
}

export interface AlgoConfig {
  name: string;
  instrument: "NIFTY" | "SENSEX";
  days: string[];
  windowStart: string;
  windowEnd: string;
  steps: Step[];
  hardRules: {
    maxCapitalInr: number;
    vixSkipAbove: number;
    spotEmergencyPct: number;
    noNewOrdersAfter: string;
  };
}

export const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;

export const RECIPE_LABELS: Record<RecipeType, string> = {
  BUY:  "BUY",
  SELL: "SELL",
};

export const SELECTION_MODE_LABELS: Record<StrikeSelectionMode, string> = {
  manual:        "Manual list",
  distance_pct:  "% away from spot",
  distance_pts:  "Points away from spot",
  premium:       "Target premium ₹",
  range:         "Strike range",
};

let _stepId = 1;
export const newStepId = () => `step-${_stepId++}`;

export function blankRecipe(type: RecipeType): Recipe {
  if (type === "BUY") {
    return {
      type: "BUY",
      selection: blankStrikeSelection({
        mode: "distance_pct",
        ce_pct: [4.5, 5.0, 5.5],
        pe_pct: [4.5, 5.0, 5.5],
        uniform_price: 0.05,
      }),
      qtyLotsDefault: 5,
      capitalCapInr: 12500,
      takeProfit: { mode: "absolute", price: 3 },
    };
  }
  return {
    type: "SELL",
    selection: blankStrikeSelection({
      mode: "distance_pct",
      ce_pct: [3.0, 3.5, 4.0, 4.5, 5.0, 5.5],
      pe_pct: [3.0, 3.5, 4.0, 4.5, 5.0, 5.5],
      uniform_price: 4.0,
    }),
    qtyLotsDefault: 20,
    capitalCapInr: 100000,
    cover: { mode: "absolute", price: 0.05 },
  };
}

/** Manipulation Harvest expressed in the simplified BUY/SELL-only shape.
 *  Margin recycle is handled separately (it's squaring off existing
 *  positions, not part of building an algo).
 */
export function manipulationHarvestTemplate(): AlgoConfig {
  return {
    name: "Manipulation Harvest · v1",
    instrument: "SENSEX",
    days: ["THU"],
    windowStart: "14:00",
    windowEnd: "15:25",
    steps: [
      { id: newStepId(), name: "Buy deep-OTM basket", startTime: "14:00", endTime: "14:30",
        recipe: blankRecipe("BUY") },
      { id: newStepId(), name: "Sell limits at 12× LTP", startTime: "14:30", endTime: "15:00",
        recipe: blankRecipe("SELL") },
    ],
    hardRules: {
      maxCapitalInr: 15000,
      vixSkipAbove: 22,
      spotEmergencyPct: 1.0,
      noNewOrdersAfter: "15:20",
    },
  };
}
