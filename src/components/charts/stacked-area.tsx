"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Currency } from "@/lib/types";
import { axisFormatter, ChartLegend, ChartTable, niceTicks, Tooltip, TooltipRow, useMeasure } from "./internals";

export interface AreaPoint {
  label: string;
  a: number;
  b: number;
}

export function StackedArea({
  points,
  currency,
  seriesA,
  seriesB,
  height = 260,
  xTickEvery = 12,
  xTickFormat = (label: string) => label.slice(0, 4),
}: {
  points: AreaPoint[];
  currency: Currency;
  seriesA?: string;
  seriesB?: string;
  height?: number;
  xTickEvery?: number;
  xTickFormat?: (label: string) => string;
}) {
  const { t } = useT();
  const labelA = seriesA ?? t("forecast.savings");
  const labelB = seriesB ?? t("balance.investments");
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 10, right: 12, bottom: 22, left: 52 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => p.a + p.b));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const tickLabel = axisFormatter(top);
  const x = (i: number) => pad.left + (n > 1 ? (i / (n - 1)) * plotW : 0);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;

  const lineA = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.a).toFixed(1)}`).join("");
  const lineTotal = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.a + p.b).toFixed(1)}`).join("");
  const areaA = `${lineA} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const areaB =
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.a + p.b).toFixed(1)}`).join("") +
    points.map((p, i) => `L${x(n - 1 - i).toFixed(1)},${y(points[n - 1 - i].a).toFixed(1)}`).join("") +
    " Z";

  const onMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const i = Math.round((px / Math.max(1, rect.width)) * (n - 1));
      setHover(Math.min(n - 1, Math.max(0, i)));
    },
    [n],
  );

  if (n < 2) return null;

  const perLabel = plotW / Math.max(1, (n - 1) / xTickEvery);
  const labelEvery = xTickEvery * Math.max(1, Math.ceil(38 / Math.max(1, perLabel)));

  return (
    <div>
      <ChartLegend
        items={[
          { label: labelA, color: "var(--series-1)" },
          { label: labelB, color: "var(--series-2)" },
        ]}
      />
      <ChartTable
        caption={t("chart.area.caption", { a: labelA, b: labelB })}
        columns={[t("chart.point"), labelA, labelB, t("forecast.col.total")]}
        rows={points.map((p) => ({
          key: p.label,
          cells: [
            xTickFormat(p.label),
            formatMoney(p.a, currency, { compact: true }),
            formatMoney(p.b, currency, { compact: true }),
            formatMoney(p.a + p.b, currency, { compact: true }),
          ],
        }))}
      />
      <div ref={ref} className="relative mt-2" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} aria-hidden>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--gridline)" strokeWidth={1} />
                <text x={pad.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={11} className="tnum" fill="var(--ink-3)">
                  {tickLabel(t)}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              i % labelEvery === 0 ? (
                <text key={p.label} x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                  {xTickFormat(p.label)}
                </text>
              ) : null,
            )}
            <path d={areaA} fill="var(--series-1)" fillOpacity={0.12} className="chart-fade" />
            <path d={areaB} fill="var(--series-2)" fillOpacity={0.12} className="chart-fade" />
            <path
              d={lineA}
              fill="none"
              stroke="var(--series-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="chart-line"
              style={{ "--len": plotW * 2.2 } as CSSProperties}
            />
            <path
              d={lineTotal}
              fill="none"
              stroke="var(--series-2)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="chart-line"
              style={{ "--len": plotW * 2.2 } as CSSProperties}
            />
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} stroke="var(--ink-3)" strokeWidth={1} opacity={0.5} />
                <circle cx={x(hover)} cy={y(points[hover].a)} r={4} fill="var(--series-1)" stroke="var(--card-strong)" strokeWidth={2} />
                <circle cx={x(hover)} cy={y(points[hover].a + points[hover].b)} r={4} fill="var(--series-2)" stroke="var(--card-strong)" strokeWidth={2} />
              </g>
            )}
            <rect
              x={pad.left}
              y={pad.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hover !== null && points[hover] && (
          <Tooltip x={x(hover)} y={pad.top} containerWidth={width}>
            <p className="mb-0.5 font-semibold text-ink-1">{points[hover].label}</p>
            <TooltipRow color="var(--series-2)" label={labelB} value={formatMoney(points[hover].b, currency, { compact: true })} />
            <TooltipRow color="var(--series-1)" label={labelA} value={formatMoney(points[hover].a, currency, { compact: true })} />
            <TooltipRow label={t("forecast.col.total")} value={formatMoney(points[hover].a + points[hover].b, currency, { compact: true })} />
          </Tooltip>
        )}
      </div>
    </div>
  );
}
