"use client";

import {
  useEffect,
  useId,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import { CURRENCIES } from "@/lib/constants";
import { convert, formatMoney } from "@/lib/money";
import type { Currency, Settings } from "@/lib/types";

/* ---------- layout ---------- */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-ink-1">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function GlassCard({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rounded-card p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="card-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <p className="font-medium text-ink-1">{title}</p>
      {hint && <p className="max-w-xs text-sm text-ink-2">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------- money ---------- */

export function Money({
  amount,
  currency,
  compact,
  sign,
  exact,
  className = "",
}: {
  amount: number;
  currency: Currency;
  compact?: boolean;
  sign?: boolean;
  exact?: boolean;
  className?: string;
}) {
  return (
    <span className={`tnum ${className}`}>
      {formatMoney(amount, currency, { compact, sign, exact })}
    </span>
  );
}

/**
 * The signature spreadsheet view: one amount shown in all three currencies.
 * The native currency leads (emphasized); the two conversions follow muted.
 */
export function TripleMoney({
  amount,
  currency,
  settings,
  size = "md",
}: {
  amount: number;
  currency: Currency;
  settings: Settings;
  size?: "md" | "lg";
}) {
  const others = CURRENCIES.filter((c) => c !== currency);
  return (
    <div>
      <Money
        amount={amount}
        currency={currency}
        exact
        className={
          size === "lg"
            ? "hero-number block text-[2.5rem] font-bold leading-tight tracking-tight"
            : "block text-[22px] font-bold leading-tight tracking-tight text-ink-1"
        }
      />
      <p className={`tnum mt-1 text-ink-2 ${size === "lg" ? "text-sm" : "text-xs"}`}>
        {others
          .map((c) =>
            formatMoney(convert(amount, currency, c, settings.rates), c, { exact: true }),
          )
          .join("  ·  ")}
      </p>
    </div>
  );
}

/** three aligned currency cells for balance-sheet style table rows */
export function CurrencyCells({
  amount,
  currency,
  settings,
}: {
  amount: number;
  currency: Currency;
  settings: Settings;
}) {
  return (
    <>
      {CURRENCIES.map((c) => (
        <span
          key={c}
          className={`tnum text-right text-sm ${
            c === currency ? "font-semibold text-ink-1" : "text-ink-3"
          }`}
        >
          {formatMoney(convert(amount, currency, c, settings.rates), c, { exact: true })}
        </span>
      ))}
    </>
  );
}

/* ---------- controls ---------- */

type ButtonVariant = "primary" | "ghost" | "danger" | "plain";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      "btn-gradient shadow-md hover:brightness-110 active:scale-[0.97] disabled:opacity-40",
    ghost:
      "bg-ghost text-ink-1 hover:bg-ghost-2 active:scale-[0.97] disabled:opacity-40",
    danger:
      "bg-expense/10 text-expense hover:bg-expense/20 active:scale-[0.97] disabled:opacity-40",
    plain: "text-accent hover:bg-accent-soft active:scale-[0.97] disabled:opacity-40",
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-[transform,background-color,filter] duration-150 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={`flex rounded-full bg-ghost p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150 ${
              active
                ? "glass-strong text-ink-1"
                : "text-ink-2 hover:text-ink-1"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7.5 w-12.5 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? "bg-income" : "bg-ghost-2"
      }`}
    >
      <span
        className={`absolute top-0.5 size-6.5 rounded-full bg-white shadow-md transition-[left] duration-200 ${
          checked ? "left-5.5" : "left-0.5"
        }`}
      />
    </button>
  );
}

/* ---------- forms ---------- */

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
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

const controlBase =
  "w-full rounded-control border border-hairline bg-ghost px-3.5 py-2.5 text-[15px] text-ink-1 outline-none transition-colors focus:border-accent focus:bg-transparent";

export function TextInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlBase} ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${controlBase} appearance-none ${className}`} {...props}>
      {children}
    </select>
  );
}

/* ---------- progress ---------- */

export function ProgressMeter({
  value,
  max,
  tone = "accent",
}: {
  value: number;
  max: number;
  /** accent (goals) | budget (flips to warning/expense near and over the limit) */
  tone?: "accent" | "budget";
}) {
  const ratio = max > 0 ? value / max : 0;
  const clamped = Math.min(1, Math.max(0, ratio));
  const color =
    tone === "budget"
      ? ratio > 1
        ? "bg-expense"
        : ratio > 0.85
          ? "bg-warning"
          : "bg-accent"
      : "bg-accent";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft"
    >
      <div
        className={`h-full rounded-full ${color} transition-[width] duration-300`}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}

/* ---------- modal sheet ---------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-strong max-h-[90dvh] w-full overflow-y-auto rounded-t-card p-5 sm:max-w-md sm:rounded-card"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-ink-1">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full bg-ghost text-ink-2 transition-colors hover:bg-ghost-2"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{message}</p>
    </Sheet>
  );
}
