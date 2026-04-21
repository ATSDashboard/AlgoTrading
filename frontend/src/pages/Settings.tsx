import { useState } from "react";
import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { useAuth } from "@/stores/auth";
import { Power } from "lucide-react";
import FormModal from "@/components/FormModal";
import ConfirmModal from "@/components/ConfirmModal";
import { toast } from "@/components/Toast";

const SUB: Array<[string, string]> = [
  ["profile", "Profile"],
  ["brokers", "Brokers & Demats"],
  ["risk", "Risk & Limits (Admin)"],
  ["execution", "Execution (OMS)"],
  ["defaults", "Strategy Defaults"],
  ["notify", "Notifications"],
  ["api-keys", "API Keys & Webhooks"],
  ["users", "Users & Roles (Admin)"],
  ["audit", "Audit & Compliance"],
  ["health", "System Health"],
];

export default function Settings() {
  return (
    <div className="flex gap-6">
      <nav className="w-56 shrink-0 space-y-1">
        {SUB.map(([p, l]) => (
          <NavLink key={p} to={p}
            className={({isActive}) => `block px-3 py-2 rounded-lg text-sm ${
              isActive ? "bg-accent/15 text-accent" : "text-muted hover:bg-panel hover:text-ink"
            }`}>{l}</NavLink>
        ))}
      </nav>
      <div className="flex-1 min-w-0">
        <Routes>
          <Route path="/" element={<Navigate to="profile" replace/>}/>
          <Route path="profile" element={<Profile/>} />
          <Route path="brokers" element={<Brokers/>} />
          <Route path="risk" element={<Risk/>} />
          <Route path="execution" element={<Execution/>} />
          <Route path="defaults" element={<Defaults/>} />
          <Route path="notify" element={<Notify/>} />
          <Route path="api-keys" element={<APIKeys/>} />
          <Route path="users" element={<Users/>} />
          <Route path="audit" element={<Audit/>} />
          <Route path="health" element={<Health/>} />
        </Routes>
      </div>
    </div>
  );
}

