"use client";

import Link from "next/link";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import { todayISO } from "@/lib/date";
import { netWorth } from "@/lib/finmath";
import { formatMoney } from "@/lib/money";
import { useStore, type SyncStatus } from "@/lib/store";
import { useRadioGroupKeys } from "./ui";
import { Icon, type IconName } from "./icons";
import type { ThemePref } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  /**
   * What fits under a 20px icon in a sixth of a phone. "Dashboard" at 11px is
   * ~58px of text; six tabs of that plus their padding need about 450px of
   * intrinsic width, and the bar has 361px to give on a 393px phone — so the
   * labels were spilling out past the ends of the rounded bar on every handset
   * made. The full name still goes to the sidebar and to the accessible name.
   */
  short: string;
  icon: IconName;
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Home", icon: "home" },
  { href: "/transactions", label: "Expenses", short: "Spend", icon: "swapArrows" },
  { href: "/income", label: "Income", short: "Income", icon: "arrowDown" },
  { href: "/balance", label: "Balance", short: "Balance", icon: "wallet" },
  { href: "/forecast", label: "Forecast", short: "Plan", icon: "bars" },
  { href: "/settings", label: "Settings", short: "More", icon: "gear" },
];

/** floating glass command bar — the app's only chrome on desktop */
/** shows when a write is in flight or the last write to Postgres failed */
/** a quiet status dot: pulsing while saving, red on failure, hidden when idle */
function SyncDot({ sync }: { sync: SyncStatus }) {
  if (sync === "idle") return null;
  // "conflict" is louder than a failed write: the data on the server is newer
  // than what this tab holds, so nothing here will be saved until it reloads
  const bad = sync === "error" || sync === "conflict";
  const label =
    sync === "conflict" ? "Out of date" : sync === "error" ? "Not saved" : "Saving";
  const title =
    sync === "conflict"
      ? "Another tab saved after this one loaded — reload to catch up"
      : sync === "error"
        ? "Could not save — your last changes are only in this tab"
        : "Saving…";
  return (
    <span
      title={title}
      className={`hidden items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-xs font-semibold sm:inline-flex ${
        bad ? "bg-expense/12 text-expense" : "bg-ghost text-ink-2"
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${bad ? "bg-expense" : "animate-pulse bg-income"}`}
      />
      {label}
    </span>
  );
}

const THEME_CHOICES: Array<{
  value: ThemePref;
  /** accessible name */
  label: string;
  /** what fits beside the icon when the control has room */
  short: string;
  icon: IconName;
}> = [
  { value: "system", label: "Match the system theme", short: "Auto", icon: "monitor" },
  { value: "light", label: "Light theme", short: "Light", icon: "sun" },
  { value: "dark", label: "Dark theme", short: "Dark", icon: "moon" },
];

/**
 * Theme as a three-way choice rather than a flip — the preference itself is
 * three-valued, and a toggle could never show that "system" was picked. The
 * selected thumb is one element that slides between the three positions, so
 * the control reads as a switch instead of three separate buttons.
 */
function ThemeChoice({ compact = false }: { compact?: boolean }) {
  const { state, update } = useStore();
  const current = state.settings.theme;
  const index = Math.max(0, THEME_CHOICES.findIndex((c) => c.value === current));
  const setTheme = (theme: ThemePref) =>
    update((s) => ({ ...s, settings: { ...s.settings, theme } }));
  const groupRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useRadioGroupKeys(
    groupRef,
    THEME_CHOICES.map((c) => c.value),
    current,
    setTheme,
  );
  return (
    <div
      ref={groupRef}
      onKeyDown={onKeyDown}
      role="radiogroup"
      aria-label="Theme"
      className={`relative flex shrink-0 rounded-full bg-ghost p-1 ${compact ? "" : "w-full"}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 rounded-full bg-(--card-strong) shadow-[inset_0_1px_0_var(--card-highlight),0_1px_4px_rgba(4,12,24,0.14)] transition-[left] duration-300 ease-[cubic-bezier(0.22,0.68,0.24,1)]"
        style={{ width: "calc((100% - 0.5rem) / 3)", left: `calc(0.25rem + ${index} * (100% - 0.5rem) / 3)` }}
      />
      {THEME_CHOICES.map((choice) => {
        const active = choice.value === current;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            aria-label={choice.label}
            title={choice.label}
            onClick={() => setTheme(choice.value)}
            className={`relative z-1 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent-soft ${
              active ? "text-ink-1" : "text-ink-3 hover:text-ink-1"
            } ${compact ? "size-8 p-0" : ""}`}
          >
            <Icon name={choice.icon} size={15} strokeWidth={active ? 2.1 : 1.8} />
            {!compact && <span>{choice.short}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** gradient ₴ tile + wordmark + live net worth; the app's identity block */
function Brand() {
  const { state, hydrated } = useStore();
  const worth = netWorth(state, todayISO());
  return (
    <Link
      href="/"
      className="row-tap flex shrink-0 items-center gap-3 p-2"
      aria-label="Dashboard"
    >
      <span
        aria-hidden
        className="btn-gradient flex size-9 items-center justify-center rounded-chip text-base font-black shadow-md"
      >
        ₴
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-bold tracking-tight text-ink-1">Finances</span>
        {hydrated && (
          <span className="tnum block text-xs text-ink-3">
            {formatMoney(worth.total, state.settings.baseCurrency, { compact: true })}
          </span>
        )}
      </span>
    </Link>
  );
}

/** desktop chrome: a floating glass rail down the left edge */
export function Sidebar() {
  const pathname = usePathname();
  const { sync } = useStore();
  return (
    <aside className="fixed inset-y-4 left-4 z-40 hidden w-56 md:flex">
      <div className="glass-strong flex h-full w-full flex-col rounded-card p-3">
        <Brand />

        <nav className="mt-4 flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                // the active item was marked in colour alone; `aria-current` is
                // what says "you are here" to anything that cannot see it
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-field px-3.5 py-2.5 text-sm font-semibold transition-all duration-150 ${
                  active
                    ? "btn-gradient"
                    : "text-ink-2 hover:bg-fill-hover hover:text-ink-1"
                }`}
              >
                <Icon name={item.icon} size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-3 space-y-2 border-t border-hairline pt-3">
          <SyncDot sync={sync} />
          <ThemeChoice />
        </div>
      </div>
    </aside>
  );
}

/** mobile chrome: a slim top bar (brand + theme); nav lives in the TabBar */
export function MobileTopBar() {
  const { sync } = useStore();
  return (
    <header className="sticky top-4 z-40 mb-6 md:hidden">
      <div className="glass-strong flex items-center gap-2 rounded-full py-1.5 pl-2 pr-2.5">
        <Brand />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SyncDot sync={sync} />
          <ThemeChoice compact />
        </div>
      </div>
    </header>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="glass-strong fixed inset-x-3 bottom-3 z-40 flex rounded-full px-1 py-1.5 md:hidden">
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            // `flex-1 basis-0 min-w-0` rather than `justify-around`: equal sixths
            // that are allowed to shrink, so the bar can never be wider than the
            // phone no matter what the labels say. `justify-around` distributes
            // free space and simply overflows when there is none.
            className={`flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 rounded-full px-1 py-1 transition-colors duration-150 ${
              active ? "text-accent [text-shadow:0_0_12px_var(--glow-a)]" : "text-ink-3"
            }`}
          >
            <Icon name={item.icon} size={20} strokeWidth={active ? 2.2 : 1.8} />
            <span className="w-full truncate text-center text-[11px] font-semibold">
              {item.short}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
