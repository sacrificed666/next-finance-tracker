"use client";

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import { CURRENCIES } from "@/lib/constants";
import { currentMonth, MONTH_NAMES, pad } from "@/lib/date";
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
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight text-ink-1 sm:text-[1.8rem]">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-2 sm:text-sm">{subtitle}</p>}
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
  interactive = false,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** pinned to the bottom edge, above the padding — for totals and captions */
  footer?: ReactNode;
  /** lifts under the pointer; for cards whose whole body leads somewhere */
  interactive?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`glass ${interactive ? "glass-hover" : ""} flex flex-col rounded-card p-4 sm:p-5 ${className}`}
    >
      {(title || action || icon) && (
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && (
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ghost text-base"
              >
                {icon}
              </span>
            )}
            {(title || subtitle) && (
              <div className="min-w-0">
                {title && <h2 className="card-title truncate">{title}</h2>}
                {subtitle && <p className="mt-0.5 truncate text-xs text-ink-3">{subtitle}</p>}
              </div>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
      {footer && (
        <div className="mt-auto border-t border-hairline pt-3 text-xs text-ink-3">{footer}</div>
      )}
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
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  // Every variant carries an edge and a fill of its own: a bare label on glass
  // did not read as something you could press.
  const styles: Record<ButtonVariant, string> = {
    primary:
      "btn-gradient shadow-[0_2px_10px_rgba(4,20,32,0.18)] hover:-translate-y-px hover:brightness-[1.07] active:translate-y-0 active:scale-[0.97] disabled:opacity-40 disabled:hover:translate-y-0",
    ghost:
      "border border-hairline bg-ghost text-ink-1 shadow-[inset_0_1px_0_var(--card-highlight)] hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] hover:bg-fill-hover hover:text-ink-1 active:scale-[0.97] disabled:opacity-40",
    danger:
      "border border-expense/25 bg-expense/12 text-expense hover:bg-expense/20 active:scale-[0.97] disabled:opacity-40",
    plain:
      "border border-transparent text-accent underline-offset-4 hover:border-hairline hover:bg-accent-soft active:scale-[0.97] disabled:opacity-40",
  };
  // swallow an accidental repeat click on the same action (double-tap, jitter)
  // so a save/add/delete can't fire twice — actions are discrete, never held
  const lastFired = useRef(0);
  const guarded = onClick
    ? (e: MouseEvent<HTMLButtonElement>) => {
        const now = Date.now();
        if (now - lastFired.current < 400) return;
        lastFired.current = now;
        onClick(e);
      }
    : undefined;
  return (
    <button
      type="button"
      onClick={guarded}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-[transform,background-color,filter] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-accent-soft ${styles[variant]} ${className}`}
      {...props}
    />
  );
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
  /** sm is the in-card version (chart windows, card headers) */
  size?: "sm" | "md";
  /** accessible name, for groups that stand on their own without a Field */
  label?: string;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const small = size === "sm";
  // the track's own padding, which the thumb has to sit inside
  const pad = small ? "0.125rem" : "0.25rem";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      // Equal columns, not equal flex shares: a flex track sized to its content
      // hands out the *sum* of the labels split n ways, so the widest one ("6M"
      // among 1Y/2Y/3Y) got ellipsised down to "6…". A 1fr grid sizes every
      // column to the widest label, which is also what keeps the thumb's
      // 100%/n geometry honest.
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      className={`relative grid rounded-full border border-hairline bg-ghost ${
        small ? "p-0.5" : "p-1"
      } ${className}`}
    >
      {/* one thumb that travels, rather than three buttons that light up:
          the movement is what makes the choice legible */}
      <span
        aria-hidden
        className={`absolute rounded-full bg-(--card-strong) shadow-[inset_0_1px_0_var(--card-highlight),0_1px_4px_rgba(10,12,20,0.14)] transition-[left,width] duration-300 ease-[cubic-bezier(0.22,0.68,0.24,1)] ${
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
            onClick={() => onChange(opt.value)}
            // the thumb says which one is chosen; the label only has to be
            // legible, so it darkens to full ink instead of turning brand-red
            className={`relative z-1 min-w-0 truncate rounded-full font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent-soft ${
              small ? "px-2.5 py-1.5 text-xs" : "px-2.5 py-2 text-[13px] sm:px-3"
            } ${active ? "text-ink-1" : "text-ink-3 hover:text-ink-1"}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A grid of single-choice chips — icons, currencies, anything with more
 * options than a segmented control can hold. Selected is a filled accent
 * chip, not a ring around a ghost, so the choice survives a glance.
 */
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
  /** accessible name for the group */
  label: string;
  size?: "md" | "lg";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      // Columns that divide the full width, not a left-packed wrap: the flex
      // version stopped wherever the last chip happened to land and left a
      // ragged 18–40px of dead space down the right edge, next to fields and
      // segmented controls that all reach the far side. The chips keep their
      // own round size and centre inside their column.
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
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={`flex items-center justify-center justify-self-center rounded-full border outline-none transition-[background-color,border-color,transform] duration-150 focus-visible:ring-4 focus-visible:ring-accent-soft active:scale-95 ${
              size === "lg" ? "size-11 text-xl" : "size-9 text-base"
            } ${
              active
                ? "border-accent bg-accent text-on-accent shadow-[0_2px_10px_var(--glow-a)]"
                : // brand colour marks the chosen chip; hovering an unchosen one
                  // only lifts its surface, so the two never look alike
                  "border-hairline bg-ghost hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] hover:bg-fill-hover"
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
      className={`relative h-7.5 w-12.5 shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-4 focus-visible:ring-accent-soft ${
        checked ? "bg-income/85" : "bg-ghost-2"
      }`}
    >
      <span
        className={`absolute top-0.5 size-6.5 rounded-full bg-white shadow-[0_1px_4px_rgba(20,12,28,0.25)] transition-[left] duration-200 ${
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
      {hint && <span className="mt-1.5 block text-xs leading-snug text-ink-3">{hint}</span>}
    </label>
  );
}

/**
 * A Field for things that are not a single form control — a chip grid, a row
 * of swatches, a radiogroup. Looks identical, but wrapping those in a `<label>`
 * is a lie: a label points at one control, so screen readers announce the
 * caption on whichever button happens to be first. The group carries its own
 * accessible name instead (`OptionChips` takes `label`, radiogroups take
 * `aria-label`).
 */
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
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-snug text-ink-3">{hint}</span>}
    </div>
  );
}

// 16px on phones is deliberate: iOS Safari zooms the whole page in when a
// focused field is smaller than that. Focus is a soft ring rather than a hard
// border swap, and the 44px floor keeps every control thumb-sized.
const controlBase =
  "w-full min-h-11 rounded-field border border-hairline bg-ghost px-3.5 py-2.5 text-base text-ink-1 outline-none transition-[background-color,border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-3 hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] " +
  "focus:border-[color-mix(in_oklab,var(--accent)_45%,var(--hairline))] focus:bg-transparent focus:ring-4 focus:ring-accent-soft " +
  "disabled:cursor-not-allowed disabled:opacity-50 sm:text-[15px]";

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
    <div className="group relative">
      <select
        className={`${controlBase} cursor-pointer appearance-none pr-12 ${className}`}
        {...props}
      >
        {children}
      </select>
      {/* the native chevron is gone with appearance-none; this one sits in its
          own chip so the field reads as "opens a list", not as a text input */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-ghost-2 text-ink-2 transition-colors group-hover:text-ink-1"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}

/**
 * Picks a `yyyy-mm` month as two selects.
 *
 * `<input type="month">` looks like a first-class control in Chrome but does
 * not exist in Safari or Firefox: there it degrades to a bare text box where
 * the value has to be typed in ISO form by hand, and a typo just leaves the
 * form invalid. Selects are supported everywhere and carry the app's own
 * styling, so the field looks and behaves the same in every browser.
 */
export function MonthInput({
  value,
  onChange,
  name,
  allowEmpty = false,
}: {
  /** yyyy-mm, or "" when unset (only reachable with `allowEmpty`) */
  value: string;
  onChange: (value: string) => void;
  /** what the field is called, for the per-select accessible names */
  name: string;
  /** offer a "—" option that clears the field */
  allowEmpty?: boolean;
}) {
  const now = currentMonth();
  const [nowYear, nowMonth] = now.split("-").map(Number);
  // 0 means "unset" and only shows where a "—" option exists; a required field
  // handed an empty value falls back to this month rather than lying about
  // what the selects are pointing at
  const [year, month] = /^\d{4}-\d{2}$/.test(value)
    ? value.split("-").map(Number)
    : allowEmpty
      ? [0, 0]
      : [nowYear, nowMonth];

  // a window wide enough for a rule that started years ago or ends far out,
  // always stretched to include the value being edited
  const first = Math.min(nowYear - 5, year || nowYear);
  const last = Math.max(nowYear + 10, year || nowYear);
  const years: number[] = [];
  for (let y = first; y <= last; y++) years.push(y);

  // setting half of an empty field fills the other half with today's, so one
  // tap always produces a valid month; picking "—" in either clears the field
  const setMonth = (m: number) =>
    onChange(m === 0 ? "" : `${year || nowYear}-${pad(m)}`);
  const setYear = (y: number) =>
    onChange(y === 0 ? "" : `${y}-${pad(month || nowMonth)}`);

  return (
    <div className="grid grid-cols-[1fr_7.5rem] gap-2">
      <Select
        aria-label={`${name}: month`}
        value={String(month)}
        onChange={(e) => setMonth(Number(e.target.value))}
      >
        {allowEmpty && <option value="0">—</option>}
        {MONTH_NAMES.map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </Select>
      <Select
        aria-label={`${name}: year`}
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
      className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // the panel scrolls, its title and actions do not: on a short screen a
        // long form used to push Save out of reach behind the keyboard
        className="sheet-panel glass-strong flex max-h-[92dvh] w-full flex-col rounded-t-sheet sm:max-w-md sm:rounded-sheet"
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <h2 id={titleId} className="min-w-0 truncate text-lg font-bold text-ink-1">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="icon-btn size-9 shrink-0 bg-ghost"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-hairline px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-5">
            {footer}
          </div>
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
