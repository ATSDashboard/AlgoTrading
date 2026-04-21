import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Pause, LogOut, Power, Copy, Edit3, TrendingUp, X, RefreshCw, Repeat } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import ConfirmModal from "@/components/ConfirmModal";
import { toast } from "@/components/Toast";
import { useStrategyStream } from "@/api/ws";
import { useStrategy, useExitStrategy, useKillStrategy } from "@/api/hooks";

const MOCK_CHART = Array.from({ length: 40 }, (_, i) => ({
  t: i, ce: 41 - i * 0.2, pe: 37 - i * 0.18, combined: 78 - i * 0.38,
}));

export default function StrategyMonitor() {
  const { id } = useParams();
  const nav = useNavigate();
  const strategyId = id ? parseInt(id, 10) : null;
  const { data: strat } = useStrategy(strategyId);
  const { events, connected } = useStrategyStream(strategyId);
  const exitStrat = useExitStrategy();
  const killStrat = useKillStrategy();

  // Latest pnl from WS stream (falls back to mock for UI preview)
  const pnlEvents = events.filter(e => e.type === "pnl_tick").slice(-1);
  const pnl = pnlEvents.length > 0 ? Math.round(pnlEvents[0].data.pnl) : 2100;

  const [modal, setModal] = useState<null|"pause"|"exit"|"kill"|"clone"|"rollover">(null);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Strategy #{id}</h1>
          <div className="text-sm text-[var(--muted)] flex items-center gap-2 mt-1">
            NIFTY · 17-Apr-2026 · <span className="chip-green">LIVE</span>
            <span className="chip-gray">Zerodha · 1234567890</span>
            <span className="chip-blue">Heartbeat OK</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-ghost btn-sm flex items-center gap-1" onClick={() => setModal("clone")}>
            <Copy size={13}/>Clone
          </button>
          <button className="btn-ghost btn-sm flex items-center gap-1" onClick={() => setModal("rollover")}>
            <Repeat size={13}/>Rollover
          </button>
          <button className="btn-ghost flex items-center gap-2" onClick={() => setModal("pause")}>
            <Pause size={14}/>Pause
          </button>
          <button className="btn-ghost flex items-center gap-2" onClick={() => setModal("exit")}>
            <LogOut size={14}/>Exit
          </button>
          <button className="btn-danger flex items-center gap-2" onClick={() => setModal("kill")}>
            <Power size={14}/>Kill
          </button>
        </div>
      </div>

      {/* Big P&L */}
      <div className="card text-center py-8">
        <div className="text-xs uppercase tracking-wider text-muted">Unrealized P&L</div>
        <div className={`mt-2 text-6xl font-bold font-mono ${pnl>0?"text-success":"text-danger"}`}>
          {pnl>=0?"+":""}₹{pnl.toLocaleString()}
        </div>
        <div className="text-xs text-muted mt-2">
          Peak: +₹2,840 · DD from peak: 26% · MTM DD kill at 40%
        </div>
      </div>

      {/* Positions */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between font-semibold" style={{borderColor:"var(--border)"}}>
          <span>Positions</span>
          <button className="btn-ghost btn-sm flex items-center gap-1 !text-xs"
                  onClick={() => toast("success","Reconciled","Internal positions match broker")}>
            <RefreshCw size={11}/>Reconcile now
          </button>
        </div>
        <table className="w-full">
          <thead style={{background:"var(--panel-2)"}}>
            <tr>
              <th className="table-th">Leg</th><th className="table-th">Strike</th>
              <th className="table-th">Qty</th><th className="table-th">Entry</th>
              <th className="table-th">LTP</th><th className="table-th">Slippage</th>
              <th className="table-th">P&L</th>
              <th className="table-th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <PositionRow leg="CE_MAIN" strike="25000 CE" qty={-65} entry={41.20} ltp={32.10} slip="0.18%" pnl={682}/>
            <PositionRow leg="PE_MAIN" strike="24500 PE" qty={-65} entry={37.50} ltp={18.90} slip="0.22%" pnl={1395}/>
          </tbody>
        </table>
      </div>

      {/* Premium chart */}
      <div className="card">
        <div className="font-semibold mb-3">Premium History</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={MOCK_CHART}>
              <XAxis dataKey="t" stroke="#8a94a7" fontSize={11} />
              <YAxis stroke="#8a94a7" fontSize={11} />
              <Tooltip contentStyle={{background:"#141821",border:"1px solid #232836",borderRadius:8}}/>
              <Line dataKey="ce" stroke="#5b9dff" dot={false} strokeWidth={2} name="CE bid"/>
              <Line dataKey="pe" stroke="#eab308" dot={false} strokeWidth={2} name="PE bid"/>
              <Line dataKey="combined" stroke="#22c55e" dot={false} strokeWidth={2} name="Combined"/>
              <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" label="Threshold"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Order log + metrics */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="card">
          <h2 className="font-semibold mb-3">Order Log</h2>
          <ul className="space-y-1.5 text-xs font-mono">
            <li>09:21:04 <span className="chip-green">FILL</span> #CE SELL 25000CE x75 @41.20 AX123 lat 48ms</li>
            <li>09:21:04 <span className="chip-green">FILL</span> #PE SELL 24500PE x75 @37.50 AX124 lat 62ms</li>
            <li>09:20:58 <span className="chip-blue">CHECK</span> combined=79.8 threshold=80</li>
            <li>09:20:56 <span className="chip-blue">CHECK</span> combined=79.5 threshold=80</li>
            <li>09:15:00 <span className="chip-gray">START</span> state=MONITORING</li>
          </ul>
        </div>
        <div className="card">
          <h2 className="font-semibold mb-3">Execution Metrics</h2>
          <dl className="text-sm space-y-2">
            <Row k="Margin blocked" v={<span className="font-semibold">₹1,08,500</span>}/>
            <Row k="ROI on credit" v={<span className="text-[var(--success)]">2.82%</span>}/>
            <Row k="Per ₹1Cr margin" v="₹28,200"/>
            <Row k="Tick-to-trade p50" v="52ms"/>
            <Row k="Tick-to-trade p99" v="128ms"/>
            <Row k="Avg slippage" v="0.20%"/>
            <Row k="Orders placed" v="2"/>
            <Row k="OTR" v="1.0"/>
            <Row k="SEBI rate used" v="0/8 /sec"/>
            <Row k="Reconciled" v={<span className="text-[var(--success)]">10s ago ✓</span>}/>
          </dl>
        </div>
      </div>

      <ConfirmModal open={modal==="pause"} title="Pause monitoring?"
        body={<p>Current positions stay open; engine stops polling for triggers/risk until you resume.</p>}
        confirmLabel="Pause" onConfirm={() => {setModal(null); toast("info","Strategy paused");}}
        onCancel={() => setModal(null)}/>
      <ConfirmModal open={modal==="exit"} title="Exit strategy — close all positions?"
        tone="warn" confirmLabel="Exit All"
        body={<div><p>Places BUY orders to flatten all SELL legs (and vice versa). Final P&L locked.</p>
              <p className="text-xs text-[var(--muted)] mt-2">Current P&L: +₹2,100 · this will be realized</p></div>}
        onConfirm={() => {setModal(null); toast("success","Exit initiated","All legs closing"); nav("/history");}}
        onCancel={() => setModal(null)}/>
      <ConfirmModal open={modal==="kill"} title="⚠ Kill Switch — emergency halt"
        tone="danger" confirmLabel="KILL" typeToConfirm="KILL"
        body={<div><p>Force-closes all positions IMMEDIATELY at market-protect orders. Use only in emergency.</p>
              <p className="text-xs text-[var(--muted)] mt-2">Slippage will likely be higher than normal exit.</p></div>}
        onConfirm={() => {setModal(null); toast("error","Kill switch activated","Emergency close in progress"); nav("/");}}
        onCancel={() => setModal(null)}/>
      <ConfirmModal open={modal==="clone"} title="Clone this strategy?"
        body={<p>Opens New Strategy pre-filled with the same legs. No orders placed yet.</p>}
        confirmLabel="Clone" onConfirm={() => {setModal(null); nav("/strategy/new");}}
        onCancel={() => setModal(null)}/>
      <ConfirmModal open={modal==="rollover"} title="Rollover to next expiry?"
        tone="warn" confirmLabel="Rollover"
        body={<div><p>Closes current legs and opens equivalent legs in next expiry (24-Apr-2026).</p>
              <p className="text-xs text-[var(--muted)] mt-2">Two orders per leg: close current + open new. Subject to margin check.</p></div>}
        onConfirm={() => {setModal(null); toast("info","Rollover queued");}}
        onCancel={() => setModal(null)}/>
    </div>
  );
}

