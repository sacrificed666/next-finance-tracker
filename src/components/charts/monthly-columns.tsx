"use client";

import { useState } from "react";
import { formatMonthShort } from "@/lib/date";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Currency } from "@/lib/types";
import { axisFormatter, ChartLegend, ChartTable, Column, niceTicks, Tooltip, TooltipRow, useMeasure } from "./internals";

export interface MonthPoint {
  month: string;
  income: number;
  expense: number;
  /** Tax withheld from the month's income; stacked on top of it in the income view. */
  tax?: number;
}

/**
 * Monthly columns. By default income and expenses side by side; with
 * `incomeOnly`, one column of income per month with any tax stacked on top,
 * so the column's full height is the gross.
 */
export function MonthlyColumns({
  data,
  currency,
  height = 190,
  incomeOnly = false,
}: {
  data: MonthPoint[];
  currency: Currency;
  height?: number;
  incomeOnly?: boolean;
}) {
  const { t } = useT();
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const withTax = incomeOnly && data.some((d) => (d.tax ?? 0) > 0);
  const pad = { top: 8, right: 8, bottom: 22, left: 44 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(
    1,
    ...data.map((d) => (incomeOnly ? d.income + (withTax ? (d.tax ?? 0) : 0) : Math.max(d.income, d.expense))),
  );
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const tickLabel = axisFormatter(top);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;

  const band = data.length > 0 ? plotW / data.length : 0;
  const barW = incomeOnly
    ? Math.max(1.5, Math.min(24, band - Math.max(4, band * 0.35)))
    : Math.max(1.5, Math.min(24, (band - Math.min(4, band * 0.25)) / 2 - 1));
  const barGap = Math.min(2, band * 0.06);
  const labelStep = Math.max(1, Math.ceil(28 / Math.max(1, band)));

  const legend = incomeOnly
    ? withTax
      ? [
          { label: t("tx.stat.income"), color: "var(--income)" },
          { label: t("income.tax"), color: "var(--expense)" },
        ]
      : []
    : [
        { label: t("tx.stat.income"), color: "var(--income)" },
        { label: t("tx.stat.expenses"), color: "var(--expense)" },
      ];
  const columns = incomeOnly
    ? [t("chart.month"), t("tx.stat.income"), ...(withTax ? [t("income.tax")] : [])]
    : [t("chart.month"), t("tx.stat.income"), t("tx.stat.expenses"), t("tx.stat.net")];
  const money = (v: number, sign = false) => formatMoney(v, currency, { compact: true, sign });
  const hovered = hover !== null ? data[hover] : undefined;

  return (
    <div>
      {legend.length > 0 && <ChartLegend items={legend} />}
      <ChartTable
        caption={t("chart.columns.caption")}
        columns={columns}
        rows={data.map((d) => ({
          key: d.month,
          cells: incomeOnly
            ? [formatMonthShort(d.month), money(d.income), ...(withTax ? [money(d.tax ?? 0)] : [])]
            : [formatMonthShort(d.month), money(d.income), money(d.expense), money(d.income - d.expense, true)],
        }))}
      />
      <div ref={ref} className="relative mt-2" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} aria-hidden>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--gridline)" strokeWidth={1} />
                <text x={pad.left - 6} y={y(tick) + 3.5} textAnchor="end" fontSize={11} className="tnum" fill="var(--ink-3)">
                  {tickLabel(tick)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = pad.left + band * i + band / 2;
              const dim = hover !== null && hover !== i;
              const tax = withTax ? (d.tax ?? 0) : 0;
              return (
                <g key={d.month} opacity={dim ? 0.45 : 1} style={{ transition: "opacity 120ms" }}>
                  {incomeOnly ? (
                    <>
                      {/* The tax segment sits on the income with a 2 px gap; only the top of the stack is rounded. */}
                      <Column
                        x={cx - barW / 2}
                        w={barW}
                        y0={y(0)}
                        y1={y(d.income)}
                        color="var(--income)"
                        index={i}
                        rounded={tax <= 0}
                      />
                      {tax > 0 && (
                        <Column
                          x={cx - barW / 2}
                          w={barW}
                          y0={y(d.income) - 2}
                          y1={y(d.income + tax) - 2}
                          color="var(--expense)"
                          index={i}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <Column x={cx - barW - barGap / 2} w={barW} y0={y(0)} y1={y(d.income)} color="var(--income)" index={i} />
                      <Column x={cx + barGap / 2} w={barW} y0={y(0)} y1={y(d.expense)} color="var(--expense)" index={i} />
                    </>
                  )}
                  {(data.length - 1 - i) % labelStep === 0 && (
                    <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                      {formatMonthShort(d.month)}
                    </text>
                  )}
                </g>
              );
            })}
            {data.map((d, i) => (
              <rect
                key={d.month}
                x={pad.left + band * i}
                y={pad.top}
                width={band}
                height={plotH}
                fill="transparent"
                onPointerMove={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            ))}
          </svg>
        )}
        {hovered && hover !== null && (
          <Tooltip x={pad.left + band * hover + band / 2} y={pad.top} containerWidth={width}>
            <p className="mb-0.5 font-semibold text-ink-1">{formatMonthShort(hovered.month)}</p>
            <TooltipRow color="var(--income)" label={t("tx.stat.income")} value={money(hovered.income)} />
            {incomeOnly ? (
              withTax && (hovered.tax ?? 0) > 0 && (
                <>
                  <TooltipRow color="var(--expense)" label={t("income.tax")} value={money(hovered.tax ?? 0)} />
                  <TooltipRow label={t("income.gross")} value={money(hovered.income + (hovered.tax ?? 0))} />
                </>
              )
            ) : (
              <>
                <TooltipRow color="var(--expense)" label={t("tx.stat.expenses")} value={money(hovered.expense)} />
                <TooltipRow label={t("tx.stat.net")} value={money(hovered.income - hovered.expense, true)} />
              </>
            )}
          </Tooltip>
        )}
      </div>
    </div>
  );
}
