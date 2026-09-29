"use client";

import { currentMonth, todayISO } from "@/lib/date";
import { monthlySeries } from "@/lib/finance/finmath";
import { formatMoney } from "@/lib/finance/money";
import { useStore } from "@/lib/state/store";
import { useT } from "@/lib/i18n";

export function useMonthSummary() {
  const { state } = useStore();
  const { t } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const month = currentMonth();
  const today = todayISO();

  const series = monthlySeries(state.transactions, month, 12, settings);
  const current = series[series.length - 1];
  const previous = series[series.length - 2];
  const hasPrevious = previous.income > 0 || previous.expense > 0;

  const vsLast = (delta: number) =>
    t("tx.vsLastMonth", { delta: formatMoney(delta, base, { compact: true, sign: true }) });

  return { state, settings, base, month, today, series, current, previous, hasPrevious, vsLast };
}
