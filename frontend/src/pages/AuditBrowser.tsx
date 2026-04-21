import { useState } from "react";
import { Shield, CheckCircle2, Download, Filter } from "lucide-react";

// Mock — real impl queries /admin/audit/search
const EVENTS = [
  {id:14208, ts:"2026-04-16 13:22:04", user:"rohan", strategy:42, type:"ORDER_FILLED",   severity:"INFO",     data:{leg:"CE_MAIN", price:41.20, qty:65}},
  {id:14207, ts:"2026-04-16 13:22:03", user:"rohan", strategy:42, type:"ORDER_PLACED",   severity:"INFO",     data:{leg:"CE_MAIN", limit:41.20}},
  {id:14206, ts:"2026-04-16 13:22:00", user:"rohan", strategy:42, type:"TRIGGER_MET",    severity:"INFO",     data:{combined:80.1}},
  {id:14205, ts:"2026-04-16 13:15:00", user:"rohan", strategy:42, type:"STRATEGY_START", severity:"INFO",     data:{state:"MONITORING"}},
  {id:14204, ts:"2026-04-16 12:58:12", user:"admin", strategy:null,type:"RISK_LIMIT_EDIT",severity:"WARN",    data:{field:"MAX_DAILY_LOSS", from:50000, to:75000, approved_by:"admin2"}},
  {id:14203, ts:"2026-04-16 10:04:55", user:"rohan", strategy:40, type:"SL_HIT",          severity:"WARN",     data:{pnl:-2100}},
  {id:14202, ts:"2026-04-16 09:18:03", user:"rohan", strategy:null,type:"LOGIN",          severity:"INFO",     data:{ip:"203.0.113.5"}},
  {id:14201, ts:"2026-04-16 09:17:59", user:"rohan", strategy:null,type:"TOTP_VERIFIED",  severity:"INFO",     data:{}},
];

export default function AuditBrowser() {
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<"ALL"|"INFO"|"WARN"|"ERROR"|"CRITICAL">("ALL");
  const [type, setType] = useState("ALL");

  const filtered = EVENTS.filter(e =>
    (sev === "ALL" || e.severity === sev) &&
    (type === "ALL" || e.type === type) &&
    (!q || JSON.stringify(e).toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield size={20}/> Audit Browser
          </h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">Immutable hash-chained log · append-only · tamper-evident</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost btn-sm flex items-center gap-1"><CheckCircle2 size={13}/>Verify Chain</button>
          <button className="btn-ghost btn-sm flex items-center gap-1"><Download size={13}/>Export</button>
        </div>
      </div>

      <div className="card flex items-start gap-3 !py-3"
           style={{background:"color-mix(in srgb, var(--success) 6%, transparent)",
                   borderColor:"color-mix(in srgb, var(--success) 25%, transparent)"}}>
        <CheckCircle2 size={16} className="text-[var(--success)] shrink-0 mt-0.5"/>
        <div className="text-sm">
          <b>Chain intact.</b> Last 10,000 entries verified — all hashes match. Today's anchor anchored to S3 at 16:05 IST.
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"/>
            <input className="input pl-8" placeholder="Search event data…"
                   value={q} onChange={e => setQ(e.target.value)}/>
          </div>
          <select className="input !w-36" value={sev} onChange={e => setSev(e.target.value as any)}>
            <option>ALL</option><option>INFO</option><option>WARN</option><option>ERROR</option><option>CRITICAL</option>
          </select>
          <select className="input !w-52" value={type} onChange={e => setType(e.target.value)}>
            <option value="ALL">All event types</option>
            <option>ORDER_PLACED</option><option>ORDER_FILLED</option>
            <option>STRATEGY_START</option><option>SL_HIT</option><option>TARGET_HIT</option>
            <option>KILL_SWITCH</option><option>CIRCUIT_BREAKER</option>
            <option>LOGIN</option><option>RISK_LIMIT_EDIT</option>
          </select>
          <select className="input !w-32"><option>Last 24h</option><option>Last 7d</option><option>Last 30d</option><option>Custom</option></select>
        </div>

        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">ID</th><th className="table-th">Time (IST)</th>
              <th className="table-th">User</th><th className="table-th">Strategy</th>
              <th className="table-th">Event</th><th className="table-th">Severity</th>
              <th className="table-th">Data</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} className="hover-row">
                <td className="table-td font-mono text-xs">#{e.id}</td>
                <td className="table-td font-mono text-xs">{e.ts}</td>
                <td className="table-td">{e.user}</td>
                <td className="table-td font-mono text-xs">{e.strategy ? `#${e.strategy}` : "—"}</td>
                <td className="table-td font-mono text-xs">{e.type}</td>
                <td className="table-td">
                  <span className={
                    e.severity === "CRITICAL" ? "chip-red"
                    : e.severity === "ERROR" ? "chip-red"
                    : e.severity === "WARN" ? "chip-yellow"
                    : "chip-gray"
                  }>{e.severity}</span>
                </td>
                <td className="table-td font-mono text-[10px] text-[var(--muted)]">
                  {Object.entries(e.data).map(([k,v]) => `${k}=${v}`).join(" ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)] text-sm">No events match filters</div>
        )}
      </div>
    </div>
  );
}
