"use client";

import { useEffect, useRef, useState } from "react";
import { OptionPicker } from "@/components/forms/option-picker";
import { useAccountGroups, useCategoryGroups } from "@/components/forms/picker-groups";
import { Button, Card, Field, FieldSet, SegmentedControl, TextInput } from "@/components/ui";
import { CURRENCY_SYMBOL, displayCurrencies } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { categoryTree } from "@/lib/finance/categories";
import { parseAmount } from "@/lib/finance/money";
import { uid, useStore } from "@/lib/state/store";
import { useT } from "@/lib/i18n";
import type { Currency, TxType } from "@/lib/types";

/** Log an expense or income for today without leaving the dashboard. */
export function QuickAddCard({ className = "" }: { className?: string }) {
  const { state, update } = useStore();
  const { t } = useT();
  const base = state.settings.baseCurrency;
  const currencies = displayCurrencies(state);

  const expenseCategoryGroups = useCategoryGroups(state.categories, ["expense"]);
  const incomeCategoryGroups = useCategoryGroups(state.categories, ["income"]);
  const accountGroups = useAccountGroups(state.savings, [{ value: "", label: t("common.notAssigned") }]);

  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [currencyChoice, setCurrencyChoice] = useState<Currency | null>(null);
  const currency = currencyChoice ?? base;
  const [categoryChoice, setCategoryChoice] = useState<string | null>(null);
  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [savedTick, setSavedTick] = useState(false);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (tickTimer.current) clearTimeout(tickTimer.current);
    },
    [],
  );

  const categories = state.categories.filter((c) => c.kind === type);
  const categoryId =
    categoryChoice && categories.some((c) => c.id === categoryChoice)
      ? categoryChoice
      : (categoryTree(state.categories, type)[0]?.parent.id ?? "");
  const accountId =
    accountChoice !== null && (accountChoice === "" || state.savings.some((a) => a.id === accountChoice))
      ? accountChoice
      : (state.savings[0]?.id ?? "");
  const parsed = parseAmount(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && categoryId !== "";

  const switchType = (next: "income" | "expense") => {
    setType(next);
    setCategoryChoice(null);
  };

  const submit = () => {
    if (!valid) return;
    const txType: TxType = type;
    update((s) => ({
      ...s,
      transactions: [
        ...s.transactions,
        {
          id: uid(),
          type: txType,
          amount: parsed,
          currency,
          categoryId,
          date: todayISO(),
          note: note.trim() || undefined,
          accountId: accountId || undefined,
        },
      ],
    }));
    setAmount("");
    setNote("");
    setSavedTick(true);
    if (tickTimer.current) clearTimeout(tickTimer.current);
    tickTimer.current = setTimeout(() => setSavedTick(false), 1600);
  };

  const typeSwitch = (
    <SegmentedControl
      size="sm"
      label={t("tx.kind")}
      options={[
        { value: "expense" as const, label: t("tx.type.expense") },
        { value: "income" as const, label: t("tx.type.income") },
      ]}
      value={type}
      onChange={switchType}
    />
  );

  // A wide, two-row form: it sits at the top of the dashboard's main column.
  return (
    <Card title={t("dash.quick")} icon="bolt" action={typeSwitch} className={className}>
      <div className="grid gap-3 md:grid-cols-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 md:col-span-2">
          <Field label={t("common.amount")}>
            <TextInput
              inputMode="decimal"
              placeholder="0"
              prefix={CURRENCY_SYMBOL[currency]}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <FieldSet label={t("common.currency")}>
            <SegmentedControl
              label={t("common.currency")}
              options={currencies.map((c) => ({ value: c, label: CURRENCY_SYMBOL[c] }))}
              value={currency}
              onChange={setCurrencyChoice}
            />
          </FieldSet>
        </div>
        <div className={state.savings.length > 0 ? "md:col-span-2" : "md:col-span-4"}>
          <Field label={t("common.category")}>
            <OptionPicker
              label={t("common.category")}
              value={categoryId}
              onChange={setCategoryChoice}
              groups={type === "income" ? incomeCategoryGroups : expenseCategoryGroups}
            />
          </Field>
        </div>
        {state.savings.length > 0 && (
          <div className="md:col-span-2">
            <Field label={t("common.account")}>
              <OptionPicker label={t("common.account")} value={accountId} onChange={setAccountChoice} groups={accountGroups} />
            </Field>
          </div>
        )}
        <div className="md:col-span-4">
          <Field label={t("common.note")}>
            <TextInput placeholder={t("common.optional")} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-end md:col-span-2">
          <Button className="w-full" onClick={submit} disabled={!valid}>
            {savedTick ? t("dash.quick.added") : t("dash.quick.add")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
