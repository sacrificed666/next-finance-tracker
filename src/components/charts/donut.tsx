"use client";

import { useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Currency } from "@/lib/types";
import { SERIES_VAR, useMeasure } from "./internals";

export interface BreakdownSegment {
  id: string;
  label: string;
  icon: ReactNode;
  value: number;
  colorSlot: number;
}

export function Donut({
  segments,
  currency,
  centerLabel,
  size,
  stacked = false,
  legend = true,
}: {
  segments: BreakdownSegment[];
  currency: Currency;
  centerLabel?: string;
  size?: number;
  stacked?: boolean;
  legend?: boolean;
}) {
  const { t } = useT();
  const [hover, setHover] = useState<string | null>(null);
  const [ref, width] = useMeasure<HTMLDivElement>();
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  const sideBySide = legend && !stacked && width >= 360;
  const dim =
    size ??
    (sideBySide
      ?
        Math.max(140, Math.min(220, Math.round(width * 0.36)))
      : width > 0
        ?
          Math.max(150, Math.min(288, Math.round(width * 0.78)))
        : 168);
  const stroke = Math.max(14, dim * 0.14);
  const radius = (dim - stroke) / 2;
  const cx = dim / 2;
  const c = 2 * Math.PI * radius;
  const gap = segments.length > 1 ? 3 : 0;

  const arcs: Array<{ seg: BreakdownSegment; dashArray: string; dashOffset: number }> = [];
  let offset = 0;
  for (const seg of segments) {
    if (total > 0) {
      const len = (seg.value / total) * c;
      const dash = Math.max(0, len - gap);
      arcs.push({ seg, dashArray: `${dash} ${c - dash}`, dashOffset: -offset });
      offset += len;
    }
  }

  const focused = hover ? segments.find((s) => s.id === hover) : null;

  const hitTest = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = dim / rect.width;
    const x = (e.clientX - rect.left) * scale - cx;
    const y = (e.clientY - rect.top) * scale - cx;
    const dist = Math.hypot(x, y);
    if (dist < radius - stroke / 2 - 6 || dist > radius + stroke / 2 + 6) {
      setHover(null);
      return;
    }
    let ang = Math.atan2(x, -y);
    if (ang < 0) ang += 2 * Math.PI;
    const frac = ang / (2 * Math.PI);
    let acc = 0;
    for (const seg of segments) {
      acc += seg.value / total;
      if (frac <= acc) {
        setHover(seg.id);
        return;
      }
    }
  };

  if (total <= 0) return null;

  return (
    <div
      ref={ref}
      className={
        sideBySide
          ? "flex flex-row items-center gap-5"
          : "flex flex-col items-center gap-4"
      }
    >
      <svg
        width={dim}
        height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        role="img"
        aria-label={t("chart.donut", { label: centerLabel ?? t("chart.breakdown") })}
        className="shrink-0"
        onPointerMove={hitTest}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: "pan-y" }}
      >
        <circle cx={cx} cy={cx} r={radius} fill="none" stroke="var(--fill-ghost)" strokeWidth={stroke} />
        <g className="chart-ring">
        {arcs.map(({ seg, dashArray, dashOffset }) => {
          const dimmed = hover !== null && hover !== seg.id;
          return (
            <circle
              key={seg.id}
              cx={cx}
              cy={cx}
              r={radius}
              fill="none"
              stroke={SERIES_VAR(seg.colorSlot)}
              strokeWidth={stroke}
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cx})`}
              opacity={dimmed ? 0.35 : 1}
              style={{ transition: "opacity 140ms ease", pointerEvents: "none" }}
            />
          );
        })}
        </g>
        <text x={cx} y={cx - dim * 0.035} textAnchor="middle" fontSize={Math.max(10, dim * 0.062)} fontWeight={650} fill="var(--ink-3)" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {focused ? focused.label : (centerLabel ?? t("forecast.col.total"))}
        </text>
        <text x={cx} y={cx + dim * 0.082} textAnchor="middle" fontSize={Math.max(15, dim * 0.098)} fontWeight={700} className="tnum" fill="var(--ink-1)">
          {formatMoney(focused ? focused.value : total, currency, { compact: true })}
        </text>
      </svg>

      {legend && (
      <ul className="w-full min-w-0 space-y-2">
        {segments.map((seg) => (
          <li
            key={seg.id}
            className="flex items-center gap-2.5 text-sm"
            onPointerMove={() => setHover(seg.id)}
            onPointerLeave={() => setHover(null)}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: SERIES_VAR(seg.colorSlot) }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-1">{seg.label}</span>
            <span className="tnum text-xs text-ink-3">
              {((seg.value / total) * 100).toFixed(0)}%
            </span>
            <span className="tnum whitespace-nowrap font-semibold text-ink-1">
              {formatMoney(seg.value, currency, { compact: true })}
            </span>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
