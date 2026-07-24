"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { todayISO } from "@/lib/date";
import { netWorth } from "@/lib/finmath";
import { formatMoney } from "@/lib/money";
import { useStore, type SyncStatus } from "@/lib/store";

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
      className={`hidden items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-[11px] font-semibold sm:inline-flex ${
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

function useTheme() {
  const { state, update } = useStore();
  const theme = state.settings.theme;
  const toggle = () =>
    update((s) => ({
      ...s,
      settings: { ...s.settings, theme: theme === "dark" ? "light" : "dark" },
    }));
  return { theme, toggle };
}

function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-ghost text-base transition-colors hover:bg-ghost-2 active:scale-95 ${className}`}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
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
        className="btn-gradient flex size-9 items-center justify-center rounded-xl text-base font-black text-white shadow-md"
      >
        ₴
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-bold tracking-tight text-ink-1">Finances</span>
        {hydrated && (
          <span className="tnum block text-[11px] text-ink-3">
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
                className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
                  active
                    ? "btn-gradient shadow-md"
                    : "text-ink-2 hover:bg-ghost hover:text-ink-1"
                }`}
              >
                {item.icon(active)}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline pt-3">
          <SyncDot sync={sync} />
          <ThemeToggle className="ml-auto" />
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
          <ThemeToggle />
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
              active ? "text-accent" : "text-ink-3"
            }`}
          >
            {item.icon(active)}
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
