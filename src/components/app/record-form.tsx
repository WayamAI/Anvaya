"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { btnPrimary, btnSecondary, inputSm, selectSm } from "@/components/app/controls";
import { ErrorNote } from "@/components/app/api-error-note";
import { SearchPicker } from "@/components/app/search-picker";
import { cn } from "@/lib/utils";

/**
 * A create / edit dialog for a master-data record, described by its fields.
 *
 * The form only shapes and pre-checks input: the API validates every field
 * again and its field-level errors are shown by <ErrorNote>. Values are kept
 * as strings while editing and converted by the caller's `toBody`, which is
 * told which fields changed so an edit sends only those (the update endpoints
 * reject an empty body and unknown keys).
 */

import type { FieldValue } from "./record-form-values";
export type { FieldValue } from "./record-form-values";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PickerItem = { id: string } & Record<string, any>;
export type FormValues = Record<string, FieldValue>;

export interface FieldSpec {
  key: string;
  label: string;
  type?: "text" | "email" | "number" | "select" | "checkbox" | "textarea" | "picker";
  /** For a picker: the search endpoint, its filters and how an item reads. The value is the item's id. */
  picker?: { endpoint: string; params?: Record<string, string>; format: (item: PickerItem) => string };
  options?: { value: string; label: string }[];
  required?: boolean;
  /** Shown read-only when editing, e.g. a permanent business code. */
  lockedOnEdit?: boolean;
  placeholder?: string;
  help?: string;
  /** Columns spanned in the 3-column grid. */
  span?: 1 | 2 | 3;
  min?: number;
  max?: number;
  integer?: boolean;
  maxLength?: number;
  /** Hide the field unless the predicate holds for the current values. */
  when?: (v: FormValues) => boolean;
}

interface Props {
  title: string;
  description?: string;
  fields: FieldSpec[];
  initial: FormValues;
  isEdit?: boolean;
  submitLabel?: string;
  successMessage: (result: unknown) => string;
  toBody: (values: FormValues, changed: (key: string) => boolean) => Record<string, unknown>;
  submit: (body: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
  onSaved?: (result: unknown) => void;
}

const labelCls = "block text-caption text-muted-foreground mb-1";

function precheck(fields: FieldSpec[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.when && !f.when(values)) continue;
    const v = values[f.key];
    if (f.type === "checkbox") continue;
    const s = typeof v === "string" ? v.trim() : "";
    if (f.required && s === "") { errors[f.key] = "is required"; continue; }
    if (s === "") continue;
    if (f.type === "number") {
      const n = Number(s);
      if (!Number.isFinite(n)) errors[f.key] = "must be a number";
      else if (f.integer && !Number.isInteger(n)) errors[f.key] = "must be a whole number";
      else if (f.min !== undefined && n < f.min) errors[f.key] = `must be at least ${f.min}`;
      else if (f.max !== undefined && n > f.max) errors[f.key] = `must be at most ${f.max}`;
    }
    if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) errors[f.key] = "is not a valid email address";
  }
  return errors;
}

