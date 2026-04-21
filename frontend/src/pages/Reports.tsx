import { useState } from "react";
import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { Download, BarChart3, PieChart, Calendar, TrendingUp, Layers, Info } from "lucide-react";
import { toast } from "@/components/Toast";

// ── Algo-only reporting: ALL trades shown here come from the algo engine ────
// Paper and Live demats are both tracked. No manual entry. For full multi-source
// reporting (manual / sheet upload / contract notes / bank recon), see the
// separate "Options Reporting Tool" project.

const TABS: Array<[string, string, JSX.Element]> = [
  ["overview",   "Overview",           <BarChart3 size={14}/>],
  ["portfolio",  "By Portfolio",       <PieChart size={14}/>],
  ["strategy",   "By Strategy",        <Layers size={14}/>],
  ["demat",      "By Demat",           <TrendingUp size={14}/>],
  ["monthly",    "Monthly",            <Calendar size={14}/>],
  ["trades",     "All Algo Trades",    <TrendingUp size={14}/>],
];

// Portfolio → Strategy → trades (from algo executions only)
const PORTFOLIOS = [
  {id:1, name:"Weekly Strangles",     kind:"NEUTRAL",   strategies:12, openTrades:2, margin:342000,  pnl:+18500, returnPct:5.41, mode:"LIVE"},
  {id:2, name:"Monthly Iron Condors", kind:"NEUTRAL",   strategies:4,  openTrades:1, margin:1820000, pnl:+42100, returnPct:2.31, mode:"LIVE"},
  {id:3, name:"Paper Testing",        kind:"TEST",      strategies:28, openTrades:0, margin:0,       pnl:+125000,returnPct:0.00, mode:"PAPER"},
];

const TRADES = [
  {id:42, date:"2026-04-16", strategy:"Short Strangle",  portfolio:"Weekly Strangles",     demat:"ZD12345", mode:"LIVE",  status:"LIVE",    pnl:+2100,  margin:108500, legs:"25000CE + 24500PE"},
  {id:43, date:"2026-04-16", strategy:"Iron Condor",     portfolio:"Monthly Iron Condors", demat:"1234567890", mode:"LIVE", status:"MONITOR", pnl:0,     margin:180000, legs:"25300CE/25000CE + 24200PE/24500PE"},
  {id:41, date:"2026-04-14", strategy:"Short Strangle",  portfolio:"Weekly Strangles",     demat:"ZD12345", mode:"LIVE",  status:"CLOSED",  pnl:+1820, margin:105000, legs:"25000CE + 24500PE"},
  {id:40, date:"2026-04-12", strategy:"Bull Put",        portfolio:"Weekly Strangles",     demat:"9876543210", mode:"LIVE", status:"CLOSED",pnl:-2100, margin:45000,  legs:"24500PE + 24200PE"},
  {id:39, date:"2026-04-10", strategy:"Short Strangle",  portfolio:"Paper Testing",        demat:"PAPER-001", mode:"PAPER", status:"CLOSED",pnl:+980,  margin:0,      legs:"25100CE + 24400PE"},
];

