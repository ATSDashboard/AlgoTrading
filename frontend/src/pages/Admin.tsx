import { Power, Eye, Scale } from "lucide-react";

export default function Admin() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Admin Console</h1>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 text-danger"><Power size={18}/><b>Global Kill Switch</b></div>
          <p className="text-xs text-muted mt-2">Halts all users' active strategies immediately.
            Requires Admin + 2nd-Admin confirmation.</p>
          <button className="btn-danger w-full mt-3">Halt All Trading</button>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 text-warn"><Scale size={18}/><b>Two-Person Approvals</b></div>
          <p className="text-xs text-muted mt-2">3 pending requests.</p>
          <button className="btn-ghost w-full mt-3">Review Requests</button>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 text-accent"><Eye size={18}/><b>Audit Browser</b></div>
          <p className="text-xs text-muted mt-2">Search hash-chained immutable log.</p>
          <button className="btn-ghost w-full mt-3">Open Audit Browser</button>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Pending Two-Person Approvals</h2>
        <table className="w-full">
          <thead>
            <tr><th className="table-th">Requested By</th><th className="table-th">Action</th>
                <th className="table-th">Details</th><th className="table-th">Expires</th><th className="table-th"></th></tr>
          </thead>
          <tbody>
            <tr><td className="table-td">rohan</td><td className="table-td"><span className="chip-yellow">START_STRATEGY</span></td>
              <td className="table-td text-xs font-mono">#47 · 7 lots NIFTY · ≥5 lots threshold</td>
              <td className="table-td text-muted">4m</td>
              <td className="table-td text-right">
                <button className="btn-ghost mr-1">Reject</button><button className="btn-primary">Approve</button>
              </td></tr>
            <tr><td className="table-td">rohan</td><td className="table-td"><span className="chip-red">RISK_LIMIT_EDIT</span></td>
              <td className="table-td text-xs font-mono">MAX_DAILY_LOSS 50k → 75k</td>
              <td className="table-td text-muted">12m</td>
              <td className="table-td text-right">
                <button className="btn-ghost mr-1">Reject</button><button className="btn-primary">Approve</button>
              </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
