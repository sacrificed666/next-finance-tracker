"use client";

import { useDeferredValue, useState } from "react";
import { PageBody, Split } from "@/components/layout/page";
import { Card, EmptyState, Icon, LinkButton, PageHeader, SegmentedControl } from "@/components/ui";
import { displayCurrencies } from "@/lib/constants";
import { useStore } from "@/lib/state/store";
import { useT } from "@/lib/i18n";
import type { Currency, PlannedEvent } from "@/lib/types";
import { AssumptionsCard } from "./assumptions-card";
import { EventsCard } from "./events-card";
import { ForecastHero } from "./forecast-hero";
import { GoalCard } from "./goal-card";
import { ProjectionCard } from "./projection-card";
import { useLegacyEvents } from "./legacy-events";
import { useForecast } from "./use-forecast";
import { WishlistCard } from "./wishlist-card";
import { YearlyTableCard } from "./yearly-table-card";

export function ForecastPage() {
  const { state, update } = useStore();
  const { t } = useT();
  const currencies = displayCurrencies(state);

  const [years, setYears] = useState(10);
  const [view, setView] = useState<Currency>(state.settings.baseCurrency);
  const [returnPct, setReturnPct] = useState(0);
  const [spreadPct, setSpreadPct] = useState(3);
  const [inflationOn, setInflationOn] = useState(false);
  const [withDebts, setWithDebts] = useState(state.debts.length > 0);
  const shownYears = useDeferredValue(years);
  const shownReturn = useDeferredValue(returnPct);
  const shownSpread = useDeferredValue(spreadPct);
  const shownInflation = useDeferredValue(inflationOn);
  const shownDebts = useDeferredValue(withDebts);
  const events = state.plannedEvents;
  const setEvents = (next: PlannedEvent[]) => update((s) => ({ ...s, plannedEvents: next }));
  useLegacyEvents();

  const wishes: PlannedEvent[] = state.wishlist
    .filter((w) => w.month)
    .map((w) => ({ id: `wish:${w.id}`, month: w.month!, amount: -w.price, currency: w.currency, note: `${w.icon} ${w.name}` }));
  const f = useForecast({
    years: shownYears,
    view,
    returnPct: shownReturn,
    spreadPct: shownSpread,
    inflationOn: shownInflation,
    withDebts: shownDebts,
    events: [...events, ...wishes],
  });
  const isEmpty = state.savings.length === 0 && state.investments.length === 0;

  return (
    <>
      <PageHeader
        title={t("forecast.title")}
        subtitle={t("forecast.subtitle")}
        action={
          <SegmentedControl
            label={t("forecast.viewCurrency")}
            options={currencies.map((c) => ({ value: c, label: c }))}
            value={view}
            onChange={setView}
            className="w-44"
          />
        }
      />

      <PageBody>
        <ForecastHero
          f={f}
          view={view}
          years={shownYears}
          returnPct={shownReturn}
          spreadPct={shownSpread}
          inflationOn={shownInflation}
        />

        {isEmpty ? (
          <>
            <AssumptionsCard
              f={f}
              years={years}
              setYears={setYears}
              returnPct={returnPct}
              setReturnPct={setReturnPct}
              spreadPct={spreadPct}
              setSpreadPct={setSpreadPct}
              inflationOn={inflationOn}
              setInflationOn={setInflationOn}
              withDebts={withDebts}
              setWithDebts={setWithDebts}
            />
            <Card>
              <EmptyState
                icon={<Icon name="trend" />}
                title={t("forecast.empty")}
                hint={t("forecast.empty.hint")}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <LinkButton href="/accounts">{t("forecast.goBalance")}</LinkButton>
                    <LinkButton href="/income">{t("dash.empty.income")}</LinkButton>
                  </div>
                }
              />
            </Card>
          </>
        ) : (
          <>
            <Split
              main={
                <>
                  <AssumptionsCard
                    f={f}
                    years={years}
                    setYears={setYears}
                    returnPct={returnPct}
                    setReturnPct={setReturnPct}
                    spreadPct={spreadPct}
                    setSpreadPct={setSpreadPct}
                    inflationOn={inflationOn}
                    setInflationOn={setInflationOn}
                    withDebts={withDebts}
                    setWithDebts={setWithDebts}
                  />
                  <ProjectionCard
                    f={f}
                    view={view}
                    years={shownYears}
                    returnPct={shownReturn}
                    inflationOn={shownInflation}
                    withDebts={shownDebts}
                  />
                </>
              }
              side={
                <>
                  <GoalCard f={f} view={view} years={shownYears} returnPct={shownReturn} />
                  <EventsCard f={f} view={view} events={events} setEvents={setEvents} />
                  <WishlistCard />
                </>
              }
            />
            <YearlyTableCard f={f} view={view} withDebts={shownDebts} />
          </>
        )}
      </PageBody>
    </>
  );
}
