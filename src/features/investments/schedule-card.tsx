"use client";

import { Button, Card, IconDisc, Money, Unit } from "@/components/ui";
import { investmentColorSlot, valuationOf } from "@/lib/constants";
import { formatDate, monthDiff, monthOf, todayISO } from "@/lib/date";
import { investmentAt, projectedSnapshot } from "@/lib/finance/finmath";
import { convert, formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { Investment } from "@/lib/types";
import { oneYearFrom } from "./helpers";
import { PositionMark } from "./position-mark";

const SHOWN = 4;

export function ScheduleCard({
  onOpen,
  onRenew,
  onClose,
}: {
  onOpen: (inv: Investment) => void;
  onRenew: (inv: Investment) => void;
  onClose: (inv: Investment) => void;
}) {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();
  const yearOut = oneYearFrom(today);
  const toBase = (n: number, inv: Investment) => convert(n, inv.currency, base, settings.rates);

  const active = state.investments.filter((inv) => !inv.endDate || inv.endDate > today);
  const topUps = active.reduce((sum, inv) => sum + toBase(inv.monthlyContribution ?? 0, inv), 0);
  const payoutsYear = active.reduce((sum, inv) => {
    const paid =
      valuationOf(inv.kind) === "market"
        ? projectedSnapshot(inv, today, yearOut).paidOut
        : investmentAt(inv, yearOut).paidOut - investmentAt(inv, today).paidOut;
    return sum + toBase(Math.max(0, paid), inv);
  }, 0);
  const maturing = active
    .filter((inv): inv is Investment & { endDate: string } => inv.endDate !== undefined)
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  const matured = state.investments
    .filter((inv): inv is Investment & { endDate: string } => inv.endDate !== undefined && inv.endDate <= today)
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  if (topUps === 0 && payoutsYear === 0 && maturing.length === 0 && matured.length === 0) return null;

  return (
    <Card title={t("investments.schedule")} subtitle={t("investments.schedule.subtitle")} icon="calendar">
      {matured.length > 0 && (
        <div className={topUps > 0 || payoutsYear > 0 || maturing.length > 0 ? "mb-4" : ""}>
          <p className="card-title mb-2">{t("investments.matured")}</p>
          <ul className="space-y-2">
            {matured.map((inv) => (
              <li key={inv.id} className="rounded-field border border-warning/35 bg-warning/10 p-2.5">
                <div className="flex items-center gap-2.5">
                  <IconDisc colorSlot={investmentColorSlot(inv.kind)} className="size-8 rounded-chip text-sm">
                    <PositionMark inv={inv} />
                  </IconDisc>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-1">{inv.name}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {t("investments.matured.on", { date: formatDate(inv.endDate) })}
                    </span>
                  </span>
                  <Money
                    amount={investmentAt(inv, inv.endDate).value}
                    currency={inv.currency}
                    compact
                    className="shrink-0 whitespace-nowrap text-sm font-semibold text-ink-1"
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button size="sm" onClick={() => onRenew(inv)}>
                    {t("investments.renew")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onClose(inv)}>
                    {t("investments.withdraw")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(topUps > 0 || payoutsYear > 0) && (
        <div className={`grid gap-2 ${topUps > 0 && payoutsYear > 0 ? "grid-cols-2" : ""}`}>
          {topUps > 0 && (
            <div className="rounded-field bg-ghost p-3">
              <p className="caption">{t("investments.topUps")}</p>
              <p className="num-sm mt-1 whitespace-nowrap text-ink-1">
                {formatMoney(topUps, base, { compact: true })}
                <Unit>{t("common.perMonth")}</Unit>
              </p>
              <p className="caption mt-0.5">{t("tx.subs.perYear", { amount: formatMoney(topUps * 12, base, { compact: true }) })}</p>
            </div>
          )}
          {payoutsYear > 0 && (
            <div className="rounded-field bg-ghost p-3">
              <p className="caption">{t("investments.payouts")}</p>
              <p className="num-sm mt-1 whitespace-nowrap text-income">
                ≈ {formatMoney(payoutsYear / 12, base, { compact: true })}
                <Unit>{t("common.perMonth")}</Unit>
              </p>
              <p className="caption mt-0.5">{t("tx.subs.perYear", { amount: formatMoney(payoutsYear, base, { compact: true }) })}</p>
            </div>
          )}
        </div>
      )}

      {maturing.length > 0 && (
        <div className={topUps > 0 || payoutsYear > 0 ? "mt-4" : ""}>
          <p className="card-title mb-2">{t("balance.inv.matures")}</p>
          <ul className="rows">
            {maturing.slice(0, SHOWN).map((inv) => {
              const months = Math.max(0, monthDiff(monthOf(today), monthOf(inv.endDate)));
              return (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(inv)}
                    className="row-tap flex w-full items-center gap-2.5 px-2.5 py-2 text-left"
                  >
                    <IconDisc colorSlot={investmentColorSlot(inv.kind)} className="size-8 rounded-chip text-sm">
                      <PositionMark inv={inv} />
                    </IconDisc>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-1">{inv.name}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {formatDate(inv.endDate)}
                        {months > 0 ? ` · ${tp("forecast.goal.inMonths", months)}` : ""}
                      </span>
                    </span>
                    <Money
                      amount={investmentAt(inv, inv.endDate).value}
                      currency={inv.currency}
                      compact
                      className="shrink-0 whitespace-nowrap text-sm font-semibold text-ink-1"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          {maturing.length > SHOWN && (
            <p className="mt-2 text-xs text-ink-3">{t("investments.matures.more", { n: maturing.length - SHOWN })}</p>
          )}
        </div>
      )}
    </Card>
  );
}
