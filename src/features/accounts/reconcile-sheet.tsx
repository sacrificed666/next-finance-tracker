"use client";

import { useState } from "react";
import { Button, Field, Money, Sheet, TextInput } from "@/components/ui";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { accountBalances } from "@/lib/finance/finmath";
import { parseAmount } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { uid, useStore } from "@/lib/state/store";

export function ReconcileSheet({ accountId, amount: bankAmount, onClose }: { accountId: string; amount?: number; onClose: () => void }) {
  const { state, update } = useStore();
  const { t } = useT();
  const today = todayISO();
  const [amount, setAmount] = useState(bankAmount !== undefined ? String(bankAmount) : "");
  const account = state.savings.find((a) => a.id === accountId) ?? null;
  const current = account ? (accountBalances(state, today).get(account.id) ?? 0) : 0;
  const delta = parseAmount(amount) - current;

  const adjustCategoryId = (up: boolean) =>
    (up
      ? (state.categories.find((c) => c.id === "cat-other-inc") ?? state.categories.find((c) => c.kind === "income"))
      : (state.categories.find((c) => c.id === "cat-other-exp") ?? state.categories.find((c) => c.kind === "expense"))
    )?.id;

  const problem: string | null = (() => {
    if (!account) return null;
    if (amount.trim() === "" || !Number.isFinite(parseAmount(amount))) return t("balance.move.problem.enter");
    if (Math.abs(delta) < 0.005) return t("balance.move.problem.matches");
    if (!adjustCategoryId(delta > 0)) return t("balance.move.problem.categories");
    return null;
  })();
  const valid = account !== null && problem === null;

  const submit = () => {
    if (!account || !valid) return;
    const categoryId = adjustCategoryId(delta > 0)!;
    update(
      (s) => ({
        ...s,
        transactions: [
          ...s.transactions,
          {
            id: uid(),
            type: delta > 0 ? ("income" as const) : ("expense" as const),
            amount: Math.abs(delta),
            currency: account.currency,
            categoryId,
            date: today,
            note: t("balance.move.note", { name: account.name }),
            accountId: account.id,
          },
        ],
      }),
      t("balance.move.done"),
    );
    onClose();
  };

  return (
    <Sheet
      open={account !== null}
      onClose={onClose}
      onSubmit={submit}
      problem={problem}
      title={t("balance.move.title", { name: account?.name ?? "" })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!valid}>
            {t("balance.move.adjust")}
          </Button>
        </>
      }
    >
      {account && (
        <p className="text-sm text-ink-2">
          {t("balance.move.current")}{" "}
          <Money amount={current} currency={account.currency} exact className="font-semibold text-ink-1" />
        </p>
      )}
      <Field label={t("balance.move.bankShows")} hint={t("balance.move.bankShows.hint")}>
        <TextInput
          inputMode="decimal"
          prefix={account ? CURRENCY_SYMBOL[account.currency] : undefined}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={account ? String(Math.round(current)) : "0"}
        />
      </Field>
    </Sheet>
  );
}
