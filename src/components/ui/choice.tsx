"use client";

import { useRef, type CSSProperties } from "react";

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
              small ? "min-h-8 px-2 text-xs" : "px-2.5 py-2 text-[13px]"
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
        gridTemplateColumns: `repeat(auto-fit, minmax(${size === "lg" ? "2.5rem" : "2rem"}, 1fr))`,
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
              size === "lg" ? "size-10 text-lg" : "size-8 text-base"
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
            className={`flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent-soft ${
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
      className={`btn-ring relative h-6 w-11 shrink-0 rounded-full outline-none transition-colors duration-200 before:absolute before:-inset-2 before:content-[''] focus-visible:ring-4 focus-visible:ring-accent-soft ${
        checked
          ? "bg-accent-fill shadow-[inset_0_1px_2px_var(--rim-shade)]"
          : "glass-well bg-ghost-2"
      }`}
    >
      <span
        className={`absolute top-1 size-4 rounded-full bg-white shadow-[0_1px_4px_rgba(10,20,16,0.3)] transition-[left] duration-200 ease-[cubic-bezier(0.22,0.68,0.24,1)] ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
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
