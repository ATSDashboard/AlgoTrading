/**
 * Entry Time Window — restricts entries to a chosen intraday IST window.
 * Quick presets cover the common cases. Toggle to disable entirely.
 */

const PRESETS = [
  { label: "Open", from: "09:15", to: "09:30" },
  { label: "Morn", from: "09:30", to: "10:30" },
  { label: "Mid",  from: "11:00", to: "13:00" },
  { label: "Aft",  from: "13:30", to: "14:30" },
  { label: "All",  from: "09:15", to: "15:15" },
];

type Props = {
  entryFrom: string;
  setEntryFrom: (v: string) => void;
  entryTo: string;
  setEntryTo: (v: string) => void;
  restrictByTime: boolean;
  setRestrictByTime: (v: boolean) => void;
};

export default function EntryTimeWindow(p: Props) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold">Entry Time Window</h2>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            Restricts entries to this intraday window (IST). Outside the window,
            the strategy waits or skips.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={p.restrictByTime}
                 onChange={(e) => p.setRestrictByTime(e.target.checked)} />
          Restrict by time
        </label>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="label">Entry from</label>
          <input type="time" className="input !py-1.5 font-mono w-32"
                 value={p.entryFrom} disabled={!p.restrictByTime}
                 onChange={(e) => p.setEntryFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Entry to</label>
          <input type="time" className="input !py-1.5 font-mono w-32"
                 value={p.entryTo} disabled={!p.restrictByTime}
                 onChange={(e) => p.setEntryTo(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap pt-5">
          {PRESETS.map((preset) => (
            <button key={preset.label} type="button"
                    disabled={!p.restrictByTime}
                    onClick={() => { p.setEntryFrom(preset.from); p.setEntryTo(preset.to); }}
                    className="btn-ghost btn-sm !text-[10px] disabled:opacity-30">
              {preset.label} {preset.from}–{preset.to}
            </button>
          ))}
        </div>
      </div>

      {!p.restrictByTime && (
        <div className="text-[11px] text-[var(--muted)]">
          No time restriction — entries can fire anytime trigger conditions are met.
        </div>
      )}
    </section>
  );
}
