import { create } from "zustand";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { useEffect } from "react";

type Kind = "success" | "error" | "info" | "warn";
interface ToastMsg { id: number; kind: Kind; title: string; body?: string; ttl: number }

interface ToastState {
  items: ToastMsg[];
  push: (t: Omit<ToastMsg, "id" | "ttl"> & { ttl?: number }) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
export const useToast = create<ToastState>((set, get) => ({
  items: [],
  push: (t) => {
    const id = nextId++;
    const msg: ToastMsg = { id, kind: t.kind, title: t.title, body: t.body, ttl: t.ttl ?? 4000 };
    set((s) => ({ items: [...s.items, msg] }));
    setTimeout(() => get().dismiss(id), msg.ttl);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export function toast(kind: Kind, title: string, body?: string) {
  useToast.getState().push({ kind, title, body });
}

export default function Toaster() {
  const { items, dismiss } = useToast();
  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-80">
      {items.map((t) => <Item key={t.id} t={t} onClose={() => dismiss(t.id)}/>)}
    </div>
  );
}

function Item({t, onClose}: {t: ToastMsg; onClose: () => void}) {
  const color = t.kind === "success" ? "var(--success)"
               : t.kind === "error" ? "var(--danger)"
               : t.kind === "warn" ? "var(--warn)" : "var(--accent)";
  const Icon = t.kind === "success" ? CheckCircle2
             : t.kind === "error" ? XCircle
             : t.kind === "warn" ? AlertTriangle : Info;
  return (
    <div className="rounded-lg border p-3 flex items-start gap-3 shadow-lg"
         style={{background:"var(--panel)", borderColor: color}}>
      <Icon size={18} style={{color}} className="mt-0.5 shrink-0"/>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{t.title}</div>
        {t.body && <div className="text-xs text-[var(--muted)] mt-0.5">{t.body}</div>}
      </div>
      <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)]"><X size={14}/></button>
    </div>
  );
}
