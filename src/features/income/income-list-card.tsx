"use client";

import { useState } from "react";
import { OptionPicker } from "@/components/forms/option-picker";
import { useCategoryGroups } from "@/components/forms/picker-groups";
import {
  AddButton,
  Card,
  EmptyState,
  Icon,
  IconDisc,
  SearchInput,
  SegmentedControl,
  SortSelect,
  Toolbar,
  ToolbarSlot,
} from "@/components/ui";
import { formatDateShort, formatMonth, monthOf, todayISO } from "@/lib/date";
import { descendantsOf } from "@/lib/finance/categories";
import { convert, formatMoney, ratesAt } from "@/lib/finance/money";
import { taxRegime } from "@/lib/finance/tax";
import { useT, type MessageKey } from "@/lib/i18n";
import { matchesQuery, oneOf, sortItems, usePersistentState } from "@/lib/state/listing";
import { useStore } from "@/lib/state/store";
import type { IncomeTax, Transaction } from "@/lib/types";
import { breakdownSummary } from "./helpers";

type SortKey = "date" | "amount";
type Scope = "received" | "planned" | "all";

export function IncomeListCard({
  onAdd,
  onEdit,
  className = "",
}: {
  onAdd: () => void;
  onEdit: (tx: Transaction) => void;
  className?: string;
}) {
  const { state } = useStore();
  const { t, tp, category } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();

  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const accountById = new Map(state.savings.map((a) => [a.id, a]));
  const filterCategoryGroups = useCategoryGroups(state.categories, ["income"], [
    { value: "", label: t("filter.allCategories") },
  ]);

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [scope, setScope] = useState<Scope>("received");
  const [sortKey, setSortKey] = usePersistentState<SortKey>("income.sort", "date", oneOf(["date", "amount"] as const));
  const [sortDir, setSortDir] = usePersistentState<"asc" | "desc">("income.dir", "desc", oneOf(["asc", "desc"] as const));

  const incomeTx = state.transactions.filter((tx) => tx.type === "income");
  const plannedCount = incomeTx.filter((tx) => tx.date > today).length;
  const inCategory = categoryFilter ? descendantsOf(state.categories, categoryFilter) : null;
  const visibleTx = incomeTx.filter((tx) => {
    if (scope === "planned" ? tx.date <= today : scope === "received" ? tx.date > today : false) return false;
    if (inCategory && !inCategory.has(tx.categoryId)) return false;
    const cat = catById.get(tx.categoryId);
    const account = tx.accountId ? accountById.get(tx.accountId) : undefined;
    return matchesQuery(query, tx.note, cat ? category(cat) : undefined, account?.name, tx.tax?.label);
  });
  const filtering = query.trim() !== "" || categoryFilter !== "";

  const byMonth = new Map<string, Transaction[]>();
  for (const tx of visibleTx) {
    const m = monthOf(tx.date);
    const list = byMonth.get(m);
    if (list) list.push(tx);
    else byMonth.set(m, [tx]);
  }
  const months = sortItems([...byMonth.keys()], (m) => m, sortDir);
  const flatByAmount = sortItems(visibleTx, (tx) => convert(tx.amount, tx.currency, base, ratesAt(settings, tx.date)), sortDir);

  const taxLabelOf = (txTax: IncomeTax) =>
    txTax.label || (txTax.regime ? t(taxRegime(txTax.regime).shortKey as MessageKey) : t("income.tax"));

  const renderRow = (tx: Transaction) => {
    const cat = catById.get(tx.categoryId);
    const account = tx.accountId ? accountById.get(tx.accountId) : undefined;
    const details = [
      tx.note ? category(cat) : null,
      account?.name ?? null,
      tx.breakdown ? breakdownSummary(tx.breakdown, tx.currency, t("income.dayUnit")) : null,
      tx.tax
        ? t("income.netOfTax", { amount: formatMoney(tx.tax.gross - tx.amount, tx.currency), regime: taxLabelOf(tx.tax) })
        : null,
    ].filter(Boolean);
    if (details.length === 0) details.push(formatMonth(monthOf(tx.date)));
    return (
      <li key={tx.id}>
        <button type="button" onClick={() => onEdit(tx)} className="row-tap flex w-full items-center gap-3 px-2 py-2 text-left">
          <IconDisc colorSlot={cat?.colorSlot} className="size-9 rounded-full text-base">
            {cat?.icon ?? "💰"}
          </IconDisc>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink-1">
              {tx.note || (cat ? category(cat) : t("income.fallbackName"))}
            </span>
            <span className="block truncate text-xs text-ink-3">{details.join(" · ")}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="tnum block text-sm font-semibold text-income">
              {formatMoney(tx.amount, tx.currency, { sign: true, exact: true })}
            </span>
            <span className="block text-xs text-ink-3">
              {tx.currency !== base && (
                <span className="tnum">
                  ≈ {formatMoney(convert(tx.amount, tx.currency, base, ratesAt(settings, tx.date)), base, { compact: true })}
                  {" · "}
                </span>
              )}
              {formatDateShort(tx.date)}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <Card
      title={t("income.all")}
      subtitle={
        scope === "planned"
          ? t("income.scope.planned.subtitle")
          : scope === "all"
            ? t("income.scope.all.subtitle")
            : t("income.scope.received.subtitle")
      }
      icon="banknote"
      action={
        plannedCount > 0 ? (
          <SegmentedControl
            size="sm"
            label={t("income.scope.label")}
            options={[
              { value: "received", label: t("income.scope.received") },
              { value: "planned", label: `${t("income.scope.planned")} (${plannedCount})` },
              { value: "all", label: t("income.scope.all") },
            ]}
            value={scope}
            onChange={setScope}
          />
        ) : undefined
      }
      className={className}
    >
      {incomeTx.length === 0 ? (
        <EmptyState
          icon={<Icon name="banknote" />}
          title={t("income.empty.list")}
          hint={t("income.empty.list.hint")}
          action={<AddButton variant="primary" onClick={onAdd} label={t("income.add")} />}
        />
      ) : (
        <>
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder={t("income.search")} />
            <ToolbarSlot>
              <OptionPicker
                size="sm"
                label={t("filter.category")}
                value={categoryFilter}
                onChange={setCategoryFilter}
                groups={filterCategoryGroups}
              />
            </ToolbarSlot>
            <SortSelect
              value={sortKey}
              onChange={setSortKey}
              options={[
                { value: "date", label: t("sort.date") },
                { value: "amount", label: t("sort.amount") },
              ]}
              direction={sortDir}
              onDirectionChange={setSortDir}
            />
          </Toolbar>
          {filtering && (
            <p className="mb-2 px-1 text-xs text-ink-3">
              {tp("filter.shown", visibleTx.length, { total: incomeTx.length })}
              <button
                type="button"
                className="ml-2 font-semibold text-accent"
                onClick={() => {
                  setQuery("");
                  setCategoryFilter("");
                }}
              >
                {t("filter.reset")}
              </button>
            </p>
          )}
          {visibleTx.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-2">{t("filter.noMatches")}</p>
          ) : sortKey === "amount" ? (
            <ul className="rows">{flatByAmount.map(renderRow)}</ul>
          ) : (
            <div className="space-y-3">
              {months.map((month) => {
                const rows = sortItems(byMonth.get(month)!, (tx) => `${tx.date}|${tx.id}`, sortDir);
                const subtotal = rows.reduce((sum, tx) => sum + convert(tx.amount, tx.currency, base, ratesAt(settings, tx.date)), 0);
                return (
                  <section key={month}>
                    <h3 className="group-head">
                      <span>
                        <span className="text-ink-1">{formatMonth(month)}</span>
                        <span className="font-medium text-ink-3"> · {tp("common.entries", rows.length)}</span>
                      </span>
                      <span className="tnum text-income">{formatMoney(subtotal, base, { sign: true })}</span>
                    </h3>
                    <ul className="rows mt-1">{rows.map(renderRow)}</ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
