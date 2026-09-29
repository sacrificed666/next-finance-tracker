"use client";

import { CategoryBreakdown, type BreakdownSegment } from "@/components/charts";
import { Card } from "@/components/ui";
import { CURRENCY_SLOT, CURRENCY_SYMBOL } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { accountBalances } from "@/lib/finance/finmath";
import { convert, formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { Currency } from "@/lib/types";

export function CurrenciesCard() {
  const { state } = useStore();
  const { t } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const balances = accountBalances(state, todayISO());

  const byCurrency = new Map<Currency, { base: number; native: number }>();
  for (const acc of state.savings) {
    const native = Math.max(0, balances.get(acc.id) ?? 0);
    if (native <= 0) continue;
    const row = byCurrency.get(acc.currency) ?? { base: 0, native: 0 };
    byCurrency.set(acc.currency, {
      base: row.base + convert(native, acc.currency, base, settings.rates),
      native: row.native + native,
    });
  }
  if (byCurrency.size < 2) return null;

  const segments: BreakdownSegment[] = [...byCurrency.entries()]
    .map(([currency, row]) => ({
      id: currency,
      label: currency,
      icon: CURRENCY_SYMBOL[currency],
      value: row.base,
      colorSlot: CURRENCY_SLOT[currency],
    }))
    .sort((a, b) => b.value - a.value);

  const native = (id: string) => {
    const row = byCurrency.get(id as Currency);
    if (!row || id === base) return null;
    return <p className="caption tnum mt-0.5 pl-12">{formatMoney(row.native, id as Currency)}</p>;
  };

  return (
    <Card title={t("accounts.byCurrency")} subtitle={t("accounts.mix.subtitle", { currency: base })} icon="globe">
      <CategoryBreakdown segments={segments} currency={base} rowExtra={native} />
    </Card>
  );
}
