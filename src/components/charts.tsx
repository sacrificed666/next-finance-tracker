"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatMonthShort } from "@/lib/date";
import { formatCompact, formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/types";

/* ---------- shared plumbing ---------- */

function useMeasure<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
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

/** clean axis ticks: 0 .. niceMax in `count` steps */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

const SERIES_VAR = (slot: number) => `var(--series-${((slot - 1) % 8) + 1})`;

function Tooltip({
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
  const flip = x > containerWidth - 150;
  return (
    <div
      className="glass-strong pointer-events-none absolute z-10 min-w-32 rounded-2xl px-3 py-2 text-xs"
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? containerWidth - x + 12 : undefined,
        top: Math.max(0, y - 8),
      }}
    >
      {children}
    </div>
  );
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
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

/* ---------- sparkline (stat tiles) ---------- */

export function Sparkline({
  values,
  height = 28,
  width = 72,
}: {
  values: number[];
  height?: number;
  width?: number;
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
      <circle cx={px(last)} cy={py(values[last])} r={3} fill="var(--accent)" stroke="var(--card-strong)" strokeWidth={2} />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  delta,
  spark,
  tone,
  className = "",
}: {
  label: string;
  value: string;
  delta?: { text: string; good: boolean };
  spark?: number[];
  tone?: "income" | "expense";
  className?: string;
}) {
  return (
    <div className={`glass flex flex-col justify-between rounded-card p-4 ${className}`}>
      <p className="card-title">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p
          className={`text-2xl font-bold leading-tight tracking-tight ${
            tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : "text-ink-1"
          }`}
        >
          {value}
        </p>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      {delta && (
        <p className={`mt-1.5 text-xs font-medium ${delta.good ? "text-income" : "text-expense"}`}>
          {delta.text}
        </p>
      )}
    </div>
  );
}

/* ---------- monthly income vs expense columns ---------- */

export interface MonthPoint {
  month: string; // yyyy-mm
  income: number;
  expense: number;
}

export function MonthlyColumns({
  data,
  currency,
  height = 200,
}: {
  data: MonthPoint[];
  currency: Currency;
  height?: number;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 8, right: 8, bottom: 22, left: 44 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;

  const band = data.length > 0 ? plotW / data.length : 0;
  const barW = Math.min(24, Math.max(4, (band - 10) / 2));
  // thin x-axis labels on narrow containers (mobile) so short month names
  // don't collide; always keep the most recent (rightmost) month labelled
  const labelStep = Math.max(1, Math.ceil(28 / Math.max(1, band)));

  return (
    <div>
      <ChartLegend
        items={[
          { label: "Income", color: "var(--series-1)" },
          { label: "Expenses", color: "var(--series-6)" },
        ]}
      />
      <div ref={ref} className="relative mt-2" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Income and expenses by month">
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--hairline)"
                  strokeWidth={1}
                />
                <text x={pad.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} className="tnum" fill="var(--ink-3)">
                  {formatCompact(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = pad.left + band * i + band / 2;
              const dim = hover !== null && hover !== i;
              return (
                <g key={d.month} opacity={dim ? 0.45 : 1} style={{ transition: "opacity 120ms" }}>
                  <Column x={cx - barW - 1} w={barW} y0={y(0)} y1={y(d.income)} color="var(--series-1)" />
                  <Column x={cx + 1} w={barW} y0={y(0)} y1={y(d.expense)} color="var(--series-6)" />
                  {(data.length - 1 - i) % labelStep === 0 && (
                    <text x={cx} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)">
                      {formatMonthShort(d.month)}
                    </text>
                  )}
                </g>
              );
            })}
            {/* hover hit bands */}
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
        {hover !== null && data[hover] && (
          <Tooltip x={pad.left + band * hover + band / 2} y={pad.top} containerWidth={width}>
            <p className="mb-1 font-semibold text-ink-1">{formatMonthShort(data[hover].month)}</p>
            <TooltipRow color="var(--series-1)" label="Income" value={formatMoney(data[hover].income, currency, { compact: true })} />
            <TooltipRow color="var(--series-6)" label="Expenses" value={formatMoney(data[hover].expense, currency, { compact: true })} />
            <TooltipRow label="Net" value={formatMoney(data[hover].income - data[hover].expense, currency, { compact: true, sign: true })} />
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function Column({ x, w, y0, y1, color }: { x: number; w: number; y0: number; y1: number; color: string }) {
  const h = Math.max(0, y0 - y1);
  if (h < 0.5) return null;
  const r = Math.min(4, w / 2, h); // rounded data-end, square baseline
  return (
    <path
      d={`M${x},${y0} L${x},${y1 + r} Q${x},${y1} ${x + r},${y1} L${x + w - r},${y1} Q${x + w},${y1} ${x + w},${y1 + r} L${x + w},${y0} Z`}
      fill={color}
    />
  );
}

/* ---------- category breakdown: stacked bar + rows (table view) ---------- */

export interface BreakdownSegment {
  id: string;
  label: string;
  icon: string;
  value: number;
  colorSlot: number;
}

export function CategoryBreakdown({
  segments,
  currency,
  maxSegments = 6,
  rowExtra,
}: {
  segments: BreakdownSegment[]; // sorted desc
  currency: Currency;
  maxSegments?: number;
  /** optional extra row content (e.g. budget meter), by segment id */
  rowExtra?: (id: string) => ReactNode;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const shown = segments.slice(0, maxSegments);
  const rest = segments.slice(maxSegments);
  const restValue = rest.reduce((s, seg) => s + seg.value, 0);
  const bars = restValue > 0
    ? [...shown, { id: "__other", label: "Other", icon: "📦", value: restValue, colorSlot: 0 }]
    : shown;

  if (total <= 0) return null;

  return (
    <div>
      <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Expense breakdown by category">
        {bars.map((seg) => (
          <div
            key={seg.id}
            style={{
              width: `${(seg.value / total) * 100}%`,
              background: seg.colorSlot === 0 ? "var(--ink-3)" : SERIES_VAR(seg.colorSlot),
            }}
            title={`${seg.label}: ${formatMoney(seg.value, currency, { compact: true })}`}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {bars.map((seg) => (
          <li key={seg.id}>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: seg.colorSlot === 0 ? "var(--ink-3)" : SERIES_VAR(seg.colorSlot) }}
              />
              <span className="text-base leading-none" aria-hidden>{seg.icon}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{seg.label}</span>
              <span className="text-xs text-ink-3 tnum">{((seg.value / total) * 100).toFixed(0)}%</span>
              <span className="tnum text-sm font-semibold text-ink-1">
                {formatMoney(seg.value, currency, { compact: true })}
              </span>
            </div>
            {rowExtra?.(seg.id)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- projection: stacked area ---------- */

export interface AreaPoint {
  label: string; // x label (month key)
  a: number; // bottom series (savings)
  b: number; // top series (investments)
}

export function StackedArea({
  points,
  currency,
  seriesA = "Savings",
  seriesB = "Investments",
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
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 10, right: 12, bottom: 22, left: 52 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => p.a + p.b));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
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

  return (
    <div>
      <ChartLegend
        items={[
          { label: seriesA, color: "var(--series-1)" },
          { label: seriesB, color: "var(--series-5)" },
        ]}
      />
      <div ref={ref} className="relative mt-2" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${seriesA} and ${seriesB} projection`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeWidth={1} />
                <text x={pad.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} className="tnum" fill="var(--ink-3)">
                  {formatCompact(t)}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              i % xTickEvery === 0 ? (
                <text key={p.label} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)">
                  {xTickFormat(p.label)}
                </text>
              ) : null,
            )}
            <path d={areaA} fill="var(--series-1)" opacity={0.1} />
            <path d={areaB} fill="var(--series-5)" opacity={0.1} />
            <path d={lineA} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={lineTotal} fill="none" stroke="var(--series-5)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} stroke="var(--ink-3)" strokeWidth={1} opacity={0.5} />
                <circle cx={x(hover)} cy={y(points[hover].a)} r={4} fill="var(--series-1)" stroke="var(--card-strong)" strokeWidth={2} />
                <circle cx={x(hover)} cy={y(points[hover].a + points[hover].b)} r={4} fill="var(--series-5)" stroke="var(--card-strong)" strokeWidth={2} />
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
            <p className="mb-1 font-semibold text-ink-1">{points[hover].label}</p>
            <TooltipRow color="var(--series-5)" label={seriesB} value={formatMoney(points[hover].b, currency, { compact: true })} />
            <TooltipRow color="var(--series-1)" label={seriesA} value={formatMoney(points[hover].a, currency, { compact: true })} />
            <TooltipRow label="Total" value={formatMoney(points[hover].a + points[hover].b, currency, { compact: true })} />
          </Tooltip>
        )}
      </div>
    </div>
  );
}
