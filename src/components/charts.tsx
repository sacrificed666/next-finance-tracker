"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { formatMonthShort } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/types";
import { IconDisc, SegmentedControl } from "./ui";
import { useT } from "@/lib/i18n";
import { Icon, SUBJECT_SLOT, type IconName } from "./icons";

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

function axisFormatter(top: number): (v: number) => string {
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

const SERIES_VAR = (slot: number) => `var(--series-${((slot - 1) % 14) + 1})`;

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
  const flip = x > containerWidth - 132;
  return (
    <div
      className="glass-strong pointer-events-none absolute z-10 w-max rounded-chip px-2.5 py-1.5 text-[11px] leading-tight"
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

export const CHART_PERIODS = [
  { months: 6, label: "period.6m" },
  { months: 12, label: "period.1y" },
  { months: 24, label: "period.2y" },
  { months: 36, label: "period.3y" },
] as const;

export function PeriodTabs({
  value,
  onChange,
  options = CHART_PERIODS,
}: {
  value: number;
  onChange: (months: number) => void;
  options?: ReadonlyArray<{ months: number; label: string }>;
}) {
  const { t, tk } = useT();
  return (
    <SegmentedControl
      size="sm"
      label={t("chart.period")}
      className="shrink-0"
      options={options.map((p) => ({ value: String(p.months), label: tk(p.label, p.label) }))}
      value={String(value)}
      onChange={(months) => onChange(Number(months))}
    />
  );
}

function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<{ key: string; cells: string[] }>;
}) {
  return (
    <table className="sr-only">
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

type Tone = "income" | "expense" | "accent";

const TONE_COLOR: Record<Tone, string> = {
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

function SparkArea({ values, tone, height }: { values: number[]; tone: Tone; height: number }) {
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

export function StatTile({
  label,
  value,
  delta,
  hint,
  spark,
  bar,
  tone,
  href,
  icon,
  className = "",
}: {
  label: string;
  value: string;
  delta?: { text: string; good: boolean };
  hint?: string;
  spark?: number[];
  bar?: Array<{
    label: string;
    value: number;
    colorSlot?: number;
    color?: string;
  }>;
  tone?: "income" | "expense";
  href?: string;
  icon?: IconName;
  className?: string;
}) {
  const sparkTone: Tone = tone ?? "accent";
  const barTotal = bar ? bar.reduce((sum, seg) => sum + Math.max(0, seg.value), 0) : 0;
  const shell = `glass ${href ? "glass-hover" : ""} relative flex min-h-31 flex-col overflow-hidden rounded-card p-4 sm:p-5 ${
    spark && spark.length > 1 ? "pb-11" : ""
  } ${className}`;
  const body = (
    <>
      {icon ? (
        <div className="flex items-center gap-2.5">
          <IconDisc
            colorSlot={SUBJECT_SLOT[icon]}
            className={`size-8 rounded-chip ${SUBJECT_SLOT[icon] ? "" : "text-ink-3"}`}
          >
            <Icon name={icon} size={16} />
          </IconDisc>
          <p className="card-title truncate">{label}</p>
        </div>
      ) : (
        <p className="card-title">{label}</p>
      )}
      <p
        className={`num-md mt-2 whitespace-nowrap ${
          tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : "text-ink-1"
        }`}
      >
        {value}
      </p>
      {delta && (
        <p
          className={`relative z-1 mt-1.5 text-xs font-medium ${
            delta.good ? "text-income" : "text-expense"
          }`}
        >
          {delta.text}
        </p>
      )}
      {hint && (
        <p className={`relative z-1 text-xs text-ink-3 ${delta ? "mt-0.5" : "mt-1.5"}`}>
          {hint}
        </p>
      )}
      {spark && spark.length > 1 && <SparkArea values={spark} tone={sparkTone} height={40} />}
      {bar && barTotal > 0 && (
        <div className="mt-auto pt-3">
          <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
            {bar.map((seg) => (
              <div
                key={seg.label}
                style={{
                  width: `${(seg.value / barTotal) * 100}%`,
                  background: seg.color ?? `var(--series-${seg.colorSlot})`,
                }}
              />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
            {bar.map((seg) => (
              <li key={seg.label} className="flex items-center gap-1.5 text-[11px] text-ink-3">
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: seg.color ?? `var(--series-${seg.colorSlot})` }}
                />
                {seg.label}
                <span className="tnum">{Math.round((seg.value / barTotal) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export interface MonthPoint {
  month: string;
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
  const { t } = useT();
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 8, right: 8, bottom: 22, left: 44 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const tickLabel = axisFormatter(top);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;

  const band = data.length > 0 ? plotW / data.length : 0;
  const barW = Math.max(1.5, Math.min(24, (band - Math.min(4, band * 0.25)) / 2 - 1));
  const barGap = Math.min(2, band * 0.06);
  const labelStep = Math.max(1, Math.ceil(28 / Math.max(1, band)));

  return (
    <div>
      <ChartLegend
        items={[
          { label: t("tx.stat.income"), color: "var(--income)" },
          { label: t("tx.stat.expenses"), color: "var(--expense)" },
        ]}
      />
      <ChartTable
        caption={t("chart.columns.caption")}
        columns={[t("chart.month"), t("tx.stat.income"), t("tx.stat.expenses"), t("tx.stat.net")]}
        rows={data.map((d) => ({
          key: d.month,
          cells: [
            formatMonthShort(d.month),
            formatMoney(d.income, currency, { compact: true }),
            formatMoney(d.expense, currency, { compact: true }),
            formatMoney(d.income - d.expense, currency, { compact: true, sign: true }),
          ],
        }))}
      />
      <div ref={ref} className="relative mt-2" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} aria-hidden>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--gridline)"
                  strokeWidth={1}
                />
                <text x={pad.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={11} className="tnum" fill="var(--ink-3)">
                  {tickLabel(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = pad.left + band * i + band / 2;
              const dim = hover !== null && hover !== i;
              return (
                <g key={d.month} opacity={dim ? 0.45 : 1} style={{ transition: "opacity 120ms" }}>
                  <Column x={cx - barW - barGap / 2} w={barW} y0={y(0)} y1={y(d.income)} color="var(--income)" index={i} />
                  <Column x={cx + barGap / 2} w={barW} y0={y(0)} y1={y(d.expense)} color="var(--expense)" index={i} />
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
        {hover !== null && data[hover] && (
          <Tooltip x={pad.left + band * hover + band / 2} y={pad.top} containerWidth={width}>
            <p className="mb-0.5 font-semibold text-ink-1">{formatMonthShort(data[hover].month)}</p>
            <TooltipRow color="var(--income)" label={t("tx.stat.income")} value={formatMoney(data[hover].income, currency, { compact: true })} />
            <TooltipRow color="var(--expense)" label={t("tx.stat.expenses")} value={formatMoney(data[hover].expense, currency, { compact: true })} />
            <TooltipRow label={t("tx.stat.net")} value={formatMoney(data[hover].income - data[hover].expense, currency, { compact: true, sign: true })} />
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function Column({
  x,
  w,
  y0,
  y1,
  color,
  index = 0,
}: {
  x: number;
  w: number;
  y0: number;
  y1: number;
  color: string;
  index?: number;
}) {
  const h = Math.max(0, y0 - y1);
  if (h < 0.5) return null;
  const r = Math.min(4, w / 2, h);
  return (
    <path
      d={`M${x},${y0} L${x},${y1 + r} Q${x},${y1} ${x + r},${y1} L${x + w - r},${y1} Q${x + w},${y1} ${x + w},${y1 + r} L${x + w},${y0} Z`}
      fill={color}
      className="chart-bar"
      style={{ "--i": index } as CSSProperties}
    />
  );
}

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
          ? "flex flex-row items-center gap-6"
          : "flex flex-col items-center gap-5"
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

export function CategoryBreakdown({
  segments,
  currency,
  maxSegments = 6,
  rowExtra,
}: {
  segments: BreakdownSegment[];
  currency: Currency;
  maxSegments?: number;
  rowExtra?: (id: string) => ReactNode;
}) {
  const { t } = useT();
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const shown = segments.slice(0, maxSegments);
  const rest = segments.slice(maxSegments);
  const restValue = rest.reduce((s, seg) => s + seg.value, 0);
  const bars: BreakdownSegment[] =
    restValue > 0
      ? [
          ...shown,
          {
            id: "__other",
            label: t("chart.other"),
            icon: <Icon name="ellipsis" size={14} strokeWidth={3} />,
            value: restValue,
            colorSlot: 0,
          },
        ]
      : shown;

  if (total <= 0) return null;

  return (
    <div>
      <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t("chart.breakdownAria")}>
        {bars.map((seg, i) => (
          <div
            key={seg.id}
            className="bar-slice"
            style={{
              width: `${(seg.value / total) * 100}%`,
              background: seg.colorSlot === 0 ? "var(--ink-3)" : SERIES_VAR(seg.colorSlot),
              "--i": i,
            } as CSSProperties}
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
