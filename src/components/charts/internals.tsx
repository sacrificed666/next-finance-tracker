"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function useMeasure<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export function axisFormatter(top: number): (v: number) => string {
  const div = top >= 1_000_000 ? 1_000_000 : top >= 1_000 ? 1_000 : 1;
  const suffix = div === 1_000_000 ? "M" : div === 1_000 ? "K" : "";
  return (v) => {
    if (v === 0) return "0";
    const scaled = v / div;
    const text = Math.abs(scaled) < 10 && !Number.isInteger(scaled)
      ? scaled.toFixed(1)
      : String(Math.round(scaled));
    return text + suffix;
  };
}

export const SERIES_VAR = (slot: number) => `var(--series-${((slot - 1) % 14) + 1})`;

export function Tooltip({
  x,
  y,
  containerWidth,
  children,
}: {
  x: number;
  y: number;
  containerWidth: number;
  children: ReactNode;
}) {
  const flip = x > containerWidth - 132;
  return (
    <div
      className="glass-solid pointer-events-none absolute z-10 w-max rounded-chip px-2.5 py-1.5 text-[11px] leading-tight"
      style={{
        left: flip ? undefined : x + 10,
        right: flip ? containerWidth - x + 10 : undefined,
        top: Math.max(0, y - 6),
      }}
    >
      {children}
    </div>
  );
}

export function TooltipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2.5 py-px">
      <span className="flex items-center gap-1.5 text-ink-2">
        {color && (
          <span
            aria-hidden
            className="inline-block h-0.5 w-3 rounded-full"
            style={{ background: color }}
          />
        )}
        {label}
      </span>
      <span className="tnum font-semibold text-ink-1">{value}</span>
    </div>
  );
}

export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<{ key: string; cells: string[] }>;
}) {
  // `sr-only` sits on a wrapper: tables ignore `overflow: hidden`, so a hidden
  // table with many rows would otherwise stretch the page with empty scroll.
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((cell, i) =>
                i === 0 ? (
                  <th key={columns[i]} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={columns[i]}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartLegend({
  items,
}: {
  items: Array<{ label: string; color: string; kind?: "line" | "rect" }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-xs text-ink-2">
          <span
            aria-hidden
            className={it.kind === "line" ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-sm"}
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** A column growing from the baseline, with a 4 px rounded data end and a square foot. */
export function Column({
  x,
  w,
  y0,
  y1,
  color,
  index = 0,
  rounded = true,
}: {
  x: number;
  w: number;
  y0: number;
  y1: number;
  color: string;
  index?: number;
  /** False for a lower segment of a stack: only the top of a stack is rounded. */
  rounded?: boolean;
}) {
  const h = Math.max(0, y0 - y1);
  if (h < 0.5) return null;
  const r = rounded ? Math.min(4, w / 2, h) : 0;
  return (
    <path
      d={`M${x},${y0} L${x},${y1 + r} Q${x},${y1} ${x + r},${y1} L${x + w - r},${y1} Q${x + w},${y1} ${x + w},${y1 + r} L${x + w},${y0} Z`}
      fill={color}
      className="chart-bar"
      style={{ "--i": index } as CSSProperties}
    />
  );
}
