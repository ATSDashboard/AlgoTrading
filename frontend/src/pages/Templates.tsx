import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, Copy, Edit3, Trash2, Play, Star } from "lucide-react";
import FormModal from "@/components/FormModal";
import ConfirmModal from "@/components/ConfirmModal";
import { toast } from "@/components/Toast";

interface Tpl { id:number; name:string; kind:string; legs:number; mode:string; lastUsed:string; winRate:number|null; avgPnl:number|null; favorite:boolean }

const INITIAL: Tpl[] = [
  {id:1, name:"Weekly Tier 1 Strangle",   kind:"SHORT_STRANGLE", legs:2, mode:"Tier 1 (auto)",      lastUsed:"Yesterday", winRate:95, avgPnl:1240, favorite:true},
  {id:2, name:"Monthly Iron Condor",       kind:"IRON_CONDOR",    legs:4, mode:"Distance 2%",         lastUsed:"5d ago",    winRate:82, avgPnl:980,  favorite:true},
  {id:3, name:"Expiry Day Straddle",       kind:"SHORT_STRADDLE", legs:2, mode:"Delta 0.50 (ATM)",    lastUsed:"2w ago",    winRate:62, avgPnl:-150, favorite:false},
  {id:4, name:"Bull Put (Defensive)",      kind:"BULL_PUT",       legs:2, mode:"Delta 0.15 + hedge",  lastUsed:"3w ago",    winRate:88, avgPnl:680,  favorite:false},
  {id:5, name:"High Capital Efficiency",   kind:"SHORT_STRANGLE", legs:2, mode:"Premium / ₹1Cr ≥ 3L", lastUsed:"Never",     winRate:null,avgPnl:null, favorite:false},
];

export default function Templates() {
  const nav = useNavigate();
  const [tpls, setTpls] = useState<Tpl[]>(INITIAL);
  const [newOpen, setNewOpen] = useState(false);
  const [editId, setEditId] = useState<number|null>(null);
  const [deleteId, setDeleteId] = useState<number|null>(null);

  const toggleFav = (id: number) =>
    setTpls(tpls.map(t => t.id === id ? {...t, favorite: !t.favorite} : t));

  const duplicate = (id: number) => {
    const src = tpls.find(t => t.id === id); if (!src) return;
    const newT: Tpl = {...src, id: Math.max(...tpls.map(t=>t.id))+1, name: src.name + " (copy)", lastUsed: "Never", favorite: false};
    setTpls([...tpls, newT]); toast("success","Template duplicated", newT.name);
  };

  const apply = (id: number) => {
    const t = tpls.find(x => x.id === id);
    toast("success","Applied to Trade", `"${t?.name}" loaded`); nav("/trade");
  };

  const editing = tpls.find(t => t.id === editId);
  const deleting = tpls.find(t => t.id === deleteId);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Strategy Templates</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">Reusable multi-leg rule sets · applied from Trade page</p>
        </div>
        <button className="btn-primary btn-sm flex items-center gap-1" onClick={() => setNewOpen(true)}>
          <Save size={13}/>New Template
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">★</th>
              <th className="table-th">Name</th>
              <th className="table-th">Kind</th>
              <th className="table-th">Legs</th>
              <th className="table-th">Selection</th>
              <th className="table-th">Last Used</th>
              <th className="table-th">Win Rate</th>
              <th className="table-th">Avg P&L</th>
              <th className="table-th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tpls.map(t => (
              <tr key={t.id} className="hover-row">
                <td className="table-td">
                  <button onClick={() => toggleFav(t.id)} title="Toggle favourite">
                    <Star size={14} className={t.favorite ? "text-[var(--warn)] fill-current" : "text-[var(--muted)] hover:text-[var(--ink)]"}/>
                  </button>
                </td>
                <td className="table-td font-medium">{t.name}</td>
                <td className="table-td"><span className="chip-gray">{t.kind}</span></td>
                <td className="table-td font-mono">{t.legs}</td>
                <td className="table-td text-xs text-[var(--muted)]">{t.mode}</td>
                <td className="table-td text-xs text-[var(--muted)]">{t.lastUsed}</td>
                <td className="table-td font-mono">
                  {t.winRate != null
                    ? <span className={t.winRate >= 80 ? "text-[var(--success)]" : t.winRate >= 60 ? "text-[var(--warn)]" : "text-[var(--danger)]"}>{t.winRate}%</span>
                    : <span className="text-[var(--muted)]">—</span>}
                </td>
                <td className="table-td font-mono">
                  {t.avgPnl != null
                    ? <span className={t.avgPnl >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                        {t.avgPnl >= 0 ? "+" : ""}₹{Math.abs(t.avgPnl).toLocaleString("en-IN")}
                      </span>
                    : <span className="text-[var(--muted)]">—</span>}
                </td>
                <td className="table-td text-right">
                  <div className="flex gap-0.5 justify-end">
                    <button title="Apply in Trade" className="p-1.5 text-[var(--accent)] hover:bg-[var(--panel-2)] rounded"
                            onClick={() => apply(t.id)}><Play size={12}/></button>
                    <button title="Duplicate" className="p-1.5 text-[var(--muted)] hover:text-[var(--ink)] rounded"
                            onClick={() => duplicate(t.id)}><Copy size={12}/></button>
                    <button title="Edit" className="p-1.5 text-[var(--muted)] hover:text-[var(--ink)] rounded"
                            onClick={() => setEditId(t.id)}><Edit3 size={12}/></button>
                    <button title="Delete" className="p-1.5 text-[var(--muted)] hover:text-[var(--danger)] rounded"
                            onClick={() => setDeleteId(t.id)}><Trash2 size={12}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormModal open={newOpen} title="New strategy template"
        description="Saves the current Trade page config as a reusable template."
        fields={[
          {name:"name", label:"Name", type:"text", required:true, placeholder:"Weekly Deep OTM v2"},
          {name:"kind", label:"Kind", type:"select", required:true,
           options:["SHORT_STRANGLE","SHORT_STRADDLE","IRON_CONDOR","BULL_PUT","BEAR_CALL","CUSTOM"]},
          {name:"description", label:"Description / notes", type:"textarea"},
        ]}
        submitLabel="Create template"
        onSubmit={(v) => {
          const id = Math.max(...tpls.map(t=>t.id))+1;
          setTpls([...tpls, {id, name:v.name, kind:v.kind, legs:2, mode:"Custom", lastUsed:"Never", winRate:null, avgPnl:null, favorite:false}]);
          setNewOpen(false); toast("success","Template created", v.name);
        }}
        onCancel={() => setNewOpen(false)}/>

      <FormModal open={editId !== null} title={`Edit "${editing?.name ?? ""}"`}
        fields={[
          {name:"name", label:"Name", type:"text", required:true, defaultValue: editing?.name ?? ""},
          {name:"description", label:"Description", type:"textarea"},
        ]}
        submitLabel="Save"
        onSubmit={(v) => {
          setTpls(tpls.map(t => t.id === editId ? {...t, name: v.name} : t));
          setEditId(null); toast("success","Template updated");
        }}
        onCancel={() => setEditId(null)}/>

      <ConfirmModal open={deleteId !== null} tone="danger"
        title="Delete template?"
        body={<p>Permanently delete <b>{deleting?.name}</b>? Historical runs that used it are preserved.</p>}
        confirmLabel="Delete"
        onConfirm={() => {
          setTpls(tpls.filter(t => t.id !== deleteId));
          setDeleteId(null); toast("warn","Template deleted");
        }}
        onCancel={() => setDeleteId(null)}/>
    </div>
  );
}