function Profile() {
  const user = useAuth((s) => s.user);
  const [modal, setModal] = useState<null|"password"|"2fa">(null);
  return (
    <div className="card space-y-4 max-w-lg">
      <h2 className="font-semibold">Profile</h2>
      <Row label="Username"><div className="font-mono">{user?.username}</div></Row>
      <Row label="Role"><span className="chip-blue">{user?.role}</span></Row>
      <Row label="2FA"><span className={user?.totp_enabled ? "chip-green" : "chip-yellow"}>
        {user?.totp_enabled ? "Enrolled" : "Not enrolled — REQUIRED"}</span></Row>
      <div className="border-t pt-4 space-y-3" style={{borderColor:"var(--border)"}}>
        <button className="btn-ghost" onClick={() => setModal("password")}>Change password</button>
        <button className="btn-ghost ml-2" onClick={() => setModal("2fa")}>
          {user?.totp_enabled ? "Reset 2FA" : "Enroll 2FA now"}
        </button>
      </div>

      <FormModal open={modal==="password"} title="Change password"
        fields={[
          {name:"current", label:"Current password", type:"password", required:true},
          {name:"next", label:"New password (min 12 chars)", type:"password", required:true},
          {name:"confirm", label:"Confirm new password", type:"password", required:true},
        ]}
        submitLabel="Update password"
        onSubmit={(v) => {
          if (v.next !== v.confirm) { toast("error","Passwords don't match"); return; }
          if (v.next.length < 12) { toast("error","Min 12 characters"); return; }
          setModal(null); toast("success","Password updated · logout from other sessions to take effect");
        }}
        onCancel={() => setModal(null)}/>

      <ConfirmModal open={modal==="2fa"} tone="warn"
        title={user?.totp_enabled ? "Reset 2FA?" : "Enroll 2FA"}
        body={<p>You'll be shown a new QR code. Scan it with Google Authenticator / Authy. Requires verification with a 6-digit code before the change takes effect.</p>}
        confirmLabel="Start enrollment"
        onConfirm={() => {setModal(null); toast("info","QR code generated — check your authenticator app");}}
        onCancel={() => setModal(null)}/>
    </div>
  );
}

function Brokers() {
  const [modal, setModal] = useState<null|"add"|"edit"|"demat">(null);
  const [editingBroker, setEditingBroker] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Brokers & Demats</h2>
        <button className="btn-primary" onClick={() => setModal("add")}>+ Add Broker</button>
      </div>
      <FormModal open={modal==="add"} title="Add Broker"
        description="Register a new broker account. You'll be prompted to connect the session separately."
        fields={[
          {name:"broker", label:"Broker", type:"select", required:true,
           options:["Axis Direct (RAPID)","Zerodha (Kite)","Monarch Networth","JM Financial (Blink)","Paper Broker"]},
          {name:"label", label:"Label (nickname for this account)", type:"text", required:true, placeholder:"e.g., Main trading account"},
          {name:"client_id", label:"Client ID", type:"text", required:true},
          {name:"api_key", label:"API Key", type:"password", required:true},
          {name:"api_secret", label:"API Secret", type:"password", required:true},
        ]}
        submitLabel="Add broker"
        onSubmit={(v) => {setModal(null); toast("success",`${v.broker} added`, "Now connect the session from Connect Broker page");}}
        onCancel={() => setModal(null)}/>
      <FormModal open={modal==="edit"} title={`Edit ${editingBroker}`}
        fields={[
          {name:"label", label:"Label", type:"text"},
          {name:"api_key", label:"Rotate API Key (optional)", type:"password"},
          {name:"api_secret", label:"Rotate API Secret (optional)", type:"password"},
        ]}
        submitLabel="Save changes"
        onSubmit={() => {setModal(null); toast("success","Broker config updated");}}
        onCancel={() => setModal(null)}/>
      {[
        {name:"Axis Direct (RAPID)", client:"AX****23", dematss:[{n:"1234567890",l:"Rohan Individual",cap:"₹25L",dcap:"₹5L/day"},
                                                             {n:"9876543210",l:"Rohan HUF",cap:"₹10L",dcap:"₹2L/day"}]},
        {name:"Zerodha (Kite)", client:"ZD****45", dematss:[{n:"ZD12345",l:"Rohan — Kite",cap:"₹15L",dcap:"₹3L/day"}]},
      ].map((b, i) => (
        <div key={i} className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-semibold">{b.name}</div>
              <div className="text-xs text-muted">Client: {b.client} · session exp: 7h 42m</div>
            </div>
            <div className="flex gap-2"><span className="chip-green">Active</span>
              <button className="btn-ghost" onClick={() => {setEditingBroker(b.name); setModal("edit");}}>Edit</button></div>
          </div>
          <div className="text-xs text-muted mb-1">Demats:</div>
          <ul className="text-sm space-y-1">
            {b.dematss.map((d) => (
              <li key={d.n} className="font-mono flex gap-4 text-xs">
                <span>{d.n}</span><span className="text-muted">{d.l}</span>
                <span className="text-muted">capital {d.cap}</span>
                <span className="text-warn">cap {d.dcap}</span>
              </li>
            ))}
          </ul>
          <div className="text-xs text-muted mt-3">Health: 14ms avg · 99.8% success · 0 rejects (24h)</div>
        </div>
      ))}

      <div className="card">
        <h3 className="font-semibold mb-3">Smart Order Routing</h3>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked/> Split orders across demats by free margin</label>
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked/> Prefer lowest-latency broker for entry</label>
          <label className="flex items-center gap-2"><input type="checkbox"/> Fallback to secondary broker on primary failure</label>
        </div>
      </div>
    </div>
  );
}

