"use client";

import { PageBody, Split } from "@/components/layout/page";
import { Card, EmptyState, Icon, LinkButton, PageHeader, SegmentedControl } from "@/components/ui";
import { displayCurrencies } from "@/lib/constants";
import { currentMonth, formatMonth } from "@/lib/date";
import { useStore } from "@/lib/state/store";
import { useT } from "@/lib/i18n";
import type { Currency } from "@/lib/types";
import { CashAheadCard } from "./cash-ahead-card";
import { CashFlowCard } from "./cash-flow-card";
import { CurrencyCard } from "./currency-card";
import { DashboardHero } from "./dashboard-hero";
import { HoldingsCard } from "./holdings-card";
import { ProgressCard } from "./progress-card";
import { QuickAddCard } from "./quick-add-card";
import { SpendingCard } from "./spending-card";
import { SubscriptionsCard } from "./subscriptions-card";

export function DashboardPage() {
  const { state, update } = useStore();
  const { t } = useT();
  const currencies = displayCurrencies(state);
  const hasAnyData =
    state.transactions.length > 0 || state.savings.length > 0 || state.investments.length > 0 || state.debts.length > 0;

  return (
    <>
      <PageHeader
        title={t("nav.dashboard")}
        subtitle={formatMonth(currentMonth())}
        action={
          <SegmentedControl
            label={t("settings.baseCurrency")}
            options={currencies.map((c) => ({ value: c, label: c }))}
            value={state.settings.baseCurrency}
            onChange={(v: Currency) => update((s) => ({ ...s, settings: { ...s.settings, baseCurrency: v } }))}
            className={currencies.length > 3 ? "w-56" : "w-44"}
          />
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
          <Split
            main={
              <>
                <QuickAddCard />
                <CashFlowCard />
                <SpendingCard />
                <CashAheadCard />
              </>
            }
            side={
              <>
                <HoldingsCard />
                <SubscriptionsCard />
                <CurrencyCard />
                <ProgressCard />
              </>
            }
          />
        </PageBody>
      )}
    </>
  );
}
