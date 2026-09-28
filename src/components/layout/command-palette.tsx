"use client";

import { useDeferredValue, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon, IconDisc, Money, type IconName } from "@/components/ui";
import { useDialogStack, useFocusTrap, useScrollLock } from "@/components/ui/overlay";
import { formatDateShort, todayISO } from "@/lib/date";
import { accountBalances } from "@/lib/finance/finmath";
import { useT } from "@/lib/i18n";
import { matchesQuery } from "@/lib/state/listing";
import { useStore } from "@/lib/state/store";
import { NAV, PROFILE, SETTINGS } from "./nav-items";

const OPEN_EVENT = "finance:command-palette";
const ENTRIES_SHOWN = 8;
const MATCHES_SHOWN = 5;

/** Open the palette from anywhere, such as a search button in the navigation. */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type Group = "actions" | "pages" | "accounts" | "investments" | "entries";
const GROUPS: Group[] = ["actions", "pages", "accounts", "investments", "entries"];

interface Command {
  id: string;
  group: Group;
  label: string;
  hint?: string;
  /** Extra text the query matches besides the label and the hint. */
  keywords?: string;
  mark: ReactNode;
  trailing?: ReactNode;
  run: () => void;
}

const glyph = (name: IconName) => (
  <span className="grid size-8 shrink-0 place-items-center rounded-chip bg-ghost text-ink-2">
    <Icon name={name} size={16} />
  </span>
);

