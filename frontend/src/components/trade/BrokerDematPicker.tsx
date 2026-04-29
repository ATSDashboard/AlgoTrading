/**
 * Broker & Demat picker — global selector at the top of the Trade page.
 * Modes:
 *   - Single broker + single demat   (default)
 *   - Single broker + multi-demat    (SOR within broker)
 *   - Multi-broker + multi-demat     (full SOR fan-out)
 *
 * Includes the Margin Allocation row when multi-* is on:
 *   "Deploy [X] Cr · keep [Y]% or [Z]₹ free per demat"
 *
 * State lives in the parent (NewStrategy.tsx) — this component is a
 * controlled view. Constants (broker list, demat mock data) are
 * co-located here; replace BROKER_DEMATS with API data when backend
 * GET /broker/{id}/demats lands (HANDOFF §5.2).
 */
import { Shield, AlertCircle } from "lucide-react";

export type Demat = { id: string; label: string; cap: string; assigned: boolean };

export const ALL_BROKERS = [
  { id: "paper",   label: "Paper Broker (mock)" },
  { id: "axis",    label: "Axis Direct (RAPID)" },
  { id: "zerodha", label: "Zerodha (Kite Connect)" },
  { id: "monarch", label: "Monarch Networth" },
  { id: "jm",      label: "JM Financial (Blink)" },
];

export const BROKER_DEMATS: Record<string, Demat[]> = {
  paper:   [{ id: "PAPER-001", label: "Paper Account", cap: "Unlimited", assigned: true }],
  axis:    [{ id: "1234567890", label: "Rohan Individual", cap: "₹5L/day", assigned: true },
            { id: "9876543210", label: "Rohan HUF",        cap: "₹2L/day", assigned: true }],
  zerodha: [{ id: "ZD12345",    label: "Rohan Kite",       cap: "₹3L/day", assigned: true },
            { id: "ZD67890",    label: "Navin HUF",        cap: "₹4L/day", assigned: true }],
  monarch: [{ id: "MN98765",    label: "Rohan Monarch",    cap: "₹5L/day", assigned: true }],
  jm:      [{ id: "JM45678",    label: "Rohan JM Blink",   cap: "₹2L/day", assigned: false }],
};

type Props = {
  // single-broker mode
  selectedBroker: string;
  setSelectedBroker: (b: string) => void;
  // multi-broker mode
  selectedBrokers: string[];
  toggleBroker: (id: string) => void;
  // demats (used in both modes)
  selectedDemats: string[];
  setSelectedDemats: (d: string[]) => void;
  toggleDemat: (id: string) => void;
  // toggles
  multiDematMode: boolean;
  setMultiDematMode: (v: boolean) => void;
  multiBrokerMode: boolean;
  setMultiBrokerMode: (v: boolean) => void;
  // allocation
  budgetCr: number;
  setBudgetCr: (v: number) => void;
  cushionPct: number;
  setCushionPct: (v: number) => void;
  cushionMin: number;
  setCushionMin: (v: number) => void;
};

export default function BrokerDematPicker(p: Props) {
  return (
    <section className="card space-y-3">
      <Header {...p} />

      {p.multiBrokerMode ? <MultiBrokerView {...p} /> : <SingleBrokerView {...p} />}

      <MarginAllocation {...p} />

      <div className="text-[10px] text-[var(--muted)] flex items-center gap-1.5 pt-1 border-t"
           style={{ borderColor: "var(--border)" }}>
        <AlertCircle size={11} />
        This selection routes <b>every order</b> placed from this page — Default Strategy,
        manual legs, Execute Now, and trigger-based starts.
      </div>
    </section>
  );
}

