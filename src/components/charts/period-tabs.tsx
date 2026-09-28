"use client";

import { SegmentedControl } from "@/components/ui";
import { useT } from "@/lib/i18n";

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
