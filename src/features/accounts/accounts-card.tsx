"use client";

import { useState, type CSSProperties } from "react";
import {
  AddButton,
  Card,
  CurrencyCells,
  EmptyState,
  FilterPills,
  Icon,
  IconDisc,
  ProgressMeter,
  SearchInput,
  SortSelect,
  Toolbar,
  type SortDirection,
} from "@/components/ui";
import { brandInfo } from "@/lib/catalog/brands";
import { gameLabel } from "@/lib/catalog/games";
import { ACCOUNT_KINDS, accountColorSlot, CURRENCY_SYMBOL, displayCurrencies } from "@/lib/constants";
import { formatDate, formatDateTime, todayISO } from "@/lib/date";
import { accountBalances, netWorth } from "@/lib/finance/finmath";
import { convert, formatMoney, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { matchesQuery, oneOf, sortItems, usePersistentState } from "@/lib/state/listing";
import { useStore } from "@/lib/state/store";
import type { AccountKind, SavingsAccount } from "@/lib/types";
import { AccountMark } from "./account-mark";
import { holdingsSummary } from "./helpers";

type AccountSort = "name" | "balance" | "kind";

/** Every account with its derived balance in each displayed currency, plus savings goals. */
export function AccountsCard({
  onAdd,
  onEdit,
  className = "",
}: {
  onAdd: () => void;
  onEdit: (acc: SavingsAccount) => void;
  className?: string;
}) {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();
  const balances = accountBalances(state, today);
  const worth = netWorth(state, today);
  const shown = displayCurrencies(state);
  const currencyGrid = { gridTemplateColumns: `minmax(0,1fr) repeat(${shown.length}, 7.25rem)` };

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<AccountKind | "all">("all");
  const [sort, setSort] = usePersistentState<AccountSort>("acc.sort", "balance", oneOf(["name", "balance", "kind"] as const));
  const [dir, setDir] = usePersistentState<SortDirection>("acc.dir", "desc", oneOf(["asc", "desc"] as const));

  const kindLabel = (kind: AccountKind) => t(`accountKind.${kind}`);
  const inBase = (acc: SavingsAccount) => convert(balances.get(acc.id) ?? 0, acc.currency, base, settings.rates);
  const kindCounts = new Map<AccountKind, number>();
  for (const acc of state.savings) kindCounts.set(acc.kind, (kindCounts.get(acc.kind) ?? 0) + 1);

  const visible = sortItems(
    state.savings.filter(
      (acc) =>
        (kindFilter === "all" || acc.kind === kindFilter) &&
        matchesQuery(query, acc.name, kindLabel(acc.kind), brandInfo(acc.bank)?.name, gameLabel(acc.game, acc.gameName), acc.currency),
    ),
    (acc) =>
      sort === "name"
        ? acc.name.toLocaleLowerCase()
        : sort === "kind"
          ? `${ACCOUNT_KINDS.findIndex((k) => k.value === acc.kind)}|${acc.name}`
          : inBase(acc),
    dir,
  );
  const filtered = query.trim() !== "" || kindFilter !== "all";
  const visibleTotal = visible.reduce((s, acc) => s + inBase(acc), 0);

  // Accounts with nothing in them fold into one row at the end, unless a search or filter is on.
  const [showEmpty, setShowEmpty] = useState(false);
  const isEmpty = (acc: SavingsAccount) => Math.abs(balances.get(acc.id) ?? 0) < 0.005;
  const emptyCount = filtered ? 0 : visible.filter(isEmpty).length;
  const listed = filtered || showEmpty ? visible : visible.filter((acc) => !isEmpty(acc));

  const kindOptions = [
    { value: "all" as const, label: t("filter.all"), count: state.savings.length },
    ...ACCOUNT_KINDS.filter((k) => kindCounts.has(k.value)).map((k) => ({
      value: k.value,
      label: `${k.icon} ${kindLabel(k.value)}`,
      count: kindCounts.get(k.value) ?? 0,
    })),
  ];

  return (
    <Card
      title={t("balance.accounts")}
      subtitle={t("balance.accounts.subtitle")}
      icon="bank"
      action={<AddButton onClick={onAdd} label={t("common.add")} />}
      className={className}
    >
      {state.savings.length === 0 ? (
        <EmptyState
          icon={<Icon name="card" />}
          title={t("balance.accounts.empty")}
          hint={t("balance.accounts.empty.hint")}
          action={<AddButton onClick={onAdd} label={t("common.add")} />}
        />
      ) : (
        <div>
          {state.savings.length > 3 && (
            <>
              <Toolbar>
                <SearchInput value={query} onChange={setQuery} placeholder={t("balance.accounts.search")} />
                <SortSelect
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: "balance", label: t("sort.balance") },
                    { value: "name", label: t("sort.name") },
                    { value: "kind", label: t("sort.kind") },
                  ]}
                  direction={dir}
                  onDirectionChange={setDir}
                />
              </Toolbar>
              {kindOptions.length > 2 && (
                <div className="mb-2">
                  <FilterPills label={t("filter.kind")} options={kindOptions} value={kindFilter} onChange={setKindFilter} />
                </div>
              )}
            </>
          )}
          <div className="rows-head mt-2 hidden gap-3 px-2.5 py-2 sm:grid" style={currencyGrid}>
            <span>{t("common.account")}</span>
            {shown.map((c) => (
              <span key={c} className="text-right">
                {c} {CURRENCY_SYMBOL[c]}
              </span>
            ))}
          </div>
          {visible.length === 0 && <p className="py-6 text-center text-sm text-ink-2">{t("filter.noMatches")}</p>}
          <div className="rows mt-1">
            {listed.map((acc) => {
              const goal = acc.goal;
              const balance = balances.get(acc.id) ?? 0;
              const reached = goal != null && balance >= goal.target;
              const brand = brandInfo(acc.bank);
              const game = acc.kind === "skins" ? gameLabel(acc.game, acc.gameName) : undefined;
              return (
                <button key={acc.id} type="button" onClick={() => onEdit(acc)} className="row-tap block w-full px-2.5 py-2 text-left">
                  <span
                    className="currency-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                    style={{ "--currency-cols": shown.length } as CSSProperties}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <IconDisc colorSlot={accountColorSlot(acc.kind)} className="size-9 rounded-field text-base">
                        <AccountMark acc={acc} />
                      </IconDisc>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-1">{acc.name}</span>
                        <span className="block truncate text-xs text-ink-3">
                          {[kindLabel(acc.kind), brand?.name ?? game, acc.currency].filter(Boolean).join(" · ")}
                        </span>
                        {acc.kind === "crypto" && acc.holdings?.length ? (
                          <span
                            className="tnum block truncate text-xs text-ink-2"
                            title={acc.pricedAt ? t("balance.prices.pricedAt", { when: formatDateTime(acc.pricedAt) }) : undefined}
                          >
                            {holdingsSummary(acc.holdings)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="tnum text-right text-sm font-semibold text-ink-1 sm:hidden">
                      {formatMoney(balance, acc.currency, { exact: true })}
                    </span>
                    <span className="hidden sm:contents">
                      <CurrencyCells amount={balance} currency={acc.currency} settings={settings} />
                    </span>
                  </span>
                  {goal && (
                    <span
                      className="mt-1.5 flex items-center gap-2.5 pl-12 pr-1"
                      title={
                        reached
                          ? t("balance.goal.reached")
                          : [
                              t("balance.goal.progress", {
                                have: formatMoney(balance, acc.currency),
                                target: formatMoney(goal.target, acc.currency),
                                pct: formatPercent((balance / goal.target) * 100, 0),
                              }),
                              goal.deadline ? t("balance.goal.by", { date: formatDate(goal.deadline) }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                      }
                    >
                      <span className="min-w-0 flex-1">
                        <ProgressMeter value={balance} max={goal.target} label={t("balance.goal.label", { name: acc.name })} />
                      </span>
                      <span className={`tnum shrink-0 text-[11px] ${reached ? "font-medium text-income" : "text-ink-3"}`}>
                        {reached
                          ? t("balance.goal.reached")
                          : `${formatPercent(Math.min(100, (balance / goal.target) * 100), 0)} · ${formatMoney(goal.target, acc.currency, { compact: true })}`}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {emptyCount > 0 && (
            <button
              type="button"
              onClick={() => setShowEmpty(!showEmpty)}
              aria-expanded={showEmpty}
              className="row-tap mt-1 flex w-full items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-ink-3 hover:text-ink-1"
            >
              <Icon name="chevronDown" size={14} strokeWidth={2.4} className={showEmpty ? "-scale-y-100" : ""} />
              {showEmpty ? t("balance.accounts.hideEmpty") : tp("balance.accounts.showEmpty", emptyCount)}
            </button>
          )}
          <div className="total-row mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 px-2.5 py-2.5 sm:hidden">
            <span className="text-sm">
              {filtered
                ? t("balance.accounts.shownTotal")
                : worth.debts > 0
                  ? t("balance.netWorth.afterDebts")
                  : t("balance.netWorth.inclInvestments")}
            </span>
            <span className="tnum text-right text-sm">{formatMoney(filtered ? visibleTotal : worth.total, base, { exact: true })}</span>
          </div>
          <div className="total-row mt-1 hidden gap-3 px-2.5 py-2.5 sm:grid" style={currencyGrid}>
            <span className="text-sm font-semibold text-ink-1">
              {filtered
                ? t("balance.accounts.shownTotal")
                : worth.debts > 0
                  ? t("balance.netWorth.afterDebts")
                  : t("balance.netWorth.inclInvestments")}
            </span>
            {shown.map((c) => (
              <span key={c} className="tnum text-right text-sm font-semibold text-ink-1">
                {formatMoney(convert(filtered ? visibleTotal : worth.total, base, c, settings.rates), c, { exact: true })}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
