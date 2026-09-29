"use client";

import type { ReactNode } from "react";
import { Sparkline } from "@/components/charts";
import { Button, Fact, Facts, Icon, IconDisc, Money } from "@/components/ui";
import { investmentColorSlot, valuationOf } from "@/lib/constants";
import { formatDate } from "@/lib/date";
import { investmentAt, projectedSnapshot } from "@/lib/finance/finmath";
import { formatMoney, formatNumber, formatPercent } from "@/lib/finance/money";
import { returnPolicy } from "@/lib/finance/returns";
import { useT } from "@/lib/i18n";
import { coinInfo } from "@/lib/market/crypto";
import { inzhurFund } from "@/lib/market/inzhur";
import type { Investment } from "@/lib/types";
import { returnLabel, sparkValues, yieldRange } from "./helpers";
import { PositionMark } from "./position-mark";

export function InvestmentCard({
  inv,
  today,
  oneYearOut,
  onEdit,
  className = "",
}: {
  inv: Investment;
  today: string;
  oneYearOut: string;
  onEdit: () => void;
  className?: string;
}) {
  const { t } = useT();
  const snap = investmentAt(inv, today);
  const inYear = investmentAt(inv, oneYearOut);
  const market = valuationOf(inv.kind) === "market";
  const coin = coinInfo(inv.coin);
  const fund = inzhurFund(inv.fund);
  const matured = inv.endDate != null && inv.endDate <= today;
  const returnMode = returnLabel(returnPolicy(inv), inv.kind, inv.compoundingFreq, t);
  const earned = snap.accrued + snap.paidOut;
  const gainPct = snap.invested > 0 ? (earned / snap.invested) * 100 : 0;
  const proj = projectedSnapshot(inv, today, oneYearOut);
  const yearDeposits = (inv.monthlyContribution ?? 0) * 12;
  const projGain = market
    ? proj.value - snap.value - yearDeposits + proj.paidOut
    : inYear.accrued - snap.accrued + (inYear.paidOut - snap.paidOut);
  const expectedLabel = fund
    ? yieldRange(
        inv.annualRatePct,
        inv.annualRatePct === fund.projectedYieldPct ? fund.projectedYieldMaxPct : undefined,
        fund.linkedCurrency,
        t,
      )
    : t("balance.perYear", { pct: formatPercent(inv.annualRatePct) });

  const pairs: Array<{ label: string; value: ReactNode } | false> = [
    (!market || inv.annualRatePct > 0) && {
      label: market ? t("balance.inv.row.expected") : t("balance.inv.row.rate"),
      value: expectedLabel,
    },
    !matured && (!market || inv.annualRatePct > 0) && { label: t("balance.inv.row.return"), value: returnMode },
    !!coin && !!inv.quantity && {
      label: t("balance.inv.row.holding"),
      value: `${formatNumber(inv.quantity, 8)} ${coin.symbol}`,
    },
    !!fund && !!inv.quantity && { label: t("balance.inv.row.certificates"), value: formatNumber(inv.quantity, 4) },
    (!!coin || !!fund) && !!inv.quantity && !!inv.marketValue && {
      label: fund ? t("balance.inv.row.nav") : t("balance.inv.row.price"),
      value: <Money amount={inv.marketValue / inv.quantity} currency={inv.currency} exact />,
    },
    {
      label: market ? t("balance.inv.row.paid") : t("balance.inv.row.invested"),
      value: <Money amount={snap.invested} currency={inv.currency} exact />,
    },
    yearDeposits > 0 && {
      label: t("balance.inv.row.topUp"),
      value: `${formatMoney(inv.monthlyContribution ?? 0, inv.currency)}${t("common.perMonth")}`,
    },
    yearDeposits > 0 && {
      label: t("balance.inv.row.youAdd"),
      value: t("balance.inv.row.perYear", { amount: formatMoney(yearDeposits, inv.currency, { compact: true }) }),
    },
    { label: t("balance.inv.row.since"), value: formatDate(inv.startDate) },
    !!inv.endDate && {
      label: matured ? t("balance.inv.row.matured") : t("balance.inv.row.matures"),
      value: formatDate(inv.endDate),
    },
  ];
  const shown = pairs.filter((f): f is { label: string; value: ReactNode } => Boolean(f));
  const facts: Array<{ label: string; value: ReactNode; wide?: boolean }> = shown.map((f, i) => ({
    ...f,
    wide: shown.length % 2 === 1 && i === shown.length - 1,
  }));
  if (!matured && (!market || inv.annualRatePct > 0 || yearDeposits > 0)) {
    facts.push({
      label: t("balance.inv.row.inYear"),
      wide: true,
      value: (
        <span>
          <Money amount={market ? proj.value : inYear.value} currency={inv.currency} exact />{" "}
          {projGain > 0.5 && (
            <span className="text-income">
              {t("balance.inv.row.inYearEarned", { amount: formatMoney(projGain, inv.currency) })}
            </span>
          )}
        </span>
      ),
    });
  }

  return (
    <div className={`glass-well flex min-w-0 flex-col rounded-field p-3.5 ${className}`}>
      <div className="flex items-start gap-3">
        <IconDisc colorSlot={investmentColorSlot(inv.kind)} className="size-10 rounded-field text-lg">
          <PositionMark inv={inv} size={30} coinSize={28} />
        </IconDisc>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-ink-1">{inv.name}</h3>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-3">
            {[t(`investmentKind.${inv.kind}`), fund && fund.name !== inv.name ? fund.name : null, inv.currency]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
            earned >= 0 ? "bg-income/12 text-income ring-income/20" : "bg-expense/12 text-expense ring-expense/20"
          }`}
        >
          <Icon name="trend" size={13} className={earned >= 0 ? "" : "-scale-y-100"} />
          {formatPercent(Math.abs(gainPct))}
        </span>
      </div>

      {inv.note && <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-3 italic">{inv.note}</p>}

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Money amount={snap.value} currency={inv.currency} exact className="num-md block text-ink-1" />
          <p className="tnum mt-1.5 text-xs text-ink-3">
            {t("balance.inv.earnedLine", { amount: formatMoney(earned, inv.currency, { sign: true, compact: true }) })}
          </p>
        </div>
        {!market && <Sparkline values={sparkValues(inv, today)} width={104} height={40} />}
      </div>

      <Facts className="mb-3 mt-3">
        {facts.map((fact) => (
          <Fact key={fact.label} label={fact.label} wide={fact.wide}>
            {fact.value}
          </Fact>
        ))}
      </Facts>

      <Button variant="ghost" size="sm" className="mt-auto w-full" onClick={onEdit}>
        <Icon name="edit" size={14} />
        {t("common.edit")}
      </Button>
    </div>
  );
}
