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
  MonthInput,
  PageHeader,
  ProgressMeter,
  SegmentedControl,
  Slider,
  Switch,
  TextInput,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { CURRENCIES, CURRENCY_SYMBOL, displayCurrencies } from "@/lib/constants";
import {
  addMonths,
  currentMonth,
  formatMonthCompact,
  formatMonthShort,
  monthDiff,
  todayISO,
} from "@/lib/date";
import { buildProjection, holdings, monthlySeries } from "@/lib/finmath";
import { convert, formatMoney, formatPercent, parseAmount } from "@/lib/money";
import { usePersistentState } from "@/lib/listing";
import { uid, useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { Currency } from "@/lib/types";

const num = (s: string) => {
  const v = parseAmount(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

const INFLATION_PCT: Record<Currency, number> = { UAH: 10, USD: 3, EUR: 2.5 };
const SAFE_WITHDRAWAL_PCT = 4;

interface PlannedEvent {
  id: string;
  month: string;
  amount: number;
  currency: Currency;
  note: string;
}

function isEventList(v: unknown): v is PlannedEvent[] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as PlannedEvent).id === "string" &&
        typeof (e as PlannedEvent).month === "string" &&
        typeof (e as PlannedEvent).amount === "number" &&
        typeof (e as PlannedEvent).currency === "string",
    )
  );
}

function emptyByCurrency<T>(value: T): Record<Currency, T> {
  return Object.fromEntries(CURRENCIES.map((c) => [c, value])) as Record<Currency, T>;
}

