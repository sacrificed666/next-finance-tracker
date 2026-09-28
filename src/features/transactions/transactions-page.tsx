"use client";

import { useDeferredValue, useState } from "react";
import { PageBody, Split } from "@/components/layout/page";
import { AddButton, PageHeader } from "@/components/ui";
import { currentMonth } from "@/lib/date";
import { useT } from "@/lib/i18n";
import type { Transaction } from "@/lib/types";
import { BudgetsCard } from "./budgets-card";
import { LedgerCard } from "./ledger-card";
import { MonthHero } from "./month-hero";
import { RecurringCard } from "./recurring-card";
import { SpendingOverview } from "./spending-overview";
import { SubscriptionsCard } from "./subscriptions-card";
import { TransactionSheet } from "./transaction-sheet";

/** The ledger for one month, with the schedules and budgets that shape it. */
export function TransactionsPage() {
  const { t } = useT();
  const [chosen, setMonth] = useState(currentMonth());
  // The switcher follows every click at once; the cards redraw in the background and
  // can be interrupted, so a quick run of clicks only draws the month it ends on.
  const month = useDeferredValue(chosen);
  const [target, setTarget] = useState<Transaction | "new" | null>(null);
  const openAdd = () => setTarget("new");

  return (
    <>
      <PageHeader
        title={t("tx.title")}
        subtitle={t("tx.subtitle")}
        action={<AddButton variant="primary" onClick={openAdd} label={t("common.add")} />}
      />
      <PageBody>
        <MonthHero month={month} switcherMonth={chosen} onMonthChange={setMonth} />
        <Split
          main={
            <>
              <SpendingOverview month={month} />
              <LedgerCard month={month} onAdd={openAdd} onEdit={setTarget} />
              <RecurringCard month={month} />
            </>
          }
          side={
            <>
              <BudgetsCard month={month} />
              <SubscriptionsCard month={month} />
            </>
          }
        />
      </PageBody>

      {target && (
        <TransactionSheet
          key={target === "new" ? `new:${month}` : target.id}
          target={target}
          month={month}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}