function Risk() {
  const [dirty, setDirty] = useState(false);
  const [v, setV] = useState({
    // Global
    dailyLossGlobal: 100000, openRiskGlobal: 500000, activeMax: 25, opsSecGlobal: 20,
    // Per-user
    lotsCap: 10, dailyLossUser: 50000, orderSec: 8, otrHalt: 100,
    circuitErrors: 3, coolingOff: 30,
    // Kill switches (ALL configurable)
    deadmanSec: 120, deadmanEnabled: true,
    mtmDdKill: 40, mtmDdEnabled: true,
    timeExit: "15:15", timeExitEnabled: true,
    consecutiveSL: 3, consecutiveSLEnabled: true,
    vixSpikeKill: 25, vixSpikeEnabled: true,
    brokerDownKill: 60, brokerDownEnabled: true,
    marginUsagePct: 90, marginUsageEnabled: true,
    // Per strategy template
    fatFinger: 500, minPremium: 1, maxSpread: 5, minOI: 10000, maxSlippage: 1,
    // 2-person approval
    twoPersonLots: 5, twoPersonEnabled: true,
  });
  const upd = (patch: Partial<typeof v>) => { setV({...v, ...patch}); setDirty(true); };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Risk & Limits (Admin)</h2>
        <span className="chip-yellow">Changes require 2nd admin approval</span>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">GLOBAL (firm-wide)</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <EditRow label="Max daily loss (₹)" suffix="" val={v.dailyLossGlobal} onChange={(x) => upd({dailyLossGlobal: +x})}/>
          <EditRow label="Max open risk (₹)" val={v.openRiskGlobal} onChange={(x) => upd({openRiskGlobal: +x})}/>
          <EditRow label="Max active strategies" val={v.activeMax} onChange={(x) => upd({activeMax: +x})}/>
          <EditRow label="Max orders/sec (firm)" val={v.opsSecGlobal} onChange={(x) => upd({opsSecGlobal: +x})}/>
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">PER USER · Rohan</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <EditRow label="Max lots / strategy" val={v.lotsCap} onChange={(x) => upd({lotsCap: +x})}/>
          <EditRow label="Max daily loss (₹)" val={v.dailyLossUser} onChange={(x) => upd({dailyLossUser: +x})}/>
          <EditRow label="Order rate cap (/sec)" suffix={<span className="text-[var(--muted)] text-xs">SEBI≤10</span>}
                   val={v.orderSec} onChange={(x) => upd({orderSec: +x})}/>
          <EditRow label="OTR halt threshold" val={v.otrHalt} onChange={(x) => upd({otrHalt: +x})}/>
          <EditRow label="Circuit: consecutive errors" val={v.circuitErrors} onChange={(x) => upd({circuitErrors: +x})}/>
          <EditRow label="Cooling-off after halt (min)" val={v.coolingOff} onChange={(x) => upd({coolingOff: +x})}/>
        </div>
      </div>

      {/* ── AUTO-KILL SWITCHES — all configurable ──────────────────────── */}
      <div className="card space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Power size={16}/> Auto-Kill Switches
        </h3>
        <div className="text-xs text-[var(--muted)] mb-2">
          Each switch can be enabled/disabled independently. When triggered, engine squares off positions + halts user.
        </div>
        <KillSwitch label="Dead-Man Switch" hint="If UI heartbeat missed for N seconds (min 60)"
                    enabled={v.deadmanEnabled} onToggle={(e) => upd({deadmanEnabled: e})}
                    val={v.deadmanSec} suffix="seconds" onChange={(x) => upd({deadmanSec: +x})}
                    policy="required" onPolicy={() => {}}/>
        <KillSwitch label="MTM Drawdown Kill" hint="Halt strategy if % drop from peak P&L exceeds"
                    enabled={v.mtmDdEnabled} onToggle={(e) => upd({mtmDdEnabled: e})}
                    val={v.mtmDdKill} suffix="% from peak" onChange={(x) => upd({mtmDdKill: +x})}
                    policy="optional" onPolicy={() => {}}/>
        <KillSwitch label="Time-based Exit" hint="Auto square-off at IST time (regardless of P&L)"
                    enabled={v.timeExitEnabled} onToggle={(e) => upd({timeExitEnabled: e})}
                    val={v.timeExit} suffix="IST" onChange={(x) => upd({timeExit: x})}
                    policy="required" onPolicy={() => {}}/>
        <KillSwitch label="Stop Loss" hint="Hard SL in ₹ — exit when loss exceeds"
                    enabled={true} onToggle={() => {}}
                    val={3000} suffix="₹" onChange={() => {}}
                    policy="optional" onPolicy={() => {}}/>
        <KillSwitch label="Target Profit" hint="Exit when profit reaches ₹"
                    enabled={true} onToggle={() => {}}
                    val={2000} suffix="₹" onChange={() => {}}
                    policy="optional" onPolicy={() => {}}/>
        <KillSwitch label="Trailing SL" hint="Move SL up as profit grows"
                    enabled={true} onToggle={() => {}}
                    val={500} suffix="₹ step" onChange={() => {}}
                    policy="optional" onPolicy={() => {}}/>
        <KillSwitch label="Lock-in Profits" hint="Move SL to breakeven after profit ≥ threshold"
                    enabled={true} onToggle={() => {}}
                    val={1500} suffix="₹" onChange={() => {}}
                    policy="optional" onPolicy={() => {}}/>
        <KillSwitch label="Consecutive SL Kill" hint="Halt user after N consecutive SL hits today"
                    enabled={v.consecutiveSLEnabled} onToggle={(e) => upd({consecutiveSLEnabled: e})}
                    val={v.consecutiveSL} suffix="SL hits" onChange={(x) => upd({consecutiveSL: +x})}
                    policy="optional" onPolicy={() => {}}/>
        <KillSwitch label="VIX Spike Kill" hint="Halt if VIX moves X% intraday (systemic shock)"
                    enabled={v.vixSpikeEnabled} onToggle={(e) => upd({vixSpikeEnabled: e})}
                    val={v.vixSpikeKill} suffix="% VIX move" onChange={(x) => upd({vixSpikeKill: +x})}
                    policy="optional" onPolicy={() => {}}/>
        <KillSwitch label="Broker Down Kill" hint="Square-off if broker API fails for N seconds"
                    enabled={v.brokerDownEnabled} onToggle={(e) => upd({brokerDownEnabled: e})}
                    val={v.brokerDownKill} suffix="seconds" onChange={(x) => upd({brokerDownKill: +x})}
                    policy="optional" onPolicy={() => {}}/>
        <KillSwitch label="Margin Usage Kill" hint="Halt new orders when margin usage exceeds"
                    enabled={v.marginUsageEnabled} onToggle={(e) => upd({marginUsageEnabled: e})}
                    val={v.marginUsagePct} suffix="% of available" onChange={(x) => upd({marginUsagePct: +x})}
                    policy="optional" onPolicy={() => {}}/>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">PER STRATEGY TEMPLATE</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <EditRow label="Max fat-finger combined (₹)" val={v.fatFinger} onChange={(x) => upd({fatFinger: +x})}/>
          <EditRow label="Min premium (illiquid guard)" val={v.minPremium} onChange={(x) => upd({minPremium: +x})}/>
          <EditRow label="Max bid-ask spread (%)" val={v.maxSpread} onChange={(x) => upd({maxSpread: +x})}/>
          <EditRow label="Min OI per leg" val={v.minOI} onChange={(x) => upd({minOI: +x})}/>
          <EditRow label="Max slippage from quote (%)" val={v.maxSlippage} onChange={(x) => upd({maxSlippage: +x})}/>
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">Two-Person Approval</h3>
        <KillSwitch label="Require 2nd admin approval" hint="Triggers when lot count ≥ threshold"
                    enabled={v.twoPersonEnabled} onToggle={(e) => upd({twoPersonEnabled: e})}
                    val={v.twoPersonLots} suffix="lots" onChange={(x) => upd({twoPersonLots: +x})}/>
      </div>

      <div className="flex gap-2 justify-end sticky bottom-0 py-3" style={{background: "var(--bg)"}}>
        <button className="btn-ghost" disabled={!dirty} onClick={() => setDirty(false)}>Reset</button>
        <button className="btn-primary" disabled={!dirty}
                onClick={() => {setDirty(false); toast("success","Approval request submitted", "Pending 2nd-admin review in Admin → Approvals");}}>
          Request Change (→ 2nd admin)
        </button>
      </div>
    </div>
  );
}

