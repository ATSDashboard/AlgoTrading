import { useState } from "react";
import { Link } from "react-router-dom";
import { PlusCircle, Power, TrendingUp, Zap, Activity, AlertTriangle, Wallet } from "lucide-react";
import { useStrategies, useHeartbeat } from "@/api/hooks";
import ConfirmModal from "@/components/ConfirmModal";
import { toast } from "@/components/Toast";

// Mock data for UI preview — wired to real /strategy endpoint in M5
const MOCK_STRATS = [
  { id: 42, state: "LIVE",       underlying: "NIFTY",  ce: 25000, pe: 24500, lots: 1, pnl: +2100, reason: null },
  { id: 43, state: "MONITORING", underlying: "SENSEX", ce: 81500, pe: 80500, lots: 2, pnl: 0,     reason: null },
];

export default function Dashboard() {
  useHeartbeat();                                    // starts 30s heartbeat loop
  const { data: liveStrats } = useStrategies(true);  // active strategies from backend
  const [killAllOpen, setKillAllOpen] = useState(false);
  // Fall back to mock if backend is offline so the UI still demos
  const strats = liveStrats && liveStrats.length > 0
    ? liveStrats.map((s) => ({
        id: s.id, state: s.state, underlying: s.underlying,
        ce: Number(s.ce_strike), pe: Number(s.pe_strike),
        lots: s.quantity_lots,
        pnl: Number(s.final_pnl ?? 0),
        reason: s.exit_reason,
      }))
    : MOCK_STRATS;
  const totalPnL = strats.reduce((s, x) => s + x.pnl, 0);
  const active = strats.length;

  return (
    <div className="space-y-6">
      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="Active Strategies" value={String(active)} icon={<Activity size={16}/>} />
        <StatCard title="Today P&L" value={`₹${totalPnL.toLocaleString("en-IN")}`} tone={totalPnL>=0?"green":"red"} icon={<TrendingUp size={16}/>} />
        <StatCard title="Open Risk" value="₹18,000" subtitle="SL if all hit" icon={<Zap size={16}/>} />
        <StatCard title="Margin Used" value="₹1,42,000"
                  subtitle="₹7,03,000 free · 16.8% used"
                  icon={<Wallet size={16}/>} />
        <StatCard title="Daily Loss Cap" value="₹50,000" subtitle="₹46,100 remaining" icon={<AlertTriangle size={16}/>} />
      </div>

      {/* Margin by demat */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Wallet size={14}/> Margin by Demat</h3>
          <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Live · refreshes every 10s</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <MarginBar broker="Zerodha" demat="ZD12345" used={92000} total={545000}/>
          <MarginBar broker="Axis"    demat="1234567890" used={50000} total={300000}/>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/trade" className="btn-primary flex items-center gap-2">
          <PlusCircle size={16}/> New Trade
        </Link>
        <button className="btn-danger flex items-center gap-2" onClick={() => setKillAllOpen(true)}>
          <Power size={16}/> Kill All Strategies
        </button>
        <ConfirmModal open={killAllOpen}
          title="⚠ Kill all MY strategies"
          tone="danger"
          confirmLabel="KILL ALL"
          typeToConfirm="KILL"
          body={<p>Force-closes all your active strategies immediately at market-protect orders. Use for emergency only. Firm-wide halt is in Admin → Global Kill Switch.</p>}
          onConfirm={() => {setKillAllOpen(false); toast("error","Kill all initiated","All positions closing");}}
          onCancel={() => setKillAllOpen(false)}/>
        <span className="ml-auto text-xs text-muted">
          SEBI rate: 0/8 orders this sec · OTR: 2.1 · Circuit: <span className="text-success">OK</span>
        </span>
      </div>

      {/* Active strategies table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Active Strategies</h2>
          <span className="chip-gray">{active} running</span>
        </div>
        <table className="w-full">
          <thead className="bg-panel/50">
            <tr>
              <th className="table-th">ID</th>
              <th className="table-th">Underlying</th>
              <th className="table-th">Strikes</th>
              <th className="table-th">Lots</th>
              <th className="table-th">State</th>
              <th className="table-th">P&L</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {strats.map((s) => (
              <tr key={s.id} className="hover:bg-panel/30">
                <td className="table-td font-mono">#{s.id}</td>
                <td className="table-td">{s.underlying}</td>
                <td className="table-td font-mono">{s.ce}CE + {s.pe}PE</td>
                <td className="table-td">{s.lots}</td>
                <td className="table-td"><StateChip state={s.state} /></td>
                <td className={`table-td font-mono ${s.pnl>0?"text-success":s.pnl<0?"text-danger":""}`}>
                  ₹{s.pnl.toLocaleString()}
                </td>
                <td className="table-td text-right">
                  <Link to={`/strategy/${s.id}`} className="text-accent text-sm hover:underline">Monitor →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Activity feed */}
      <div className="card">
        <h2 className="font-semibold mb-3">Recent Activity</h2>
        <ul className="space-y-2 text-sm font-mono text-muted">
          <li>09:21:04 <span className="chip-blue">ORDER</span> #42 SELL CE25000 x75 @41.20 FILLED</li>
          <li>09:21:04 <span className="chip-blue">ORDER</span> #42 SELL PE24500 x75 @37.50 FILLED</li>
          <li>09:20:58 <span className="chip-gray">PREMIUM</span> #42 combined=79.8 threshold=80</li>
          <li>09:15:00 <span className="chip-green">START</span> #42 MONITORING</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({title, value, subtitle, tone, icon}:
  {title: string; value: string; subtitle?: string; tone?: "green"|"red"; icon?: React.ReactNode}) {
  const valCls = tone === "green" ? "text-success" : tone === "red" ? "text-danger" : "";
  return (
    <div className="card">
      <div className="flex items-center justify-between text-muted text-xs uppercase tracking-wide">
        <span>{title}</span>{icon}
      </div>
      <div className={`mt-3 text-2xl font-bold font-mono ${valCls}`}>{value}</div>
      {subtitle && <div className="text-xs text-muted mt-1">{subtitle}</div>}
    </div>
  );
}

function MarginBar({broker, demat, used, total}: {broker: string; demat: string; used: number; total: number}) {
  const pct = Math.round((used / total) * 100);
  const col = pct >= 85 ? "var(--danger)" : pct >= 60 ? "var(--warn)" : "var(--success)";
  return (
    <div className="p-3 rounded-lg border" style={{borderColor:"var(--border)"}}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-medium">{broker}</div>
          <div className="text-[10px] text-[var(--muted)] font-mono">{demat}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono font-semibold">₹{used.toLocaleString("en-IN")} <span className="text-[var(--muted)]">/ ₹{total.toLocaleString("en-IN")}</span></div>
          <div className="text-[10px] font-mono" style={{color: col}}>{pct}% used · ₹{(total-used).toLocaleString("en-IN")} free</div>
        </div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{background:"var(--panel-2)"}}>
        <div className="h-full transition-all" style={{width: `${pct}%`, background: col}}/>
      </div>
    </div>
  );
}

function StateChip({state}: {state: string}) {
  const map: Record<string, string> = {
    LIVE: "chip-green", MONITORING: "chip-blue", ENTERING: "chip-yellow",
    EXITING: "chip-yellow", CLOSED: "chip-gray", EMERGENCY_HALT: "chip-red",
    DRAFT: "chip-gray",
  };
  return <span className={map[state] ?? "chip-gray"}>{state}</span>;
}