export default function Reports() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><BarChart3 size={20}/> Reports</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">Algo-executed trades only · paper + live · portfolio and strategy linked</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost btn-sm flex items-center gap-1"
                  onClick={() => toast("info","Excel export queued","File will download shortly")}>
            <Download size={13}/>Export Excel
          </button>
          <button className="btn-ghost btn-sm flex items-center gap-1"
                  onClick={() => toast("info","CSV export queued","File will download shortly")}>
            <Download size={13}/>Export CSV
          </button>
        </div>
      </div>

      {/* Scope banner */}
      <div className="card flex items-start gap-3 !py-3"
           style={{background:"color-mix(in srgb, var(--accent) 6%, transparent)",
                   borderColor:"color-mix(in srgb, var(--accent) 25%, transparent)"}}>
        <Info size={16} className="text-[var(--accent)] shrink-0 mt-0.5"/>
        <div className="text-sm">
          <b>Algo-only reports.</b> This captures trades placed through this platform (paper + live demats).
          For full-demat reporting (auto broker sync, manual entry, contract notes, sheet upload, bank recon)
          use the separate <i>Options Reporting Tool</i>.
        </div>
      </div>

      <nav className="flex gap-1 border-b" style={{borderColor:"var(--border)"}}>
        {TABS.map(([p,l,icon]) => (
          <NavLink key={p} to={p}
            className={({isActive}) => `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              isActive ? "text-[var(--accent)] border-[var(--accent)]" : "text-[var(--muted)] border-transparent hover:text-[var(--ink)]"
            }`}>{icon}{l}</NavLink>
        ))}
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="overview" replace/>}/>
        <Route path="overview"  element={<Overview/>}/>
        <Route path="portfolio" element={<ByPortfolio/>}/>
        <Route path="strategy"  element={<ByStrategy/>}/>
        <Route path="demat"     element={<ByDemat/>}/>
        <Route path="monthly"   element={<Monthly/>}/>
        <Route path="trades"    element={<AllTrades/>}/>
      </Routes>
    </div>
  );
}

