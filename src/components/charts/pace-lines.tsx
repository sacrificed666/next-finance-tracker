"use client";

import { useId, useState } from "react";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Currency } from "@/lib/types";
import { axisFormatter, ChartLegend, ChartTable, niceTicks, Tooltip, TooltipRow, useMeasure } from "./internals";

export function PaceLines({
  current,
  previous,
  days,
  currency,
  currentLabel,
  previousLabel,
  caption,
  dayLabel,
  color = "var(--expense)",
  height = 180,
}: {
  current: number[];
  previous: number[];
  days: number;
  currency: Currency;
  currentLabel: string;
  previousLabel: string;
  caption: string;
  dayLabel: (day: number) => string;
  color?: string;
  height?: number;
}) {
  const { t } = useT();
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradient = `pace-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const pad = { top: 10, right: 12, bottom: 22, left: 44 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...current, ...previous);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const tickLabel = axisFormatter(top);
  const x = (i: number) => pad.left + (days > 1 ? (i / (days - 1)) * plotW : 0);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = current.length - 1;
  const money = (v: number) => formatMoney(v, currency, { compact: true });

  return (
    <div>
      <ChartLegend
        items={[
          { label: currentLabel, color },
          { label: previousLabel, color: "var(--ink-3)" },
        ]}
      />
      <ChartTable
        caption={caption}
        columns={[t("common.date"), currentLabel, previousLabel]}
        rows={Array.from({ length: days }, (_, i) => ({
          key: String(i),
          cells: [dayLabel(i + 1), i < current.length ? money(current[i]) : "—", i < previous.length ? money(previous[i]) : "—"],
        }))}
      />
      <div ref={ref} className="relative mt-2" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} aria-hidden>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.16} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--gridline)" strokeWidth={1} />
                <text x={pad.left - 6} y={y(tick) + 3.5} textAnchor="end" fontSize={11} className="tnum" fill="var(--ink-3)">
                  {tickLabel(tick)}
                </text>
              </g>
            ))}
            {Array.from({ length: days }, (_, i) =>
              i === 0 || (i + 1) % 5 === 0 || (i === days - 1 && days % 5 >= 3) ? (
                <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} className="tnum" fill="var(--ink-3)">
                  {i + 1}
                </text>
              ) : null,
            )}
            {previous.length > 1 && (
              <path
                d={path(previous)}
                fill="none"
                stroke="var(--ink-3)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.55}
              />
            )}
            {current.length > 1 && (
              <>
                <path d={`${path(current)}L${x(last)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${gradient})`} />
                <path d={path(current)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}
            {current.length > 0 && (
              <circle cx={x(last)} cy={y(current[last])} r={4} fill={color} stroke="var(--card-strong)" strokeWidth={2} />
            )}
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} opacity={0.6} />
            )}
            <rect
              x={pad.left}
              y={pad.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const i = Math.round(((e.clientX - box.left) / Math.max(1, box.width)) * (days - 1));
                setHover(Math.max(0, Math.min(days - 1, i)));
              }}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hover !== null && (
          <Tooltip x={x(hover)} y={pad.top} containerWidth={width}>
            <p className="mb-0.5 font-semibold text-ink-1">{dayLabel(hover + 1)}</p>
            {hover < current.length && <TooltipRow color={color} label={currentLabel} value={money(current[hover])} />}
            {hover < previous.length && <TooltipRow color="var(--ink-3)" label={previousLabel} value={money(previous[hover])} />}
          </Tooltip>
        )}
      </div>
    </div>
  );
}
