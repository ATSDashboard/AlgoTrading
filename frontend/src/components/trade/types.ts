/** Shared types for the Trade page subcomponents. */

export type Side = "B" | "S";
export type OptType = "CE" | "PE";
export type OrderKind = "LIMIT" | "LIMIT_WITH_BUFFER" | "MARKET";

export interface Leg {
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
