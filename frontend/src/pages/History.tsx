const ROWS = [
  { id: 41, date: "2026-04-14", underlying: "NIFTY",  strikes: "25000CE+24500PE", lots: 1, pnl: +1820, exit: "TARGET_HIT",    slippage: "0.18%" },
  { id: 40, date: "2026-04-12", underlying: "SENSEX", strikes: "81500CE+80500PE", lots: 2, pnl: -2100, exit: "SL_HIT",        slippage: "0.31%" },
  { id: 39, date: "2026-04-10", underlying: "NIFTY",  strikes: "25100CE+24400PE", lots: 1, pnl: +980,  exit: "TIME_EXIT",     slippage: "0.12%" },
  { id: 38, date: "2026-04-05", underlying: "NIFTY",  strikes: "25000CE+24500PE", lots: 1, pnl: +2400, exit: "MANUAL_EXIT",   slippage: "0.22%" },
];

export default function History() {
  const total = ROWS.reduce((s, r) => s + r.pnl, 0);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">History</h1>
          <p className="text-sm text-muted mt-1">Past strategies · execution quality · exit reasons</p>
        </div>
        <div className="flex gap-3">
          <select className="input w-40"><option>Last 7 days</option><option>Last 30 days</option><option>Custom</option></select>
          <button className="btn-ghost">Export CSV</button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card"><div className="text-xs text-muted uppercase">Net P&L</div><div className={`font-mono text-2xl font-bold mt-2 ${total>0?"text-success":"text-danger"}`}>₹{total.toLocaleString()}</div></div>
        <div className="card"><div className="text-xs text-muted uppercase">Win rate</div><div className="font-mono text-2xl font-bold mt-2">75%</div></div>
        <div className="card"><div className="text-xs text-muted uppercase">Avg slippage</div><div className="font-mono text-2xl font-bold mt-2">0.21%</div></div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-panel/50">
            <tr>
              <th className="table-th">ID</th><th className="table-th">Date</th>
              <th className="table-th">Underlying</th><th className="table-th">Strikes</th>
              <th className="table-th">Lots</th><th className="table-th">P&L</th>
              <th className="table-th">Exit</th><th className="table-th">Slippage</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.id} className="hover:bg-panel/30 cursor-pointer">
                <td className="table-td font-mono">#{r.id}</td>
                <td className="table-td">{r.date}</td>
                <td className="table-td">{r.underlying}</td>
                <td className="table-td font-mono">{r.strikes}</td>
                <td className="table-td">{r.lots}</td>
                <td className={`table-td font-mono ${r.pnl>0?"text-success":"text-danger"}`}>
                  {r.pnl>=0?"+":""}₹{r.pnl.toLocaleString()}
                </td>
                <td className="table-td text-xs"><span className="chip-gray">{r.exit}</span></td>
                <td className="table-td text-muted">{r.slippage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
