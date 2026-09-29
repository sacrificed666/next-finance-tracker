"use client";

import { useState } from "react";
import { AddButton, Card, FilterPills, SearchInput, SegmentedControl, SortSelect, Toolbar, type SortDirection } from "@/components/ui";
import { INVESTMENT_KINDS } from "@/lib/constants";
import { addMonths, dateInMonth, monthOf, todayISO } from "@/lib/date";
import { investmentAt } from "@/lib/finance/finmath";
import { convert } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { matchesQuery, oneOf, sortItems, usePersistentState } from "@/lib/state/listing";
import { useStore } from "@/lib/state/store";
import type { Investment, InvestmentKind } from "@/lib/types";
import { InvestmentCard } from "./investment-card";
import { ReturnsTable } from "./returns-table";

type InvestmentSort = "value" | "gain" | "name" | "start";

export function InvestmentsCard({ onAdd, onEdit }: { onAdd: () => void; onEdit: (inv: Investment) => void }) {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();
  const oneYearOut = dateInMonth(addMonths(monthOf(today), 12), Number(today.slice(8, 10)));

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<InvestmentKind | "all">("all");
  const [sort, setSort] = usePersistentState<InvestmentSort>(
    "inv.sort",
    "value",
    oneOf(["value", "gain", "name", "start"] as const),
  );
  const [dir, setDir] = usePersistentState<SortDirection>("inv.dir", "desc", oneOf(["asc", "desc"] as const));
  const [view, setView] = usePersistentState<"cards" | "table">("inv.view", "cards", oneOf(["cards", "table"] as const));

  const kindLabel = (kind: InvestmentKind) => t(`investmentKind.${kind}`);
  const gain = (inv: Investment) => {
    const snap = investmentAt(inv, today);
    return snap.invested > 0 ? (snap.accrued + snap.paidOut) / snap.invested : 0;
  };
  const kindCounts = new Map<InvestmentKind, number>();
  for (const inv of state.investments) kindCounts.set(inv.kind, (kindCounts.get(inv.kind) ?? 0) + 1);
  const visible = sortItems(
    state.investments.filter(
      (inv) =>
        (kindFilter === "all" || inv.kind === kindFilter) &&
        matchesQuery(query, inv.name, kindLabel(inv.kind), inv.fund, inv.currency),
    ),
    (inv) =>
      sort === "name"
        ? inv.name.toLocaleLowerCase()
        : sort === "gain"
          ? gain(inv)
          : sort === "start"
            ? inv.startDate
            : convert(investmentAt(inv, today).value, inv.currency, base, settings.rates),
    dir,
  );
  const kindOptions = [
    { value: "all" as const, label: t("filter.all"), count: state.investments.length },
    ...INVESTMENT_KINDS.filter((k) => kindCounts.has(k.value)).map((k) => ({
      value: k.value,
      label: `${k.icon} ${kindLabel(k.value)}`,
      count: kindCounts.get(k.value) ?? 0,
    })),
  ];

  return (
    <Card
      title={t("balance.investments")}
      subtitle={tp("balance.inv.positions", state.investments.length)}
      icon="trend"
      action={
        <div className="flex items-center gap-2">
          {state.investments.length > 1 && (
            <SegmentedControl
              size="sm"
              label={t("investments.view")}
              options={[
                { value: "cards" as const, label: t("investments.view.cards") },
                { value: "table" as const, label: t("investments.view.table") },
              ]}
              value={view}
              onChange={setView}
            />
          )}
          <AddButton onClick={onAdd} label={t("common.add")} />
        </div>
      }
    >
      {state.investments.length > 3 && (
        <>
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder={t("balance.inv.search")} />
            <SortSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: "value", label: t("sort.value") },
                { value: "gain", label: t("sort.gain") },
                { value: "name", label: t("sort.name") },
                { value: "start", label: t("sort.startDate") },
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
      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-2">{t("filter.noMatches")}</p>
      ) : view === "table" && visible.length > 1 ? (
        <ReturnsTable positions={visible} onOpen={onEdit} />
      ) : (
        <div className={`gap-3 sm:gap-4 ${visible.length > 1 ? "sm:columns-2" : ""}`}>
          {visible.map((inv) => (
            <InvestmentCard
              key={inv.id}
              inv={inv}
              today={today}
              oneYearOut={oneYearOut}
              onEdit={() => onEdit(inv)}
              className="mb-3 break-inside-avoid last:mb-0 sm:mb-4"
            />
          ))}
        </div>
      )}
    </Card>
  );
}
