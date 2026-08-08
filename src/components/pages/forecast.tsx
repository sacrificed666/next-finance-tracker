"use client";

import { useState } from "react";
import { StackedArea, StatTile, type AreaPoint } from "@/components/charts";
import {
  Button,
  EmptyState,
  Field,
  FieldSet,
  GlassCard,
  LinkButton,
  PageHeader,
  ProgressMeter,
  SegmentedControl,
  Slider,
  Switch,
  TextInput,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/constants";
import { currentMonth, formatMonthCompact, formatMonthShort, todayISO } from "@/lib/date";
import { averageMonthlyNet, buildProjection, holdings } from "@/lib/finmath";
import { convert, formatMoney, formatPercent, parseAmount } from "@/lib/money";
import { useStore } from "@/lib/store";
import type { Currency } from "@/lib/types";

const num = (s: string) => {
  const v = parseAmount(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** long-run average CPI per currency — the hryvnia erodes far faster than the
 *  dollar or the euro */
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

  /*
   * Inflation weighted by the money you actually hold, not by the currency you
   * happen to be reading in.
   *
   * The old version discounted everything at the *view* currency's rate, which
   * meant flipping the display from ₴ to $ silently repriced a portfolio that
   * had not moved: the same euro deposit lost 10%/yr on one tab and 3%/yr on the
   * next. But this app exists precisely because its user keeps money in three
   * currencies at once, and a hryvnia balance erodes at the hryvnia's rate no
   * matter what units you print it in.
   *
   * So the rate is a weighted average over the actual composition — every
   * account and position at its own currency's CPI, plus the monthly savings
   * split, which is where the money is *going*. Same answer in every view.
   */
  const inflationMix = (() => {
    const weight: Record<Currency, number> = { UAH: 0, USD: 0, EUR: 0 };
    for (const h of holdings(state, today)) {
      weight[h.currency] += Math.max(0, h.base);
    }
    // a year of planned saving, so an empty portfolio still weights sensibly
    for (const c of CURRENCIES) {
      weight[c] += convert(num(saveByCur[c]), c, base, settings.rates) * 12;
    }
    const total = CURRENCIES.reduce((sum, c) => sum + weight[c], 0);
    if (total <= 0) return { pct: INFLATION_PCT[base], shares: null };
    const pct = CURRENCIES.reduce(
      (sum, c) => sum + (weight[c] / total) * INFLATION_PCT[c],
      0,
    );
    return {
      pct,
      shares: CURRENCIES.filter((c) => weight[c] > 0).map((c) => ({
        currency: c,
        share: weight[c] / total,
      })),
    };
  })();
  const inflationPct = inflationMix.pct;

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
  /**
   * The end total split three ways: what you already hold, what you will pay in
   * between now and then, and what the returns add on top. Deposits are the
   * monthly amount times the horizon — a figure the form above already asks
   * for — so growth is simply the remainder, and the three always sum to the
   * total by construction.
   */
  const contributionSplit = (() => {
    const start = nowTotal;
    // The savings fields are not the only thing you pay in: every investment
    // can carry a monthly top-up, and counting only the former reported those
    // deposits as though the market had produced them.
    const investmentTopUps = state.investments.reduce(
      (sum, inv) =>
        sum +
        convert(inv.monthlyContribution ?? 0, inv.currency, base, settings.rates),
      0,
    );
    const perMonth = monthlySavingsBase + investmentTopUps;
    const deposits = show(perMonth * years * 12, projection.length - 1);
    const growth = Math.max(0, endTotal - start - deposits);
    const total = Math.max(1e-9, start + deposits + growth);
    return {
      start,
      deposits,
      growth,
      startPct: (start / total) * 100,
      depositPct: (deposits / total) * 100,
      growthPct: (growth / total) * 100,
    };
  })();

  const yearRows = projection
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % 12 === 0);
  // the yardstick the bars in the Total column are drawn against. Inflation is
  // applied per row, so the largest is not necessarily the last one.
  const maxYearTotal = Math.max(0, ...yearRows.map(({ p, i }) => show(p.total, i)));

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
            label="Currency to show the projection in"
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={view}
            onChange={setView}
            className="w-44"
          />
        }
      />

      <div className="stagger space-y-4 sm:space-y-5">
        {/*
          The answer leads, the controls follow. This page opened on a form —
          two sliders, three currency fields and a switch — and the numbers they
          produce were below the fold. But the fields arrive prefilled from real
          data, so there is a real answer to show before anyone touches
          anything; "here is where you land, and here is what I assumed" reads
          in that order, not the reverse.
        */}
        <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3">
          {/* "Now" has no curve to draw — there is no stored history of net
              worth — so it shows what it is made of instead of an empty half
              card beside two tiles that do. */}
          <StatTile
            label="Now"
            icon="wallet"
            value={formatMoney(nowTotal, view, { compact: true })}
            bar={[
              { label: "Savings", value: show(projection[0].savings, 0), colorSlot: 1 },
              { label: "Investments", value: show(projection[0].investments, 0), colorSlot: 6 },
            ]}
          />
          <StatTile
            label={`In ${years} yr${inflationOn ? " (real)" : ""}`}
            icon="calendar"
            value={formatMoney(endTotal, view, { compact: true })}
            spark={points.map((p) => p.a + p.b)}
            hint={`${formatMoney(endTotal / (years * 12), view, { compact: true })} per month of the way there`}
          />
          <StatTile
            className="col-span-2 md:col-span-1"
            icon="trend"
            label="Growth"
            value={formatMoney(diff, view, { compact: true, sign: true })}
            tone={diff >= 0 ? "income" : "expense"}
            // the curve of the gain itself, so the tile carries the same kind
            // of shape as the one beside it instead of sitting flat
            spark={points.map((p) => p.a + p.b - nowTotal)}
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


        {/* assumptions */}
        <GlassCard title="Assumptions" subtitle="Tune the projection" icon="sliders">
          <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="label">Horizon</span>
                <span className="tnum text-sm font-semibold text-ink-1">
                  {years} {years === 1 ? "year" : "years"}
                </span>
              </div>
              <Slider min={1} max={40} value={years} onChange={setYears} label="Horizon in years" />
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="label">
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
              <span className="mb-2 block label">
                Monthly saving — split across currencies
              </span>
              <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
                {CURRENCIES.map((c) => (
                  // the field's own `prefix`, not a hand-placed span: the local
                  // copy sat at a different size and a different inset from the
                  // one every other amount field in the app uses
                  <TextInput
                    key={c}
                    inputMode="decimal"
                    prefix={CURRENCY_SYMBOL[c]}
                    value={saveByCur[c]}
                    onChange={(e) =>
                      setSaveByCur((prev) => ({ ...prev, [c]: e.target.value }))
                    }
                    placeholder="0"
                    aria-label={`Monthly saving in ${c}`}
                  />
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
                <p className="body-strong">Show in today’s money</p>
                <p className="caption mt-0.5">
                  Real terms — {formatPercent(inflationPct, 1)}/yr, weighted across what
                  you actually hold
                  {inflationMix.shares && inflationMix.shares.length > 1 && (
                    <>
                      {": "}
                      {inflationMix.shares
                        .map(
                          (sh) =>
                            `${formatPercent(sh.share * 100, 0)} ${CURRENCY_SYMBOL[sh.currency]}`,
                        )
                        .join(" · ")}
                    </>
                  )}
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
        {isEmpty ? (
          <GlassCard>
            <EmptyState
              icon={<Icon name="trend" />}
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
            {/* from a laptop, not only a wide desktop: between 1024 and 1280 the
                goal form owned a full-width row and spread a short input, three
                presets and one milestone across it */}
            <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-3">
              <GlassCard title={`Wealth projection · ${view}`} icon="trend" className="lg:col-span-2">
                <StackedArea
                  points={points}
                  currency={view}
                  height={320}
                  xTickEvery={tickEvery}
                  xTickFormat={(label) =>
                    tickEvery === 12 ? label.slice(0, 4) : formatMonthShort(label)
                  }
                />
                {/*
                  A projection that only shows a total invites the wrong lesson.
                  Most of a ten-year curve is usually money you put in, not money
                  the market made — and the split is what tells you whether the
                  lever worth pulling is saving more or earning more on it. Both
                  halves come from figures already on the page: what you start
                  with, what you add, and what is left over.
                */}
                {contributionSplit.growth > 0 && (
                  <div className="mt-4 border-t border-hairline pt-3.5">
                    <p className="card-title">Where it comes from</p>
                    <div
                      className="mt-2 flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
                      role="img"
                      aria-label="Starting balance, deposits and growth as shares of the end total"
                    >
                      <div
                        className="bar-slice bg-series-1"
                        style={{ width: `${contributionSplit.startPct}%` }}
                      />
                      <div
                        className="bar-slice bg-series-2"
                        style={{ width: `${contributionSplit.depositPct}%` }}
                      />
                      <div
                        className="bar-slice bg-series-3"
                        style={{ width: `${contributionSplit.growthPct}%` }}
                      />
                    </div>
                    <ul className="mt-2.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-3">
                      {[
                        { label: "You have now", value: contributionSplit.start, slot: 1 },
                        { label: "You will add", value: contributionSplit.deposits, slot: 2 },
                        { label: "It earns", value: contributionSplit.growth, slot: 3 },
                      ].map((part) => (
                        <li key={part.label} className="flex items-baseline gap-2 text-xs">
                          <span
                            aria-hidden
                            className="size-2 shrink-0 translate-y-px rounded-sm"
                            style={{ background: `var(--series-${part.slot})` }}
                          />
                          <span className="min-w-0 flex-1 truncate text-ink-2">{part.label}</span>
                          <span className="tnum font-semibold text-ink-1">
                            {formatMoney(part.value, view, { compact: true })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-3 text-xs text-ink-3">
                  Savings compound at {formatPercent(returnPct)}/yr; payout interest is added as
                  it is received. Investments follow their own terms.
                  {inflationOn && " Values are shown in today’s purchasing power."}
                </p>
              </GlassCard>

              {/* goal calculator */}
              <GlassCard title="Reach a goal" subtitle="When you hit a target" icon="target">
                <p className="mb-3 text-sm text-ink-2">
                  How long until you have a certain amount?
                </p>
                <div className="space-y-3">
                  <Field label="Target amount">
                    <TextInput
                      inputMode="decimal"
                      // the only amount field in the app that was not saying
                      // what it was denominated in, with the currency picker
                      // for it sitting directly underneath
                      prefix={CURRENCY_SYMBOL[goalCurrency]}
                      value={goalAmount}
                      onChange={(e) => setGoalAmount(e.target.value)}
                      placeholder="e.g. 20 000"
                    />
                  </Field>
                  <FieldSet label="Currency">
                    <SegmentedControl
                      label="Goal currency"
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                      value={goalCurrency}
                      onChange={setGoalCurrency}
                    />
                  </FieldSet>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {goalPresets.map((preset) => (
                    <Button
                      key={preset}
                      variant="ghost"
                      size="sm"
                      onClick={() => setGoalAmount(String(preset))}
                    >
                      {formatMoney(preset, goalCurrency, { compact: true })}
                    </Button>
                  ))}
                </div>

                {/* how far along you already are: the card asked "when do I
                    get there" and never said "and where am I now", which is
                    half of the same question */}
                {goalBase > 0 && !alreadyThere && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                      <span className="text-ink-2">Progress today</span>
                      <span className="tnum font-semibold text-ink-1">
                        {formatPercent(Math.min(100, (assetsNow / goalBase) * 100), 0)}
                      </span>
                    </div>
                    <ProgressMeter
                      value={assetsNow}
                      max={goalBase}
                      label={`Progress toward ${formatMoney(goalBase, base, { compact: true })}`}
                    />
                  </div>
                )}

                <div className="glass-well mt-4 rounded-field p-4 text-center">
                  {goalBase <= 0 ? (
                    <p className="text-sm text-ink-3">Enter a target to see when you reach it.</p>
                  ) : alreadyThere ? (
                    <>
                      <span
                        aria-hidden
                        className="mx-auto flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent"
                      >
                        <Icon name="check" size={20} strokeWidth={2.6} />
                      </span>
                      <p className="mt-2 text-sm font-semibold text-income">
                        You’re already there
                      </p>
                    </>
                  ) : goalHitMonth ? (
                    <>
                      <p className="card-title">Reached around</p>
                      <p className="hero-number num-md mt-1">
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

            <GlassCard title={`Year by year · ${view}`} icon="calendar">
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-104 text-sm">
                  <thead>
                    <tr className="label border-b border-hairline">
                      <th className="py-2 pr-3 text-left font-medium">Year</th>
                      <th className="px-3 py-2 text-right font-medium">Savings</th>
                      <th className="px-3 py-2 text-right font-medium">Investments</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      {/* the table ran four columns across the full page width,
                          so the numbers drifted apart; this is the one the rows
                          were implicitly asking you to work out anyway */}
                      <th className="py-2 pl-3 text-right font-medium">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearRows.map(({ p, i }, idx) => {
                      const prev = idx > 0 ? yearRows[idx - 1] : null;
                      const added = prev ? show(p.total, i) - show(prev.p.total, prev.i) : 0;
                      return (
                      <tr
                        key={p.month}
                        className="table-row border-b border-hairline last:border-b-0"
                      >
                        <td className="py-2.5 pr-3">
                          {/* today is the row every other one is measured
                              against, so it is not just another year label */}
                          <span
                            className={
                              i === 0 ? "font-semibold text-ink-1" : "text-ink-2"
                            }
                          >
                            {i === 0 ? "Now" : p.month.slice(0, 4)}
                          </span>
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-ink-2">
                          {formatMoney(show(p.savings, i), view, { compact: true })}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-ink-2">
                          {formatMoney(show(p.investments, i), view, { compact: true })}
                        </td>
                        {/* The column doubles as a chart. Fourteen rows of
                            compact money is a shape you have to reconstruct by
                            reading; the bar is each year's share of the last
                            one, so the curve is legible at a glance and the
                            figures are still exact underneath. */}
                        <td className="relative px-3 py-2.5 text-right">
                          <span
                            aria-hidden
                            className="absolute inset-y-1.5 right-3 rounded-sm bg-accent/12"
                            style={{
                              width: `${maxYearTotal > 0 ? (show(p.total, i) / maxYearTotal) * 100 : 0}%`,
                              maxWidth: "calc(100% - 1.5rem)",
                            }}
                          />
                          <span className="tnum relative font-semibold text-ink-1">
                            {formatMoney(show(p.total, i), view, { compact: true })}
                          </span>
                        </td>
                        <td
                          className={`tnum py-2.5 pl-3 text-right ${
                            added > 0 ? "text-income" : "text-ink-3"
                          }`}
                        >
                          {prev ? formatMoney(added, view, { compact: true, sign: true }) : "—"}
                        </td>
                      </tr>
                      );
                    })}
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
