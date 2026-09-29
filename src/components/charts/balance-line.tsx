"use client";

import { useId, useState } from "react";
import { formatDateShort, formatWeekday } from "@/lib/date";
import { formatMoney } from "@/lib/finance/money";
import type { Currency } from "@/lib/types";
import { axisFormatter, ChartTable, niceTicks, Tooltip, TooltipRow, useMeasure } from "./internals";

export interface BalancePoint {
  date: string;
  value: number;
  change: number;
}

export function BalanceLine({
  points,
  currency,
  caption,
  dateLabel,
  valueLabel,
  changeLabel,
  height = 150,
}: {
  points: BalancePoint[];
  currency: Currency;
  caption: string;
  dateLabel: string;
  valueLabel: string;
  changeLabel: string;
  height?: number;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradient = `bal-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const pad = { top: 10, right: 12, bottom: 22, left: 48 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const values = points.map((p) => p.value);
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const ticksUp = niceTicks(hi || 1, 3);
  const top = ticksUp[ticksUp.length - 1];
  const bottom = lo < 0 ? -niceTicks(-lo, 2)[niceTicks(-lo, 2).length - 1] : 0;
  const ticks = [...(bottom < 0 ? [bottom] : []), ...ticksUp];
  const tickLabel = axisFormatter(Math.max(top, -bottom));
  const x = (i: number) => pad.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : 0);
  const y = (v: number) => pad.top + ((top - v) / (top - bottom || 1)) * plotH;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const lowest = points.reduce((best, p, i) => (p.value < points[best].value ? i : best), 0);
  const color = points[lowest]?.value < 0 ? "var(--expense)" : "var(--accent)";
  const money = (v: number, sign = false) => formatMoney(v, currency, { compact: true, sign });
  const hovered = hover !== null ? points[hover] : undefined;

  return (
    <div>
      <ChartTable
        caption={caption}
        columns={[dateLabel, valueLabel, changeLabel]}
        rows={points.map((p) => ({ key: p.date, cells: [formatDateShort(p.date), money(p.value), money(p.change, true)] }))}
      />
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && points.length > 1 && (
          <svg width={width} height={height} aria-hidden>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.16} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={tick === 0 && bottom < 0 ? "var(--expense)" : "var(--gridline)"}
                  strokeOpacity={tick === 0 && bottom < 0 ? 0.5 : 1}
                  strokeWidth={1}
                />
                <text x={pad.left - 6} y={y(tick) + 3.5} textAnchor="end" fontSize={11} className="tnum" fill="var(--ink-3)">
                  {tickLabel(tick)}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              i === 0 || i === points.length - 1 || (i % 7 === 0 && points.length - 1 - i >= 4) ? (
                <text
                  key={p.date}
                  x={x(i)}
                  y={height - 6}
                  textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                  fontSize={11}
                  fill="var(--ink-3)"
                >
                  {formatDateShort(p.date)}
                </text>
              ) : null,
            )}
            <path d={`${line}L${x(points.length - 1)},${y(bottom)}L${x(0)},${y(bottom)}Z`} fill={`url(#${gradient})`} />
            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(lowest)} cy={y(points[lowest].value)} r={4} fill={color} stroke="var(--card-strong)" strokeWidth={2} />
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} stroke="var(--ink-3)" strokeWidth={1} opacity={0.6} />
            )}
            <rect
              x={pad.left}
              y={pad.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const i = Math.round(((e.clientX - box.left) / Math.max(1, box.width)) * (points.length - 1));
                setHover(Math.max(0, Math.min(points.length - 1, i)));
              }}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hovered && hover !== null && (
          <Tooltip x={x(hover)} y={pad.top} containerWidth={width}>
            <p className="mb-0.5 font-semibold text-ink-1">
              {formatWeekday(hovered.date)}, {formatDateShort(hovered.date)}
            </p>
            <TooltipRow color={color} label={valueLabel} value={money(hovered.value)} />
            {hovered.change !== 0 && <TooltipRow label={changeLabel} value={money(hovered.change, true)} />}
          </Tooltip>
        )}
      </div>
    </div>
  );
}
