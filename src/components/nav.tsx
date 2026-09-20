"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { todayISO } from "@/lib/date";
import { netWorth } from "@/lib/finmath";
import { formatMoney } from "@/lib/money";
import { useStore, type SyncStatus } from "@/lib/store";
import { useT, type MessageKey } from "@/lib/i18n";
import { Icon, type IconName } from "./icons";

interface NavItem {
  href: string;
  label: MessageKey;
  short: MessageKey;
  icon: IconName;
}

const NAV_GROUPS: Array<{ title: MessageKey; items: NavItem[] }> = [
  {
    title: "nav.group.overview",
    items: [{ href: "/", label: "nav.dashboard", short: "nav.dashboard.short", icon: "home" }],
  },
  {
    title: "nav.group.money",
    items: [
      { href: "/transactions", label: "nav.expenses", short: "nav.expenses.short", icon: "spend" },
      { href: "/income", label: "nav.income", short: "nav.income.short", icon: "arrowDown" },
    ],
  },
  {
    title: "nav.group.wealth",
    items: [
      { href: "/balance", label: "nav.balance", short: "nav.balance.short", icon: "wallet" },
      { href: "/forecast", label: "nav.forecast", short: "nav.forecast.short", icon: "trend" },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

const PROFILE: NavItem = {
  href: "/profile",
  label: "nav.profile",
  short: "nav.profile.short",
  icon: "user",
};

const SETTINGS: NavItem = {
  href: "/settings",
  label: "nav.settings",
  short: "nav.settings.short",
  icon: "gear",
};

function syncTitle(sync: SyncStatus, t: ReturnType<typeof useT>["t"]): string {
  return sync === "conflict"
    ? t("sync.conflictTitle")
    : sync === "error"
      ? t("sync.errorTitle")
      : t("sync.savingTitle");
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const { t } = useT();
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-field px-3.5 py-2.5 text-sm font-semibold transition-[background-color,color] duration-150 ${
        active
          ? "glass-el text-ink-1"
          : "text-ink-2 hover:bg-fill-hover hover:text-ink-1"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-fill"
        />
      )}
      <Icon
        name={item.icon}
        size={20}
        strokeWidth={active ? 2.2 : 1.8}
        className={active ? "text-accent" : undefined}
      />
      <span className="truncate">{t(item.label)}</span>
    </Link>
  );
}

function SyncDot({ sync }: { sync: SyncStatus }) {
  const { t } = useT();
  if (sync === "idle") return null;
  const bad = sync === "error" || sync === "conflict";
  const label =
    sync === "conflict" ? t("sync.outOfDate") : sync === "error" ? t("sync.notSaved") : t("sync.saving");
  const title = syncTitle(sync, t);
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

function Brand() {
  const { state, hydrated, sync } = useStore();
  const { t } = useT();
  const worth = netWorth(state, todayISO());
  const bad = sync === "error" || sync === "conflict";
  return (
    <Link
      href="/"
      className="row-tap flex shrink-0 items-center gap-3 p-2"
      aria-label={t("nav.dashboard")}
    >
      <span className="relative shrink-0">
        <span
          aria-hidden
          className="btn-gradient flex size-9 items-center justify-center rounded-chip text-base font-black shadow-md"
        >
          ₴
        </span>
        {sync !== "idle" && (
          <span
            title={syncTitle(sync, t)}
            className={`absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-(--card) ${
              bad ? "bg-expense" : "animate-pulse bg-income"
            }`}
          />
        )}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-bold tracking-tight text-ink-1">{t("app.name")}</span>
        {hydrated && (
          <span className="tnum block text-xs text-ink-3">
            {formatMoney(worth.total, state.settings.baseCurrency, { compact: true })}
          </span>
        )}
      </span>
    </Link>
  );
}

function SignOutRow() {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={() => void signOut({ redirectTo: "/login" })}
      className="row-tap flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm font-medium text-ink-2 transition-colors hover:text-ink-1"
    >
      <Icon name="logout" size={18} />
      {t("nav.signOut")}
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <aside className="fixed inset-y-4 left-4 z-40 hidden w-56 md:flex">
      <div className="glass flex h-full w-full flex-col overflow-y-auto rounded-card p-3">
        <Brand />

        <nav className="mt-4 flex flex-1 flex-col gap-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="card-title px-3.5 pb-1.5">{t(group.title)}</p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavRow key={item.href} item={item} active={pathname === item.href} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-4 space-y-2 border-t border-hairline pt-3">
          <NavRow item={PROFILE} active={pathname === PROFILE.href} />
          <NavRow item={SETTINGS} active={pathname === SETTINGS.href} />
          <SignOutRow />
        </div>
      </div>
    </aside>
  );
}

export function MobileTopBar() {
  const { sync } = useStore();
  const { t } = useT();
  const pathname = usePathname();
  const settingsActive = pathname === SETTINGS.href;
  return (
    <header className="sticky top-4 z-40 mb-6 md:hidden">
      <div className="glass-strong flex items-center gap-2 rounded-full py-1.5 pl-2 pr-2.5">
        <Brand />
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <SyncDot sync={sync} />
          <Link
            href={SETTINGS.href}
            aria-label={t(SETTINGS.label)}
            aria-current={settingsActive ? "page" : undefined}
            className={`icon-btn size-8 shrink-0 ${settingsActive ? "text-accent" : ""}`}
          >
            <Icon name={SETTINGS.icon} size={17} strokeWidth={settingsActive ? 2.2 : 1.8} />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <nav className="glass-strong fixed inset-x-3 bottom-3 z-40 flex rounded-full px-1 py-1.5 md:hidden">
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={t(item.label)}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 rounded-full px-1 py-1 transition-colors duration-150 ${
              active ? "text-accent" : "text-ink-3"
            }`}
          >
            {active && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-accent-soft"
              />
            )}
            <Icon
              name={item.icon}
              size={20}
              strokeWidth={active ? 2.2 : 1.8}
              className="relative"
            />
            <span className="relative w-full truncate text-center text-[11px] font-semibold">
              {t(item.short)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
