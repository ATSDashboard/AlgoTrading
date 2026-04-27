import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, Power, PlusCircle, Sparkles, History, Settings, Shield, Activity } from "lucide-react";

const ACTIONS = [
  { id: "trade",     label: "Trade",                        hint: "Create multi-leg trade",          icon: PlusCircle, path: "/trade",              kbd: "N T" },
  { id: "dashboard", label: "Dashboard",                   hint: "P&L, margins, active strategies",icon: Activity,   path: "/",                   kbd: "G D" },
  { id: "analytics", label: "Deep OTM Analytics",          hint: "Strike recommendations + insights",icon: Sparkles, path: "/analytics",          kbd: "G A" },
  { id: "history",   label: "History",                     hint: "Past strategies + exports",      icon: History,    path: "/history",            kbd: "G H" },
  { id: "brokers",   label: "Settings → Brokers & Demats", hint: "Manage broker sessions",         icon: Settings,   path: "/settings/brokers" },
  { id: "risk",      label: "Settings → Risk & Limits",    hint: "Kill switches, caps",            icon: Shield,     path: "/settings/risk" },
  { id: "exec",      label: "Settings → Execution (OMS)",  hint: "Slicing, rate limits, re-quote", icon: Settings,   path: "/settings/execution" },
  { id: "kill-all",  label: "⚠ Kill All Strategies",       hint: "Halt all active — requires 2nd admin", icon: Power, path: "/admin", kbd: "⇧⌘K" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen((o) => !o); setQ(""); setIdx(0); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = ACTIONS.filter((a) =>
    !q || a.label.toLowerCase().includes(q.toLowerCase()) || a.hint.toLowerCase().includes(q.toLowerCase())
  );

  function run(i: number) {
    const a = filtered[i]; if (!a) return;
    nav(a.path); setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-24 p-4"
         style={{background:"rgba(0,0,0,0.55)"}} onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl rounded-xl border shadow-2xl"
           onClick={(e) => e.stopPropagation()}
           style={{background:"var(--panel)", borderColor:"var(--border)"}}>
        <div className="flex items-center gap-3 p-3 border-b" style={{borderColor:"var(--border)"}}>
          <Search size={16} className="text-[var(--muted)]"/>
          <input autoFocus placeholder="Type a command or search…"
                 value={q}
                 onChange={(e) => { setQ(e.target.value); setIdx(0); }}
                 onKeyDown={(e) => {
                   if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i+1, filtered.length-1)); }
                   if (e.key === "ArrowUp")   { e.preventDefault(); setIdx((i) => Math.max(i-1, 0)); }
                   if (e.key === "Enter")     { e.preventDefault(); run(idx); }
                 }}
                 className="flex-1 bg-transparent focus:outline-none text-sm"/>
          <kbd className="text-[10px] text-[var(--muted)] px-1.5 py-0.5 rounded border" style={{borderColor:"var(--border)"}}>ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-auto p-1">
          {filtered.map((a, i) => {
            const Icon = a.icon;
            const active = i === idx;
            return (
              <li key={a.id}>
                <button onClick={() => run(i)} onMouseEnter={() => setIdx(i)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left"
                        style={{background: active ? "var(--panel-2)" : "transparent"}}>
                  <Icon size={15} className="text-[var(--muted)] shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{a.label}</div>
                    <div className="text-[11px] text-[var(--muted)] truncate">{a.hint}</div>
                  </div>
                  {a.kbd && <kbd className="text-[10px] text-[var(--muted)] px-1.5 py-0.5 rounded border" style={{borderColor:"var(--border)"}}>{a.kbd}</kbd>}
                  {active && <ArrowRight size={14} className="text-[var(--accent)]"/>}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-[var(--muted)]">No commands match "{q}"</li>
          )}
        </ul>
        <div className="px-3 py-2 border-t text-[10px] text-[var(--muted)] flex gap-3"
             style={{borderColor:"var(--border)"}}>
          <span><kbd className="px-1 py-0.5 rounded border" style={{borderColor:"var(--border)"}}>↑↓</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 rounded border" style={{borderColor:"var(--border)"}}>↵</kbd> run</span>
          <span className="ml-auto">⌘K to open anywhere</span>
        </div>
      </div>
    </div>
  );
}
