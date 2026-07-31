"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { todayISO } from "@/lib/date";
import { netWorth } from "@/lib/finmath";
import { formatMoney } from "@/lib/money";
import { useStore, type SyncStatus } from "@/lib/store";
import type { ThemePref } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

function Stroke({ d, active, size = 20 }: { d: string; active: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: (a) => <Stroke active={a} d="M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" />,
  },
  {
    href: "/transactions",
    label: "Expenses",
    icon: (a) => <Stroke active={a} d="M4 7h13m0 0-3-3m3 3-3 3M20 17H7m0 0 3-3m-3 3 3 3" />,
  },
  {
    href: "/income",
    label: "Income",
    icon: (a) => <Stroke active={a} d="M12 3v14m0 0 5-5m-5 5-5-5M4 21h16" />,
  },
  {
    href: "/balance",
    label: "Balance",
    icon: (a) => (
      <Stroke active={a} d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Zm0 3h16M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" />
    ),
  },
  {
    href: "/forecast",
    label: "Forecast",
    icon: (a) => <Stroke active={a} d="M4 20V10m5.33 10V4m5.34 16v-9M20 20v-5" />,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (a) => (
      <Stroke active={a} d="M4 7h9m4 0h3M4 17h3m4 0h9M15 7a2 2 0 1 0 0-.01M9 17a2 2 0 1 0 0-.01" />
    ),
  },
];

/** floating glass command bar — the app's only chrome on desktop */
/** shows when a write is in flight or the last write to Postgres failed */
/** a quiet status dot: pulsing while saving, red on failure, hidden when idle */
function SyncDot({ sync }: { sync: SyncStatus }) {
  if (sync === "idle") return null;
  const failed = sync === "error";
  return (
    <span
      title={
        failed
          ? "Could not save — your last changes are only in this tab"
          : "Saving…"
      }
      className={`hidden items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-xs font-semibold sm:inline-flex ${
        failed ? "bg-expense/12 text-expense" : "bg-ghost text-ink-2"
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          failed ? "bg-expense" : "animate-pulse bg-income"
        }`}
      />
      {failed ? "Not saved" : "Saving"}
    </span>
  );
}

const THEME_CHOICES: Array<{
  value: ThemePref;
  /** accessible name */
  label: string;
  /** what fits beside the icon when the control has room */
  short: string;
  icon: ReactNode;
}> = [
  {
    value: "system",
    label: "Match the system theme",
    short: "Auto",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2.2" />
        <path d="M9 20.5h6M12 17.5v3" />
      </>
    ),
  },
  {
    value: "light",
    label: "Light theme",
    short: "Light",
    icon: (
      <>
        <circle cx="12" cy="12" r="4.1" />
        <path d="M12 2.6v2M12 19.4v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.6 12h2M19.4 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4" />
      </>
    ),
  },
  {
    value: "dark",
    label: "Dark theme",
    short: "Dark",
    icon: <path d="M20.5 14.3A8.5 8.5 0 1 1 9.7 3.5a6.6 6.6 0 0 0 10.8 10.8Z" />,
  },
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
  return (
    <div
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
            aria-label={choice.label}
            title={choice.label}
            onClick={() =>
              update((s) => ({ ...s, settings: { ...s.settings, theme: choice.value } }))
            }
            className={`relative z-1 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent-soft ${
              active ? "text-ink-1" : "text-ink-3 hover:text-ink-1"
            } ${compact ? "size-8 p-0" : ""}`}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={active ? 2.1 : 1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="shrink-0"
            >
              {choice.icon}
            </svg>
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
      className="row-tap flex shrink-0 items-center gap-3 rounded-2xl p-2"
      aria-label="Dashboard"
    >
      <span
        aria-hidden
        className="btn-gradient flex size-9 items-center justify-center rounded-xl text-base font-black shadow-md"
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
      <div className="glass-strong flex h-full w-full flex-col rounded-3xl p-3">
        <Brand />

        <nav className="mt-4 flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-150 ${
                  active
                    ? "btn-gradient"
                    : "text-ink-2 hover:bg-fill-hover hover:text-ink-1"
                }`}
              >
                {item.icon(active)}
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
    <nav className="glass-strong fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-full px-1 py-1.5 md:hidden">
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            className={`flex flex-col items-center gap-0.5 rounded-full px-2 py-1 transition-colors duration-150 ${
              active ? "text-accent [text-shadow:0_0_12px_var(--glow-a)]" : "text-ink-3"
            }`}
          >
            {item.icon(active)}
            <span className="text-[11px] font-semibold">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
