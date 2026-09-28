"use client";

import { useId, type CSSProperties } from "react";
import { useMeasure } from "./internals";

export type Tone = "income" | "expense" | "accent";

export const TONE_COLOR: Record<Tone, string> = {
  income: "var(--income)",
  expense: "var(--expense)",
  accent: "var(--accent)",
};

export function Sparkline({
  values,
  height = 28,
  width = 72,
  tone = "accent",
}: {
  values: number[];
  height?: number;
  width?: number;
  tone?: Tone;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const px = (i: number) => (i / (values.length - 1)) * (width - 8) + 4;
  const py = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join("");
  const last = values.length - 1;
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      <path d={d} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.6} />
      <circle cx={px(last)} cy={py(values[last])} r={3} fill={TONE_COLOR[tone]} stroke="var(--card-strong)" strokeWidth={2} />
    </svg>
  );
}

export function SparkArea({ values, tone, height }: { values: number[]; tone: Tone; height: number }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const color = TONE_COLOR[tone];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const px = (i: number) => (i / (values.length - 1)) * width;
  const py = (v: number) => height - 3 - ((v - min) / span) * (height - 8);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join("");
  const id = `spark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height }}>
      {width > 0 && values.length > 1 && (
        <svg width={width} height={height} className="block">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${line}L${width},${height}L0,${height}Z`} fill={`url(#${id})`} className="chart-fade" />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.85}
            className="chart-line"
            style={{ "--len": width * 2 } as CSSProperties}
          />
        </svg>
      )}
    </div>
  );
}
