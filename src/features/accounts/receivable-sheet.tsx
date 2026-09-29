"use client";

import { useState } from "react";
import { Button, Field, FieldSet, SegmentedControl, Sheet, TextInput } from "@/components/ui";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { parseAmount } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { uid, useStore } from "@/lib/state/store";
import type { Currency, Receivable } from "@/lib/types";

interface ReceivableForm {
  id: string | null;
  name: string;
  currency: Currency;
  amount: string;
  repaid: string;
  date: string;
  dueDate: string;
  note: string;
}

export function ReceivableSheet({
  target,
  onClose,
  onDelete,
}: {
  target: Receivable | "new";
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { update } = useStore();
  const { t } = useT();
  const [form, setForm] = useState<ReceivableForm>(() =>
    target === "new"
      ? { id: null, name: "", currency: "UAH", amount: "", repaid: "", date: todayISO(), dueDate: "", note: "" }
      : {
          id: target.id,
          name: target.name,
          currency: target.currency,
          amount: String(target.amount),
          repaid: target.repaid > 0 ? String(target.repaid) : "",
          date: target.date,
          dueDate: target.dueDate ?? "",
          note: target.note ?? "",
        },
  );

  const amount = parseAmount(form.amount);
  const repaid = form.repaid.trim() === "" ? 0 : parseAmount(form.repaid);
  const problem: string | null = (() => {
    if (!form.name.trim()) return t("receivables.problem.name");
    if (!Number.isFinite(amount) || amount <= 0) return t("receivables.problem.amount");
    if (!Number.isFinite(repaid) || repaid < 0 || repaid > amount) return t("receivables.problem.repaid");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return t("receivables.problem.date");
    return null;
  })();

  const submit = () => {
    if (problem) return;
    const fields = {
      name: form.name.trim(),
      icon: "🤝",
      currency: form.currency,
      amount,
      repaid,
      date: form.date,
      dueDate: form.dueDate || undefined,
      note: form.note.trim() || undefined,
    };
    if (form.id) {
      const id = form.id;
      update((s) => ({ ...s, receivables: s.receivables.map((r) => (r.id === id ? { ...r, ...fields } : r)) }));
    } else {
      update((s) => ({ ...s, receivables: [...s.receivables, { id: uid(), ...fields }] }));
    }
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      onSubmit={submit}
      problem={problem}
      title={form.id ? t("receivables.edit") : t("receivables.new")}
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
      <Field label={t("receivables.name")}>
        <TextInput
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t("receivables.namePlaceholder")}
          maxLength={80}
        />
      </Field>
      <FieldSet label={t("common.currency")}>
        <SegmentedControl
          label={t("common.currency")}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={form.currency}
          onChange={(v) => setForm({ ...form, currency: v })}
        />
      </FieldSet>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("receivables.amount")}>
          <TextInput
            inputMode="decimal"
            prefix={CURRENCY_SYMBOL[form.currency]}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="5 000"
          />
        </Field>
        <Field label={t("receivables.repaid")} hint={t("common.optional")}>
          <TextInput
            inputMode="decimal"
            prefix={CURRENCY_SYMBOL[form.currency]}
            value={form.repaid}
            onChange={(e) => setForm({ ...form, repaid: e.target.value })}
            placeholder="0"
          />
        </Field>
        <Field label={t("receivables.date")}>
          <TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label={t("receivables.due")} hint={t("common.optional")}>
          <TextInput type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </Field>
      </div>
      <Field label={t("common.note")}>
        <TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t("common.optional")} />
      </Field>
      {form.id && Number.isFinite(amount) && repaid < amount && (
        <Button variant="ghost" className="w-full" onClick={() => setForm({ ...form, repaid: form.amount })}>
          {t("receivables.repaidAll")}
        </Button>
      )}
      {form.id && (
        <Button variant="danger" className="w-full" onClick={() => onDelete(form.id!)}>
          {t("receivables.delete")}
        </Button>
      )}
    </Sheet>
  );
}