export function RecordFormDialog({ title, description, fields, initial, isEdit, submitLabel, successMessage, toBody, submit, onClose, onSaved }: Props) {
  const [values, setValues] = useState<FormValues>(initial);
  const [touched, setTouched] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [picked, setPicked] = useState<Record<string, PickerItem | null>>({});
  const errors = useMemo(() => precheck(fields, values), [fields, values]);
  const changed = (k: string) => values[k] !== initial[k];
  const dirty = fields.some((f) => changed(f.key));

  const save = useMutation({
    mutationFn: () => submit(toBody(values, changed)),
    onSuccess: (result) => {
      toast.success(successMessage(result));
      onSaved?.(result);
      onClose();
    },
  });

  const set = (k: string, v: FieldValue) => setValues((s) => ({ ...s, [k]: v }));
  const valid = Object.keys(errors).length === 0;
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid && (dirty || !isEdit) && !save.isPending) save.mutate();
  };
  // Closing with edits asks first, so a stray click outside does not lose them.
  const requestClose = () => {
    if (save.isPending) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && requestClose()}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {fields.filter((f) => !f.when || f.when(values)).map((f) => {
              const id = `rf-${f.key}`;
              const err = touched ? errors[f.key] : undefined;
              const v = values[f.key];
              const span = f.span === 3 ? "sm:col-span-3" : f.span === 2 ? "sm:col-span-2" : "";
              const locked = isEdit && f.lockedOnEdit;
              if (f.type === "checkbox") {
                return (
                  <label key={f.key} htmlFor={id} className={cn("flex items-start gap-2 text-body-sm self-end pb-1", span)}>
                    <input id={id} type="checkbox" className="mt-0.5" checked={v === true} disabled={locked} onChange={(e) => set(f.key, e.target.checked)} />
                    <span>{f.label}{f.help && <span className="block text-caption text-muted-foreground">{f.help}</span>}</span>
                  </label>
                );
              }
              if (f.type === "picker" && f.picker) {
                return (
                  <div key={f.key} className={span}>
                    <span className={labelCls}>{f.label}{f.required && !locked && <span aria-hidden="true"> *</span>}</span>
                    <SearchPicker<PickerItem> endpoint={f.picker.endpoint} params={f.picker.params} label={f.label} disabled={locked}
                      value={picked[f.key] ?? null} format={f.picker.format}
                      onChange={(item) => { setPicked((p) => ({ ...p, [f.key]: item })); set(f.key, item.id); }} />
                    {err && <p className="mt-1 text-caption text-danger">{f.label} {err}</p>}
                  </div>
                );
              }
              const common = {
                id,
                "aria-invalid": err ? true : undefined,
                "aria-describedby": err ? `${id}-err` : f.help ? `${id}-help` : undefined,
                disabled: locked,
                value: typeof v === "string" ? v : "",
                onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(f.key, e.target.value),
              };
              return (
                <div key={f.key} className={span}>
                  <label htmlFor={id} className={labelCls}>{f.label}{f.required && !locked && <span aria-hidden="true"> *</span>}</label>
                  {f.type === "select" ? (
                    <select className={cn(selectSm, "w-full", err && "border-danger")} {...common}>
                      {!f.required && <option value="">—</option>}
                      {f.required && v === "" && <option value="" disabled>Choose…</option>}
                      {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea className={cn(inputSm, "h-16 w-full rounded-lg py-1.5", err && "border-danger")} maxLength={f.maxLength} placeholder={f.placeholder} {...common} />
                  ) : (
                    <input
                      className={cn(inputSm, "w-full", err && "border-danger")}
                      type={f.type === "email" ? "email" : "text"}
                      inputMode={f.type === "number" ? "decimal" : undefined}
                      maxLength={f.maxLength}
                      placeholder={f.placeholder}
                      {...common}
                    />
                  )}
                  {err ? <p id={`${id}-err`} className="mt-1 text-caption text-danger">{f.label} {err}</p>
                    : f.help && <p id={`${id}-help`} className="mt-1 text-caption text-muted-foreground">{f.help}</p>}
                </div>
              );
            })}
          </div>

          <ErrorNote error={save.error} />
          {confirmDiscard ? (
            <DialogFooter className="items-center">
              <span className="text-body-sm text-muted-foreground mr-auto">Discard your changes?</span>
              <button type="button" className={btnSecondary} onClick={() => setConfirmDiscard(false)}>Keep editing</button>
              <button type="button" className={btnPrimary} onClick={onClose}>Discard</button>
            </DialogFooter>
          ) : (
          <DialogFooter>
            <button type="button" className={btnSecondary} onClick={requestClose}>Cancel</button>
            <button type="submit" className={btnPrimary} disabled={save.isPending || (isEdit && !dirty) || (touched && !valid)}>
              {save.isPending ? "Saving…" : submitLabel ?? (isEdit ? "Save changes" : "Create")}
            </button>
          </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
