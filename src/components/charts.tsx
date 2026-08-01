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
import { SegmentedControl } from "./ui";
import { Icon } from "./icons";

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

/**
 * One unit for the whole axis, chosen from its top tick.
 *
 * `formatCompact` switches to "K" at ten thousand, which is right for a tile
 * standing on its own and wrong for a column of ticks: an axis topping out at
 * 15 000 came out as `0 / 5,000 / 10K / 15K` — two number formats stacked on
 * one line of enquiry. Pick the unit once, then apply it to every tick.
 */
function axisFormatter(top: number): (v: number) => string {
  const div = top >= 1_000_000 ? 1_000_000 : top >= 1_000 ? 1_000 : 1;
  const suffix = div === 1_000_000 ? "M" : div === 1_000 ? "K" : "";
  return (v) => {
    if (v === 0) return "0";
    const scaled = v / div;
    // one decimal only where the step actually needs it
    const text = Math.abs(scaled) < 10 && !Number.isInteger(scaled)
      ? scaled.toFixed(1)
      : String(Math.round(scaled));
    return text + suffix;
  };
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
      className="glass-strong pointer-events-none absolute z-10 min-w-32 rounded-field px-3 py-2 text-xs"
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

/** compact window selector for time-series charts (6M / 1Y / 2Y / 3Y) */
export const CHART_PERIODS = [
  { months: 6, label: "6M" },
  { months: 12, label: "1Y" },
  { months: 24, label: "2Y" },
  { months: 36, label: "3Y" },
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
  // the same control as every other single choice in the app, in its compact
  // size — it used to light the active tab up in place, with none of the
  // travelling thumb or focus ring the rest of the radiogroups have
  return (
    <SegmentedControl
      size="sm"
      label="Period"
      className="shrink-0"
      options={options.map((p) => ({ value: String(p.months), label: p.label }))}
      value={String(value)}
      onChange={(months) => onChange(Number(months))}
    />
  );
}

/**
 * The numbers behind a chart, for anything that cannot see it.
 *
 * The breakdowns on this page double as their own text equivalent — every slice
 * is a labelled row with its amount. The two time-series charts had no such
 * thing: a `role="img"` and one `aria-label` saying the chart existed, and not
 * a single value anywhere. Visually hidden, so it costs the sighted layout
 * nothing.
 */
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

/* ---------- sparkline (stat tiles) ---------- */

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

/**
 * The trend behind a stat tile: a filled area pinned to the bottom edge,
 * measured to whatever width the tile ends up with. It sits under the number
 * instead of beside it, so a long value can never be squeezed into two lines
 * by the chart next to it.
 */
function SparkArea({ values, tone, height }: { values: number[]; tone: Tone; height: number }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const color = TONE_COLOR[tone];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const px = (i: number) => (i / (values.length - 1)) * width;
  const py = (v: number) => height - 3 - ((v - min) / span) * (height - 8);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join("");
  // Per instance, not per tone: four tiles in a row all defined `spark-accent`,
  // and `url(#spark-accent)` resolves to whichever one is first in the document
  // — unmount that tile and the rest lose their fill. Stripped of punctuation
  // because React's generated ids carry delimiters that do not belong in a URL
  // fragment.
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

/**
 * One headline figure. Every tile has the same skeleton — label, value, one
 * line of context — so a row of them scans as a row rather than four
 * differently-shaped cards.
 */
export function StatTile({
  label,
  value,
  delta,
  hint,
  spark,
  tone,
  href,
  className = "",
}: {
  label: string;
  value: string;
  delta?: { text: string; good: boolean };
  /** neutral context line, under the delta when there is one */
  hint?: string;
  spark?: number[];
  tone?: "income" | "expense";
  /** where the figure comes from; makes the tile a link */
  href?: string;
  className?: string;
}) {
  const sparkTone: Tone = tone ?? "accent";
  // the lift is reserved for tiles that lead somewhere — every tile used to
  // rise under the pointer and then do nothing when clicked
  // the sparkline is a 40px band pinned to the bottom edge, so the text block
  // has to end above it — a second context line used to be drawn straight
  // across the curve
  const shell = `glass ${href ? "glass-hover" : ""} relative flex min-h-31 flex-col overflow-hidden rounded-card p-4 ${
    spark && spark.length > 1 ? "pb-11" : ""
  } ${className}`;
  const body = (
    <>
      <p className="card-title">{label}</p>
      <p
        className={`num-md mt-2 whitespace-nowrap ${
          tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : "text-ink-1"
        }`}
      >
        {value}
      </p>
      {/* both lines when both are given: the hint used to be dropped whenever a
          delta existed, which is exactly when a tile has most to explain */}
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
  const tickLabel = axisFormatter(top);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;

  const band = data.length > 0 ? plotW / data.length : 0;
  // A pair of bars plus the gap between them has to fit inside one band. The
  // old floor of 6px did not care whether it did: at three years on a phone the
  // band is ~7px wide, so two 6px bars and a 2px gap — 14px of ink — were being
  // drawn in it, and every month bled into its neighbours until the chart was a
  // solid slab. Bars can be hairlines if that is what the window costs.
  const barW = Math.max(1.5, Math.min(24, (band - Math.min(4, band * 0.25)) / 2 - 1));
  const barGap = Math.min(2, band * 0.06);
  // thin x-axis labels on narrow containers (mobile) so short month names
  // don't collide; always keep the most recent (rightmost) month labelled
  const labelStep = Math.max(1, Math.ceil(28 / Math.max(1, band)));

  return (
    <div>
      <ChartLegend
        items={[
          { label: "Income", color: "var(--income)" },
          { label: "Expenses", color: "var(--expense)" },
        ]}
      />
      <ChartTable
        caption="Income and expenses by month"
        columns={["Month", "Income", "Expenses", "Net"]}
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
          // the table above carries the data; the drawing is decoration to
          // anything that cannot see it, and announcing both reads it twice
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
            <TooltipRow color="var(--income)" label="Income" value={formatMoney(data[hover].income, currency, { compact: true })} />
            <TooltipRow color="var(--expense)" label="Expenses" value={formatMoney(data[hover].expense, currency, { compact: true })} />
            <TooltipRow label="Net" value={formatMoney(data[hover].income - data[hover].expense, currency, { compact: true, sign: true })} />
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
  /** position in the series — staggers the grow-in so the row sweeps */
  index?: number;
}) {
  const h = Math.max(0, y0 - y1);
  if (h < 0.5) return null;
  const r = Math.min(4, w / 2, h); // rounded data-end, square baseline
  return (
    <path
      d={`M${x},${y0} L${x},${y1 + r} Q${x},${y1} ${x + r},${y1} L${x + w - r},${y1} Q${x + w},${y1} ${x + w},${y1 + r} L${x + w},${y0} Z`}
      fill={color}
      className="chart-bar"
      style={{ "--i": index } as CSSProperties}
    />
  );
}

/* ---------- category breakdown: stacked bar + rows (table view) ---------- */

export interface BreakdownSegment {
  id: string;
  label: string;
  /** the emoji the user picked for this category or account, or an app icon */
  icon: ReactNode;
  value: number;
  colorSlot: number;
}

/**
 * Donut for a small part-to-whole (≤ 6 slices) with a hero total in the hole.
 * A legend keys the slices, so identity never rests on colour alone.
 */
export function Donut({
  segments,
  currency,
  centerLabel,
  size,
  stacked = false,
  legend = true,
}: {
  segments: BreakdownSegment[]; // sorted desc
  currency: Currency;
  centerLabel?: string;
  /** fixed diameter; omit in `stacked` mode to auto-fit the container width */
  size?: number;
  /** legend below the ring (fills a narrow column) instead of beside it */
  stacked?: boolean;
  /** off when the card already lists the same slices in more detail */
  legend?: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [ref, width] = useMeasure<HTMLDivElement>();
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  /*
   * Ring beside the legend only when there *is* a legend and the card is
   * actually wide enough for both.
   *
   * `width` is this container's own width rather than a `sm:` breakpoint,
   * because the viewport says nothing about the column the donut landed in: in
   * a two-up grid on a 1152px laptop the legend was squeezed to about 70px and
   * every category read as "C 69%".
   *
   * The `legend` half of the condition is the part that was missing. The one
   * caller that turns the legend off — currency allocation, which lists its own
   * slices underneath in more detail — still got the two-column layout, with
   * nothing to put in the second column: a 190px ring pinned to the left edge
   * of a 460px card and a quarter of the card left blank. It only showed up
   * from `xl`, where that card is finally wide enough to trip the threshold.
   */
  const sideBySide = legend && !stacked && width >= 360;
  // Sharing the row, the ring takes a share of the width and leaves the rest to
  // the legend; alone, it grows into the card. A fixed 220px ring in a 420px
  // column left the labels 70px and stacking it instead made the card twice as
  // tall as the chart beside it — scaling is what keeps both honest.
  const dim =
    size ??
    (sideBySide
      ? // 36%: the legend needs room for a real name plus a percentage and an
        // amount — at 42% "Subscriptions" still came out as "Subscripti…"
        Math.max(140, Math.min(220, Math.round(width * 0.36)))
      : width > 0
        ? // Alone in the card the ring is the card, so it takes most of the
          // width rather than a token 224px cap left over from the days when a
          // legend was stacked underneath it. 78% keeps a margin either side;
          // the ceiling stops it turning into a dinner plate on a wide desktop.
          Math.max(150, Math.min(288, Math.round(width * 0.78)))
        : 168);
  const stroke = Math.max(14, dim * 0.14);
  const radius = (dim - stroke) / 2;
  const cx = dim / 2;
  const c = 2 * Math.PI * radius;
  const gap = segments.length > 1 ? 3 : 0; // px of surface between slices

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

  // one deterministic hit-test on the whole ring: which slice does the
  // pointer's angle fall into? per-circle handlers flicker at slice seams.
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
    // angle measured clockwise from the top (matches the -90° arc rotation)
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
        aria-label={`${centerLabel ?? "Breakdown"} donut`}
        className="shrink-0"
        onPointerMove={hitTest}
        onPointerLeave={() => setHover(null)}
        // `pan-y`, not `none`: the ring is a full-width, ~200px-tall block in a
        // phone-width card, and `none` made it a dead zone you could not scroll
        // the page through. Vertical panning still belongs to the page;
        // everything else is still ours to hit-test.
        style={{ touchAction: "pan-y" }}
      >
        <circle cx={cx} cy={cx} r={radius} fill="none" stroke="var(--fill-ghost)" strokeWidth={stroke} />
        <g className="chart-ring">
        {arcs.map(({ seg, dashArray, dashOffset }) => {
          // `dimmed`, not `dim`: the diameter above is called that, and a slice
          // that shadowed it here was one edit away from a silent geometry bug
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
          {focused ? focused.label : (centerLabel ?? "Total")}
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
  const bars: BreakdownSegment[] =
    restValue > 0
      ? [
          ...shown,
          {
            id: "__other",
            label: "Other",
            // the app's own row, so it takes the app's own icon rather than a
            // cardboard box that reads as one more category you chose
            icon: <Icon name="ellipsis" size={14} strokeWidth={3} />,
            value: restValue,
            colorSlot: 0,
          },
        ]
      : shown;

  if (total <= 0) return null;

  return (
    <div>
      <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Expense breakdown by category">
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

  // a label needs ~38px of its own; on a narrow card that means showing every
  // second or third tick rather than letting years run into each other
  const perLabel = plotW / Math.max(1, (n - 1) / xTickEvery);
  const labelEvery = xTickEvery * Math.max(1, Math.ceil(38 / Math.max(1, perLabel)));

  return (
    <div>
      <ChartLegend
        items={[
          { label: seriesA, color: "var(--series-1)" },
          { label: seriesB, color: "var(--series-2)" },
        ]}
      />
      <ChartTable
        caption={`${seriesA} and ${seriesB} over time`}
        columns={["Point", seriesA, seriesB, "Total"]}
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
            <p className="mb-1 font-semibold text-ink-1">{points[hover].label}</p>
            <TooltipRow color="var(--series-2)" label={seriesB} value={formatMoney(points[hover].b, currency, { compact: true })} />
            <TooltipRow color="var(--series-1)" label={seriesA} value={formatMoney(points[hover].a, currency, { compact: true })} />
            <TooltipRow label="Total" value={formatMoney(points[hover].a + points[hover].b, currency, { compact: true })} />
          </Tooltip>
        )}
      </div>
    </div>
  );
}
