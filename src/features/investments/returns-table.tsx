"use client";

import { IconDisc, Money } from "@/components/ui";
import { investmentColorSlot } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { formatMoney, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Investment } from "@/lib/types";
import { oneYearFrom, positionReturns } from "./helpers";
import { PositionMark } from "./position-mark";

/** One line per position, in the order given: what it is worth, what it has earned, and what the next year should add. */
export function ReturnsTable({ positions, onOpen }: { positions: Investment[]; onOpen: (inv: Investment) => void }) {
  const { t } = useT();
  const today = todayISO();
  const yearOut = oneYearFrom(today);
  const rows = positions.map((inv) => ({ inv, ...positionReturns(inv, today, yearOut) }));

  return (
    <table className="data-table table-fixed">
      <thead>
        <tr>
          <th className="text-left">{t("balance.investments")}</th>
          <th className="hidden w-28 text-right sm:table-cell">{t("sort.value")}</th>
          <th className="w-24 truncate text-right sm:w-28">{t("investments.returns.soFar")}</th>
          <th className="w-24 truncate text-right sm:w-28">{t("investments.returns.next")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ inv, snap, earned, gainPct, nextYear, nextYearPct }) => {
          return (
            <tr
              key={inv.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(inv)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(inv)}
            >
              <td>
                <span className="flex min-w-0 items-center gap-2.5">
                  <IconDisc colorSlot={investmentColorSlot(inv.kind)} className="size-8 rounded-chip text-sm">
                    <PositionMark inv={inv} />
                  </IconDisc>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink-1">{inv.name}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {t(`investmentKind.${inv.kind}`)} · {inv.currency}
                    </span>
                  </span>
                </span>
              </td>
              <td className="hidden text-right sm:table-cell">
                <Money amount={snap.value} currency={inv.currency} compact className="whitespace-nowrap font-semibold text-ink-1" />
              </td>
              <td className="text-right">
                <span className={`tnum block whitespace-nowrap font-semibold ${earned >= 0 ? "text-income" : "text-expense"}`}>
                  {formatMoney(earned, inv.currency, { compact: true, sign: true })}
                </span>
                <span className="tnum block text-xs text-ink-3">{formatPercent(gainPct)}</span>
              </td>
              <td className="text-right">
                <span className={`tnum block whitespace-nowrap font-semibold ${nextYear > 0 ? "text-ink-1" : "text-ink-3"}`}>
                  {nextYear !== 0 ? formatMoney(nextYear, inv.currency, { compact: true, sign: true }) : "—"}
                </span>
                {nextYear !== 0 && (
                  <span className="tnum block text-xs text-ink-3">{t("balance.perYear", { pct: formatPercent(nextYearPct) })}</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
