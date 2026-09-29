"use client";

import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Currency } from "@/lib/types";
import type { BreakdownSegment } from "./donut";
import { SERIES_VAR } from "./internals";

export function CategoryBreakdown({
  segments,
  currency,
  maxSegments = 6,
  rowExtra,
  twoColumn = false,
}: {
  segments: BreakdownSegment[];
  currency: Currency;
  maxSegments?: number;
  rowExtra?: (id: string) => ReactNode;
  twoColumn?: boolean;
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
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t("chart.breakdownAria")}>
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
      <ul className={twoColumn ? "mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2" : "mt-3 space-y-2"}>
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
