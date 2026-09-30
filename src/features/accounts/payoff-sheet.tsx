"use client";

import { useState } from "react";
import { Button, Fact, Facts, Field, IconDisc, SegmentedControl, Sheet, SummaryPanel, TextInput } from "@/components/ui";
import { CURRENCY_SYMBOL, debtColorSlot } from "@/lib/constants";
import { currentMonth, formatMonthCompact } from "@/lib/date";
import { convert, formatMoney, parseAmount } from "@/lib/finance/money";
import { planPayoff, type PayoffPlan, type PayoffStrategy } from "@/lib/finance/payoff";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";

export function PayoffSheet({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const from = currentMonth();
  const [extra, setExtra] = useState("");
  const [strategy, setStrategy] = useState<PayoffStrategy>("avalanche");

  const debts = state.debts.map((d) => ({
    id: d.id,
    balance: convert(d.balance, d.currency, base, settings.rates),
    ratePct: d.annualRatePct ?? 0,
    payment: convert(d.monthlyPayment ?? 0, d.currency, base, settings.rates),
  }));
  const typed = parseAmount(extra);
  const asSet = planPayoff(debts, from);
  const plan = planPayoff(debts, from, { extra: Number.isFinite(typed) ? typed : 0, strategy });
  const money = (v: number) => formatMoney(v, base, { compact: true });
  const summary = (p: PayoffPlan) =>
    p.neverPaysOff ? t("payoff.never") : t("payoff.freeBy", { month: formatMonthCompact(p.finalMonth) });
  const savedInterest = asSet.neverPaysOff || plan.neverPaysOff ? 0 : asSet.interest - plan.interest;
  const savedMonths = asSet.neverPaysOff || plan.neverPaysOff ? 0 : asSet.months - plan.months;
  const byId = new Map(state.debts.map((d) => [d.id, d]));
  const unpaid = state.debts.filter((d) => d.balance > 0 && !plan.cleared.some((c) => c.id === d.id));

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("payoff.title")}
      footer={<Button onClick={onClose}>{t("dash.layout.done")}</Button>}
    >
      <p className="text-sm text-ink-2">{t("payoff.hint")}</p>
      <Field label={t("payoff.extra")} hint={t("payoff.extra.hint")}>
        <TextInput inputMode="decimal" prefix={CURRENCY_SYMBOL[base]} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" />
      </Field>
      <SegmentedControl
        label={t("payoff.strategy")}
        options={[
          { value: "avalanche" as const, label: t("payoff.avalanche") },
          { value: "snowball" as const, label: t("payoff.snowball") },
        ]}
        value={strategy}
        onChange={setStrategy}
      />
      <p className="caption">{strategy === "avalanche" ? t("payoff.avalanche.hint") : t("payoff.snowball.hint")}</p>

      <Facts>
        <Fact label={t("payoff.asSet")}>
          <span className="block">{summary(asSet)}</span>
          {!asSet.neverPaysOff && <span className="block text-xs font-normal text-ink-3">{t("payoff.interest", { amount: money(asSet.interest) })}</span>}
        </Fact>
        <Fact label={t("payoff.plan")}>
          <span className="block">{summary(plan)}</span>
          {!plan.neverPaysOff && <span className="block text-xs font-normal text-ink-3">{t("payoff.interest", { amount: money(plan.interest) })}</span>}
        </Fact>
      </Facts>

      {(savedInterest > 0.5 || savedMonths > 0) && (
        <SummaryPanel tone="income" value={money(savedInterest)} meta={tp("payoff.savesMonths", savedMonths)}>
          <p className="caption">{t("payoff.saves")}</p>
        </SummaryPanel>
      )}

      <section className="space-y-2">
        <h3 className="caption">{t("payoff.order")}</h3>
        <ol className="rows">
          {plan.cleared.map((c, i) => {
            const debt = byId.get(c.id);
            if (!debt) return null;
            return (
              <li key={c.id} className="flex items-center gap-2.5 px-2.5 py-2">
                <span className="tnum w-5 shrink-0 text-center text-xs font-semibold text-ink-3">{i + 1}</span>
                <IconDisc colorSlot={debtColorSlot(debt.kind)} className="size-8 rounded-field text-sm">
                  {debt.icon}
                </IconDisc>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{debt.name}</span>
                <span className="tnum shrink-0 text-xs text-ink-2">{t("payoff.clears", { month: formatMonthCompact(c.month) })}</span>
              </li>
            );
          })}
          {unpaid.map((debt) => (
            <li key={debt.id} className="flex items-center gap-2.5 px-2.5 py-2">
              <span className="w-5 shrink-0" />
              <IconDisc colorSlot={debtColorSlot(debt.kind)} className="size-8 rounded-field text-sm">
                {debt.icon}
              </IconDisc>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{debt.name}</span>
              <span className="shrink-0 text-xs text-expense">{t("payoff.stuck")}</span>
            </li>
          ))}
        </ol>
      </section>
      <p className="caption">{t("payoff.note", { currency: base })}</p>
    </Sheet>
  );
}