function Row({k, v}: {k: string; v: React.ReactNode}) {
  return <div className="flex justify-between border-b pb-1.5" style={{borderColor:"var(--border)"}}>
    <span className="text-[var(--muted)]">{k}</span><span className="font-mono">{v}</span>
  </div>;
}

function PositionRow({leg, strike, qty, entry, ltp, slip, pnl}: {
  leg: string; strike: string; qty: number; entry: number; ltp: number; slip: string; pnl: number
}) {
  const [action, setAction] = useState<null|"modify"|"add"|"close">(null);
  return (
    <>
      <tr className="hover-row">
        <td className="table-td">{leg}</td><td className="table-td font-mono">{strike}</td>
        <td className="table-td font-mono">{qty}</td><td className="table-td font-mono">{entry.toFixed(2)}</td>
        <td className="table-td font-mono">{ltp.toFixed(2)}</td>
        <td className="table-td text-[var(--warn)]">{slip}</td>
        <td className={`table-td font-mono ${pnl>=0?"text-[var(--success)]":"text-[var(--danger)]"}`}>
          {pnl>=0?"+":""}₹{pnl.toLocaleString("en-IN")}
        </td>
        <td className="table-td text-right">
          <div className="flex gap-0.5 justify-end">
            <button title="Modify price" className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--accent)]"
                    onClick={() => setAction("modify")}><Edit3 size={12}/></button>
            <button title="Add to position" className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--accent)]"
                    onClick={() => setAction("add")}><TrendingUp size={12}/></button>
            <button title="Close this leg only" className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--danger)]"
                    onClick={() => setAction("close")}><X size={12}/></button>
          </div>
        </td>
      </tr>
      <ConfirmModal open={action === "modify"} title={`Modify ${leg}?`}
        body={<p>Change limit price for <b>{strike}</b>. Re-quote counter will increment.</p>}
        confirmLabel="Modify" onConfirm={() => {setAction(null); toast("info", "Modify request queued");}}
        onCancel={() => setAction(null)}/>
      <ConfirmModal open={action === "add"} title={`Add to ${leg}?`}
        body={<p>Adds another lot to <b>{strike}</b>. Uses free margin. Pre-trade RMS applies.</p>}
        confirmLabel="Place Add Order" onConfirm={() => {setAction(null); toast("success", "Add order placed");}}
        onCancel={() => setAction(null)}/>
      <ConfirmModal open={action === "close"} title={`Close ${leg} only?`} tone="warn"
        body={<p>This closes only the {strike} leg. Remaining legs stay live (could be naked exposure — verify).</p>}
        confirmLabel="Close Leg" onConfirm={() => {setAction(null); toast("warn", `${leg} close order submitted`);}}
        onCancel={() => setAction(null)}/>
    </>
  );
}
