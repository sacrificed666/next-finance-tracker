"use client";

import { useState, type ComponentType } from "react";
import { PageBody, Split } from "@/components/layout/page";
import { Card, EmptyState, Icon, LinkButton, PageHeader, SegmentedControl } from "@/components/ui";
import { displayCurrencies } from "@/lib/constants";
import { currentMonth, formatMonth } from "@/lib/date";
import { dashboardLayout, normalizeDashboard } from "@/lib/state/dashboard";
import { useStore } from "@/lib/state/store";
import { useT } from "@/lib/i18n";
import type { Currency, DashboardCardId } from "@/lib/types";
import { CashAheadCard } from "./cash-ahead-card";
import { CashFlowCard } from "./cash-flow-card";
import { CurrencyCard } from "./currency-card";
import { DashboardHero } from "./dashboard-hero";
import { HoldingsCard } from "./holdings-card";
import { LayoutSheet } from "./layout-sheet";
import { ProgressCard } from "./progress-card";
import { QuickAddCard } from "./quick-add-card";
import { SpendingCard } from "./spending-card";
import { SubscriptionsCard } from "./subscriptions-card";

const CARDS: Record<DashboardCardId, ComponentType> = {
  quickAdd: QuickAddCard,
  cashFlow: CashFlowCard,
  spending: SpendingCard,
  cashAhead: CashAheadCard,
  holdings: HoldingsCard,
  subscriptions: SubscriptionsCard,
  currency: CurrencyCard,
  progress: ProgressCard,
};

export function DashboardPage() {
  const { state, update } = useStore();
  const { t } = useT();
  const [customising, setCustomising] = useState(false);
  const currencies = displayCurrencies(state);
  const layout = dashboardLayout(state.settings.dashboard);
  const shown = (ids: DashboardCardId[]) =>
    ids.filter((id) => !layout.hidden.includes(id)).map((id) => {
      const Shown = CARDS[id];
      return <Shown key={id} />;
    });
  const main = shown(layout.main);
  const side = shown(layout.side);
  const hasAnyData =
    state.transactions.length > 0 || state.savings.length > 0 || state.investments.length > 0 || state.debts.length > 0;

  return (
    <>
      <PageHeader
        title={t("nav.dashboard")}
        subtitle={formatMonth(currentMonth())}
        action={
          <div className="flex items-center gap-2">
            <SegmentedControl
              label={t("settings.baseCurrency")}
              options={currencies.map((c) => ({ value: c, label: c }))}
              value={state.settings.baseCurrency}
              onChange={(v: Currency) => update((s) => ({ ...s, settings: { ...s.settings, baseCurrency: v } }))}
              className={currencies.length > 3 ? "w-56" : "w-44"}
            />
            {hasAnyData && (
              <button
                type="button"
                aria-label={t("dash.layout.title")}
                title={t("dash.layout.title")}
                onClick={() => setCustomising(true)}
                className="icon-btn size-9 shrink-0 border border-hairline bg-ghost text-ink-2 print:hidden"
              >
                <Icon name="sliders" size={16} />
              </button>
            )}
          </div>
        }
      />

      {!hasAnyData ? (
        <Card glow>
          <EmptyState
            icon={<Icon name="sparkle" />}
            title={t("dash.empty")}
            hint={t("dash.empty.hint")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <LinkButton href="/accounts">{t("dash.empty.accounts")}</LinkButton>
                <LinkButton href="/income">{t("dash.empty.income")}</LinkButton>
              </div>
            }
          />
        </Card>
      ) : (
        <PageBody>
          <DashboardHero />
          {main.length > 0 && side.length > 0 ? (
            <Split main={main} side={side} />
          ) : (
            <div className={`grid items-start gap-3 sm:gap-4 ${main.length > 0 ? "" : "md:grid-cols-2 xl:grid-cols-3"}`}>
              {main.length > 0 ? main : side}
            </div>
          )}
        </PageBody>
      )}
      {customising && (
        <LayoutSheet
          layout={layout}
          onChange={(next) => update((s) => ({ ...s, settings: { ...s.settings, dashboard: normalizeDashboard(next) } }))}
          onClose={() => setCustomising(false)}
        />
      )}
    </>
  );
}
