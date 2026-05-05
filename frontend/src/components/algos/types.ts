/** Custom Algo Builder — domain types. */

export type Side = "CE" | "PE" | "BOTH";
export type DistanceMetric = "percent" | "points" | "delta";

export interface Selector {
  metric: DistanceMetric;
  rangeMin: number;     // e.g. 4.5
  rangeMax: number;     // e.g. 5.5
  side: Side;
  maxOi: number | null;     // skip strikes more liquid than this
  minLtp: number | null;    // skip strikes below this premium
  maxLtp: number | null;    // skip strikes above this premium
}

export const RECIPE_TYPES = [
  "MARGIN_RECYCLE",
  "BUY_BASKET",
  "SELL_LIMITS",
  "TAKE_PROFIT",
  "SPIKE_MONITOR",
  "SETTLE",
] as const;

export type RecipeType = typeof RECIPE_TYPES[number];

export type Recipe =
  | {
      type: "MARGIN_RECYCLE";
      closePct: number;            // e.g. 20
      qualifyingMaxLtp: number;    // e.g. 0.10
      qualifyingMinDistPct: number;// e.g. 2.5
    }
  | {
      type: "BUY_BASKET";
      budgetInr: number;           // total ₹ across the basket
      nStrikes: number;            // 5
      selector: Selector;
      limitOffset: number;         // ₹ above ask for fill
    }
  | {
      type: "SELL_LIMITS";
      multiplier: number;          // × LTP at recipe start
      qtyLots: number;             // per strike
      selector: Selector;
    }
  | {
      type: "TAKE_PROFIT";
      tpMultiplier: number;        // × buy avg
      appliesToStepId: string | null;  // referenced step
    }
  | {
      type: "SPIKE_MONITOR";
      thresholdMultiplier: number; // alert when LTP ≥ X × baseline
      pollIntervalSec: number;
      baselineFromTime: string;    // HH:MM — record baseline at this time
    }
  | {
      type: "SETTLE";
      cancelUnfilled: boolean;
      closeOpenLongs: boolean;
    };

export interface Step {
  id: string;
  name: string;
  startTime: string;   // HH:MM
  endTime: string;     // HH:MM
  recipe: Recipe;
}

export interface AlgoConfig {
  name: string;
  instrument: "NIFTY" | "SENSEX";
  days: string[];           // ["MON","TUE",…]
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
  MARGIN_RECYCLE: "Margin recycle",
  BUY_BASKET:     "BUY basket",
  SELL_LIMITS:    "SELL LIMITs",
  TAKE_PROFIT:    "Take-profit",
  SPIKE_MONITOR:  "Spike monitor",
  SETTLE:         "Settle / cleanup",
};

const blankSelector = (): Selector => ({
  metric: "percent", rangeMin: 4.5, rangeMax: 5.5, side: "BOTH",
  maxOi: 2_000_000, minLtp: 0.05, maxLtp: 0.50,
});

let _stepId = 1;
export const newStepId = () => `step-${_stepId++}`;

export function blankRecipe(type: RecipeType): Recipe {
  switch (type) {
    case "MARGIN_RECYCLE": return { type, closePct: 20, qualifyingMaxLtp: 0.10, qualifyingMinDistPct: 2.5 };
    case "BUY_BASKET":     return { type, budgetInr: 12500, nStrikes: 5, selector: blankSelector(), limitOffset: 0.05 };
    case "SELL_LIMITS":    return { type, multiplier: 12, qtyLots: 20, selector: { ...blankSelector(), rangeMin: 3.0, rangeMax: 5.5, maxOi: 3_000_000 } };
    case "TAKE_PROFIT":    return { type, tpMultiplier: 10, appliesToStepId: null };
    case "SPIKE_MONITOR":  return { type, thresholdMultiplier: 5, pollIntervalSec: 30, baselineFromTime: "14:00" };
    case "SETTLE":         return { type, cancelUnfilled: true, closeOpenLongs: true };
  }
}

/** Manipulation Harvest expressed as the canonical 6-step composition. */
export function manipulationHarvestTemplate(): AlgoConfig {
  return {
    name: "Manipulation Harvest · v1",
    instrument: "SENSEX",
    days: ["THU"],
    windowStart: "14:00",
    windowEnd: "15:25",
    steps: [
      { id: newStepId(), name: "Margin recycle",  startTime: "14:00", endTime: "14:30",
        recipe: blankRecipe("MARGIN_RECYCLE") },
      { id: newStepId(), name: "Play D basket",   startTime: "14:00", endTime: "14:30",
        recipe: blankRecipe("BUY_BASKET") },
      { id: newStepId(), name: "Sell limits",     startTime: "14:30", endTime: "15:00",
        recipe: blankRecipe("SELL_LIMITS") },
      { id: newStepId(), name: "Take-profits",    startTime: "14:30", endTime: "15:00",
        recipe: { type: "TAKE_PROFIT", tpMultiplier: 10, appliesToStepId: null } },
      { id: newStepId(), name: "Spike monitor",   startTime: "15:00", endTime: "15:25",
        recipe: blankRecipe("SPIKE_MONITOR") },
      { id: newStepId(), name: "Settle",          startTime: "15:25", endTime: "15:25",
        recipe: blankRecipe("SETTLE") },
    ],
    hardRules: {
      maxCapitalInr: 15000,
      vixSkipAbove: 22,
      spotEmergencyPct: 1.0,
      noNewOrdersAfter: "15:20",
    },
  };
}
