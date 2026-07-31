"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { StackedArea, StatTile, type AreaPoint } from "@/components/charts";
import {
  Button,
  EmptyState,
  Field,
  GlassCard,
  PageHeader,
  SegmentedControl,
  Slider,
  Switch,
  TextInput,
} from "@/components/ui";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/constants";
import { currentMonth, formatMonthCompact, formatMonthShort, todayISO } from "@/lib/date";
import { averageMonthlyNet, buildProjection } from "@/lib/finmath";
import { convert, formatMoney, formatPercent, parseAmount } from "@/lib/money";
import { useStore } from "@/lib/store";
import type { Currency } from "@/lib/types";

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

const num = (s: string) => {
  const v = parseAmount(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

// Long-run average CPI per currency — the hryvnia erodes far faster than the
// dollar or euro, so "today's money" is discounted at the *view* currency's rate.
const INFLATION_PCT: Record<Currency, number> = { UAH: 10, USD: 3, EUR: 2.5 };

export function ForecastPage() {
  const { state } = useStore();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();
  const startMonth = currentMonth();

  /* ---------- assumptions ---------- */
  const [years, setYears] = useState(10);
  const [view, setView] = useState<Currency>(base);
  const [returnPct, setReturnPct] = useState(0);
  const [inflationOn, setInflationOn] = useState(false);
  const inflationPct = INFLATION_PCT[view]; // depends on the currency being shown

  // monthly saving entered per currency — the whole point of a multi-currency plan
  const [saveByCur, setSaveByCur] = useState<Record<Currency, string>>(() => {
    const avg = Math.max(
      0,
      Math.round(averageMonthlyNet(state.transactions, startMonth, 3, settings)),
    );
    return {
      UAH: base === "UAH" ? String(avg) : "",
      USD: base === "USD" ? String(avg) : "",
      EUR: base === "EUR" ? String(avg) : "",
    };
  });

  // sum the per-currency contributions into the base currency
  const monthlySavingsBase = CURRENCIES.reduce(
    (sum, c) => sum + convert(num(saveByCur[c]), c, base, settings.rates),
    0,
  );

  /* ---------- projection (computed in base, shown in `view`) ---------- */
  // the forecast projects the wealth you are building — accounts + investments.
  // Debts are a Balance-sheet concern; they don't grow, so they stay out of it.
  const projection = buildProjection(state, today, years * 12, {
    monthlySavings: monthlySavingsBase,
    savingsReturnPct: returnPct,
  });

  const inflMonthly = inflationOn ? inflationPct / 100 / 12 : 0;
  // base value at month index i → the display currency, then discounted at the
  // view currency's own inflation so purchasing power is measured in that basket
  const show = (baseValue: number, i: number) =>
    convert(baseValue, base, view, settings.rates) / Math.pow(1 + inflMonthly, i);

  const assetsNow = projection[0].total; // gross holdings today, in base
  const nowTotal = show(assetsNow, 0);
  const endTotal = show(projection[projection.length - 1].total, projection.length - 1);
  const diff = endTotal - nowTotal;

  const isEmpty =
    state.savings.length === 0 &&
    state.investments.length === 0 &&
    monthlySavingsBase === 0;

  const tickEvery = years >= 3 ? 12 : 3;
  const points: AreaPoint[] = projection.map((p, i) => ({
    label: p.month,
    a: show(p.savings, i),
    b: show(p.investments, i),
  }));
  const yearRows = projection
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % 12 === 0);

  /* ---------- goal calculator ---------- */
  const [goalAmount, setGoalAmount] = useState("");
  const [goalCurrency, setGoalCurrency] = useState<Currency>(base);
  const goalBase = convert(num(goalAmount), goalCurrency, base, settings.rates);
  const goalHitIndex =
    goalBase > 0 ? projection.findIndex((p) => p.total >= goalBase) : -1;
  const goalHitMonth = goalHitIndex >= 0 ? projection[goalHitIndex].month : null;
  const alreadyThere = goalBase > 0 && assetsNow >= goalBase;

  // Round numbers to start from, one order of magnitude above where you are —
  // an empty target box is a dead end, a tappable "1M ₴" is a question.
  const goalPresets = (() => {
    const anchor = Math.max(
      convert(assetsNow, base, goalCurrency, settings.rates),
      convert(monthlySavingsBase * 12, base, goalCurrency, settings.rates),
      1,
    );
    const step = 10 ** Math.floor(Math.log10(anchor));
    return [2, 5, 10].map((m) => Math.round(m * step));
  })();

  /** the next round totals the curve crosses, with the month it crosses them */
  const milestones = (() => {
    const top = projection[projection.length - 1]?.total ?? 0;
    if (top <= assetsNow) return [];
    const step = 10 ** Math.floor(Math.log10(Math.max(top, 1)));
    const out: Array<{ amount: number; month: string }> = [];
    for (let target = step; target <= top && out.length < 3; target += step) {
      if (target <= assetsNow) continue;
      const at = projection.findIndex((p) => p.total >= target);
      if (at >= 0) {
        out.push({
          amount: convert(target, base, view, settings.rates),
          month: projection[at].month,
        });
      }
    }
    return out;
  })();

  return (
    <>
      <PageHeader
        title="Forecast"
        subtitle="Project your wealth, in any currency, under your own assumptions"
        action={
          <SegmentedControl
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={view}
            onChange={setView}
            className="w-44"
          />
        }
      />

      <div className="stagger space-y-4">
        {/* assumptions */}
        <GlassCard title="Assumptions" subtitle="Tune the projection" icon="🎛️">
          <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[13px] font-medium text-ink-2">Horizon</span>
                <span className="tnum text-sm font-semibold text-ink-1">
                  {years} {years === 1 ? "year" : "years"}
                </span>
              </div>
              <Slider min={1} max={40} value={years} onChange={setYears} label="Horizon in years" />
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[13px] font-medium text-ink-2">
                  Return on savings
                </span>
                <span className="tnum text-sm font-semibold text-ink-1">
                  {formatPercent(returnPct)}/yr
                </span>
              </div>
              <Slider
                min={0}
                max={25}
                step={0.5}
                value={returnPct}
                onChange={setReturnPct}
                label="Annual return on savings"
              />
            </div>

            <div className="lg:col-span-2">
              <span className="mb-2 block text-[13px] font-medium text-ink-2">
                Monthly saving — split across currencies
              </span>
              <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
                {CURRENCIES.map((c) => (
                  <div key={c} className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-3">
                      {CURRENCY_SYMBOL[c]}
                    </span>
                    <TextInput
                      inputMode="decimal"
                      value={saveByCur[c]}
                      onChange={(e) =>
                        setSaveByCur((prev) => ({ ...prev, [c]: e.target.value }))
                      }
                      placeholder="0"
                      className="pl-8"
                      aria-label={`Monthly saving in ${c}`}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-3">
                {monthlySavingsBase > 0
                  ? `≈ ${formatMoney(convert(monthlySavingsBase, base, view, settings.rates), view, { exact: true })} / month combined`
                  : "The ₴ field is prefilled with your 3-month average net flow."}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 lg:col-span-2">
              <div>
                <p className="text-[15px] font-medium text-ink-1">Show in today’s money</p>
                <p className="mt-0.5 text-xs text-ink-3">
                  Real terms — discount {CURRENCY_SYMBOL[view]} by {formatPercent(inflationPct, 1)}/yr,
                  its long-run inflation
                </p>
              </div>
              <Switch
                checked={inflationOn}
                onChange={setInflationOn}
                label="Adjust for inflation"
              />
            </div>
          </div>
        </GlassCard>

        {/* headline numbers */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          <StatTile
            label="Now"
            value={formatMoney(nowTotal, view, { compact: true })}
            hint="savings + investments today"
          />
          <StatTile
            label={`In ${years} yr${inflationOn ? " (real)" : ""}`}
            value={formatMoney(endTotal, view, { compact: true })}
            spark={points.map((p) => p.a + p.b)}
            hint={`${formatMoney(endTotal / (years * 12), view, { compact: true })} per month of the way there`}
          />
          <StatTile
            className="col-span-2 md:col-span-1"
            label="Growth"
            value={formatMoney(diff, view, { compact: true, sign: true })}
            tone={diff >= 0 ? "income" : "expense"}
            delta={
              nowTotal > 0
                ? {
                    text: `${diff >= 0 ? "+" : ""}${formatPercent((diff / nowTotal) * 100)} over ${years} years`,
                    good: diff >= 0,
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
          <>
            <div className="grid items-start gap-4 xl:grid-cols-3">
              <GlassCard title={`Wealth projection · ${view}`} icon="📈" className="xl:col-span-2">
                <StackedArea
                  points={points}
                  currency={view}
                  height={320}
                  xTickEvery={tickEvery}
                  xTickFormat={(label) =>
                    tickEvery === 12 ? label.slice(0, 4) : formatMonthShort(label)
                  }
                />
                <p className="mt-3 text-xs text-ink-3">
                  Savings compound at {formatPercent(returnPct)}/yr; payout interest is added as
                  it is received. Investments follow their own terms.
                  {inflationOn && " Values are shown in today’s purchasing power."}
                </p>
              </GlassCard>

              {/* goal calculator */}
              <GlassCard title="Reach a goal" subtitle="When you hit a target" icon="🎯">
                <p className="mb-3 text-sm text-ink-2">
                  How long until you have a certain amount?
                </p>
                <Field label="Target amount">
                  <TextInput
                    inputMode="decimal"
                    value={goalAmount}
                    onChange={(e) => setGoalAmount(e.target.value)}
                    placeholder="e.g. 20 000"
                  />
                </Field>
                <div className="mt-3">
                  <Field label="Currency">
                    <SegmentedControl
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                      value={goalCurrency}
                      onChange={setGoalCurrency}
                    />
                  </Field>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {goalPresets.map((preset) => (
                    <Button
                      key={preset}
                      variant="ghost"
                      className="min-h-9 px-3 text-xs"
                      onClick={() => setGoalAmount(String(preset))}
                    >
                      {formatMoney(preset, goalCurrency, { compact: true })}
                    </Button>
                  ))}
                </div>

                <div className="mt-4 rounded-field bg-ghost p-4 text-center">
                  {goalBase <= 0 ? (
                    <p className="text-sm text-ink-3">Enter a target to see when you reach it.</p>
                  ) : alreadyThere ? (
                    <>
                      <p className="text-2xl">🎉</p>
                      <p className="mt-1 text-sm font-semibold text-income">
                        You’re already there
                      </p>
                    </>
                  ) : goalHitMonth ? (
                    <>
                      <p className="card-title">Reached around</p>
                      <p className="hero-number mt-1 text-2xl font-bold">
                        {formatMonthCompact(goalHitMonth)}
                      </p>
                      <p className="mt-1 text-xs text-ink-3">
                        in {goalHitIndex} month{goalHitIndex === 1 ? "" : "s"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-ink-1">
                        Not within {years} years
                      </p>
                      <p className="mt-1 text-xs text-ink-3">
                        Save more, raise the return, or extend the horizon.
                      </p>
                    </>
                  )}
                </div>

                {milestones.length > 0 && (
                  <div className="mt-4 border-t border-hairline pt-3">
                    <p className="card-title">Milestones ahead</p>
                    <ul className="mt-2 space-y-1.5">
                      {milestones.map((m) => (
                        <li key={m.amount} className="flex items-center justify-between gap-3 text-sm">
                          <span className="tnum text-ink-2">
                            {formatMoney(m.amount, view, { compact: true })}
                          </span>
                          <span className="font-medium text-ink-1">
                            {formatMonthCompact(m.month)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </GlassCard>
            </div>

            <GlassCard title={`Year by year · ${view}`} icon="📅">
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-104 text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-[13px] text-ink-2">
                      <th className="py-2 pr-3 text-left font-medium">Year</th>
                      <th className="px-3 py-2 text-right font-medium">Savings</th>
                      <th className="px-3 py-2 text-right font-medium">Investments</th>
                      <th className="py-2 pl-3 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearRows.map(({ p, i }) => (
                      <tr key={p.month} className="border-b border-hairline last:border-b-0">
                        <td className="py-2.5 pr-3 text-ink-1">
                          {i === 0 ? "Now" : p.month.slice(0, 4)}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-ink-2">
                          {formatMoney(show(p.savings, i), view, { compact: true })}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-ink-2">
                          {formatMoney(show(p.investments, i), view, { compact: true })}
                        </td>
                        <td className="tnum py-2.5 pl-3 text-right font-semibold text-ink-1">
                          {formatMoney(show(p.total, i), view, { compact: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </>
        )}
      </div>
    </>
  );
}
