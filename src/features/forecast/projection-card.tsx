"use client";

import { StackedArea } from "@/components/charts";
import { Card } from "@/components/ui";
import { formatMonthShort } from "@/lib/date";
import { formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Currency } from "@/lib/types";
import type { Forecast } from "./use-forecast";

export function ProjectionCard({
  f,
  view,
  years,
  returnPct,
  inflationOn,
  withDebts,
  className = "",
}: {
  f: Forecast;
  view: Currency;
  years: number;
  returnPct: number;
  inflationOn: boolean;
  withDebts: boolean;
  className?: string;
}) {
  const { t } = useT();
  const tickEvery = years >= 3 ? 12 : 3;

  return (
    <Card title={t("forecast.projection", { currency: view })} icon="trend" className={className}>
      <StackedArea
        points={f.points}
        currency={view}
        height={280}
        xTickEvery={tickEvery}
        xTickFormat={(label) => (tickEvery === 12 ? label.slice(0, 4) : formatMonthShort(label))}
      />
      <p className="mt-3 text-xs text-ink-3">
        {t("forecast.footnote", { pct: formatPercent(returnPct) })}
        {inflationOn && ` ${t("forecast.footnoteReal")}`}
        {withDebts && f.state.debts.length > 0 && ` ${t("forecast.footnoteDebts")}`}
      </p>
    </Card>
  );
}
