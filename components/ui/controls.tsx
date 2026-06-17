'use client';

import type { ReactNode } from 'react';

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[0.8125rem] font-medium text-muted">{label}</span>
        {hint ? <span className="tnum text-[0.8125rem] text-ink">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <Field label={label} hint={format(value)}>
      <input
        type="range"
        className="w-full"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  step = 1000,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  step?: number;
  min?: number;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center rounded border border-line bg-paper focus-within:border-evergreen">
        {prefix ? <span className="pl-2.5 text-sm text-faint">{prefix}</span> : null}
        <input
          type="number"
          className="tnum w-full bg-transparent px-2.5 py-1.5 text-sm text-ink outline-none"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </Field>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        className="w-full rounded border border-line bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-evergreen"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label}>
      <select
        className="w-full rounded border border-line bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-evergreen"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1 rounded border border-line bg-paper p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
              active ? 'bg-evergreen text-paper' : 'text-muted hover:bg-line/60'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  children,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="rounded border border-line bg-paper/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          {description ? <p className="mt-0.5 text-xs leading-snug text-faint">{description}</p> : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
            checked ? 'bg-evergreen' : 'bg-line'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-transform ${
              checked ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      {checked && children ? <div className="mt-3 space-y-3 border-t border-line pt-3">{children}</div> : null}
    </div>
  );
}
