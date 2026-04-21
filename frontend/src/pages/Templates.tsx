import { Save, Copy, Edit3, Trash2, Play, Star } from "lucide-react";

const TPLS = [
  {id:1, name:"Weekly Tier 1 Strangle",   kind:"SHORT_STRANGLE", legs:2, mode:"Tier 1 (auto)",      lastUsed:"Yesterday", winRate:95, avgPnl:1240, favorite:true},
  {id:2, name:"Monthly Iron Condor",       kind:"IRON_CONDOR",    legs:4, mode:"Distance 2%",         lastUsed:"5d ago",    winRate:82, avgPnl:980,  favorite:true},
  {id:3, name:"Expiry Day Straddle",       kind:"SHORT_STRADDLE", legs:2, mode:"Delta 0.50 (ATM)",    lastUsed:"2w ago",    winRate:62, avgPnl:-150, favorite:false},
  {id:4, name:"Bull Put (Defensive)",      kind:"BULL_PUT",       legs:2, mode:"Delta 0.15 + hedge",  lastUsed:"3w ago",    winRate:88, avgPnl:680,  favorite:false},
  {id:5, name:"High Capital Efficiency",   kind:"SHORT_STRANGLE", legs:2, mode:"Premium / ₹1Cr ≥ 3L", lastUsed:"Never",     winRate:null,avgPnl:null, favorite:false},
];

export default function Templates() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Strategy Templates</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">Reusable multi-leg rule sets · applied from Trade page</p>
        </div>
        <button className="btn-primary btn-sm flex items-center gap-1"><Save size={13}/>New Template</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">★</th>
              <th className="table-th">Name</th>
              <th className="table-th">Kind</th>
              <th className="table-th">Legs</th>
              <th className="table-th">Selection</th>
              <th className="table-th">Last Used</th>
              <th className="table-th">Win Rate</th>
              <th className="table-th">Avg P&L</th>
              <th className="table-th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {TPLS.map(t => (
              <tr key={t.id} className="hover-row">
                <td className="table-td">
                  <Star size={14} className={t.favorite ? "text-[var(--warn)] fill-current" : "text-[var(--muted)]"}/>
                </td>
                <td className="table-td font-medium">{t.name}</td>
                <td className="table-td"><span className="chip-gray">{t.kind}</span></td>
                <td className="table-td font-mono">{t.legs}</td>
                <td className="table-td text-xs text-[var(--muted)]">{t.mode}</td>
                <td className="table-td text-xs text-[var(--muted)]">{t.lastUsed}</td>
                <td className="table-td font-mono">
                  {t.winRate != null
                    ? <span className={t.winRate >= 80 ? "text-[var(--success)]" : t.winRate >= 60 ? "text-[var(--warn)]" : "text-[var(--danger)]"}>{t.winRate}%</span>
                    : <span className="text-[var(--muted)]">—</span>}
                </td>
                <td className="table-td font-mono">
                  {t.avgPnl != null
                    ? <span className={t.avgPnl >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                        {t.avgPnl >= 0 ? "+" : ""}₹{Math.abs(t.avgPnl).toLocaleString("en-IN")}
                      </span>
                    : <span className="text-[var(--muted)]">—</span>}
                </td>
                <td className="table-td text-right">
                  <div className="flex gap-0.5 justify-end">
                    <button title="Apply in Trade" className="p-1.5 text-[var(--accent)] hover:bg-[var(--panel-2)] rounded"><Play size={12}/></button>
                    <button title="Duplicate" className="p-1.5 text-[var(--muted)] hover:text-[var(--ink)] rounded"><Copy size={12}/></button>
                    <button title="Edit" className="p-1.5 text-[var(--muted)] hover:text-[var(--ink)] rounded"><Edit3 size={12}/></button>
                    <button title="Delete" className="p-1.5 text-[var(--muted)] hover:text-[var(--danger)] rounded"><Trash2 size={12}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
