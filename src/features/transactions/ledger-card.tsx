"use client";

import { useDeferredValue, useState } from "react";
import { OptionPicker } from "@/components/forms/option-picker";
import { useAccountGroups, useCategoryGroups } from "@/components/forms/picker-groups";
import {
  AddButton,
  Button,
  Card,
  EmptyState,
  FilterPills,
  Icon,
  IconDisc,
  Money,
  SearchInput,
  SegmentedControl,
  SortSelect,
  Toolbar,
  ToolbarSlot,
} from "@/components/ui";
import { addMonths, formatDate, formatDateShort, formatMonth, formatMonthShort, formatWeekday, monthOf, todayISO } from "@/lib/date";
import { descendantsOf } from "@/lib/finance/categories";
import { convert, formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { matchesQuery, oneOf, sortItems, usePersistentState } from "@/lib/state/listing";
import { useStore } from "@/lib/state/store";
import type { Transaction, TxType } from "@/lib/types";

type LedgerSort = "date" | "amount" | "category" | "account";
type LedgerScope = "month" | "quarter" | "year" | "all";
type LedgerTiming = "all" | "posted" | "planned";

const digits = (v: string) => v.replace(/[^\d]/g, "");

/** Every entry in a period, grouped by day, with search, filters and sorting. */
export function LedgerCard({
  month,
  onAdd,
  onEdit,
}: {
  month: string;
  onAdd: () => void;
  onEdit: (tx: Transaction) => void;
}) {
  const { state } = useStore();
  const { t, tp, category } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();

  const [query, setQuery] = useState("");
  const [type, setType] = useState<TxType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [timing, setTiming] = useState<LedgerTiming>("all");
  const [scope, setScope] = usePersistentState<LedgerScope>(
    "ledger.scope",
    "month",
    oneOf(["month", "quarter", "year", "all"] as const),
  );
  const [sort, setSort] = usePersistentState<LedgerSort>(
    "ledger.sort",
    "date",
    oneOf(["date", "amount", "category", "account"] as const),
  );
  const [dir, setDir] = usePersistentState<"asc" | "desc">("ledger.dir", "desc", oneOf(["asc", "desc"] as const));

  const categoryGroups = useCategoryGroups(state.categories, ["expense", "income"], [
    { value: "", label: t("filter.allCategories") },
  ]);
  const accountGroups = useAccountGroups(state.savings, [{ value: "", label: t("filter.allAccounts") }]);

  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const accountById = new Map(state.savings.map((a) => [a.id, a]));

  // The field keeps up with every keystroke; the filtered list follows in the background.
  const q = useDeferredValue(query).trim().toLowerCase();
  const qDigits = digits(q);
  const inCategory = categoryFilter ? descendantsOf(state.categories, categoryFilter) : null;
  const filtering =
    q !== "" || type !== "all" || categoryFilter !== "" || accountFilter !== "" || tagFilter !== "" || timing !== "all";
  const allTags = [...new Set(state.transactions.flatMap((tx) => tx.tags ?? []))].sort((a, b) => a.localeCompare(b));
  const tagGroups = [
    {
      items: [{ value: "", label: t("filter.allTags") }, ...allTags.map((tag) => ({ value: tag, label: `#${tag}` }))],
    },
  ];
  const matchesFilter = (tx: Transaction) => {
    if (type !== "all" && tx.type !== type) return false;
    if (timing === "posted" && tx.date > today) return false;
    if (timing === "planned" && tx.date <= today) return false;
    if (inCategory && !inCategory.has(tx.categoryId)) return false;
    if (accountFilter && tx.accountId !== accountFilter && tx.toAccountId !== accountFilter) return false;
    if (tagFilter && !(tx.tags ?? []).includes(tagFilter)) return false;
    if (!q) return true;
    const cat = catById.get(tx.categoryId);
    const from = tx.accountId ? accountById.get(tx.accountId) : undefined;
    const to = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined;
    if (
      matchesQuery(q, tx.note, cat ? category(cat) : undefined, from?.name, to?.name, tx.currency, formatDate(tx.date), ...(tx.tags ?? []))
    )
      return true;
    return qDigits.length > 0 && digits(String(tx.amount)).includes(qDigits);
  };
  const clearFilters = () => {
    setQuery("");
    setType("all");
    setCategoryFilter("");
    setAccountFilter("");
    setTagFilter("");
    setTiming("all");
  };

  const monthCount = state.transactions.filter((tx) => monthOf(tx.date) === month).length;
  const scopeStart = scope === "quarter" ? addMonths(month, -2) : scope === "year" ? `${month.slice(0, 4)}-01` : month;
  const scopeEnd = scope === "year" ? `${month.slice(0, 4)}-12` : month;
  const inScope = (tx: Transaction) => {
    if (scope === "all") return true;
    const m = monthOf(tx.date);
    return m >= scopeStart && m <= scopeEnd;
  };
  const scoped = state.transactions.filter(inScope);
  const plannedCount = scoped.filter((tx) => tx.date > today).length;
  const spanning = scope !== "month";
  const ledger = scoped.filter(matchesFilter);
  const signedBase = (tx: Transaction) =>
    (tx.type === "expense" ? -1 : 1) * convert(tx.amount, tx.currency, base, settings.rates);
  const net = ledger.reduce((sum, tx) => (tx.type === "transfer" ? sum : sum + signedBase(tx)), 0);

  const byDay = new Map<string, Transaction[]>();
  for (const tx of ledger) {
    const list = byDay.get(tx.date);
    if (list) list.push(tx);
    else byDay.set(tx.date, [tx]);
  }
  const days = sortItems([...byDay.keys()], (d) => d, dir);
  const flat = sortItems(
    ledger,
    (tx) =>
      sort === "amount"
        ? Math.abs(signedBase(tx))
        : sort === "category"
          ? category(catById.get(tx.categoryId)).toLocaleLowerCase()
          : (tx.accountId ? (accountById.get(tx.accountId)?.name ?? "") : "").toLocaleLowerCase(),
    dir,
  );

  const row = (tx: Transaction, showDate: boolean) => {
    const cat = catById.get(tx.categoryId);
    const isTransfer = tx.type === "transfer";
    const from = tx.accountId ? accountById.get(tx.accountId) : undefined;
    const to = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined;
    const parent = cat?.parentId ? catById.get(cat.parentId) : undefined;
    const note = tx.note?.trim();
    return (
      <button
        key={tx.id}
        type="button"
        onClick={() => onEdit(tx)}
        className="row-tap flex w-full items-center gap-3 px-2.5 py-2 text-left"
      >
        <IconDisc colorSlot={isTransfer ? undefined : cat?.colorSlot} className="size-9 rounded-full text-base">
          {isTransfer ? "⇄" : (cat?.icon ?? "❓")}
        </IconDisc>
        <span className="min-w-0 flex-1">
          {/* A note names the entry (the service, the shop); the category then moves to the second line. */}
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink-1">
            <span className="truncate">{isTransfer ? `${from?.name ?? "?"} → ${to?.name ?? "?"}` : note || category(cat)}</span>
            {tx.attachmentIds?.length ? (
              <Icon name="receipt" size={12} className="shrink-0 text-ink-3" aria-label={t("tx.receipt")} />
            ) : null}
            {tx.splitId ? <span className="shrink-0 rounded-full bg-ghost px-1.5 text-[10px] font-semibold text-ink-3">{t("tx.split.badge")}</span> : null}
          </span>
          <span className="block truncate text-xs text-ink-3">
            {isTransfer
              ? tx.toAmount != null && to && tx.toAmount !== tx.amount
                ? t("tx.arrivesAs", { amount: formatMoney(tx.toAmount, to.currency, { exact: true }) })
                : (tx.note ?? t("tx.type.transfer"))
              : [
                  showDate ? formatDateShort(tx.date) : null,
                  note ? (parent ? `${category(parent)} › ${category(cat)}` : category(cat)) : parent ? category(parent) : null,
                  from?.name,
                  tx.tags?.map((tag) => `#${tag}`).join(" "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </span>
        <Money
          amount={tx.type === "expense" ? -tx.amount : tx.amount}
          currency={tx.currency}
          sign={!isTransfer}
          className={`shrink-0 whitespace-nowrap text-sm font-semibold ${
            isTransfer ? "text-ink-2" : tx.type === "income" ? "text-income" : "text-expense"
          }`}
        />
      </button>
    );
  };

  const addButton = (variant: "primary" | "ghost") => (
    <AddButton variant={variant} onClick={onAdd} label={t("common.add")} />
  );

  return (
    <Card
      title={t("tx.ledger")}
      subtitle={
        filtering
          ? spanning
            ? tp("tx.ledger.matchesAll", ledger.length)
            : tp("tx.ledger.matchesMonth", ledger.length, { month: formatMonth(month) })
          : tp("tx.ledger.entriesMonth", monthCount, { month: formatMonth(month) })
      }
      icon="receipt"
      action={addButton("ghost")}
    >
      {state.transactions.length > 0 && (
        <>
          <Toolbar className="mb-2">
            <SearchInput value={query} onChange={setQuery} placeholder={t("tx.search")} />
            <SegmentedControl
              size="sm"
              label={t("tx.kind")}
              className="flex-[1_0_auto] sm:flex-none"
              options={[
                { value: "all" as const, label: t("tx.kind.all") },
                { value: "expense" as const, label: t("tx.kind.out") },
                { value: "income" as const, label: t("tx.kind.in") },
                { value: "transfer" as const, label: "⇄" },
              ]}
              value={type}
              onChange={setType}
            />
          </Toolbar>
          <Toolbar className="mb-2">
            <FilterPills
              label={t("filter.period")}
              options={[
                { value: "month" as const, label: formatMonthShort(month) },
                { value: "quarter" as const, label: t("filter.period.quarter") },
                { value: "year" as const, label: month.slice(0, 4) },
                { value: "all" as const, label: t("filter.period.all") },
              ]}
              value={scope}
              onChange={setScope}
            />
            {plannedCount > 0 && (
              <FilterPills
                label={t("filter.timing")}
                options={[
                  { value: "all" as const, label: t("filter.all") },
                  { value: "posted" as const, label: t("filter.timing.posted") },
                  { value: "planned" as const, label: t("filter.timing.planned") },
                ]}
                value={timing}
                onChange={setTiming}
              />
            )}
          </Toolbar>
          <Toolbar>
            <ToolbarSlot>
              <OptionPicker
                size="sm"
                label={t("filter.category")}
                value={categoryFilter}
                onChange={setCategoryFilter}
                groups={categoryGroups}
              />
            </ToolbarSlot>
            {state.savings.length > 0 && (
              <ToolbarSlot>
                <OptionPicker
                  size="sm"
                  label={t("filter.account")}
                  value={accountFilter}
                  onChange={setAccountFilter}
                  groups={accountGroups}
                />
              </ToolbarSlot>
            )}
            {allTags.length > 0 && (
              <ToolbarSlot>
                <OptionPicker size="sm" label={t("filter.tag")} value={tagFilter} onChange={setTagFilter} groups={tagGroups} />
              </ToolbarSlot>
            )}
            <SortSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: "date", label: t("sort.date") },
                { value: "amount", label: t("sort.amount") },
                { value: "category", label: t("filter.category") },
                { value: "account", label: t("common.account") },
              ]}
              direction={dir}
              onDirectionChange={setDir}
            />
            {filtering && (
              <Button variant="ghost" size="sm" className="shrink-0" onClick={clearFilters}>
                {t("filter.reset")}
              </Button>
            )}
          </Toolbar>
          {ledger.length > 0 && (
            <p className="tnum mb-2 px-1 text-xs text-ink-3">
              {tp("common.entries", ledger.length)} ·{" "}
              <span className={net >= 0 ? "text-income" : "text-expense"}>
                {formatMoney(net, base, { sign: true, compact: true })}
              </span>
            </p>
          )}
        </>
      )}
      {ledger.length === 0 ? (
        filtering ? (
          <EmptyState
            icon={<Icon name="search" />}
            title={t("filter.noMatches")}
            hint={spanning ? t("tx.noMatch.all") : t("tx.noMatch.month", { month: formatMonth(month) })}
            action={
              <Button variant="ghost" onClick={clearFilters}>
                {t("filter.reset")}
              </Button>
            }
          />
        ) : (
          <EmptyState icon={<Icon name="receipt" />} title={t("tx.empty")} hint={t("tx.empty.hint")} action={addButton("primary")} />
        )
      ) : sort !== "date" ? (
        <div className="rows">{flat.map((tx) => row(tx, true))}</div>
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const planned = day > today;
            const rows = byDay.get(day)!;
            const dayNet = rows.filter((tx) => tx.type !== "transfer").reduce((sum, tx) => sum + signedBase(tx), 0);
            return (
              <section key={day} className={planned ? "opacity-75" : ""}>
                <h3 className="group-head">
                  <span className="flex items-center gap-2">
                    <span>
                      <span className="text-ink-1">{formatWeekday(day)}</span>
                      <span className="font-medium text-ink-3">, {spanning ? formatDate(day) : formatDateShort(day)}</span>
                    </span>
                    {planned && (
                      <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent">
                        {t("tx.planned")}
                      </span>
                    )}
                  </span>
                  <span className={`tnum shrink-0 ${dayNet >= 0 ? "text-income" : "text-expense"}`}>
                    {formatMoney(dayNet, base, { compact: true, sign: true })}
                  </span>
                </h3>
                <div className="rows mt-1">{rows.map((tx) => row(tx, false))}</div>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}
