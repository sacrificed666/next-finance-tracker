"use client";

import { CategoryBreakdown, type BreakdownSegment } from "@/components/charts";
import { Card } from "@/components/ui";
import { CURRENCIES, investmentColorSlot, investmentKind } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { investmentAt } from "@/lib/finance/finmath";
import { convert, formatMoney, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import { investmentsByKind } from "./helpers";

export function AllocationCard({ className = "" }: { className?: string }) {
  const { state } = useStore();
  const { t } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();

  const segments: BreakdownSegment[] = investmentsByKind(state.investments, today, settings)
    .filter((row) => row.value > 0)
    .map((row) => ({
      id: row.kind,
      label: t(`investmentKind.${row.kind}`),
      icon: investmentKind(row.kind).icon,
      value: row.value,
      colorSlot: investmentColorSlot(row.kind),
    }));
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  const byCurrency = CURRENCIES.map((currency) => ({
    currency,
    value: state.investments
      .filter((inv) => inv.currency === currency)
      .reduce((sum, inv) => sum + convert(investmentAt(inv, today).value, currency, base, settings.rates), 0),
  })).filter((c) => c.value > 0);

  return (
    <Card title={t("investments.allocation")} subtitle={t("investments.allocation.subtitle")} icon="pie" className={className}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <p className="num-md whitespace-nowrap text-ink-1">{formatMoney(total, base, { compact: true })}</p>
      </div>
      <CategoryBreakdown segments={segments} currency={base} maxSegments={6} />
      {byCurrency.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {byCurrency.map((c) => (
            <span key={c.currency} className="rounded-full bg-ghost px-2.5 py-1 text-xs font-semibold text-ink-2">
              {c.currency} <span className="tnum font-medium text-ink-3">{formatPercent((c.value / total) * 100, 0)}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
