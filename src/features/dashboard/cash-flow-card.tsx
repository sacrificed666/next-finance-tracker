"use client";

import { useState } from "react";
import { MonthlyColumns, PeriodTabs } from "@/components/charts";
import { Card, EmptyState, Icon, LinkButton } from "@/components/ui";
import { monthlySeries } from "@/lib/finance/finmath";
import { useT } from "@/lib/i18n";
import { useMonthSummary } from "./use-month-summary";

export function CashFlowCard({ className = "" }: { className?: string }) {
  const { state, settings, base, month } = useMonthSummary();
  const { t } = useT();
  const [months, setMonths] = useState(12);
  const series = monthlySeries(state.transactions, month, months, settings);

  return (
    <Card title={t("tx.flow")} icon="chart" action={<PeriodTabs value={months} onChange={setMonths} />} className={className}>
      {state.transactions.length > 0 ? (
        <MonthlyColumns
          data={series.map((m) => ({ month: m.month, income: m.income, expense: m.expense }))}
          currency={base}
          height={190}
        />
      ) : (
        <EmptyState
          icon={<Icon name="chart" />}
          title={t("dash.chart.empty")}
          hint={t("dash.chart.empty.hint")}
          action={<LinkButton href="/transactions">{t("dash.addTransaction")}</LinkButton>}
        />
      )}
    </Card>
  );
}
