"use client";

import type { CSSProperties, ReactNode } from "react";
import { formatMoney, formatPercent } from "@/lib/finance/money";
import type { Currency } from "@/lib/types";
import { SERIES_VAR } from "./internals";
import { SparkArea, type Tone } from "./sparkline";

function Heading({ title, summary }: { title: string; summary?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p className="card-title">{title}</p>
      {summary && <p className="tnum text-xs text-ink-2">{summary}</p>}
    </div>
  );
}

export function HeroTrend({
  title,
  summary,
  values,
  tone,
  from,
  to,
  height = 104,
}: {
  title: string;
  summary?: ReactNode;
  values: number[];
  tone: Tone;
  from: string;
  to: string;
  height?: number;
}) {
  return (
    <div>
      <Heading title={title} summary={summary} />
      <div className="relative mt-2 border-b border-hairline" style={{ height }} role="img" aria-label={title}>
        <SparkArea values={values} tone={tone} height={height} />
      </div>
      <div className="tnum mt-1.5 flex justify-between text-[11px] text-ink-3">
        <span>{from}</span>
        <span>{to}</span>
      </div>
    </div>
  );
}

export interface SplitSegment {
  id: string;
  label: string;
  value: number;
  colorSlot: number;
  icon?: ReactNode;
}

export function HeroSplit({
  title,
  summary,
  segments,
  currency,
  columns = 2,
}: {
  title: string;
  summary?: ReactNode;
  segments: SplitSegment[];
  currency: Currency;
  columns?: 2 | 3;
}) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;
  const pct = (seg: SplitSegment) => formatPercent((seg.value / total) * 100, 0);
  const dot = (seg: SplitSegment, size: string) => (
    <span aria-hidden className={`${size} shrink-0 rounded-sm`} style={{ background: SERIES_VAR(seg.colorSlot) }} />
  );

  return (
    <div>
      <Heading title={title} summary={summary} />
      <div className="mt-2.5 flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={title}>
        {shown.map((seg, i) => (
          <div
            key={seg.id}
            className="bar-slice"
            title={`${seg.label}: ${formatMoney(seg.value, currency, { compact: true })}`}
            style={{ width: `${(seg.value / total) * 100}%`, background: SERIES_VAR(seg.colorSlot), "--i": i } as CSSProperties}
          />
        ))}
      </div>
      {columns === 3 ? (
        <ul className="mt-3 grid grid-cols-3 gap-x-4">
          {shown.map((seg) => (
            <li key={seg.id} className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs text-ink-3">
                {dot(seg, "size-2")}
                <span className="min-w-0">{seg.label}</span>
              </p>
              <p className="tnum mt-0.5 whitespace-nowrap">
                <span className="text-sm font-semibold text-ink-1">{formatMoney(seg.value, currency, { compact: true })}</span>{" "}
                <span className="text-xs text-ink-3">{pct(seg)}</span>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {shown.map((seg) => (
            <li key={seg.id} className="flex min-w-0 items-center gap-2 text-sm">
              {dot(seg, "size-2.5")}
              {seg.icon && (
                <span aria-hidden className="text-base leading-none">
                  {seg.icon}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-ink-2">{seg.label}</span>
              <span className="tnum text-xs text-ink-3">{pct(seg)}</span>
              <span className="tnum font-semibold text-ink-1">{formatMoney(seg.value, currency, { compact: true })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