function Header(p: Props) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-[var(--accent)]" />
        <h2 className="font-semibold">Broker & Demat</h2>
        <span className="text-[10px] text-[var(--muted)]">applies to every order on this page</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={p.multiBrokerMode}
                 onChange={(e) => {
                   p.setMultiBrokerMode(e.target.checked);
                   if (e.target.checked) p.setMultiDematMode(true);
                 }} />
          Multi-broker SOR
        </label>
        <label className={`flex items-center gap-2 ${p.multiBrokerMode ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
          <input type="checkbox" checked={p.multiDematMode || p.multiBrokerMode}
                 disabled={p.multiBrokerMode}
                 onChange={(e) => p.setMultiDematMode(e.target.checked)} />
          Multi-demat
        </label>
      </div>
    </div>
  );
}

function MultiBrokerView(p: Props) {
  return (
    <div className="space-y-2">
      {ALL_BROKERS.map((b) => {
        const demats = BROKER_DEMATS[b.id] ?? [];
        const broker_selected = p.selectedBrokers.includes(b.id);
        return (
          <div key={b.id} className="rounded-lg border p-3"
               style={{
                 borderColor: broker_selected ? "var(--accent)" : "var(--border)",
                 background: broker_selected ? "color-mix(in srgb, var(--accent) 5%, transparent)" : "transparent",
               }}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={broker_selected} onChange={() => p.toggleBroker(b.id)} />
              <div className="flex-1">
                <div className="text-sm font-semibold">{b.label}</div>
                <div className="text-[10px] text-[var(--muted)]">
                  {demats.filter((d) => d.assigned).length} demat
                  {demats.filter((d) => d.assigned).length !== 1 ? "s" : ""} available
                </div>
              </div>
            </label>
            {broker_selected && (
              <div className="grid sm:grid-cols-2 gap-1.5 mt-2 pl-6">
                {demats.map((d) => (
                  <label key={d.id}
                         className="flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs"
                         style={{
                           borderColor: p.selectedDemats.includes(d.id) ? "var(--accent)" : "var(--border)",
                           background: p.selectedDemats.includes(d.id) ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
                           opacity: d.assigned ? 1 : 0.4,
                           cursor: d.assigned ? "pointer" : "not-allowed",
                         }}>
                    <input type="checkbox" checked={p.selectedDemats.includes(d.id)}
                           disabled={!d.assigned}
                           onChange={() => d.assigned && p.toggleDemat(d.id)} />
                    <span className="font-mono flex-1">{d.id}</span>
                    <span className="text-[var(--muted)] text-[10px]">cap {d.cap}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="text-[10px] text-[var(--muted)] pt-1">
        SOR fans orders across <b>selected broker × demat combos</b> by free margin and session health.
      </div>
    </div>
  );
}

function SingleBrokerView(p: Props) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <label className="label">Broker</label>
        <select className="input" value={p.selectedBroker}
                onChange={(e) => {
                  p.setSelectedBroker(e.target.value);
                  const first = BROKER_DEMATS[e.target.value]?.find((d) => d.assigned);
                  p.setSelectedDemats(first ? [first.id] : []);
                }}>
          {ALL_BROKERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Demat Account{p.multiDematMode ? "s (select multiple)" : ""}</label>
        {p.multiDematMode ? (
          <div className="space-y-2">
            {(BROKER_DEMATS[p.selectedBroker] ?? []).map((d) => (
              <label key={d.id}
                     className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition"
                     style={{
                       borderColor: p.selectedDemats.includes(d.id) ? "var(--accent)" : "var(--border)",
                       background: p.selectedDemats.includes(d.id) ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
                       opacity: d.assigned ? 1 : 0.4,
                       cursor: d.assigned ? "pointer" : "not-allowed",
                     }}>
                <input type="checkbox" checked={p.selectedDemats.includes(d.id)}
                       disabled={!d.assigned}
                       onChange={() => d.assigned && p.toggleDemat(d.id)} />
                <div className="flex-1">
                  <div className="text-sm font-mono">{d.id}</div>
                  <div className="text-xs text-[var(--muted)]">{d.label}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[var(--muted)]">Daily cap</div>
                  <div className="text-xs font-mono">{d.cap}</div>
                </div>
                {!d.assigned && <span className="chip-red">Not assigned</span>}
              </label>
            ))}
            <div className="text-[10px] text-[var(--muted)]">
              Orders split across selected demats by free margin (Smart Order Routing).
            </div>
          </div>
        ) : (
          <select className="input" value={p.selectedDemats[0] ?? ""}
                  onChange={(e) => p.setSelectedDemats([e.target.value])}>
            {(BROKER_DEMATS[p.selectedBroker] ?? []).filter((d) => d.assigned).map((d) => (
              <option key={d.id} value={d.id}>{d.id} — {d.label} (cap {d.cap})</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function MarginAllocation(p: Props) {
  if (!(p.multiDematMode || p.multiBrokerMode) || p.selectedDemats.length === 0) return null;

  // Mocked balances — backend will provide live values via GET /broker/margin/summary
  const balances = p.selectedDemats.map((_, i) =>
    [1500000, 800000, 2200000, 1100000, 600000][i % 5] ?? 1000000
  );
  const totalDeployable = balances.reduce(
    (s, b) => s + Math.max(0, b - Math.max(b * (p.cushionPct / 100), p.cushionMin)),
    0
  );
  const cap = p.budgetCr > 0
    ? Math.min(p.budgetCr * 1_00_00_000, totalDeployable)
    : totalDeployable;
  const breakdown = p.selectedDemats
    .map((id, i) => {
      const b = balances[i];
      const deployable = Math.max(0, b - Math.max(b * (p.cushionPct / 100), p.cushionMin));
      const alloc = totalDeployable > 0 ? cap * (deployable / totalDeployable) : 0;
      return { id, alloc };
    })
    .filter((x) => x.alloc > 0);

  return (
    <div className="pt-3 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
      <div className="text-xs font-medium flex items-center gap-2">
        <Shield size={12} className="text-[var(--accent)]" />Margin allocation
      </div>
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-[var(--muted)]">Deploy</span>
        <input type="number" step="0.5" min="0" className="input !py-1 !w-24 font-mono text-sm"
               placeholder="0 = all"
               value={p.budgetCr || ""}
               onChange={(e) => p.setBudgetCr(+e.target.value || 0)} />
        <span className="text-[var(--muted)]">Cr · keep</span>
        <input type="number" step="0.5" min="0" max="50" className="input !py-1 !w-16 font-mono text-sm"
               value={p.cushionPct} onChange={(e) => p.setCushionPct(+e.target.value)} />
        <span className="text-[var(--muted)]">% or</span>
        <input type="number" step="100000" min="0" className="input !py-1 !w-28 font-mono text-sm"
               value={p.cushionMin} onChange={(e) => p.setCushionMin(+e.target.value)} />
        <span className="text-[var(--muted)]">₹ free per demat</span>
      </div>
      <div className="text-[11px] text-[var(--muted)]">
        {p.budgetCr === 0
          ? <>Will use available margin across {p.selectedDemats.length} selected demat
              {p.selectedDemats.length > 1 ? "s" : ""} (~₹{(cap / 100000).toFixed(1)}L total) — </>
          : <>Will deploy ₹{p.budgetCr}Cr (capped to ₹{(cap / 100000).toFixed(1)}L by available) — </>}
        pulls weighted by free balance:&nbsp;
        {breakdown.map((b, i) => (
          <span key={b.id}>
            {i > 0 && ", "}
            <span className="font-mono text-[var(--ink)]">{b.id}</span> ₹{(b.alloc / 100000).toFixed(1)}L
          </span>
        ))}
      </div>
    </div>
  );
}