function Overview() {
  const live = TRADES.filter(t => t.mode === "LIVE");
  const paper = TRADES.filter(t => t.mode === "PAPER");
  const livePnl = live.reduce((s,t) => s + t.pnl, 0);
  const paperPnl = paper.reduce((s,t) => s + t.pnl, 0);
  const liveMargin = live.reduce((s,t) => s + t.margin, 0);

  return (
    <div className="space-y-5">
      {/* Mode comparison */}
      <div className="grid md:grid-cols-2 gap-4">
        <ModeCard title="LIVE" pnl={livePnl} margin={liveMargin} trades={live.length} tone="green"/>
        <ModeCard title="PAPER" pnl={paperPnl} margin={0} trades={paper.length} tone="blue"/>
      </div>

      {/* Portfolios roll-up */}
      <div className="card">
        <h3 className="font-semibold mb-3">Portfolios (algo trades)</h3>
        <table className="w-full">
          <thead><tr>
            <th className="table-th">Portfolio</th><th className="table-th">Mode</th>
            <th className="table-th">Strategies</th><th className="table-th">Open</th>
            <th className="table-th">Margin</th><th className="table-th">P&L</th>
            <th className="table-th">Return %</th>
          </tr></thead>
          <tbody>
            {PORTFOLIOS.map(p => (
              <tr key={p.id} className="hover-row">
                <td className="table-td font-medium">{p.name} <span className="text-[var(--muted)] text-[10px]">· {p.kind}</span></td>
                <td className="table-td"><span className={p.mode==="LIVE"?"chip-green":"chip-blue"}>{p.mode}</span></td>
                <td className="table-td">{p.strategies}</td>
                <td className="table-td">{p.openTrades}</td>
                <td className="table-td font-mono">₹{(p.margin/100000).toFixed(1)}L</td>
                <td className={`table-td font-mono ${p.pnl>=0?"text-[var(--success)]":"text-[var(--danger)]"}`}>
                  {p.pnl>=0?"+":""}₹{(p.pnl/1000).toFixed(1)}k</td>
                <td className={`table-td font-mono ${p.returnPct>=0?"text-[var(--success)]":"text-[var(--danger)]"}`}>
                  {p.returnPct.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Consolidated per demat */}
      <div className="card">
        <h3 className="font-semibold mb-3">By Demat (algo trades)</h3>
        <table className="w-full">
          <thead><tr><th className="table-th">Broker</th><th className="table-th">Demat</th>
            <th className="table-th">Mode</th><th className="table-th">Trades</th>
            <th className="table-th">Margin Used</th><th className="table-th">P&L</th>
            <th className="table-th">Return %</th></tr></thead>
          <tbody>
            <tr className="hover-row"><td className="table-td">Zerodha</td><td className="table-td font-mono">ZD12345</td>
              <td className="table-td"><span className="chip-green">LIVE</span></td>
              <td className="table-td">2</td><td className="table-td font-mono">₹2.14L</td>
              <td className="table-td font-mono text-[var(--success)]">+₹3.9k</td>
              <td className="table-td font-mono text-[var(--success)]">1.82%</td></tr>
            <tr className="hover-row"><td className="table-td">Axis</td><td className="table-td font-mono">1234567890</td>
              <td className="table-td"><span className="chip-green">LIVE</span></td>
              <td className="table-td">1</td><td className="table-td font-mono">₹1.80L</td>
              <td className="table-td font-mono text-[var(--muted)]">₹0</td>
              <td className="table-td font-mono">0.00%</td></tr>
            <tr className="hover-row"><td className="table-td">Axis</td><td className="table-td font-mono">9876543210</td>
              <td className="table-td"><span className="chip-green">LIVE</span></td>
              <td className="table-td">1</td><td className="table-td font-mono">₹0.45L</td>
              <td className="table-td font-mono text-[var(--danger)]">-₹2.1k</td>
              <td className="table-td font-mono text-[var(--danger)]">-4.67%</td></tr>
            <tr className="hover-row"><td className="table-td">Paper</td><td className="table-td font-mono">PAPER-001</td>
              <td className="table-td"><span className="chip-blue">PAPER</span></td>
              <td className="table-td">1</td><td className="table-td font-mono">—</td>
              <td className="table-td font-mono text-[var(--success)]">+₹980</td>
              <td className="table-td font-mono">—</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModeCard({title, pnl, margin, trades, tone}:
  {title: string; pnl: number; margin: number; trades: number; tone: "green"|"blue"}) {
  const bg = tone === "green" ? "color-mix(in srgb, var(--success) 8%, transparent)"
                              : "color-mix(in srgb, var(--accent) 8%, transparent)";
  return (
    <div className="card !p-5" style={{background: bg}}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-[var(--muted)]">{title}</div>
        <span className={tone==="green"?"chip-green":"chip-blue"}>{title}</span>
      </div>
      <div className={`mt-2 font-mono text-3xl font-bold ${pnl>=0?"text-[var(--success)]":"text-[var(--danger)]"}`}>
        {pnl>=0?"+":""}₹{Math.abs(pnl).toLocaleString("en-IN")}
      </div>
      <div className="mt-3 flex gap-6 text-sm">
        <div><span className="text-[var(--muted)]">Trades</span> <span className="font-mono">{trades}</span></div>
        {margin > 0 && <div><span className="text-[var(--muted)]">Margin</span> <span className="font-mono">₹{(margin/100000).toFixed(1)}L</span></div>}
      </div>
    </div>
  );
}

function ByPortfolio() {
  const [expanded, setExpanded] = useState<number|null>(null);
  return (
    <div className="space-y-3">
      <div className="text-sm text-[var(--muted)]">Every strategy is linked to a portfolio at creation time.</div>
      {PORTFOLIOS.map(p => (
        <div key={p.id} className="card p-0 overflow-hidden">
          <button onClick={() => setExpanded(expanded===p.id?null:p.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-[var(--panel-2)] transition">
            <div className="text-left">
              <div className="font-semibold flex items-center gap-2">{p.name}
                <span className={p.mode==="LIVE"?"chip-green":"chip-blue"}>{p.mode}</span>
              </div>
              <div className="text-xs text-[var(--muted)]">{p.strategies} strategies · {p.openTrades} open</div>
            </div>
            <div className="flex gap-6 text-right">
              <div><div className="text-[10px] text-[var(--muted)]">Margin</div><div className="font-mono text-sm">₹{(p.margin/100000).toFixed(1)}L</div></div>
              <div><div className="text-[10px] text-[var(--muted)]">P&L</div>
                <div className={`font-mono text-sm font-semibold ${p.pnl>=0?"text-[var(--success)]":"text-[var(--danger)]"}`}>
                  {p.pnl>=0?"+":""}₹{(p.pnl/1000).toFixed(1)}k</div></div>
              <div><div className="text-[10px] text-[var(--muted)]">Return</div>
                <div className={`font-mono text-sm ${p.returnPct>=0?"text-[var(--success)]":"text-[var(--danger)]"}`}>
                  {p.returnPct.toFixed(2)}%</div></div>
            </div>
          </button>
          {expanded===p.id && (
            <div className="border-t p-4" style={{borderColor:"var(--border)", background:"var(--panel-2)"}}>
              <TradeTable trades={TRADES.filter(t => t.portfolio === p.name)}/>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ByStrategy() {
  const strategies = Array.from(new Set(TRADES.map(t => t.strategy)));
  return (
    <div className="space-y-4">
      {strategies.map(s => (
        <div key={s} className="card">
          <h3 className="font-semibold mb-3">{s}</h3>
          <TradeTable trades={TRADES.filter(t => t.strategy === s)}/>
        </div>
      ))}
    </div>
  );
}

function ByDemat() {
  const demats = Array.from(new Set(TRADES.map(t => t.demat)));
  return (
    <div className="space-y-4">
      {demats.map(d => (
        <div key={d} className="card">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="font-mono">{d}</span>
            {TRADES.find(t => t.demat === d)?.mode === "PAPER"
              ? <span className="chip-blue">PAPER</span>
              : <span className="chip-green">LIVE</span>}
          </h3>
          <TradeTable trades={TRADES.filter(t => t.demat === d)}/>
        </div>
      ))}
    </div>
  );
}

function Monthly() {
  return (
    <div className="space-y-4">
      {["Apr 2026","Mar 2026","Feb 2026"].map(m => (
        <div key={m} className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{m}</h3>
            <div className="flex gap-4 text-sm">
              <span className="text-[var(--muted)]">Trades: {TRADES.length}</span>
              <span className="font-mono text-[var(--success)]">+₹27.7k</span>
              <span className="font-mono">Return 1.82%</span>
            </div>
          </div>
          <TradeTable trades={TRADES}/>
        </div>
      ))}
    </div>
  );
}

function AllTrades() {
  return (
    <div className="card p-0 overflow-hidden">
      <TradeTable trades={TRADES} full/>
    </div>
  );
}

function TradeTable({trades, full}: {trades: typeof TRADES; full?: boolean}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap">
        <thead>
          <tr>
            <th className="table-th">ID</th>
            <th className="table-th">Date</th>
            <th className="table-th">Strategy</th>
            <th className="table-th">Portfolio</th>
            {full && <th className="table-th">Demat</th>}
            <th className="table-th">Mode</th>
            <th className="table-th">Status</th>
            <th className="table-th">Legs</th>
            <th className="table-th">Margin</th>
            <th className="table-th">P&L</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(t => (
            <tr key={t.id} className="hover-row">
              <td className="table-td font-mono">#{t.id}</td>
              <td className="table-td">{t.date}</td>
              <td className="table-td">{t.strategy}</td>
              <td className="table-td text-[var(--muted)]">{t.portfolio}</td>
              {full && <td className="table-td font-mono text-xs">{t.demat}</td>}
              <td className="table-td">
                {t.mode === "LIVE" ? <span className="chip-green">LIVE</span> : <span className="chip-blue">PAPER</span>}
              </td>
              <td className="table-td">
                <span className={t.status==="LIVE"?"chip-green":t.status==="MONITOR"?"chip-blue":"chip-gray"}>{t.status}</span>
              </td>
              <td className="table-td font-mono text-xs">{t.legs}</td>
              <td className="table-td font-mono">{t.margin ? `₹${(t.margin/1000).toFixed(0)}k` : "—"}</td>
              <td className={`table-td font-mono ${t.pnl>=0?"text-[var(--success)]":"text-[var(--danger)]"}`}>
                {t.pnl>=0?"+":""}₹{Math.abs(t.pnl).toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
