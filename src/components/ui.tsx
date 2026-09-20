"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import Link from "next/link";
import { Icon, SUBJECT_SLOT, type IconName } from "./icons";
import { displayCurrencies } from "@/lib/constants";
import { useStore } from "@/lib/store";
import { currentMonth, monthNames, pad } from "@/lib/date";
import { convert, formatMoney } from "@/lib/money";
import { brandInitials } from "@/lib/brands";
import { useT } from "@/lib/i18n";
import type { SortDirection } from "@/lib/listing";

export type { SortDirection } from "@/lib/listing";
import type { Currency, Settings } from "@/lib/types";

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
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-2 sm:text-sm">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function GlassCard({
  title,
  subtitle,
  icon,
  action,
  children,
  footer,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  icon?: IconName;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass flex min-w-0 flex-col rounded-card p-4 sm:p-5 ${className}`}>
      {(title || action || icon) && (
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && (
              <IconDisc
                colorSlot={SUBJECT_SLOT[icon]}
                className={`size-9 rounded-chip ${SUBJECT_SLOT[icon] ? "" : "text-ink-2"}`}
              >
                <Icon name={icon} size={17} />
              </IconDisc>
            )}
            {(title || subtitle) && (
              <div className="min-w-0">
                {title && <h2 className="card-title truncate">{title}</h2>}
                {subtitle && <p className="caption mt-0.5 truncate">{subtitle}</p>}
              </div>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
      {footer && (
        <div className="caption mt-auto border-t border-hairline pt-3">{footer}</div>
      )}
    </section>
  );
}

export function AddButton({
  label,
  onClick,
  variant = "ghost",
  disabled,
}: {
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}) {
  return (
    <Button variant={variant} onClick={onClick} disabled={disabled}>
      <Icon name="plus" size={15} strokeWidth={2.2} />
      {label}
    </Button>
  );
}

export function IconDisc({
  colorSlot,
  className = "",
  children,
}: {
  colorSlot?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center ${colorSlot ? "" : "glass-el"} ${className}`}
      style={
        colorSlot
          ? {
              background: `color-mix(in oklab, var(--series-${colorSlot}) 14%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--series-${colorSlot}) 30%, transparent), inset 0 1px 0 color-mix(in oklab, var(--rim-light) 50%, transparent)`,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span
        aria-hidden
        className="glass-well mb-1 flex size-12 items-center justify-center rounded-full text-ink-3 [&_svg]:size-6"
      >
        {icon}
      </span>
      <p className="font-medium text-ink-1">{title}</p>
      {hint && <p className="max-w-sm text-sm leading-relaxed text-ink-2">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

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
  const { state } = useStore();
  const others = displayCurrencies(state).filter((c) => c !== currency);
  return (
    <div>
      <Money
        amount={amount}
        currency={currency}
        exact
        className={size === "lg" ? "hero-number num-xl block" : "num-sm block text-ink-1"}
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

export function CurrencyCells({
  amount,
  currency,
  settings,
}: {
  amount: number;
  currency: Currency;
  settings: Settings;
}) {
  const { state } = useStore();
  return (
    <>
      {displayCurrencies(state).map((c) => (
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

type ButtonVariant = "primary" | "ghost" | "danger" | "plain";
type ButtonSize = "sm" | "md";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      "btn-gradient shadow-[0_2px_10px_rgba(4,20,32,0.18)] hover:-translate-y-px hover:brightness-[1.07] active:translate-y-0 active:scale-[0.97] disabled:opacity-40 disabled:hover:translate-y-0",
    ghost:
      "glass-el border border-hairline text-ink-1 hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] hover:bg-fill-hover hover:text-ink-1 active:scale-[0.97] disabled:opacity-40",
    danger:
      "border border-expense/25 bg-expense/12 text-expense shadow-[inset_0_1px_0_color-mix(in_oklab,var(--rim-light)_35%,transparent),inset_0_-1px_0_var(--under-edge)] hover:bg-expense/20 active:scale-[0.97] disabled:opacity-40",
    plain:
      "border border-transparent text-accent underline-offset-4 hover:border-hairline hover:bg-accent-soft hover:shadow-[inset_0_1px_0_color-mix(in_oklab,var(--rim-light)_30%,transparent)] active:scale-[0.97] disabled:opacity-40",
  };
  const lastFired = useRef(0);
  const guarded = onClick
    ? (e: MouseEvent<HTMLButtonElement>) => {
        const now = Date.now();
        if (now - lastFired.current < 400) return;
        lastFired.current = now;
        onClick(e);
      }
    : undefined;
  const sizing =
    size === "sm" ? "min-h-10 px-3 text-xs" : "min-h-11 px-4.5 py-2.5 text-sm";
  return (
    <button
      type="button"
      onClick={guarded}
      className={`btn-ring inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-[transform,background-color,border-color,box-shadow,filter] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-accent-soft disabled:cursor-not-allowed disabled:active:scale-100 ${sizing} ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="btn-gradient inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4.5 py-2.5 text-sm font-semibold shadow-md transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.97]"
    >
      {children}
    </Link>
  );
}

export function useRadioGroupKeys<T extends string>(
  containerRef: React.RefObject<HTMLElement | null>,
  values: readonly T[],
  value: T,
  onChange: (v: T) => void,
) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0 && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = Math.max(0, values.indexOf(value));
    const n = values.length;
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + step + n) % n;
    onChange(values[next]);
    containerRef.current
      ?.querySelectorAll<HTMLElement>('[role="radio"]')
      [next]?.focus();
  };
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  label,
  className = "",
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const small = size === "sm";
  const groupRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useRadioGroupKeys(groupRef, options.map((o) => o.value), value, onChange);
  const pad = small ? "0.125rem" : "0.25rem";
  return (
    <div
      ref={groupRef}
      onKeyDown={onKeyDown}
      role="radiogroup"
      aria-label={label}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      className={`glass-well relative grid rounded-full border border-hairline ${
        small ? "p-0.5" : "p-1"
      } ${className}`}
    >
      <span
        aria-hidden
        className={`absolute rounded-full bg-(--card-strong) shadow-[inset_0_1px_0_color-mix(in_oklab,var(--rim-light)_70%,transparent),inset_0_-1px_0_var(--under-edge),0_2px_6px_var(--rim-shade)] transition-[left,width] duration-300 ease-[cubic-bezier(0.22,0.68,0.24,1)] ${
          small ? "inset-y-0.5" : "inset-y-1"
        }`}
        style={{
          width: `calc((100% - ${pad} * 2) / ${options.length})`,
          left: `calc(${pad} + ${index} * (100% - ${pad} * 2) / ${options.length})`,
        }}
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={`btn-ring relative z-1 min-w-0 truncate rounded-full font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent-soft ${
              small ? "min-h-9 px-2.5 text-xs" : "px-2.5 py-2.5 text-[13px] sm:px-3"
            } ${active ? "text-ink-1" : "text-ink-3 hover:text-ink-1"}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function OptionChips<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: Array<{ value: T; label: string; title?: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "md" | "lg";
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useRadioGroupKeys(groupRef, options.map((o) => o.value), value, onChange);
  return (
    <div
      ref={groupRef}
      onKeyDown={onKeyDown}
      role="radiogroup"
      aria-label={label}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(${size === "lg" ? "2.75rem" : "2.25rem"}, 1fr))`,
      }}
      className="grid gap-2"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={opt.title}
            aria-label={opt.title ?? opt.label}
            onClick={() => onChange(opt.value)}
            className={`flex items-center justify-center justify-self-center rounded-full border outline-none transition-[background-color,border-color,transform] duration-150 focus-visible:ring-4 focus-visible:ring-accent-soft active:scale-95 ${
              size === "lg" ? "size-11 text-xl" : "size-9 text-base"
            } ${
              active
                ? "border-accent-fill bg-accent-fill text-on-accent shadow-[0_2px_10px_var(--glow-a)]"
                :
                  "glass-el border-hairline hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] hover:bg-fill-hover"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  label,
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  label?: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ "--fill": `${pct}%` } as CSSProperties}
    />
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
      className={`btn-ring relative h-7 w-12 shrink-0 rounded-full outline-none transition-colors duration-200 before:absolute before:-inset-2 before:content-[''] focus-visible:ring-4 focus-visible:ring-accent-soft ${
        checked
          ? "bg-accent-fill shadow-[inset_0_1px_2px_var(--rim-shade)]"
          : "glass-well bg-ghost-2"
      }`}
    >
      <span
        className={`absolute top-1 size-5 rounded-full bg-white shadow-[0_1px_4px_rgba(10,20,16,0.3)] transition-[left] duration-200 ease-[cubic-bezier(0.22,0.68,0.24,1)] ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

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
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="caption mt-1.5 block">{hint}</span>}
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
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="caption mt-1.5 block">{hint}</span>}
    </div>
  );
}

const controlBase =
  "glass-el w-full rounded-field border border-hairline px-3.5 text-ink-1 outline-none transition-[background-color,border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-3 hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] " +
  "focus:border-[color-mix(in_oklab,var(--accent)_45%,var(--hairline))] focus:ring-4 focus:ring-accent-soft " +
  "disabled:cursor-not-allowed disabled:opacity-50";

type ControlSize = "sm" | "md";
const controlSize: Record<ControlSize, string> = {
  md: "min-h-11 py-2.5 text-base sm:text-[15px]",
  sm: "min-h-10 py-2 text-base sm:text-sm",
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
          size === "sm" ? "text-base sm:text-sm" : "text-base sm:text-[15px]"
        }`}
      >
        {prefix}
      </span>
      <input className={`${base} pl-9 ${className}`} {...props} />
    </div>
  );
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${controlBase} min-h-24 resize-y py-2.5 text-base leading-relaxed sm:text-[15px] ${className}`} {...props} />;
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
        className={`${controlBase} ${controlSize[size]} min-w-0 cursor-pointer appearance-none truncate pr-12 ${className}`}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-ghost-2 text-ink-2 transition-colors group-hover:text-ink-1"
      >
        <Icon name="chevronDown" size={16} strokeWidth={2.4} />
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

export function ProgressMeter({
  value,
  max,
  tone = "accent",
  label,
}: {
  value: number;
  max: number;
  tone?: "accent" | "budget";
  label?: string;
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
    <span
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="glass-well block h-1.5 w-full overflow-hidden rounded-full"
    >
      <span
        className={`block h-full rounded-full ${color} transition-[width] duration-300`}
        style={{ width: `${clamped * 100}%` }}
      />
    </span>
  );
}

let scrollLocks = 0;
let scrollLockPrevious = "";

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (scrollLocks === 0) {
      scrollLockPrevious = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    scrollLocks++;
    return () => {
      scrollLocks--;
      if (scrollLocks === 0) document.body.style.overflow = scrollLockPrevious;
    };
  }, [active]);
}

const dialogStack: symbol[] = [];

function useDialogStack(open: boolean): () => boolean {
  const token = useRef<symbol>(undefined);
  token.current ??= Symbol("dialog");
  useEffect(() => {
    if (!open) return;
    const id = token.current!;
    dialogStack.push(id);
    return () => {
      const at = dialogStack.lastIndexOf(id);
      if (at !== -1) dialogStack.splice(at, 1);
    };
  }, [open]);
  return useCallback(() => dialogStack[dialogStack.length - 1] === token.current, []);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const FIRST_FIELD =
  'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled])';

function useFocusTrap(open: boolean, panelRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    const fine = window.matchMedia?.("(pointer: fine)").matches ?? false;
    const firstField = fine
      ? panelRef.current?.querySelector<HTMLElement>(FIRST_FIELD)
      : null;
    (firstField ?? panelRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (restoreTo?.isConnected) restoreTo.focus();
    };
  }, [open, panelRef]);
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  onSubmit,
  problem,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: () => void;
  problem?: string | null;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const { t } = useT();

  const lastSubmit = useRef(0);
  const guardedSubmit = () => {
    const now = Date.now();
    if (now - lastSubmit.current < 400) return;
    lastSubmit.current = now;
    onSubmit?.();
  };

  useScrollLock(open);
  useFocusTrap(open, panelRef);
  const isTopmost = useDialogStack(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopmost()) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, isTopmost]);

  if (!open) return null;

  const Body = onSubmit ? "form" : "div";

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (!onSubmit && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sheet-panel glass-strong flex max-h-[92dvh] w-full flex-col rounded-t-sheet outline-none sm:max-w-md sm:rounded-sheet"
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <h2 id={titleId} className="min-w-0 truncate text-lg font-bold text-ink-1">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="icon-btn size-9 shrink-0 bg-ghost text-ink-3"
          >
            <Icon name="close" size={15} strokeWidth={2.2} />
          </button>
        </div>
        <Body
          className="flex min-h-0 flex-1 flex-col"
          {...(onSubmit
            ? {
                onSubmit: (e: React.FormEvent) => {
                  e.preventDefault();
                  guardedSubmit();
                },
                noValidate: true,
              }
            : {})}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
            {children}
          </div>
          {(footer || problem) && (
            <div className="border-t border-hairline px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-5">
              {problem && (
                <p aria-live="polite" className="caption mb-2.5">
                  {problem}
                </p>
              )}
              {footer && (
                <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div>
              )}
            </div>
          )}
        </Body>
      </div>
    </div>
  );
}

export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  timeoutMs = 9000,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss?: () => void;
  timeoutMs?: number;
}) {
  const { t } = useT();
  useEffect(() => {
    if (!onDismiss) return;
    const id = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(id);
  }, [message, onDismiss, timeoutMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-20 z-50 flex justify-center md:inset-x-0 md:bottom-6 md:pl-64"
    >
      <div className="glass-strong flex w-full max-w-sm items-center gap-2 rounded-full py-2 pl-4 pr-2 shadow-lg">
        <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{message}</span>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => {
            onAction();
            onDismiss?.();
          }}
        >
          {actionLabel}
        </Button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("common.dismiss")}
            className="icon-btn size-8 shrink-0 text-ink-3"
          >
            <Icon name="close" size={13} strokeWidth={2.4} />
          </button>
        )}
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
  confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
}) {
  const { t } = useT();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel ?? t("common.delete")}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{message}</p>
    </Sheet>
  );
}

export function RemoteLogo({
  sources,
  fallback,
  size = 28,
  alt = "",
  className = "",
  rounded = "full",
}: {
  sources: string[];
  fallback: ReactNode;
  size?: number;
  alt?: string;
  className?: string;
  rounded?: "full" | "md";
}) {
  const key = sources.join("|");
  const [attempt, setAttempt] = useState({ key, index: 0 });
  if (attempt.key !== key) setAttempt({ key, index: 0 });
  const index = attempt.key === key ? attempt.index : 0;
  const src = sources[index];
  if (!src) return <>{fallback}</>;
  const next = () => setAttempt({ key, index: index + 1 });
  return (
    <img
      key={src}
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={next}
      onLoad={(e) => {
        const img = e.currentTarget;
        const tiny = img.naturalWidth > 0 && img.naturalWidth < 24;
        if (tiny && index < sources.length - 1) next();
      }}
      style={{ width: size, height: size }}
      className={`shrink-0 bg-white/0 object-contain ${rounded === "full" ? "rounded-full" : "rounded-[6px]"} ${className}`}
    />
  );
}

export function Monogram({
  name,
  color,
  size = 28,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: Math.round(size * 0.38),
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
      }}
    >
      {brandInitials(name)}
    </span>
  );
}

type CalloutTone = "info" | "warning" | "success" | "danger" | "tip";

const CALLOUT_STYLE: Record<CalloutTone, { icon: IconName; className: string }> = {
  info: { icon: "info", className: "border-[color-mix(in_oklab,var(--series-10)_35%,transparent)] bg-[color-mix(in_oklab,var(--series-10)_9%,transparent)] text-ink-1" },
  tip: { icon: "sparkle", className: "border-[color-mix(in_oklab,var(--series-3)_35%,transparent)] bg-[color-mix(in_oklab,var(--series-3)_9%,transparent)] text-ink-1" },
  success: { icon: "check", className: "border-income/30 bg-income/8 text-ink-1" },
  warning: { icon: "warning", className: "border-warning/35 bg-warning/10 text-ink-1" },
  danger: { icon: "warning", className: "border-expense/30 bg-expense/8 text-ink-1" },
};

export function Callout({
  tone = "info",
  title,
  children,
  className = "",
}: {
  tone?: CalloutTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const style = CALLOUT_STYLE[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "note"}
      className={`flex gap-2.5 rounded-field border px-3.5 py-3 text-sm ${style.className} ${className}`}
    >
      <Icon name={style.icon} size={17} className="mt-0.5 opacity-80" />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
    </div>
  );
}

export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mb-3 flex min-w-0 flex-wrap items-center gap-2 ${className}`}>{children}</div>
  );
}

export function ToolbarSlot({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 flex-[1_1_10rem] ${className}`}>{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div className={`relative min-w-0 flex-[999_1_14rem] ${className}`}>
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
        <Icon name="search" size={16} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t("filter.search")}
        aria-label={placeholder ?? t("filter.search")}
        className={`${controlBase} ${controlSize.sm} pl-9 pr-9`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("filter.clearSearch")}
          className="icon-btn absolute right-1.5 top-1/2 size-7 -translate-y-1/2 text-ink-3"
        >
          <Icon name="close" size={13} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

export function SortSelect<T extends string>({
  value,
  onChange,
  options,
  direction,
  onDirectionChange,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  direction: SortDirection;
  onDirectionChange: (direction: SortDirection) => void;
}) {
  const { t } = useT();
  return (
    <div className="flex min-w-0 flex-[1_1_11rem] items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <Select
          size="sm"
          value={value}
          aria-label={t("filter.sortBy")}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <button
        type="button"
        onClick={() => onDirectionChange(direction === "asc" ? "desc" : "asc")}
        aria-label={direction === "asc" ? t("filter.ascending") : t("filter.descending")}
        title={direction === "asc" ? t("filter.ascending") : t("filter.descending")}
        className="icon-btn glass-el size-10 shrink-0 rounded-full border border-hairline text-ink-2"
      >
        <Icon
          name="sort"
          size={16}
          className={`transition-transform duration-200 ${direction === "asc" ? "-scale-y-100" : ""}`}
        />
      </button>
    </div>
  );
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useRadioGroupKeys(groupRef, options.map((o) => o.value), value, onChange);
  return (
    <div
      ref={groupRef}
      onKeyDown={onKeyDown}
      role="radiogroup"
      aria-label={label}
      className="flex min-w-0 flex-wrap gap-1.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent-soft ${
              active
                ? "border-accent-fill bg-accent-soft text-ink-1"
                : "glass-el border-hairline text-ink-2 hover:text-ink-1"
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`tnum rounded-full px-1.5 py-px text-[10px] ${active ? "bg-accent-fill text-on-accent" : "bg-ghost-2 text-ink-3"}`}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "income" | "expense" | "warning" | "accent";
}) {
  const tones = {
    neutral: "bg-ghost-2 text-ink-2",
    income: "bg-income/12 text-income",
    expense: "bg-expense/12 text-expense",
    warning: "bg-warning/15 text-warning",
    accent: "bg-accent-soft text-accent",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
