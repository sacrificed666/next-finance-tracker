"use client";

import { useState } from "react";
import { MonthlyColumns, PeriodTabs } from "@/components/charts";
import { PageBody, Split } from "@/components/layout/page";
import { AddButton, Card, EmptyState, Icon, PageHeader } from "@/components/ui";
import { currentMonth } from "@/lib/date";
import { monthlySeries, taxPaid } from "@/lib/finance/finmath";
import { useStore } from "@/lib/state/store";
import { useT } from "@/lib/i18n";
import type { Transaction } from "@/lib/types";
import { IncomeSourcesCard, TaxLimitCard } from "./income-side-cards";
import { IncomeHero } from "./income-hero";
import { IncomeListCard } from "./income-list-card";
import { IncomeSheet } from "./income-sheet";
import { QuarterlyTaxCard, TaxCalendarCard } from "./tax-cards";

export function IncomePage() {
  const { state } = useStore();
  const { t } = useT();
  const base = state.settings.baseCurrency;
  const [target, setTarget] = useState<Transaction | "new" | null>(null);
  const [chartMonths, setChartMonths] = useState(12);
  const chartSeries = monthlySeries(state.transactions, currentMonth(), chartMonths, state.settings);
  const hasIncome = state.transactions.some((tx) => tx.type === "income");
  const hasTax = state.transactions.some((tx) => tx.type === "income" && tx.tax);
  const openAdd = () => setTarget("new");
  const addButton = <AddButton variant="primary" onClick={openAdd} label={t("income.add")} />;

  return (
    <>
      <PageHeader title={t("income.title")} subtitle={t("income.subtitle")} action={addButton} />

      <PageBody>
        <IncomeHero />
        <Split
          stickySide
          main={
            <>
              <Card
                title={t("income.byMonth")}
                subtitle={hasTax ? t("income.byMonth.taxSubtitle") : t("income.byMonth.subtitle")}
                icon="chart"
                action={<PeriodTabs value={chartMonths} onChange={setChartMonths} />}
              >
                {hasIncome ? (
                  <MonthlyColumns
                    data={chartSeries.map((m) => {
                      const withheld = taxPaid(state.transactions, m.month, m.month, state.settings);
                      return { month: m.month, income: m.income, expense: m.expense, tax: withheld.tax + withheld.vat };
                    })}
                    currency={base}
                    height={196}
                    incomeOnly
                  />
                ) : (
                  <EmptyState
                    icon={<Icon name="chart" />}
                    title={t("income.empty.chart")}
                    hint={t("income.empty.chart.hint")}
                    action={addButton}
                  />
                )}
              </Card>
              <QuarterlyTaxCard />
              <IncomeListCard onAdd={openAdd} onEdit={setTarget} />
            </>
          }
          side={
            <>
              <TaxLimitCard />
              <TaxCalendarCard />
              <IncomeSourcesCard />
            </>
          }
        />
      </PageBody>

      {target && (
        <IncomeSheet key={target === "new" ? "new" : target.id} target={target} onClose={() => setTarget(null)} />
      )}
    </>
  );
}
