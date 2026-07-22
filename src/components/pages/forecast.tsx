"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { StackedArea, StatTile, type AreaPoint } from "@/components/charts";
import {
  EmptyState,
  Field,
  GlassCard,
  PageHeader,
  TextInput,
} from "@/components/ui";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { currentMonth, formatMonthShort, todayISO } from "@/lib/date";
import { averageMonthlyNet, buildProjection, netWorth } from "@/lib/finmath";
import { formatMoney, formatPercent, parseAmount } from "@/lib/money";
import { useStore } from "@/lib/store";

function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="btn-gradient inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-md transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.97]"
    >
      {children}
    </Link>
  );
}

export function ForecastPage() {
  const { state } = useStore();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();

  const [years, setYears] = useState(10);
  const [savingsInput, setSavingsInput] = useState<string>(() =>
    String(
      Math.max(
        0,
        Math.round(averageMonthlyNet(state.transactions, currentMonth(), 3, settings)),
      ),
    ),
  );

  const parsed = parseAmount(savingsInput);
  const monthlySavings = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const worth = netWorth(state, today);
  const projection = buildProjection(state, today, years * 12, monthlySavings);
  const last = projection[projection.length - 1];
  const diff = last.total - worth.total;

  const isEmpty =
    state.savings.length === 0 &&
    state.investments.length === 0 &&
    monthlySavings === 0;

  const tickEvery = years >= 3 ? 12 : 3;
  const points: AreaPoint[] = projection.map((p) => ({
    label: p.month,
    a: p.savings,
    b: p.investments,
  }));
  const yearRows = projection.filter((_, i) => i % 12 === 0);

  return (
    <>
      <PageHeader title="Forecast" subtitle="Savings + investments over time" />
      <div className="space-y-5">
        <GlassCard>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Field label={`Horizon: ${years} ${years === 1 ? "year" : "years"}`}>
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  aria-label="Forecast horizon in years"
                  className="h-11 w-full"
                  style={{ accentColor: "var(--accent)" }}
                />
              </Field>
            </div>
            <div className="min-w-0 flex-1">
              <Field
                label={`Monthly saving, ${CURRENCY_SYMBOL[base]}`}
                hint="prefilled with your 3-month average net flow"
              >
                <TextInput
                  inputMode="decimal"
                  value={savingsInput}
                  onChange={(e) => setSavingsInput(e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-3 gap-4">
          <StatTile label="Now" value={formatMoney(worth.total, base, { compact: true })} />
          <StatTile
            label={`In ${years} yr`}
            value={formatMoney(last.total, base, { compact: true })}
          />
          <StatTile
            label="Growth"
            value={formatMoney(diff, base, { compact: true, sign: true })}
            tone="income"
            delta={
              worth.total > 0
                ? {
                    text: `${diff > 0 ? "+" : ""}${formatPercent((diff / worth.total) * 100)}`,
                    good: true,
                  }
                : undefined
            }
          />
        </div>

        {isEmpty ? (
          <GlassCard>
            <EmptyState
              icon="🔮"
              title="Nothing to project yet"
              hint="Add savings or investments, or set a monthly saving amount — and watch your wealth curve appear."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <LinkButton href="/balance">Go to Balance</LinkButton>
                  <LinkButton href="/income">Log income</LinkButton>
                </div>
              }
            />
          </GlassCard>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-3">
            <GlassCard title="Wealth projection" className="xl:col-span-2">
              <StackedArea
                points={points}
                currency={base}
                height={320}
                xTickEvery={tickEvery}
                xTickFormat={(label) =>
                  tickEvery === 12 ? label.slice(0, 4) : formatMonthShort(label)
                }
              />
              <p className="mt-3 text-xs text-ink-3">
                Payout-type interest is added to savings as it is received. Savings themselves
                earn no interest in this projection.
              </p>
            </GlassCard>

            <GlassCard title="Year by year">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-[13px] text-ink-2">
                      <th className="py-2 pr-3 text-left font-medium">Year</th>
                      <th className="px-3 py-2 text-right font-medium">Savings</th>
                      <th className="px-3 py-2 text-right font-medium">Investments</th>
                      <th className="py-2 pl-3 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearRows.map((p, i) => (
                      <tr key={p.month} className="border-b border-hairline last:border-b-0">
                        <td className="py-2.5 pr-3 text-ink-1">
                          {i === 0 ? "Now" : p.month.slice(0, 4)}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-ink-2">
                          {formatMoney(p.savings, base, { compact: true })}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-ink-2">
                          {formatMoney(p.investments, base, { compact: true })}
                        </td>
                        <td className="tnum py-2.5 pl-3 text-right font-semibold text-ink-1">
                          {formatMoney(p.total, base, { compact: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </>
  );
}
