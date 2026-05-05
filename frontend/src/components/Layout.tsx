import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/stores/theme";
import {
  Activity, FileBarChart, Settings, Shield, LogOut, PlusCircle,
  LayoutDashboard, Sparkles, Monitor, Moon, Sun, Zap,
} from "lucide-react";
import { useMarket, useHealth } from "@/api/hooks";

export default function Layout() {
  const { user, brokerSession, logout } = useAuth();
  const nav = useNavigate();
  const onLogout = () => { logout(); nav("/login"); };

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
      isActive ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]"
               : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--ink)]"
    }`;

  return (
    <div className="h-full flex flex-col">
      {/* ── Top market strip ──────────────────────────────────────── */}
      <MarketStrip />

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className="w-60 border-r flex flex-col" style={{borderColor:"var(--border)", background:"var(--panel)"}}>
          <div className="p-5">
            <div className="font-bold text-lg text-[var(--ink)]">Theta Gainers</div>
            <div className="text-xs text-[var(--muted)] mt-1 flex gap-1">
              v1.0.0 <span className="chip-yellow">PAPER</span>
            </div>
          </div>
          <nav className="flex-1 px-3 space-y-1">
            <NavLink to="/" end className={link}><LayoutDashboard size={16}/>Dashboard</NavLink>
            <NavLink to="/trade" className={link}><PlusCircle size={16}/>Trade</NavLink>
            <NavLink to="/templates" className={link}><Sparkles size={16} className="opacity-70"/>Templates</NavLink>
            <NavLink to="/algos" className={link}><Zap size={16}/>Algos</NavLink>
            <NavLink to="/analytics" className={link}><Sparkles size={16}/>Analytics</NavLink>
            <NavLink to="/reports" className={link}><FileBarChart size={16}/>Reports</NavLink>
            <NavLink to="/settings" className={link}><Settings size={16}/>Settings</NavLink>
            {user?.role === "ADMIN" && (
              <NavLink to="/admin" className={link}><Shield size={16}/>Admin</NavLink>
            )}
          </nav>
          <div className="p-3 border-t space-y-3" style={{borderColor:"var(--border)"}}>
            <ThemeToggle />
            <div className="text-xs">
              <div className="text-[var(--muted)]">Signed in as</div>
              <div className="font-medium text-[var(--ink)]">{user?.username ?? "—"} <span className="text-[var(--muted)]">· {user?.role}</span></div>
            </div>
            <button onClick={onLogout} className="btn-ghost w-full flex items-center justify-center gap-2">
              <LogOut size={14}/> Logout
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-12 border-b px-6 flex items-center justify-end gap-2 text-xs"
                   style={{borderColor:"var(--border)", background:"var(--panel)"}}>
            {brokerSession ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium"
                    style={{color:"var(--success)", background:"color-mix(in srgb, var(--success) 10%, transparent)"}}>
                <Activity size={11}/> {brokerSession.broker.toUpperCase()} · {brokerSession.demat}
              </span>
            ) : (
              <span className="chip-red">No broker session</span>
            )}
            <span className="text-[var(--muted)]">·</span>
            <span className="text-[var(--muted)] font-mono">SEBI 0/8</span>
            <span className="text-[var(--muted)]">·</span>
            <span className="text-[var(--muted)] font-mono">OTR 2.1</span>
          </header>
          <div className="flex-1 overflow-auto p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function MarketStrip() {
  const { data: live } = useMarket();
  const nifty  = { value: live?.nifty_spot  ?? 24812.40, chg: +0.32 };
  const sensex = { value: live?.sensex_spot ?? 81204.15, chg: -0.12 };
  const bank   = { value: 55820.10, chg: +0.18 };
  const vix    = { value: live?.vix ?? 13.24, chg: live?.vix_change_pct ?? -1.8 };

  const news = live?.news_headlines?.map(n => `${n.src} · ${n.text}`) ?? [
    "NSE · India VIX eased to 13.2, lowest in 3 weeks",
    "Reuters · Fed minutes expected Wed; no change priced in",
    "SEBI · Algo-order tagging: OTR cap at 500 reminded for Apr expiry",
    "Mint · FPI flows turn positive for financials after RBI comments",
    "Quantsapp · NIFTY Max Pain at 24,800 for weekly expiry",
  ];

  return (
    <div className="border-b shrink-0" style={{borderColor:"var(--border)", background:"var(--panel-2)"}}>
      <div className="h-10 px-4 flex items-center gap-6 text-sm overflow-x-auto whitespace-nowrap scrollbar-thin">
        <Quote label="NIFTY"     v={nifty.value}  c={nifty.chg}/>
        <Quote label="SENSEX"    v={sensex.value} c={sensex.chg}/>
        <Quote label="BANKNIFTY" v={bank.value}   c={bank.chg}/>
        <Quote label="VIX"       v={vix.value}    c={vix.chg} tone="warn"/>
        <span className="h-5 w-px bg-[var(--border)] shrink-0"/>
        <KV k="MaxPain NIFTY"  v="24,800"/>
        <KV k="MaxPain SENSEX" v="81,000"/>
        <span className="h-5 w-px bg-[var(--border)] shrink-0"/>
        <KV k="FII" v="-₹842Cr" tone="down"/>
        <KV k="DII" v="+₹1,240Cr" tone="up"/>
        <KV k="PCR" v="1.11"/>
        <KV k="Exp Move" v="±186"/>
      </div>
      <div className="h-7 border-t overflow-hidden relative" style={{borderColor:"var(--border)"}}>
        <div className="ticker absolute top-0 left-0 items-center h-full text-xs text-[var(--muted)] px-4">
          {[...news, ...news].map((n, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"/> {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function KV({k, v, tone}: {k: string; v: string; tone?: "up"|"down"}) {
  const col = tone === "up" ? "var(--success)" : tone === "down" ? "var(--danger)" : "var(--ink)";
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span className="text-xs text-[var(--muted)]">{k}</span>
      <span className="font-mono text-xs" style={{color: col}}>{v}</span>
    </span>
  );
}

function Quote({label, v, c, tone}: {label: string; v: number; c: number; tone?: "warn"}) {
  const up = c >= 0;
  const color = tone === "warn" ? "var(--warn)" : up ? "var(--success)" : "var(--danger)";
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-[var(--muted)] text-xs">{label}</span>
      <span className="font-mono font-semibold">{v.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
      <span className="font-mono text-xs" style={{color}}>{up?"▲":"▼"}{Math.abs(c)}%</span>
    </div>
  );
}

function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const opts: Array<{k: "light"|"dark"|"system"; i: JSX.Element; l: string}> = [
    { k: "light",  i: <Sun size={14}/>,     l: "Light" },
    { k: "dark",   i: <Moon size={14}/>,    l: "Dark" },
    { k: "system", i: <Monitor size={14}/>, l: "System" },
  ];
  return (
    <div className="flex gap-1 p-1 rounded-lg border" style={{borderColor:"var(--border)"}}>
      {opts.map((o) => (
        <button key={o.k} onClick={() => setMode(o.k)}
                className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-xs transition ${
                  mode === o.k ? "text-[var(--accent)]" : "text-[var(--muted)]"
                }`}
                style={mode === o.k ? {background:"color-mix(in srgb, var(--accent) 15%, transparent)"} : {}}>
          {o.i}
        </button>
      ))}
    </div>
  );
}
