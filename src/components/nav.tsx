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

/**
 * Six flat items said every page was a peer of every other. They are not:
 * four are places you keep money facts, one is the summary of them, and
 * Settings is machinery. Grouping says which is which before you read a word,
 * and pulling Settings out of the list leaves the tab bar five comfortable
 * targets instead of six cramped ones.
 */
const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Overview",
    items: [{ href: "/", label: "Dashboard", short: "Home", icon: "home" }],
  },
  {
    title: "Money",
    items: [
      { href: "/transactions", label: "Expenses", short: "Spend", icon: "spend" },
      { href: "/income", label: "Income", short: "Income", icon: "arrowDown" },
    ],
  },
  {
    title: "Wealth",
    items: [
      { href: "/balance", label: "Balance", short: "Balance", icon: "wallet" },
      { href: "/forecast", label: "Forecast", short: "Plan", icon: "trend" },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

const SETTINGS: NavItem = {
  href: "/settings",
  label: "Settings",
  short: "More",
  icon: "gear",
};

/**
 * One row, one look, wherever it is. The active state used to be `btn-gradient`
 * — the very same bright fill as the app's primary action button — so "you are
 * here" and "press me" were the same object in two places. A destination is not
 * an action: it gets the glass the rest of the chrome is made of, ink at full
 * strength, and a marker down its leading edge.
 */
function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      // the active item was marked in colour alone; `aria-current` is what says
      // "you are here" to anything that cannot see it
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
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** a quiet status chip: pulsing while saving, red on failure, hidden when idle */
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
      // the same groove-and-thumb the app's other single choices are made of
      className={`glass-well relative flex shrink-0 rounded-full p-1 ${compact ? "" : "w-full"}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 rounded-full bg-(--card-strong) shadow-[inset_0_1px_0_color-mix(in_oklab,var(--rim-light)_70%,transparent),inset_0_-1px_0_var(--under-edge),0_2px_6px_var(--rim-shade)] transition-[left] duration-300 ease-[cubic-bezier(0.22,0.68,0.24,1)]"
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

/**
 * Gradient ₴ tile, wordmark, and the live net worth as one quiet line under it.
 *
 * It briefly had a panel of its own in the rail — a bordered block with the
 * figure, a rule, and a cash/invested split. It looked like a card that had lost
 * its page. The number is chrome here, not content: the dashboard hero says it
 * properly, and all the rail owes is a glance.
 */
function Brand() {
  const { state, hydrated, sync } = useStore();
  const worth = netWorth(state, todayISO());
  const bad = sync === "error" || sync === "conflict";
  return (
    <Link
      href="/"
      className="row-tap flex shrink-0 items-center gap-3 p-2"
      aria-label="Dashboard"
    >
      {/*
        The save status lives on the badge, and it costs no layout at all.
        In the footer it did: rendered only when saving, it added a row and
        shoved the divider above Settings; reserved always, it left the divider
        hanging over an empty band. A dot pinned to a corner is outside flow, so
        the rail never moves whichever way the status goes.
      */}
      <span className="relative shrink-0">
        <span
          aria-hidden
          className="btn-gradient flex size-9 items-center justify-center rounded-chip text-base font-black shadow-md"
        >
          ₴
        </span>
        {sync !== "idle" && (
          <span
            title={
              sync === "conflict"
                ? "Another tab saved after this one loaded — reload to catch up"
                : sync === "error"
                  ? "Could not save — your last changes are only in this tab"
                  : "Saving…"
            }
            className={`absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-(--card) ${
              bad ? "bg-expense" : "animate-pulse bg-income"
            }`}
          />
        )}
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
  return (
    <aside className="fixed inset-y-4 left-4 z-40 hidden w-56 md:flex">
      {/* the rail scrolls on its own when a short window cannot hold it, rather
          than clipping the theme control off the bottom edge */}
      {/*
        `.glass`, not `.glass-strong` — the same material as every card on the
        page, which is the point. The chrome tier exists for surfaces with the
        page scrolling underneath, and the rail has none: the content column is
        `md:pl-64` and the rail ends at 240px, so the only thing behind it is
        the backdrop. Blurring that averaged two smooth gradients into flat
        milk, and milk beside a card you can see through is exactly why the rail
        never looked like it belonged to the same app.
      */}
      <div className="glass flex h-full w-full flex-col overflow-y-auto rounded-card p-3">
        <Brand />

        <nav className="mt-4 flex flex-1 flex-col gap-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="card-title px-3.5 pb-1.5">{group.title}</p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavRow key={item.href} item={item} active={pathname === item.href} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Settings sits with the machinery, not with the money pages, and the
            sync status sits next to the thing it is the status of */}
        <div className="mt-4 space-y-2 border-t border-hairline pt-3">
          <NavRow item={SETTINGS} active={pathname === SETTINGS.href} />
          <ThemeChoice />
        </div>
      </div>
    </aside>
  );
}

/** mobile chrome: a slim top bar (brand + settings + theme); nav is the TabBar */
export function MobileTopBar() {
  const { sync } = useStore();
  const pathname = usePathname();
  const settingsActive = pathname === SETTINGS.href;
  return (
    <header className="sticky top-4 z-40 mb-6 md:hidden">
      <div className="glass-strong flex items-center gap-2 rounded-full py-1.5 pl-2 pr-2.5">
        <Brand />
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <SyncDot sync={sync} />
          {/* the sixth tab, moved up here: it left the bar five comfortable
              targets, and settings is not something you reach for mid-task */}
          <Link
            href={SETTINGS.href}
            aria-label={SETTINGS.label}
            aria-current={settingsActive ? "page" : undefined}
            className={`icon-btn size-8 shrink-0 ${settingsActive ? "text-accent" : ""}`}
          >
            <Icon name={SETTINGS.icon} size={17} strokeWidth={settingsActive ? 2.2 : 1.8} />
          </Link>
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
            className={`relative flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 rounded-full px-1 py-1 transition-colors duration-150 ${
              active ? "text-accent" : "text-ink-3"
            }`}
          >
            {/* a lit pill behind the active tab, not a text-shadow glow on it:
                the glow read as a rendering artefact at 11px, and it left the
                target itself looking exactly like its four neighbours */}
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
              {item.short}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
