"use client";

import { useState } from "react";
import { OptionPicker } from "@/components/forms/option-picker";
import { useAccountGroups, useCategoryGroups } from "@/components/forms/picker-groups";
import {
  Button,
  ConfirmDialog,
  Field,
  FieldSet,
  MonthInput,
  SegmentedControl,
  Sheet,
  TextInput,
} from "@/components/ui";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { currentMonth } from "@/lib/date";
import { categoryTree } from "@/lib/finance/categories";
import { parseAmount } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { deleteSchedule, syncSchedule, uid, useStore } from "@/lib/state/store";
import type { CategoryKind, Currency, RecurringRule } from "@/lib/types";
import { CURRENCY_OPTIONS } from "./shared";

interface RecurringForm {
  id: string | null;
  type: CategoryKind;
  amount: string;
  currency: Currency;
  categoryId: string;
  note: string;
  accountId: string;
  day: string;
  startMonth: string;
  endMonth: string;
}

export function RecurringSheet({ target, onClose }: { target: RecurringRule | "new"; onClose: () => void }) {
  const { state, update } = useStore();
  const { t, tp } = useT();
  const firstCategoryId = (kind: CategoryKind) => categoryTree(state.categories, kind)[0]?.parent.id ?? "";
  const expenseCategoryGroups = useCategoryGroups(state.categories, ["expense"]);
  const incomeCategoryGroups = useCategoryGroups(state.categories, ["income"]);
  const optionalAccountGroups = useAccountGroups(state.savings, [{ value: "", label: t("common.notAssigned") }]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<RecurringForm>(() =>
    target === "new"
      ? {
          id: null,
          type: "expense",
          amount: "",
          currency: state.settings.baseCurrency,
          categoryId: firstCategoryId("expense"),
          note: "",
          accountId: state.savings[0]?.id ?? "",
          day: "1",
          startMonth: currentMonth(),
          endMonth: "",
        }
      : {
          id: target.id,
          type: target.type,
          amount: String(target.amount),
          currency: target.currency,
          categoryId: target.categoryId,
          note: target.note ?? "",
          accountId: target.accountId ?? "",
          day: String(target.dayOfMonth),
          startMonth: target.startMonth,
          endMonth: target.endMonth ?? "",
        },
  );

  const amount = parseAmount(form.amount);
  const day = Number(form.day.trim());
  const valid =
    Number.isFinite(amount) &&
    amount > 0 &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= 31 &&
    form.categoryId !== "" &&
    /^\d{4}-\d{2}$/.test(form.startMonth) &&
    (form.endMonth === "" || form.endMonth >= form.startMonth);
  const problem: string | null = valid
    ? null
    : !Number.isFinite(amount) || amount <= 0
      ? t("problem.amount")
      : !Number.isInteger(day) || day < 1 || day > 31
        ? t("problem.day")
        : form.categoryId === ""
          ? t("problem.category")
          : t("problem.endBeforeStart");
  const posted = form.id ? state.transactions.filter((tx) => tx.recurringId === form.id).length : 0;

  const save = () => {
    if (!valid) return;
    const patch = {
      type: form.type,
      amount,
      currency: form.currency,
      categoryId: form.categoryId,
      note: form.note.trim() || undefined,
      accountId: form.accountId || undefined,
      dayOfMonth: Math.min(31, Math.max(1, day)),
      startMonth: form.startMonth,
      endMonth: form.endMonth || undefined,
    };
    const id = form.id ?? uid();
    update((s) =>
      syncSchedule(
        {
          ...s,
          recurring: form.id ? s.recurring.map((r) => (r.id === id ? { ...r, ...patch } : r)) : [...s.recurring, { id, ...patch }],
        },
        "recurring",
        id,
      ),
    );
    onClose();
  };

  const remove = () => {
    const id = form.id;
    if (!id) return;
    update((s) => deleteSchedule(s, "recurring", id), t("tx.recurring.deleted"));
    onClose();
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        onSubmit={save}
        problem={problem}
        title={form.id ? t("tx.rec.edit") : t("tx.rec.new")}
        footer={
          <>
            {form.id && (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)}>
                {t("common.delete")}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!valid}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        {form.id && (
          <p className="rounded-field bg-ghost px-3 py-2.5 text-xs leading-snug text-ink-2">{t("tx.rec.rewriteNote")}</p>
        )}
        <SegmentedControl
          label={t("tx.kind")}
          options={[
            { value: "expense" as const, label: t("tx.type.expense") },
            { value: "income" as const, label: t("tx.type.income") },
          ]}
          value={form.type}
          onChange={(type) => setForm({ ...form, type, categoryId: firstCategoryId(type) })}
        />
        <Field label={t("common.amount")}>
          <TextInput
            inputMode="decimal"
            placeholder="0"
            prefix={CURRENCY_SYMBOL[form.currency]}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </Field>
        <FieldSet label={t("common.currency")}>
          <SegmentedControl
            label={t("common.currency")}
            options={CURRENCY_OPTIONS}
            value={form.currency}
            onChange={(c) => setForm({ ...form, currency: c })}
          />
        </FieldSet>
        <Field label={t("common.category")}>
          <OptionPicker
            label={t("common.category")}
            value={form.categoryId}
            onChange={(categoryId) => setForm({ ...form, categoryId })}
            groups={form.type === "income" ? incomeCategoryGroups : expenseCategoryGroups}
          />
        </Field>
        <Field label={t("common.note")}>
          <TextInput
            placeholder={t("common.optional")}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
        <Field label={t("common.account")} hint={t("tx.schedule.accountHint")}>
          <OptionPicker
            label={t("common.account")}
            value={form.accountId}
            onChange={(accountId) => setForm({ ...form, accountId })}
            groups={optionalAccountGroups}
          />
        </Field>
        <Field label={t("tx.rec.day")} hint={t("tx.schedule.dayHint")}>
          <TextInput inputMode="numeric" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
        </Field>
        <FieldSet label={t("tx.schedule.from")}>
          <MonthInput
            name={t("tx.schedule.from")}
            value={form.startMonth}
            onChange={(startMonth) => setForm({ ...form, startMonth })}
          />
        </FieldSet>
        <FieldSet label={t("tx.schedule.until")} hint={t("tx.schedule.untilHint")}>
          <MonthInput
            name={t("tx.schedule.until")}
            allowEmpty
            value={form.endMonth}
            onChange={(endMonth) => setForm({ ...form, endMonth })}
          />
        </FieldSet>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t("tx.rec.deleteTitle")}
        message={tp("tx.rec.deleteMessage", posted)}
      />
    </>
  );
}