export function ForecastPage() {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();
  const startMonth = currentMonth();
  const currencies = displayCurrencies(state);

  const [years, setYears] = useState(10);
  const [view, setView] = useState<Currency>(base);
  const [returnPct, setReturnPct] = useState(0);
  const [spreadPct, setSpreadPct] = useState(3);
  const [inflationOn, setInflationOn] = useState(false);
  const [withDebts, setWithDebts] = useState(state.debts.length > 0);

  const [events, setEvents] = usePersistentState<PlannedEvent[]>("forecast.events", [], isEventList);
  const [eventDraft, setEventDraft] = useState<{
    month: string;
    amount: string;
    note: string;
    sign: "out" | "in";
    currency: Currency;
  }>({
    month: addMonths(startMonth, 6),
    amount: "",
    note: "",
    sign: "out",
    currency: base,
  });

  const projectionEvents = events.map((e) => ({
    month: e.month,
    amount: convert(e.amount, e.currency, base, settings.rates),
  }));

  const inflationMix = (() => {
    const weight = emptyByCurrency(0);
    for (const h of holdings(state, today)) weight[h.currency] += Math.max(0, h.base);
    const total = CURRENCIES.reduce((sum, c) => sum + weight[c], 0);
    if (total <= 0) return { pct: INFLATION_PCT[base], shares: null };
    const pct = CURRENCIES.reduce((sum, c) => sum + (weight[c] / total) * INFLATION_PCT[c], 0);
    return {
      pct,
      shares: CURRENCIES.filter((c) => weight[c] > 0).map((c) => ({ currency: c, share: weight[c] / total })),
    };
  })();
  const inflationPct = inflationMix.pct;

  const months = years * 12;
  const projectionFor = (returns: number) =>
    buildProjection(state, today, months, {
      savingsReturnPct: returns,
      events: projectionEvents,
      includeDebts: withDebts,
    });

  const projection = projectionFor(returnPct);
  const low = projectionFor(Math.max(0, returnPct - spreadPct));
  const high = projectionFor(returnPct + spreadPct);

  const inflMonthly = inflationOn ? inflationPct / 100 / 12 : 0;
  const show = (baseValue: number, i: number) =>
    convert(baseValue, base, view, settings.rates) / Math.pow(1 + inflMonthly, i);

  const assetsNow = projection[0].net;
  const nowTotal = show(assetsNow, 0);
  const endPoint = projection[projection.length - 1];
  const endTotal = show(endPoint.net, projection.length - 1);
  const endLow = show(low[low.length - 1].net, low.length - 1);
  const endHigh = show(high[high.length - 1].net, high.length - 1);
  const diff = endTotal - nowTotal;

  const isEmpty = state.savings.length === 0 && state.investments.length === 0;

  const tickEvery = years >= 3 ? 12 : 3;
  const points: AreaPoint[] = projection.map((p, i) => ({
    label: p.month,
    a: show(p.savings, i),
    b: show(p.investments, i),
  }));

  const spendSeries = monthlySeries(state.transactions, startMonth, 6, settings).filter((m) => m.expense > 0);
  const avgSpend =
    spendSeries.length > 0 ? spendSeries.reduce((s, m) => s + m.expense, 0) / spendSeries.length : 0;
  const freedomIndex =
    avgSpend > 0
      ? projection.findIndex((p) => (p.total * SAFE_WITHDRAWAL_PCT) / 100 / 12 >= avgSpend)
      : -1;
  const freedomMonth = freedomIndex >= 0 ? projection[freedomIndex].month : null;
  const passiveNow = (projection[0].total * SAFE_WITHDRAWAL_PCT) / 100 / 12;
  const coverNow = avgSpend > 0 ? Math.min(100, (passiveNow / avgSpend) * 100) : 0;

  const contributionSplit = (() => {
    const start = nowTotal;
    const investmentTopUps = state.investments.reduce(
      (sum, inv) => sum + convert(inv.monthlyContribution ?? 0, inv.currency, base, settings.rates),
      0,
    );
    const deposits = show(investmentTopUps * months, projection.length - 1);
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

  const yearRows = projection.map((p, i) => ({ p, i })).filter(({ i }) => i % 12 === 0);
  const maxYearTotal = Math.max(0, ...yearRows.map(({ p, i }) => show(p.net, i)));

  const [goalAmount, setGoalAmount] = useState("");
  const [goalCurrency, setGoalCurrency] = useState<Currency>(base);
  const [goalBy, setGoalBy] = useState(addMonths(startMonth, 36));
  const goalBase = convert(num(goalAmount), goalCurrency, base, settings.rates);
  const goalHitIndex = goalBase > 0 ? projection.findIndex((p) => p.net >= goalBase) : -1;
  const goalHitMonth = goalHitIndex >= 0 ? projection[goalHitIndex].month : null;
  const alreadyThere = goalBase > 0 && assetsNow >= goalBase;

  const goalMonths = Math.max(1, monthDiff(startMonth, goalBy));
  const neededMonthly = (() => {
    if (goalBase <= 0 || alreadyThere) return null;
    const without = projectionFor(returnPct);
    const reached = without[Math.min(goalMonths, without.length - 1)]?.net ?? 0;
    const gap = goalBase - reached;
    if (gap <= 0) return 0;
    const r = returnPct / 100 / 12;
    const factor = r === 0 ? goalMonths : (Math.pow(1 + r, goalMonths) - 1) / r;
    return gap / Math.max(1, factor);
  })();

  const goalPresets = (() => {
    const anchor = Math.max(convert(assetsNow, base, goalCurrency, settings.rates), 1);
    const step = 10 ** Math.floor(Math.log10(anchor));
    return [2, 5, 10].map((m) => Math.round(m * step));
  })();

  const milestones = (() => {
    const top = endPoint?.net ?? 0;
    if (top <= assetsNow) return [];
    const step = 10 ** Math.floor(Math.log10(Math.max(top, 1)));
    const out: Array<{ amount: number; month: string }> = [];
    for (let target = step; target <= top && out.length < 3; target += step) {
      if (target <= assetsNow) continue;
      const at = projection.findIndex((p) => p.net >= target);
      if (at >= 0) out.push({ amount: convert(target, base, view, settings.rates), month: projection[at].month });
    }
    return out;
  })();

  const currencyOptions = currencies.map((c) => ({ value: c, label: c }));

  const addEvent = () => {
    const amount = num(eventDraft.amount);
    if (amount <= 0) return;
    setEvents([
      ...events,
      {
        id: uid(),
        month: eventDraft.month,
        amount: eventDraft.sign === "out" ? -amount : amount,
        currency: eventDraft.currency,
        note: eventDraft.note.trim(),
      },
    ]);
    setEventDraft({ ...eventDraft, amount: "", note: "" });
  };

  return (
    <>
      <PageHeader
        title={t("forecast.title")}
        subtitle={t("forecast.subtitle")}
        action={
          <SegmentedControl
            label={t("forecast.viewCurrency")}
            options={currencyOptions}
            value={view}
            onChange={setView}
            className="w-44"
          />
        }
      />

      <div className="stagger space-y-4 sm:space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:gap-5 xl:grid-cols-4">
          <StatTile
            label={t("forecast.now")}
            icon="wallet"
            value={formatMoney(nowTotal, view, { compact: true })}
            bar={[
              { label: t("forecast.savings"), value: show(projection[0].savings, 0), colorSlot: 1 },
              { label: t("balance.investments"), value: show(projection[0].investments, 0), colorSlot: 6 },
            ]}
          />
          <StatTile
            label={inflationOn ? t("forecast.inYearsReal", { n: years }) : t("forecast.inYears", { n: years })}
            icon="calendar"
            value={formatMoney(endTotal, view, { compact: true })}
            spark={points.map((p) => p.a + p.b)}
            hint={t("forecast.range", {
              low: formatMoney(endLow, view, { compact: true }),
              high: formatMoney(endHigh, view, { compact: true }),
            })}
          />
          <StatTile
            icon="trend"
            label={t("forecast.growth")}
            value={formatMoney(diff, view, { compact: true, sign: true })}
            tone={diff >= 0 ? "income" : "expense"}
            spark={points.map((p) => p.a + p.b - nowTotal)}
            delta={
              nowTotal > 0
                ? {
                    text: tp("forecast.overYears", years, {
                      pct: `${diff >= 0 ? "+" : ""}${formatPercent((diff / nowTotal) * 100)}`,
                    }),
                    good: diff >= 0,
                  }
                : undefined
            }
          />
          <StatTile
            icon="target"
            label={t("forecast.freedom")}
            value={freedomMonth ? formatMonthCompact(freedomMonth) : avgSpend > 0 ? t("forecast.freedom.beyond") : "—"}
            hint={
              avgSpend > 0
                ? t("forecast.freedom.hint", {
                    covered: formatPercent(coverNow, 0),
                    spend: formatMoney(convert(avgSpend, base, view, settings.rates), view, { compact: true }),
                  })
                : t("forecast.freedom.noSpend")
            }
          />
        </div>

        <GlassCard title={t("forecast.assumptions")} subtitle={t("forecast.assumptions.subtitle")} icon="sliders">
          <div className="grid gap-x-6 gap-y-5 lg:grid-cols-3">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="label">{t("forecast.horizon")}</span>
                <span className="tnum text-sm font-semibold text-ink-1">{tp("forecast.years", years)}</span>
              </div>
              <Slider min={1} max={40} value={years} onChange={setYears} label={t("forecast.horizon")} />
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="label">{t("forecast.return")}</span>
                <span className="tnum text-sm font-semibold text-ink-1">
                  {t("balance.perYear", { pct: formatPercent(returnPct) })}
                </span>
              </div>
              <Slider min={0} max={25} step={0.5} value={returnPct} onChange={setReturnPct} label={t("forecast.return")} />
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="label">{t("forecast.spread")}</span>
                <span className="tnum text-sm font-semibold text-ink-1">±{formatPercent(spreadPct)}</span>
              </div>
              <Slider min={0} max={10} step={0.5} value={spreadPct} onChange={setSpreadPct} label={t("forecast.spread")} />
              <p className="mt-1.5 text-xs text-ink-3">{t("forecast.spread.hint")}</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-3">
              <div className="min-w-0">
                <p className="body-strong">{t("forecast.real")}</p>
                <p className="caption mt-0.5">
                  {t("forecast.real.hint", { pct: formatPercent(inflationPct, 1) })}
                  {inflationMix.shares && inflationMix.shares.length > 1 && (
                    <>
                      {": "}
                      {inflationMix.shares
                        .map((sh) => `${formatPercent(sh.share * 100, 0)} ${CURRENCY_SYMBOL[sh.currency]}`)
                        .join(" · ")}
                    </>
                  )}
                </p>
              </div>
              <Switch checked={inflationOn} onChange={setInflationOn} label={t("forecast.real")} />
            </div>

            {state.debts.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-3">
                <div className="min-w-0">
                  <p className="body-strong">{t("forecast.debts")}</p>
                  <p className="caption mt-0.5">{t("forecast.debts.hint")}</p>
                </div>
                <Switch checked={withDebts} onChange={setWithDebts} label={t("forecast.debts")} />
              </div>
            )}
          </div>
        </GlassCard>

        {isEmpty ? (
          <GlassCard>
            <EmptyState
              icon={<Icon name="trend" />}
              title={t("forecast.empty")}
              hint={t("forecast.empty.hint")}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <LinkButton href="/balance">{t("forecast.goBalance")}</LinkButton>
                  <LinkButton href="/income">{t("dash.empty.income")}</LinkButton>
                </div>
              }
            />
          </GlassCard>
        ) : (
          <>
            <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-3">
              <GlassCard title={t("forecast.projection", { currency: view })} icon="trend" className="lg:col-span-2">
                <StackedArea
                  points={points}
                  currency={view}
                  height={320}
                  xTickEvery={tickEvery}
                  xTickFormat={(label) => (tickEvery === 12 ? label.slice(0, 4) : formatMonthShort(label))}
                />
                <ul className="mt-4 grid gap-2 sm:grid-cols-3">
                  {[
                    {
                      id: "low",
                      label: t("forecast.scenario.low"),
                      value: endLow,
                      pct: Math.max(0, returnPct - spreadPct),
                      tone: "text-ink-2",
                    },
                    { id: "base", label: t("forecast.scenario.base"), value: endTotal, pct: returnPct, tone: "text-ink-1" },
                    {
                      id: "high",
                      label: t("forecast.scenario.high"),
                      value: endHigh,
                      pct: returnPct + spreadPct,
                      tone: "text-income",
                    },
                  ].map((row) => (
                    <li key={row.id} className="rounded-field bg-ghost px-3 py-2.5">
                      <p className="caption">{row.label}</p>
                      <p className={`num-sm mt-0.5 ${row.tone}`}>{formatMoney(row.value, view, { compact: true })}</p>
                      <p className="caption mt-0.5">{t("balance.perYear", { pct: formatPercent(row.pct) })}</p>
                    </li>
                  ))}
                </ul>
                {contributionSplit.growth > 0 && (
                  <div className="mt-4 border-t border-hairline pt-3.5">
                    <p className="card-title">{t("forecast.sources")}</p>
                    <div
                      className="mt-2 flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
                      role="img"
                      aria-label={t("forecast.sources.aria")}
                    >
                      <div className="bar-slice bg-series-1" style={{ width: `${contributionSplit.startPct}%` }} />
                      <div className="bar-slice bg-series-2" style={{ width: `${contributionSplit.depositPct}%` }} />
                      <div className="bar-slice bg-series-3" style={{ width: `${contributionSplit.growthPct}%` }} />
                    </div>
                    <ul className="mt-2.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-3">
                      {[
                        { label: t("forecast.have"), value: contributionSplit.start, slot: 1 },
                        { label: t("forecast.add"), value: contributionSplit.deposits, slot: 2 },
                        { label: t("forecast.earns"), value: contributionSplit.growth, slot: 3 },
                      ].map((part) => (
                        <li key={part.slot} className="flex items-baseline gap-2 text-xs">
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
                  {t("forecast.footnote", { pct: formatPercent(returnPct) })}
                  {inflationOn && ` ${t("forecast.footnoteReal")}`}
                  {withDebts && state.debts.length > 0 && ` ${t("forecast.footnoteDebts")}`}
                </p>
              </GlassCard>

              <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
                <GlassCard title={t("forecast.goal")} subtitle={t("forecast.goal.subtitle")} icon="target">
                  <div className="space-y-3">
                    <Field label={t("balance.goal.target")}>
                      <TextInput
                        inputMode="decimal"
                        prefix={CURRENCY_SYMBOL[goalCurrency]}
                        value={goalAmount}
                        onChange={(e) => setGoalAmount(e.target.value)}
                        placeholder={t("forecast.goal.placeholder")}
                      />
                    </Field>
                    <FieldSet label={t("common.currency")}>
                      <SegmentedControl
                        label={t("common.currency")}
                        options={currencyOptions}
                        value={goalCurrency}
                        onChange={setGoalCurrency}
                      />
                    </FieldSet>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {goalPresets.map((preset) => (
                      <Button key={preset} variant="ghost" size="sm" onClick={() => setGoalAmount(String(preset))}>
                        {formatMoney(preset, goalCurrency, { compact: true })}
                      </Button>
                    ))}
                  </div>

                  {goalBase > 0 && !alreadyThere && (
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                        <span className="text-ink-2">{t("forecast.goal.progress")}</span>
                        <span className="tnum font-semibold text-ink-1">
                          {formatPercent(Math.min(100, (assetsNow / goalBase) * 100), 0)}
                        </span>
                      </div>
                      <ProgressMeter
                        value={assetsNow}
                        max={goalBase}
                        label={t("forecast.goal.progressTo", { amount: formatMoney(goalBase, base, { compact: true }) })}
                      />
                    </div>
                  )}

                  <div className="glass-well mt-4 rounded-field p-4 text-center">
                    {goalBase <= 0 ? (
                      <p className="text-sm text-ink-3">{t("forecast.goal.enter")}</p>
                    ) : alreadyThere ? (
                      <>
                        <span
                          aria-hidden
                          className="mx-auto flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent"
                        >
                          <Icon name="check" size={20} strokeWidth={2.6} />
                        </span>
                        <p className="mt-2 text-sm font-semibold text-income">{t("forecast.goal.there")}</p>
                      </>
                    ) : goalHitMonth ? (
                      <>
                        <p className="card-title">{t("forecast.goal.reached")}</p>
                        <p className="hero-number num-md mt-1">{formatMonthCompact(goalHitMonth)}</p>
                        <p className="mt-1 text-xs text-ink-3">{tp("forecast.goal.inMonths", goalHitIndex)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-ink-1">{tp("forecast.goal.notWithin", years)}</p>
                        <p className="mt-1 text-xs text-ink-3">{t("forecast.goal.notWithin.hint")}</p>
                      </>
                    )}
                  </div>

                  {goalBase > 0 && !alreadyThere && (
                    <div className="mt-4 border-t border-hairline pt-3">
                      <p className="card-title mb-2">{t("forecast.goal.byWhen")}</p>
                      <MonthInput name={t("forecast.goal.byWhen")} value={goalBy} onChange={setGoalBy} />
                      <p className="mt-2 text-sm text-ink-2">
                        {neededMonthly === null || neededMonthly === 0
                          ? t("forecast.goal.alreadyOnTrack")
                          : t("forecast.goal.needMonthly", {
                              amount: formatMoney(
                                convert(neededMonthly, base, view, settings.rates),
                                view,
                                { compact: true },
                              ),
                              months: goalMonths,
                            })}
                      </p>
                    </div>
                  )}

                  {milestones.length > 0 && (
                    <div className="mt-4 border-t border-hairline pt-3">
                      <p className="card-title">{t("forecast.milestones")}</p>
                      <ul className="mt-2 space-y-1.5">
                        {milestones.map((m) => (
                          <li key={m.amount} className="flex items-center justify-between gap-3 text-sm">
                            <span className="tnum text-ink-2">{formatMoney(m.amount, view, { compact: true })}</span>
                            <span className="font-medium text-ink-1">{formatMonthCompact(m.month)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </GlassCard>

                <GlassCard title={t("forecast.events")} subtitle={t("forecast.events.subtitle")} icon="calendar">
                  {events.length > 0 && (
                    <ul className="mb-3 space-y-1.5">
                      {[...events]
                        .sort((a, b) => a.month.localeCompare(b.month))
                        .map((e) => (
                          <li key={e.id} className="flex items-center gap-2 rounded-field bg-ghost px-3 py-2">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-ink-1">
                                {e.note || t("forecast.events.unnamed")}
                              </span>
                              <span className="caption">{formatMonthCompact(e.month)}</span>
                            </span>
                            <span
                              className={`tnum shrink-0 text-sm font-semibold ${e.amount < 0 ? "text-expense" : "text-income"}`}
                            >
                              {formatMoney(convert(e.amount, e.currency, view, settings.rates), view, {
                                compact: true,
                                sign: true,
                              })}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEvents(events.filter((x) => x.id !== e.id))}
                              aria-label={t("forecast.events.remove")}
                              className="icon-btn icon-btn-danger size-8 shrink-0 text-ink-3"
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <SegmentedControl
                        size="sm"
                        label={t("forecast.events.direction")}
                        options={[
                          { value: "out" as const, label: t("forecast.events.out") },
                          { value: "in" as const, label: t("forecast.events.in") },
                        ]}
                        value={eventDraft.sign}
                        onChange={(sign) => setEventDraft({ ...eventDraft, sign })}
                      />
                      {currencies.length > 1 && (
                        <SegmentedControl
                          size="sm"
                          label={t("common.currency")}
                          options={currencyOptions}
                          value={eventDraft.currency}
                          onChange={(currency) => setEventDraft({ ...eventDraft, currency })}
                        />
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <TextInput
                        inputMode="decimal"
                        prefix={CURRENCY_SYMBOL[eventDraft.currency]}
                        value={eventDraft.amount}
                        onChange={(e) => setEventDraft({ ...eventDraft, amount: e.target.value })}
                        placeholder="0"
                        aria-label={t("common.amount")}
                      />
                      <TextInput
                        value={eventDraft.note}
                        onChange={(e) => setEventDraft({ ...eventDraft, note: e.target.value })}
                        placeholder={t("forecast.events.notePlaceholder")}
                        aria-label={t("common.note")}
                        maxLength={60}
                      />
                    </div>
                    <MonthInput
                      name={t("forecast.events.month")}
                      value={eventDraft.month}
                      onChange={(month) => setEventDraft({ ...eventDraft, month })}
                    />
                    <Button variant="ghost" onClick={addEvent} disabled={num(eventDraft.amount) <= 0}>
                      <Icon name="plus" size={14} />
                      {t("forecast.events.add")}
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-ink-3">{t("forecast.events.note")}</p>
                </GlassCard>
              </div>
            </div>

            <GlassCard title={t("forecast.yearly", { currency: view })} icon="calendar">
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-104 text-sm">
                  <thead>
                    <tr className="label border-b border-hairline">
                      <th className="py-2 pr-3 text-left font-medium">{t("forecast.col.year")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("forecast.savings")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("balance.investments")}</th>
                      {withDebts && state.debts.length > 0 && (
                        <th className="px-3 py-2 text-right font-medium">{t("balance.debts")}</th>
                      )}
                      <th className="px-3 py-2 text-right font-medium">{t("forecast.col.total")}</th>
                      <th className="py-2 pl-3 text-right font-medium">{t("forecast.col.added")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearRows.map(({ p, i }, idx) => {
                      const prev = idx > 0 ? yearRows[idx - 1] : null;
                      const added = prev ? show(p.net, i) - show(prev.p.net, prev.i) : 0;
                      return (
                        <tr key={p.month} className="table-row border-b border-hairline last:border-b-0">
                          <td className="py-2.5 pr-3">
                            <span className={i === 0 ? "font-semibold text-ink-1" : "text-ink-2"}>
                              {i === 0 ? t("forecast.now") : p.month.slice(0, 4)}
                            </span>
                          </td>
                          <td className="tnum px-3 py-2.5 text-right text-ink-2">
                            {formatMoney(show(p.savings, i), view, { compact: true })}
                          </td>
                          <td className="tnum px-3 py-2.5 text-right text-ink-2">
                            {formatMoney(show(p.investments, i), view, { compact: true })}
                          </td>
                          {withDebts && state.debts.length > 0 && (
                            <td className="tnum px-3 py-2.5 text-right text-expense">
                              {p.debt > 0 ? `−${formatMoney(show(p.debt, i), view, { compact: true })}` : "—"}
                            </td>
                          )}
                          <td className="relative px-3 py-2.5 text-right">
                            <span
                              aria-hidden
                              className="absolute inset-y-1.5 right-3 rounded-sm bg-accent/12"
                              style={{
                                width: `${maxYearTotal > 0 ? (show(p.net, i) / maxYearTotal) * 100 : 0}%`,
                                maxWidth: "calc(100% - 1.5rem)",
                              }}
                            />
                            <span className="tnum relative font-semibold text-ink-1">
                              {formatMoney(show(p.net, i), view, { compact: true })}
                            </span>
                          </td>
                          <td className={`tnum py-2.5 pl-3 text-right ${added > 0 ? "text-income" : "text-ink-3"}`}>
                            {prev ? formatMoney(added, view, { compact: true, sign: true }) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-ink-3">
                {t("forecast.yearly.hint")}
              </p>
            </GlassCard>
          </>
        )}
      </div>
    </>
  );
}
