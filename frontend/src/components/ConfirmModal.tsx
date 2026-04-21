import { useEffect } from "react";
import { AlertTriangle, X, CheckCircle2 } from "lucide-react";

export interface ConfirmProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  tone?: "danger" | "warn" | "info";
  confirmLabel?: string;
  cancelLabel?: string;
  holdToConfirm?: boolean;   // requires 2s press-and-hold (for KILL)
  typeToConfirm?: string;    // requires typing this exact phrase
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal(p: ConfirmProps) {
  useEffect(() => {
    if (!p.open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") p.onCancel(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [p.open, p.onCancel]);

  if (!p.open) return null;
  const tone = p.tone ?? "info";
  const col = tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : "var(--accent)";
  const Icon = tone === "info" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{background: "rgba(0,0,0,0.6)"}}
         onClick={p.onCancel}>
      <div className="max-w-md w-full rounded-xl border p-5 space-y-4"
           onClick={(e) => e.stopPropagation()}
           style={{background: "var(--panel)", borderColor: "var(--border)"}}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                 style={{background: `color-mix(in srgb, ${col} 15%, transparent)`}}>
              <Icon size={20} style={{color: col}}/>
            </div>
            <div>
              <h3 className="font-semibold">{p.title}</h3>
            </div>
          </div>
          <button onClick={p.onCancel} className="p-1 text-[var(--muted)] hover:text-[var(--ink)]">
            <X size={18}/>
          </button>
        </div>
        <div className="text-sm text-[var(--ink)]">{p.body}</div>

        {p.typeToConfirm && (
          <div>
            <label className="label">Type <b className="font-mono text-[var(--ink)]">{p.typeToConfirm}</b> to confirm</label>
            <input id="confirm-type" className="input font-mono" autoFocus/>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={p.onCancel} className="btn-ghost">
            {p.cancelLabel ?? "Cancel"}
          </button>
          <button
            onClick={() => {
              if (p.typeToConfirm) {
                const el = document.getElementById("confirm-type") as HTMLInputElement | null;
                if (!el || el.value !== p.typeToConfirm) { el?.focus(); return; }
              }
              p.onConfirm();
            }}
            className={tone === "danger" ? "btn-danger" : "btn-primary"}>
            {p.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
