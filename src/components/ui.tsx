"use client";

import {
  useCallback,
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
import Link from "next/link";
import { Icon } from "./icons";
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
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** pinned to the bottom edge, above the padding — for totals and captions */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass flex flex-col rounded-card p-4 sm:p-5 ${className}`}>
      {(title || action || icon) && (
        // wraps rather than squeezing: a card whose action is a three-way
        // segmented control had nothing left for its own title on a phone
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && (
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-ghost text-ink-2"
              >
                {icon}
              </span>
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
      {/* a quiet disc in the page's own ink, not a 36px emoji: an empty state is
          an explanation, and the loudest thing on it should not be decoration */}
      <span
        aria-hidden
        className="mb-1 flex size-12 items-center justify-center rounded-full bg-ghost text-ink-3 [&_svg]:size-6"
      >
        {icon}
      </span>
      <p className="font-medium text-ink-1">{title}</p>
      {hint && <p className="max-w-sm text-sm leading-relaxed text-ink-2">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
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
type ButtonSize = "sm" | "md";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** sm is for in-row actions (chips, table rows); md is the touch-sized default */
  size?: ButtonSize;
}) {
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
  // 44px is the touch floor the fields already use; the buttons beside them sat
  // at 40 and read as a slightly different system. `sm` is the deliberate
  // exception for actions that live inside a row.
  const sizing =
    size === "sm" ? "min-h-9 px-3 text-xs" : "min-h-11 px-4.5 py-2.5 text-sm";
  return (
    <button
      type="button"
      onClick={guarded}
      className={`btn-ring inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-[transform,background-color,border-color,box-shadow,filter] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-accent-soft disabled:cursor-not-allowed disabled:active:scale-100 ${sizing} ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

/**
 * A link that has to read as `<Button variant="primary">` — identical geometry,
 * because a row holding one of each otherwise reads as two different systems.
 * Both the dashboard and the forecast had grown their own copy of this.
 */
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

/**
 * Arrow-key navigation and a single tab stop for a radiogroup.
 *
 * A `role="radiogroup"` whose options are each their own tab stop is not
 * really a radiogroup: the platform contract is one stop for the whole group,
 * with the arrows moving between options. Every single-choice control here —
 * segmented controls, icon chips, the theme switch, the colour swatches — was
 * built as N independent stops, so tabbing through a form walked every currency
 * and every one of thirty icons one press at a time.
 */
export function useRadioGroupKeys<T extends string>(
  /** the group element, so focus can follow the selection */
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
    // focus travels with the selection — that is what makes it "roving"
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
  /** sm is the in-card version (chart windows, card headers) */
  size?: "sm" | "md";
  /** accessible name, for groups that stand on their own without a Field */
  label?: string;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const small = size === "sm";
  const groupRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useRadioGroupKeys(groupRef, options.map((o) => o.value), value, onChange);
  // the track's own padding, which the thumb has to sit inside
  const pad = small ? "0.125rem" : "0.25rem";
  return (
    <div
      ref={groupRef}
      onKeyDown={onKeyDown}
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
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            // the thumb says which one is chosen; the label only has to be
            // legible, so it darkens to full ink instead of turning brand-red
            // md matches the 44px field height, so a segmented control and the
            // input above it read as one row of the same system
            className={`btn-ring relative z-1 min-w-0 truncate rounded-full font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent-soft ${
              small ? "px-2.5 py-1.5 text-xs" : "px-2.5 py-2.5 text-[13px] sm:px-3"
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
  const groupRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useRadioGroupKeys(groupRef, options.map((o) => o.value), value, onChange);
  return (
    <div
      ref={groupRef}
      onKeyDown={onKeyDown}
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
            tabIndex={active ? 0 : -1}
            title={opt.title}
            // the emoji is decoration; the group's own name plus the title is
            // what a screen reader has to go on, so give the option a real one
            aria-label={opt.title ?? opt.label}
            onClick={() => onChange(opt.value)}
            className={`flex items-center justify-center justify-self-center rounded-full border outline-none transition-[background-color,border-color,transform] duration-150 focus-visible:ring-4 focus-visible:ring-accent-soft active:scale-95 ${
              size === "lg" ? "size-11 text-xl" : "size-9 text-base"
            } ${
              active
                ? "border-accent-fill bg-accent-fill text-on-accent shadow-[0_2px_10px_var(--glow-a)]"
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
      // Round numbers on a 4px grid, like every other control; the old
      // 7.5/12.5/6.5 trio was three values that belonged to nothing else.
      // The 28×48 track is the right drawing and the wrong target, so the
      // pseudo-element takes it to 44×64 without moving a pixel of it.
      className={`btn-ring relative h-7 w-12 shrink-0 rounded-full outline-none transition-colors duration-200 before:absolute before:-inset-2 before:content-[''] focus-visible:ring-4 focus-visible:ring-accent-soft ${
        checked ? "bg-accent-fill" : "bg-ghost-2"
      }`}
    >
      <span
        // the knob widens slightly as it travels, which reads as a flick rather
        // than a jump — the one place a little physics is worth the bytes
        className={`absolute top-1 size-5 rounded-full bg-white shadow-[0_1px_4px_rgba(10,20,16,0.3)] transition-[left] duration-200 ease-[cubic-bezier(0.22,0.68,0.24,1)] ${
          checked ? "left-6" : "left-1"
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
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="caption mt-1.5 block">{hint}</span>}
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
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="caption mt-1.5 block">{hint}</span>}
    </div>
  );
}

/**
 * Focus is a soft ring rather than a hard border swap, and the 44px floor keeps
 * every control thumb-sized.
 *
 * Size is a prop, not something a caller can patch in through `className`.
 * Tailwind emits both classes when a component's base string and its override
 * disagree, and which one wins is decided by their order in the generated
 * stylesheet, not by the order they appear in the attribute — utilities are
 * sorted by value, so the *larger* one lands later and wins. The ledger's
 * search box asked for `min-h-10 py-2` on top of the base `min-h-11 py-2.5`
 * and rendered at neither: it stayed 44px tall, silently.
 */
const controlBase =
  "w-full rounded-field border border-hairline bg-ghost px-3.5 text-ink-1 outline-none transition-[background-color,border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-3 hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] " +
  "focus:border-[color-mix(in_oklab,var(--accent)_45%,var(--hairline))] focus:bg-transparent focus:ring-4 focus:ring-accent-soft " +
  "disabled:cursor-not-allowed disabled:opacity-50";

// 16px on phones is deliberate in both sizes: iOS Safari zooms the whole page
// in when a focused field is smaller than that.
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
  /** a unit that belongs to the field itself — a currency sign, a % */
  prefix?: ReactNode;
  /** sm is for controls that sit inside a toolbar row, not in a form */
  size?: ControlSize;
}) {
  const base = `${controlBase} ${controlSize[size]}`;
  if (prefix === undefined) {
    return <input className={`${base} ${className}`} {...props} />;
  }
  // the sign sits inside the field rather than in a label beside it, so what
  // you are typing and what it is denominated in are never read apart
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

export function Select({
  className = "",
  size = "md",
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: ControlSize }) {
  return (
    <div className="group relative">
      <select
        className={`${controlBase} ${controlSize[size]} cursor-pointer appearance-none pr-12 ${className}`}
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
        <Icon name="chevronDown" size={16} strokeWidth={2.4} />
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
  label,
}: {
  value: number;
  max: number;
  /** accent (goals) | budget (flips to warning/expense near and over the limit) */
  tone?: "accent" | "budget";
  /** what is being measured — a bare progressbar announces only a percentage */
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
  // Spans, not divs: every meter in this app is drawn inside a row that is
  // itself a <button> (accounts, debts, budgets), and <button> takes phrasing
  // content only — a <div> in there is invalid markup that parsers only
  // tolerate.
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="block h-1.5 w-full overflow-hidden rounded-full bg-ghost-2"
    >
      <span
        className={`block h-full rounded-full ${color} transition-[width] duration-300`}
        style={{ width: `${clamped * 100}%` }}
      />
    </span>
  );
}

/* ---------- modal sheet ---------- */

/**
 * One page-scroll lock shared by every overlay, reference-counted.
 *
 * Each sheet used to save and restore `body.overflow` for itself, which broke
 * the moment two of them closed in the same commit — the delete flow, where
 * confirming unmounts both the form sheet and the confirm dialog above it.
 * React tears effects down in tree order, so the outer sheet restored "" and
 * the inner one then restored the "hidden" it had captured, leaving the page
 * unscrollable until a reload.
 */
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

/**
 * Which dialogs are open, innermost last. Escape is a document-level key, so
 * every open sheet used to answer it at once: pressing it on "Delete this
 * transaction?" dismissed the confirmation *and* the edit form behind it, and
 * the row you were half-way through changing was gone.
 */
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

/**
 * Keeps Tab inside the open dialog and hands focus back where it came from.
 *
 * Where focus lands depends on what opened it. On touch, the panel: autofocusing
 * an input throws the on-screen keyboard over the title before you have read it.
 * On a pointer device there is no keyboard to throw, the first field is where
 * you were going anyway, and landing on the panel instead cost three keystrokes
 * to reach it on every single open.
 */
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
      // the element may have been removed by whatever the dialog just did
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
  /**
   * Makes the sheet a real `<form>`: Enter in any field saves, and the primary
   * action becomes its submit button. Passing it also stops a click on the
   * backdrop from dismissing — a confirmation has nothing to lose to a stray
   * click, a half-filled form of eight fields has all of it.
   */
  onSubmit?: () => void;
  /**
   * Why the primary action is unavailable, in plain words, next to the action
   * itself. It used to sit under the last field — inside the part of the sheet
   * that scrolls — so on a long form you pressed a Save you could see and the
   * answer appeared somewhere you could not.
   */
  problem?: string | null;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // The same repeat-press guard `Button` applies to its own clicks. Save is a
  // submit button now, so it no longer goes through that path — and a double
  // tap on "Save" would otherwise write the transaction twice.
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
      // only the dialog on top answers — anything under it stays put
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
        // the panel scrolls, its title and actions do not: on a short screen a
        // long form used to push Save out of reach behind the keyboard
        className="sheet-panel glass-strong flex max-h-[92dvh] w-full flex-col rounded-t-sheet outline-none sm:max-w-md sm:rounded-sheet"
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <h2 id={titleId} className="min-w-0 truncate text-lg font-bold text-ink-1">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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
            // Actions sit in a bar that does not scroll, so Save is reachable at
            // the bottom of an eight-field form without hunting for it, and so
            // is the line saying why it is off. A destructive action takes
            // `mr-auto` and goes to the far left, away from the button the thumb
            // is aiming for.
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

/* ---------- toast ---------- */

/**
 * A single transient message with one action, floated above the tab bar. Used
 * for the undo offer: every destructive action in this app is a permanent write
 * to Postgres, and a confirm dialog only guards the click — not the moment
 * afterwards when you realise it was the wrong row.
 */
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
  /** omit to make the toast permanent — it then has no dismiss button either */
  onDismiss?: () => void;
  timeoutMs?: number;
}) {
  useEffect(() => {
    if (!onDismiss) return;
    const id = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(id);
    // re-armed per message, so a second action restarts the countdown instead
    // of expiring on the first one's timer
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
            aria-label="Dismiss"
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
