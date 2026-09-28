"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useT } from "@/lib/i18n";
import { currentMonth, monthNames, pad } from "@/lib/date";
import { Icon } from "./icon";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
      {hint && <span className="caption mt-1 block">{hint}</span>}
    </label>
  );
}

export function FieldSet({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
      {hint && <span className="caption mt-1 block">{hint}</span>}
    </div>
  );
}

export const controlBase =
  "glass-el w-full rounded-field border border-hairline px-3.5 text-ink-1 outline-none transition-[background-color,border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-3 hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] " +
  "focus:border-[color-mix(in_oklab,var(--accent)_45%,var(--hairline))] focus:ring-4 focus:ring-accent-soft " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export type ControlSize = "sm" | "md";
export const controlSize: Record<ControlSize, string> = {
  md: "min-h-10 py-2 text-base sm:text-sm",
  sm: "min-h-9 py-1.5 text-base sm:text-[13px]",
};

export function TextInput({
  className = "",
  size = "md",
  prefix,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "prefix" | "size"> & {
  prefix?: ReactNode;
  size?: ControlSize;
}) {
  const base = `${controlBase} ${controlSize[size]}`;
  if (prefix === undefined) {
    return <input className={`${base} ${className}`} {...props} />;
  }
  return (
    <div className="relative">
      <span
        aria-hidden
        className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3 ${
          size === "sm" ? "text-base sm:text-[13px]" : "text-base sm:text-sm"
        }`}
      >
        {prefix}
      </span>
      <input className={`${base} pl-9 ${className}`} {...props} />
    </div>
  );
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${controlBase} min-h-20 resize-y py-2 text-base leading-relaxed sm:text-sm ${className}`} {...props} />;
}

export function Select({
  className = "",
  size = "md",
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: ControlSize }) {
  return (
    <div className="group relative min-w-0">
      <select
        className={`${controlBase} ${controlSize[size]} min-w-0 cursor-pointer appearance-none truncate pr-10 ${className}`}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-ghost-2 text-ink-2 transition-colors group-hover:text-ink-1"
      >
        <Icon name="chevronDown" size={14} strokeWidth={2.4} />
      </span>
    </div>
  );
}

export function MonthInput({
  value,
  onChange,
  name,
  allowEmpty = false,
}: {
  value: string;
  onChange: (value: string) => void;
  name: string;
  allowEmpty?: boolean;
}) {
  const { t } = useT();
  const now = currentMonth();
  const [nowYear, nowMonth] = now.split("-").map(Number);
  const [year, month] = /^\d{4}-\d{2}$/.test(value)
    ? value.split("-").map(Number)
    : allowEmpty
      ? [0, 0]
      : [nowYear, nowMonth];

  const first = Math.min(nowYear - 5, year || nowYear);
  const last = Math.max(nowYear + 10, year || nowYear);
  const years: number[] = [];
  for (let y = first; y <= last; y++) years.push(y);

  const setMonth = (m: number) =>
    onChange(m === 0 ? "" : `${year || nowYear}-${pad(m)}`);
  const setYear = (y: number) =>
    onChange(y === 0 ? "" : `${y}-${pad(month || nowMonth)}`);

  return (
    <div className="grid grid-cols-[1fr_7.5rem] gap-2">
      <Select
        aria-label={t("month.pickerMonth", { name })}
        value={String(month)}
        onChange={(e) => setMonth(Number(e.target.value))}
      >
        {allowEmpty && <option value="0">—</option>}
        {monthNames().map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </Select>
      <Select
        aria-label={t("month.pickerYear", { name })}
        value={String(year)}
        onChange={(e) => setYear(Number(e.target.value))}
      >
        {allowEmpty && <option value="0">—</option>}
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
}