function EditRow({label, val, suffix, onChange}:
  {label: string; val: any; suffix?: React.ReactNode; onChange: (v: any) => void}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-1.5" style={{borderColor:"var(--border)"}}>
      <span className="text-[var(--muted)] flex-1">{label}</span>
      <input className="input !py-1 !w-28 font-mono text-right text-sm" value={val} onChange={(e) => onChange(e.target.value)}/>
      {suffix && <span className="text-xs text-[var(--muted)] w-20">{suffix}</span>}
    </div>
  );
}

function KillSwitch({label, hint, enabled, onToggle, val, suffix, onChange, policy, onPolicy}:
  {label: string; hint: string; enabled: boolean; onToggle: (v: boolean) => void;
   val: any; suffix: string; onChange: (v: any) => void;
   policy?: "required"|"optional"|"disabled"; onPolicy?: (p: "required"|"optional"|"disabled") => void}) {
  return (
    <div className="flex items-center justify-between gap-3 p-2 rounded-lg" style={{background:"var(--panel-2)"}}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button onClick={() => onToggle(!enabled)}
                className="w-9 h-5 rounded-full relative transition shrink-0"
                style={{background: enabled ? "var(--accent)" : "var(--border)"}}>
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${enabled ? "translate-x-4" : ""}`}/>
        </button>
        <div className="min-w-0">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-[11px] text-[var(--muted)] truncate">{hint}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onPolicy && (
          <select className="input !py-1 !w-24 text-[10px]" value={policy ?? "optional"}
                  onChange={(e) => onPolicy(e.target.value as any)}
                  title="Required = user cannot disable this. Optional = user chooses. Disabled = hidden from strategy form.">
            <option value="required">Required</option>
            <option value="optional">Optional</option>
            <option value="disabled">Disabled</option>
          </select>
        )}
        <input className="input !py-1 !w-24 font-mono text-right text-sm" value={val}
               disabled={!enabled || policy === "disabled"} onChange={(e) => onChange(e.target.value)}/>
        <span className="text-xs text-[var(--muted)] w-20">{suffix}</span>
      </div>
    </div>
  );
}

function Grid({items}: {items: Array<[string, string]>}) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b pb-1.5" style={{borderColor:"var(--border)"}}>
          <dt className="text-[var(--muted)]">{k}</dt><dd className="font-mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Defaults() {
  return <div className="card"><h2 className="font-semibold">Strategy Defaults</h2>
    <p className="text-sm text-[var(--muted)] mt-2">Default SL%, buffer%, square-off time, lot caps. Editable by Admin.</p></div>;
}

function Execution() {
  const [v, setV] = useState({
    niftyFreeze: 1800, sensexFreeze: 1000, jitterMs: 100,
    niftyLot: 65, sensexLot: 20,
    orderSecUser: 8, orderSecGlobal: 20,
    maxQtyPerOrder: 1800, maxOrdersPerStrategy: 20,
    pegWaitSec: 3, maxRequotes: 3, maxSlippagePct: 1.0,
    tickSize: 0.05,
    maxBidAskSpread: 5, minOI: 10000, minVolume: 100, marginSafetyPct: 20,
  });
  const upd = (p: Partial<typeof v>) => setV({...v, ...p});

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="font-semibold">Execution (OMS)</h2>
        <p className="text-sm text-[var(--muted)] mt-1">Slicing, rate limits, re-quote behavior, liquidity guards</p>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold flex items-center gap-2">Iceberg / Order Slicing
          <span className="chip-yellow">exchange-enforced</span></h3>
        <div className="text-xs text-[var(--muted)]">
          NSE/BSE freeze qty — any single order above this is rejected. Engine auto-slices with jitter between child orders.
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <EditRow label="NIFTY freeze qty (units/order)" val={v.niftyFreeze} onChange={(x) => upd({niftyFreeze: +x})}/>
          <EditRow label="SENSEX freeze qty (units/order)" val={v.sensexFreeze} onChange={(x) => upd({sensexFreeze: +x})}/>
          <EditRow label="NIFTY lot size" val={v.niftyLot} onChange={(x) => upd({niftyLot: +x})}/>
          <EditRow label="SENSEX lot size" val={v.sensexLot} onChange={(x) => upd({sensexLot: +x})}/>
          <EditRow label="Jitter between slices (ms)"
                   suffix={<span className="text-xs text-[var(--muted)]">SEBI rate safety</span>}
                   val={v.jitterMs} onChange={(x) => upd({jitterMs: +x})}/>
          <EditRow label="Tick size (₹)" val={v.tickSize} onChange={(x) => upd({tickSize: +x})}/>
        </div>
        <div className="text-[11px] text-[var(--muted)] border-t pt-2" style={{borderColor:"var(--border)"}}>
          <b>Protocol:</b> place parent → wait jitter ms → place next child. client_ref_id is deterministic per (strategy, leg, slice, attempt) — broker-level idempotent on retry. SHA256 hash chain stamped on every child for tamper-evident audit.
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">Order Rate Limits
          <span className="chip-yellow ml-2">SEBI ≤10/sec non-institutional</span></h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <EditRow label="Max orders/sec (per user)"
                   suffix={<span className="text-xs text-[var(--muted)]">hard cap &lt;10</span>}
                   val={v.orderSecUser} onChange={(x) => upd({orderSecUser: +x})}/>
          <EditRow label="Max orders/sec (firm-wide)" val={v.orderSecGlobal} onChange={(x) => upd({orderSecGlobal: +x})}/>
          <EditRow label="Max qty per order (units)"
                   suffix={<span className="text-xs text-[var(--muted)]">fat-finger</span>}
                   val={v.maxQtyPerOrder} onChange={(x) => upd({maxQtyPerOrder: +x})}/>
          <EditRow label="Max orders per strategy" val={v.maxOrdersPerStrategy} onChange={(x) => upd({maxOrdersPerStrategy: +x})}/>
        </div>
        <div className="text-[11px] text-[var(--muted)] border-t pt-2" style={{borderColor:"var(--border)"}}>
          Token bucket in Redis. Over-cap orders queue up to 1.5s then reject with <code>SEBIRateLimitExceeded</code>.
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">Peg / Re-quote Engine</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <EditRow label="Wait before first re-quote (s)" val={v.pegWaitSec} onChange={(x) => upd({pegWaitSec: +x})}/>
          <EditRow label="Max re-quote attempts" val={v.maxRequotes} onChange={(x) => upd({maxRequotes: +x})}/>
          <EditRow label="Max cumulative slippage (%)" val={v.maxSlippagePct} onChange={(x) => upd({maxSlippagePct: +x})}/>
        </div>
        <div className="text-[11px] text-[var(--muted)] border-t pt-2" style={{borderColor:"var(--border)"}}>
          Unfilled LIMITs get their price moved 1 tick toward bid (SELL) or ask (BUY) every wait period. Gives up at max attempts OR slippage cap. Never converts to MARKET on options.
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">Liquidity Guards (pre-trade)</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <EditRow label="Max bid-ask spread (% of LTP)" val={v.maxBidAskSpread} onChange={(x) => upd({maxBidAskSpread: +x})}/>
          <EditRow label="Min OI per leg" val={v.minOI} onChange={(x) => upd({minOI: +x})}/>
          <EditRow label="Min daily volume per leg" val={v.minVolume} onChange={(x) => upd({minVolume: +x})}/>
          <EditRow label="Margin safety buffer (%)"
                   suffix={<span className="text-xs text-[var(--muted)]">keep free after trade</span>}
                   val={v.marginSafetyPct} onChange={(x) => upd({marginSafetyPct: +x})}/>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={() => toast("info","Reset to env defaults")}>Reset to defaults</button>
        <button className="btn-primary"
                onClick={() => toast("success","Approval request submitted", "Changes take effect after 2nd admin approves")}>
          Save (2nd admin approval)
        </button>
      </div>
    </div>
  );
}

function Notify() {
  return (
    <div className="card space-y-4 max-w-lg">
      <h2 className="font-semibold">Notifications</h2>
      <Row label="WhatsApp"><input className="input" defaultValue="+91 98XXX 12345"/></Row>
      <Row label="Telegram chat ID"><input className="input" defaultValue=""/></Row>
      <Row label="Email"><input className="input" defaultValue="rohan@thetagainers.in"/></Row>
      <Row label="SMS (critical)"><input className="input" defaultValue="+91 98XXX 12345"/></Row>
      <Row label="Phone call (circuit break)"><input className="input" defaultValue="+91 98XXX 12345"/></Row>
      <div className="border-t pt-3 flex gap-2" style={{borderColor:"var(--border)"}}>
        <button className="btn-ghost" onClick={() => toast("info","Test WhatsApp sent","Check your WhatsApp in next 30s")}>Test WhatsApp</button>
        <button className="btn-ghost" onClick={() => toast("info","Test email sent","Check inbox + spam")}>Test Email</button>
        <button className="btn-ghost" onClick={() => toast("info","Test SMS sent","Usually arrives within 60s")}>Test SMS</button>
      </div>
    </div>
  );
}

function APIKeys() {
  return <div className="card"><h2 className="font-semibold">API Keys & Webhooks</h2>
    <p className="text-sm text-muted mt-2">Scoped personal API keys, TradingView webhook URL (Phase 2).</p></div>;
}

function Users() {
  const [inviteOpen, setInviteOpen] = useState(false);
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Users & Roles</h2>
        <button className="btn-primary" onClick={() => setInviteOpen(true)}>+ Invite User</button>
      </div>
      <FormModal open={inviteOpen} title="Invite user"
        description="They'll receive an email with a sign-up link. They set password + enrol 2FA on first login."
        fields={[
          {name:"username", label:"Username", type:"text", required:true, placeholder:"rohan.jr"},
          {name:"email", label:"Email", type:"email", required:true, placeholder:"person@thetagainers.in"},
          {name:"phone", label:"Phone (for SMS/voice alerts)", type:"tel", placeholder:"+91 98XXX 12345"},
          {name:"role", label:"Role", type:"select", required:true,
           options:["ADMIN","TRADER","VIEWER","AUDITOR","RISK_OFFICER"]},
          {name:"demat_access", label:"Demats to grant access", type:"select",
           options:["All demats (admin only)","Select specific demats after invite"],
           defaultValue:"Select specific demats after invite",
           help:"After invite accepted, assign demats in this same page"},
        ]}
        submitLabel="Send invite"
        onSubmit={(v) => {setInviteOpen(false); toast("success",`Invite sent to ${v.email}`,`Role: ${v.role}`);}}
        onCancel={() => setInviteOpen(false)}/>
      <table className="w-full">
        <thead><tr><th className="table-th">Username</th><th className="table-th">Role</th>
          <th className="table-th">2FA</th><th className="table-th">Last Login</th></tr></thead>
        <tbody>
          <tr><td className="table-td font-mono">admin</td><td className="table-td"><span className="chip-blue">ADMIN</span></td>
            <td className="table-td"><span className="chip-green">✓</span></td><td className="table-td">09:14 today</td></tr>
          <tr><td className="table-td font-mono">rohan</td><td className="table-td"><span className="chip-gray">TRADER</span></td>
            <td className="table-td"><span className="chip-green">✓</span></td><td className="table-td">09:12 today</td></tr>
          <tr><td className="table-td font-mono">risk.officer</td><td className="table-td"><span className="chip-yellow">RISK_OFFICER</span></td>
            <td className="table-td"><span className="chip-green">✓</span></td><td className="table-td">Yesterday</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Audit() {
  return <div className="card"><h2 className="font-semibold">Audit & Compliance</h2>
    <p className="text-sm text-muted mt-2">Hash-chained immutable log. Filter by strategy/user/event. SEBI algo-ID tagging.</p></div>;
}

function Health() {
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card">
        <h2 className="font-semibold mb-3">Broker Latency</h2>
        {[
          {b:"Paper",level:"98%","lat":"2ms"},
          {b:"Axis Direct",level:"99.8%","lat":"14ms"},
          {b:"Zerodha",level:"99.5%","lat":"22ms"},
        ].map((r) => (
          <div key={r.b} className="flex justify-between text-sm border-b border-border/50 py-1.5">
            <span>{r.b}</span>
            <span className="text-muted">success {r.level} · avg {r.lat}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <h2 className="font-semibold mb-3">System</h2>
        <Grid items={[
          ["DB size","248 MB"],["Redis memory","42 MB"],
          ["Worker status","● running"],["Queue depth","0"],
          ["Audit log entries","1,284,091"],["Last EOD recon","16:04 yesterday · Clean"],
        ]}/>
      </div>
    </div>
  );
}

function Row({label, children}: {label: string; children: React.ReactNode}) {
  return <div className="flex items-center justify-between">
    <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
    <div className="max-w-xs">{children}</div>
  </div>;
}
