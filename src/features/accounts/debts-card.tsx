"use client";

import { AddButton, Card, IconDisc, ProgressMeter, SortSelect, type SortDirection } from "@/components/ui";
import { debtColorSlot } from "@/lib/constants";
import { currentMonth, formatMonthCompact, todayISO } from "@/lib/date";
import { debtPayoff, netWorth } from "@/lib/finance/finmath";
import { convert, formatMoney, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { oneOf, sortItems, usePersistentState } from "@/lib/state/listing";
import { useStore } from "@/lib/state/store";
import type { Debt } from "@/lib/types";

type DebtSort = "balance" | "rate" | "payoff" | "name";

export function DebtsCard({
  onAdd,
  onEdit,
  className = "",
}: {
  onAdd: () => void;
  onEdit: (debt: Debt) => void;
  className?: string;
}) {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const nowMonth = currentMonth();
  const worth = netWorth(state, todayISO());
  const [sort, setSort] = usePersistentState<DebtSort>("debt.sort", "balance", oneOf(["balance", "rate", "payoff", "name"] as const));
  const [dir, setDir] = usePersistentState<SortDirection>("debt.dir", "desc", oneOf(["asc", "desc"] as const));

  if (state.debts.length === 0) return null;

  const schedule = state.debts.reduce(
    (acc, d) => {
      acc.payment += convert(d.monthlyPayment ?? 0, d.currency, base, settings.rates);
      const payoff = debtPayoff(d, nowMonth);
      if (payoff && !payoff.neverPaysOff) {
        acc.interest += convert(payoff.interest, d.currency, base, settings.rates);
        if (!acc.lastMonth || payoff.finalMonth > acc.lastMonth) acc.lastMonth = payoff.finalMonth;
      }
      return acc;
    },
    { payment: 0, interest: 0, lastMonth: "" as string },
  );

  const visible = sortItems(
    state.debts,
    (d) => {
      if (sort === "name") return d.name.toLocaleLowerCase();
      if (sort === "rate") return d.annualRatePct ?? 0;
      if (sort === "payoff") {
        const p = debtPayoff(d, nowMonth);
        return p ? (p.neverPaysOff ? Number.MAX_SAFE_INTEGER : p.months) : Number.MAX_SAFE_INTEGER - 1;
      }
      return convert(d.balance, d.currency, base, settings.rates);
    },
    dir,
  );

  return (
    <Card
      title={t("balance.debts")}
      subtitle={tp("balance.debts.subtitle", state.debts.length, { amount: formatMoney(worth.debts, base, { compact: true }) })}
      icon="debt"
      action={
        <div className="flex flex-wrap items-center gap-2">
          {state.debts.length > 1 && (
            <SortSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: "balance", label: t("sort.balance") },
                { value: "rate", label: t("sort.rate") },
                { value: "payoff", label: t("sort.payoff") },
                { value: "name", label: t("sort.name") },
              ]}
              direction={dir}
              onDirectionChange={setDir}
            />
          )}
          <AddButton onClick={onAdd} label={t("common.add")} />
        </div>
      }
      className={className}
    >
      <div className="rows">
        {visible.map((debt) => {
          const principal = debt.principal ?? 0;
          const paid = Math.max(0, principal - debt.balance);
          const payoff = debtPayoff(debt, nowMonth);
          return (
            <button key={debt.id} type="button" onClick={() => onEdit(debt)} className="row-tap block w-full px-2.5 py-2 text-left">
              <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <IconDisc colorSlot={debtColorSlot(debt.kind)} className="size-9 rounded-field text-base">
                    {debt.icon}
                  </IconDisc>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-1">{debt.name}</span>
                    <span className="block text-xs text-ink-3">
                      {t(`debtKind.${debt.kind}`)}
                      {debt.annualRatePct ? ` · ${t("balance.perYear", { pct: formatPercent(debt.annualRatePct) })}` : ""}
                    </span>
                  </span>
                </span>
                <span className="text-right">
                  <span className="tnum block text-sm font-semibold text-expense">
                    −{formatMoney(debt.balance, debt.currency, { exact: true })}
                  </span>
                  {debt.currency !== base && (
                    <span className="tnum block text-xs text-ink-3">
                      −{formatMoney(convert(debt.balance, debt.currency, base, settings.rates), base, { compact: true })}
                    </span>
                  )}
                </span>
              </span>
              {principal > 0 && (
                <span className="mt-1.5 block pl-12 pr-1">
                  <ProgressMeter value={paid} max={principal} label={t("balance.debt.paidLabel", { name: debt.name })} />
                  <span className="tnum mt-1 block text-xs text-ink-3">
                    {t("balance.debt.paidOff", {
                      paid: formatMoney(paid, debt.currency, { compact: true }),
                      principal: formatMoney(principal, debt.currency, { compact: true }),
                      pct: formatPercent((paid / principal) * 100, 0),
                    })}
                    {debt.monthlyPayment
                      ? ` · ${formatMoney(debt.monthlyPayment, debt.currency, { compact: true })}${t("common.perMonth")}`
                      : ""}
                  </span>
                </span>
              )}
              {payoff && (
                <span className="mt-1 block pl-12 pr-1 text-xs">
                  {payoff.neverPaysOff ? (
                    <span className="text-expense">{t("balance.debt.neverPaysOff")}</span>
                  ) : (
                    <span className="tnum text-ink-2">
                      {t("balance.debt.clearBy")} <span className="font-semibold text-ink-1">{formatMonthCompact(payoff.finalMonth)}</span>
                      {" · "}
                      {tp("balance.debt.payments", payoff.months)}
                      {payoff.interest > 0.5 &&
                        ` · ${t("balance.debt.interestLeft", {
                          amount: formatMoney(payoff.interest, debt.currency, { compact: true }),
                        })}`}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-field bg-expense/8 px-2.5 py-2.5">
        <span className="text-sm font-semibold text-ink-1">{t("balance.debt.totalOwed")}</span>
        <span className="tnum text-sm font-semibold text-expense">−{formatMoney(worth.debts, base, { exact: true })}</span>
        {schedule.payment > 0 && (
          <span className="caption w-full">
            {[
              t("balance.debt.scheduled", { amount: formatMoney(schedule.payment, base, { compact: true }) }),
              schedule.lastMonth ? t("balance.debt.lastPayment", { month: formatMonthCompact(schedule.lastMonth) }) : null,
              schedule.interest > 0.5
                ? t("balance.debt.interestToPay", { amount: formatMoney(schedule.interest, base, { compact: true }) })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
    </Card>
  );
}
