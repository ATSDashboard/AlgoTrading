/**
 * Shared primitives used across Trade subcomponents.
 * Add atoms here only when used by ≥ 2 trade components.
 */

/** Compact label/value cell — Sensibull-style key-value strip. */
export function KV2({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{k}</div>
      <div className={`font-mono ${accent ? "font-bold text-[var(--ink)]" : "font-semibold"}`}>{v}</div>
    </div>
  );
}
