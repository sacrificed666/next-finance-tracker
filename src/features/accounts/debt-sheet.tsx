"use client";

import { useState } from "react";
import { Button, Field, FieldSet, SegmentedControl, Sheet, TextInput } from "@/components/ui";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/constants";
import { parseAmount } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { uid, useStore } from "@/lib/state/store";
import type { Currency, Debt, DebtKind } from "@/lib/types";
import { DEBT_KIND_ICON } from "./helpers";

interface DebtForm {
  id: string | null;
  name: string;
  kind: DebtKind;
  currency: Currency;
  balance: string;
  principal: string;
  rate: string;
  monthlyPayment: string;
  note: string;
}

const optionalNumber = (raw: string): number | undefined => (raw.trim() === "" ? undefined : parseAmount(raw) || undefined);

const outOfRange = (raw: string, max: number) => {
  if (raw.trim() === "") return false;
  const v = parseAmount(raw);
  return !Number.isFinite(v) || v < 0 || v > max;
};

export function DebtSheet({
  target,
  onClose,
  onDelete,
}: {
  target: Debt | "new";
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { update } = useStore();
  const { t } = useT();
  const [form, setForm] = useState<DebtForm>(() =>
    target === "new"
      ? { id: null, name: "", kind: "mortgage", currency: "UAH", balance: "", principal: "", rate: "", monthlyPayment: "", note: "" }
      : {
          id: target.id,
          name: target.name,
          kind: target.kind,
          currency: target.currency,
          balance: String(target.balance),
          principal: target.principal != null ? String(target.principal) : "",
          rate: target.annualRatePct != null ? String(target.annualRatePct) : "",
          monthlyPayment: target.monthlyPayment != null ? String(target.monthlyPayment) : "",
          note: target.note ?? "",
        },
  );

  const problem: string | null = (() => {
    if (!form.name.trim()) return t("balance.debt.problem.name");
    const balance = parseAmount(form.balance);
    if (!Number.isFinite(balance) || balance < 0) return t("balance.debt.problem.balance");
    if (outOfRange(form.principal, 1e12)) return t("balance.debt.problem.principal");
    if (outOfRange(form.rate, 200)) return t("balance.inv.problem.rate");
    if (outOfRange(form.monthlyPayment, 1e12)) return t("balance.debt.problem.payment");
    return null;
  })();

  const submit = () => {
    if (problem) return;
    const fields = {
      name: form.name.trim(),
      icon: DEBT_KIND_ICON[form.kind],
      kind: form.kind,
      currency: form.currency,
      balance: parseAmount(form.balance),
      principal: optionalNumber(form.principal),
      annualRatePct: optionalNumber(form.rate),
      monthlyPayment: optionalNumber(form.monthlyPayment),
      note: form.note.trim() || undefined,
    };
    if (form.id) {
      const id = form.id;
      update((s) => ({ ...s, debts: s.debts.map((d) => (d.id === id ? { ...d, ...fields } : d)) }));
    } else {
      update((s) => ({ ...s, debts: [...s.debts, { id: uid(), ...fields }] }));
    }
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      onSubmit={submit}
      problem={problem}
      title={form.id ? t("balance.debt.edit") : t("balance.debt.new")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={problem !== null}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <Field label={t("common.name")}>
        <TextInput
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t("balance.debt.namePlaceholder")}
        />
      </Field>
      <FieldSet label={t("balance.debt.type")}>
        <SegmentedControl
          label={t("balance.debt.type")}
          options={(["mortgage", "loan", "card"] as const).map((k) => ({ value: k, label: t(`debtKind.${k}`) }))}
          value={form.kind}
          onChange={(v) => setForm({ ...form, kind: v })}
        />
      </FieldSet>
      <FieldSet label={t("common.currency")}>
        <SegmentedControl
          label={t("common.currency")}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={form.currency}
          onChange={(v) => setForm({ ...form, currency: v })}
        />
      </FieldSet>
      <Field label={t("balance.debt.outstanding")} hint={t("balance.debt.outstanding.hint")}>
        <TextInput
          inputMode="decimal"
          prefix={CURRENCY_SYMBOL[form.currency]}
          value={form.balance}
          onChange={(e) => setForm({ ...form, balance: e.target.value })}
          placeholder="850 000"
        />
      </Field>
      <Field label={t("balance.debt.original")} hint={t("balance.debt.original.hint")}>
        <TextInput
          inputMode="decimal"
          prefix={CURRENCY_SYMBOL[form.currency]}
          value={form.principal}
          onChange={(e) => setForm({ ...form, principal: e.target.value })}
          placeholder="1 000 000"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("balance.debt.rate")} hint={t("balance.debt.rate.hint")}>
          <TextInput
            inputMode="decimal"
            value={form.rate}
            onChange={(e) => setForm({ ...form, rate: e.target.value })}
            placeholder="12.5"
          />
        </Field>
        <Field label={t("balance.debt.payment")} hint={t("common.optional")}>
          <TextInput
            inputMode="decimal"
            prefix={CURRENCY_SYMBOL[form.currency]}
            value={form.monthlyPayment}
            onChange={(e) => setForm({ ...form, monthlyPayment: e.target.value })}
            placeholder="15 000"
          />
        </Field>
      </div>
      <Field label={t("common.note")}>
        <TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t("common.optional")} />
      </Field>
      {form.id && (
        <Button variant="danger" className="w-full" onClick={() => onDelete(form.id!)}>
          {t("balance.debt.delete")}
        </Button>
      )}
    </Sheet>
  );
}
