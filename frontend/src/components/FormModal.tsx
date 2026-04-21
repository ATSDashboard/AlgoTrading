/**
 * Reusable form modal. Fields declared as a list; returns the submitted values.
 * Used for "Invite User", "Add Broker", "New Template", etc.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type FieldType = "text" | "email" | "password" | "tel" | "number" | "select" | "textarea";

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: string[];          // for select
  defaultValue?: string;
  help?: string;
}

interface Props {
  open: boolean;
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export default function FormModal({open, title, description, fields, submitLabel, onSubmit, onCancel}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      fields.forEach((f) => { init[f.name] = f.defaultValue ?? ""; });
      setValues(init);
    }
  }, [open, fields]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onCancel]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (const f of fields) {
      if (f.required && !values[f.name]) return;
    }
    onSubmit(values);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{background: "rgba(0,0,0,0.6)"}} onClick={onCancel}>
      <form onSubmit={handleSubmit}
            className="w-full max-w-md rounded-xl border p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
            style={{background: "var(--panel)", borderColor: "var(--border)"}}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{title}</h3>
            {description && <p className="text-xs text-[var(--muted)] mt-1">{description}</p>}
          </div>
          <button type="button" onClick={onCancel}
                  className="p-1 text-[var(--muted)] hover:text-[var(--ink)]">
            <X size={18}/>
          </button>
        </div>

        {fields.map((f) => (
          <div key={f.name}>
            <label className="label">{f.label}{f.required && <span className="text-[var(--danger)]"> *</span>}</label>
            {f.type === "select" ? (
              <select className="input" value={values[f.name] ?? ""} required={f.required}
                      onChange={(e) => setValues({...values, [f.name]: e.target.value})}>
                <option value="" disabled>Select…</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea className="input min-h-[80px]" value={values[f.name] ?? ""}
                        required={f.required} placeholder={f.placeholder}
                        onChange={(e) => setValues({...values, [f.name]: e.target.value})}/>
            ) : (
              <input type={f.type} className="input" value={values[f.name] ?? ""}
                     required={f.required} placeholder={f.placeholder}
                     onChange={(e) => setValues({...values, [f.name]: e.target.value})}/>
            )}
            {f.help && <div className="text-[10px] text-[var(--muted)] mt-1">{f.help}</div>}
          </div>
        ))}

        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
          <button type="submit" className="btn-primary">{submitLabel ?? "Submit"}</button>
        </div>
      </form>
    </div>
  );
}