/**
 * Ctrl+K (⌘K on a Mac): jump to any page, account or position, start a new
 * entry, or find an entry by its note, category, tag or amount and open it.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const show = () => {
      setQuery("");
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setActive(0);
        setOpen((was) => !was);
      }
    };
    window.addEventListener(OPEN_EVENT, show);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!open) return null;
  return (
    <Palette
      query={query}
      onQuery={(q) => {
        setQuery(q);
        setActive(0);
      }}
      active={active}
      onActive={setActive}
      onClose={() => setOpen(false)}
    />
  );
}

function Palette({
  query,
  onQuery,
  active,
  onActive,
  onClose,
}: {
  query: string;
  onQuery: (q: string) => void;
  active: number;
  onActive: (i: number) => void;
  onClose: () => void;
}) {
  const { state, update } = useStore();
  const { t, category } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const { settings } = state;

  useScrollLock(true);
  useFocusTrap(true, panelRef);
  const isTopmost = useDialogStack(true);

  const go = (href: string) => () => {
    onClose();
    router.push(href);
  };
  // Sheets opened through the address bar stay on the page you are on.
  const here = (param: string) => go(`${pathname}?${param}`);

  const dark =
    settings.theme === "dark" ||
    (settings.theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const commands: Command[] = [
    { id: "add-expense", group: "actions", label: t("dash.addExpense"), mark: glyph("plus"), run: here("add=expense") },
    { id: "add-income", group: "actions", label: t("palette.addIncome"), mark: glyph("arrowDown"), run: here("add=income") },
    ...(state.savings.length >= 2
      ? [{ id: "add-transfer", group: "actions" as const, label: t("palette.addTransfer"), mark: glyph("exchange"), run: here("add=transfer") }]
      : []),
    {
      id: "theme",
      group: "actions",
      label: dark ? t("palette.themeLight") : t("palette.themeDark"),
      mark: glyph(dark ? "sun" : "moon"),
      run: () => {
        onClose();
        update((s) => ({ ...s, settings: { ...s.settings, theme: dark ? "light" : "dark" } }));
      },
    },
    ...[...NAV, PROFILE, SETTINGS].map<Command>((item) => ({
      id: `page:${item.href}`,
      group: "pages",
      label: t(item.label),
      keywords: item.href,
      mark: glyph(item.icon),
      trailing: pathname === item.href ? <span className="caption">{t("palette.here")}</span> : undefined,
      run: go(item.href),
    })),
  ];

  // The field keeps up with typing; the results follow in the background.
  const q = useDeferredValue(query).trim();
  if (q !== "") {
    const balances = accountBalances(state);
    for (const acc of state.savings) {
      commands.push({
        id: `account:${acc.id}`,
        group: "accounts",
        label: acc.name,
        hint: t(`accountKind.${acc.kind}`),
        keywords: acc.bank,
        mark: <IconDisc className="size-8 rounded-chip text-sm">{acc.icon}</IconDisc>,
        trailing: <Money amount={balances.get(acc.id) ?? 0} currency={acc.currency} compact className="text-sm text-ink-2" />,
        run: go("/accounts"),
      });
    }
    for (const inv of state.investments) {
      commands.push({
        id: `investment:${inv.id}`,
        group: "investments",
        label: inv.name,
        hint: t(`investmentKind.${inv.kind}`),
        mark: glyph("bars"),
        run: go("/investments"),
      });
    }
  }

  const visible = commands.filter((c) => matchesQuery(q, c.label, c.hint, c.keywords));
  // Accounts and positions are many and alike; the closest few are enough.
  for (const group of ["accounts", "investments"] as const) {
    const extra = visible.filter((c) => c.group === group).slice(MATCHES_SHOWN);
    for (const c of extra) visible.splice(visible.indexOf(c), 1);
  }

  // Entries only once the query says something: a single letter matches half the ledger.
  if (q.length >= 2) {
    const catById = new Map(state.categories.map((c) => [c.id, c]));
    const today = todayISO();
    const entries = state.transactions
      .filter((tx) => {
        const cat = tx.categoryId ? catById.get(tx.categoryId) : undefined;
        return matchesQuery(q, tx.note, cat ? category(cat) : undefined, String(tx.amount), ...(tx.tags ?? []).map((tag) => `#${tag}`));
      })
      // What already happened, newest first; planned entries after it, soonest first.
      .sort((a, b) =>
        a.date > today !== b.date > today
          ? a.date > today
            ? 1
            : -1
          : a.date > today
            ? a.date.localeCompare(b.date)
            : b.date.localeCompare(a.date),
      )
      .slice(0, ENTRIES_SHOWN);
    for (const tx of entries) {
      const cat = tx.categoryId ? catById.get(tx.categoryId) : undefined;
      const note = tx.note?.trim();
      visible.push({
        id: `tx:${tx.id}`,
        group: "entries",
        label: note || (tx.type === "transfer" ? t("tx.type.transfer") : category(cat)),
        hint: [formatDateShort(tx.date), note && cat ? category(cat) : null, tx.date > today ? t("palette.planned") : null]
          .filter(Boolean)
          .join(" · "),
        mark: (
          <IconDisc colorSlot={tx.type === "transfer" ? undefined : cat?.colorSlot} className="size-8 rounded-full text-sm">
            {tx.type === "transfer" ? "⇄" : (cat?.icon ?? "❓")}
          </IconDisc>
        ),
        trailing: (
          <Money
            amount={tx.type === "expense" ? -tx.amount : tx.amount}
            currency={tx.currency}
            sign={tx.type !== "transfer"}
            compact
            className={`text-sm font-semibold ${tx.type === "income" ? "text-income" : tx.type === "expense" ? "text-expense" : "text-ink-2"}`}
          />
        ),
        run: here(`tx=${tx.id}`),
      });
    }
  }

  const ordered = GROUPS.flatMap((g) => visible.filter((c) => c.group === g));
  const current = Math.min(active, Math.max(0, ordered.length - 1));

  useEffect(() => {
    listRef.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [current, query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && isTopmost()) {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" && ordered.length > 0) {
      e.preventDefault();
      onActive((current + 1) % ordered.length);
    } else if (e.key === "ArrowUp" && ordered.length > 0) {
      e.preventDefault();
      onActive((current - 1 + ordered.length) % ordered.length);
    } else if (e.key === "Enter" && ordered[current]) {
      e.preventDefault();
      ordered[current].run();
    }
  };

  let index = -1;
  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-3 pt-[8vh] sm:pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.title")}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="sheet-panel glass-solid flex max-h-[76dvh] w-full max-w-xl flex-col overflow-hidden rounded-sheet outline-none"
      >
        <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
          <Icon name="search" size={18} className="shrink-0 text-ink-3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.title")}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={ordered[current] ? `${listId}-${current}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-base text-ink-1 outline-none placeholder:text-ink-3"
          />
          <kbd className="hidden shrink-0 rounded-md bg-ghost px-1.5 py-0.5 text-[11px] font-semibold text-ink-3 sm:block">Esc</kbd>
        </div>

        <ul ref={listRef} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {ordered.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-ink-3">{t("palette.empty", { query: q })}</li>
          )}
          {GROUPS.map((group) => {
            const items = ordered.filter((c) => c.group === group);
            if (items.length === 0) return null;
            return (
              <li key={group} role="presentation" className="mb-1 last:mb-0">
                <p className="card-title px-2.5 pb-1 pt-1.5">{t(`palette.group.${group}`)}</p>
                <ul role="presentation">
                  {items.map((c) => {
                    index++;
                    const i = index;
                    const isActive = i === current;
                    return (
                      <li
                        key={c.id}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive ? "" : undefined}
                        onMouseMove={() => !isActive && onActive(i)}
                        onClick={c.run}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-field px-2.5 py-1.5 ${
                          isActive ? "bg-fill-hover" : ""
                        }`}
                      >
                        {c.mark}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink-1">{c.label}</span>
                          {c.hint && <span className="block truncate text-xs text-ink-3">{c.hint}</span>}
                        </span>
                        {c.trailing && <span className="tnum shrink-0 whitespace-nowrap">{c.trailing}</span>}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>

        <p className="hidden items-center gap-3 border-t border-hairline px-4 py-2 text-[11px] text-ink-3 sm:flex">
          <span>
            <kbd className="font-semibold text-ink-2">↑↓</kbd> {t("palette.hint.move")}
          </span>
          <span>
            <kbd className="font-semibold text-ink-2">Enter</kbd> {t("palette.hint.open")}
          </span>
        </p>
      </div>
    </div>
  );
}

/** The search field look-alike that opens the palette, for the sidebar. */
export function PaletteButton({ className = "" }: { className?: string }) {
  const { t } = useT();
  const [mac, setMac] = useState(false);
  useEffect(() => {
    // Read on the client only; the server cannot know the visitor's platform.
    const id = setTimeout(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), 0);
    return () => clearTimeout(id);
  }, []);
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className={`flex w-full items-center gap-2 rounded-field bg-ghost px-3 py-2 text-left text-sm text-ink-3 transition-colors hover:bg-fill-hover hover:text-ink-2 ${className}`}
    >
      <Icon name="search" size={16} />
      <span className="min-w-0 flex-1 truncate">{t("palette.button")}</span>
      <kbd className="shrink-0 rounded-md bg-ghost px-1.5 text-[11px] font-semibold">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}
