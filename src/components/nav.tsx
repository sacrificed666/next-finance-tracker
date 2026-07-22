"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore, type SyncStatus } from "@/lib/store";

interface NavItem {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

function Stroke({ d, active }: { d: string; active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
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
function SyncBadge({ sync }: { sync: SyncStatus }) {
  if (sync === "idle") return null;
  const failed = sync === "error";
  return (
    <span
      title={
        failed
          ? "Could not save to the database — your last changes are only in this tab"
          : "Saving to the database…"
      }
      className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
        failed ? "bg-expense/10 text-expense" : "bg-ghost text-ink-2"
      }`}
    >
      <span aria-hidden>{failed ? "⚠️" : "💾"}</span>
      {failed ? "Not saved" : "Saving…"}
    </span>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const { state, update, sync } = useStore();
  const theme = state.settings.theme;

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    update((s) => ({ ...s, settings: { ...s.settings, theme: next } }));
  };

  return (
    <header className="sticky top-4 z-40 mb-6">
      <div className="glass-strong flex items-center justify-between gap-3 rounded-full py-2 pl-5 pr-2">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span aria-hidden className="text-lg">💠</span>
          <span className="text-[15px] font-bold tracking-tight text-ink-1">
            Finances
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-150 ${
                  active
                    ? "btn-gradient shadow-md"
                    : "text-ink-2 hover:bg-ghost-2 hover:text-ink-1"
                }`}
              >
                {item.icon(active)}
                <span className={active ? "" : "hidden lg:inline"}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <SyncBadge sync={sync} />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ghost text-base transition-colors hover:bg-ghost-2"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
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
