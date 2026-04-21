import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Power, Eye, Scale } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import { toast } from "@/components/Toast";

const INITIAL_APPROVALS = [
  {id:1, requestedBy:"rohan", action:"START_STRATEGY", details:"#47 · 7 lots NIFTY · ≥5 lots threshold", expires:"4m"},
  {id:2, requestedBy:"rohan", action:"RISK_LIMIT_EDIT", details:"MAX_DAILY_LOSS 50k → 75k", expires:"12m"},
];

export default function Admin() {
  const nav = useNavigate();
  const [killOpen, setKillOpen] = useState(false);
  const [approvals, setApprovals] = useState(INITIAL_APPROVALS);

  const decide = (id: number, accept: boolean) => {
    const a = approvals.find(x => x.id === id);
    setApprovals(approvals.filter(x => x.id !== id));
    toast(accept ? "success" : "warn",
          `${accept ? "Approved" : "Rejected"}: ${a?.action}`,
          `Requested by ${a?.requestedBy}`);
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Admin Console</h1>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 text-[var(--danger)]"><Power size={18}/><b>Global Kill Switch</b></div>
          <p className="text-xs text-[var(--muted)] mt-2">Halts all users' active strategies immediately. Requires Admin + 2nd-Admin confirmation.</p>
          <button className="btn-danger w-full mt-3" onClick={() => setKillOpen(true)}>Halt All Trading</button>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 text-[var(--warn)]"><Scale size={18}/><b>Two-Person Approvals</b></div>
          <p className="text-xs text-[var(--muted)] mt-2">{approvals.length} pending request{approvals.length!==1?"s":""}.</p>
          <button className="btn-ghost w-full mt-3"
                  onClick={() => document.getElementById("approvals")?.scrollIntoView({behavior:"smooth"})}>
            Review Requests
          </button>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 text-[var(--accent)]"><Eye size={18}/><b>Audit Browser</b></div>
          <p className="text-xs text-[var(--muted)] mt-2">Search hash-chained immutable log.</p>
          <button className="btn-ghost w-full mt-3" onClick={() => nav("/admin/audit")}>Open Audit Browser</button>
        </div>
      </div>

      <div id="approvals" className="card">
        <h2 className="font-semibold mb-3">Pending Two-Person Approvals</h2>
        {approvals.length === 0 ? (
          <div className="text-sm text-[var(--muted)] text-center py-6">No pending approvals · all clear 👌</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr><th className="table-th">Requested By</th><th className="table-th">Action</th>
                  <th className="table-th">Details</th><th className="table-th">Expires</th><th className="table-th"></th></tr>
            </thead>
            <tbody>
              {approvals.map(a => (
                <tr key={a.id}>
                  <td className="table-td">{a.requestedBy}</td>
                  <td className="table-td">
                    <span className={a.action.includes("RISK") ? "chip-red" : "chip-yellow"}>{a.action}</span>
                  </td>
                  <td className="table-td text-xs font-mono">{a.details}</td>
                  <td className="table-td text-[var(--muted)]">{a.expires}</td>
                  <td className="table-td text-right">
                    <button className="btn-ghost mr-1" onClick={() => decide(a.id, false)}>Reject</button>
                    <button className="btn-primary" onClick={() => decide(a.id, true)}>Approve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal open={killOpen}
        title="⚠ Halt ALL trading — emergency"
        tone="danger"
        confirmLabel="HALT ALL"
        typeToConfirm="HALT ALL"
        body={<div className="space-y-2">
          <p>This halts EVERY user's active strategies and flattens EVERY position across all brokers.</p>
          <p className="text-xs text-[var(--muted)]">A second admin must confirm before it actually executes. Use only in emergency.</p>
        </div>}
        onConfirm={() => {setKillOpen(false); toast("error","Halt-all requested","Awaiting 2nd admin confirmation");}}
        onCancel={() => setKillOpen(false)}/>
    </div>
  );
}
