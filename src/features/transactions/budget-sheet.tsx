"use client";

import { useState } from "react";
import { OptionPicker } from "@/components/forms/option-picker";
import { useCategoryGroups } from "@/components/forms/picker-groups";
import { Button, ConfirmDialog, Field, FieldSet, SegmentedControl, Sheet, Switch, TextInput } from "@/components/ui";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { parseAmount } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { Budget, Currency } from "@/lib/types";
import { CURRENCY_OPTIONS } from "./shared";

interface BudgetForm {
  editingId: string | null;
  categoryId: string;
  limit: string;
  currency: Currency;
  rollover: boolean;
}

/** A monthly limit for one expense category (and everything under it). */
export function BudgetSheet({ target, onClose }: { target: Budget | "new"; onClose: () => void }) {
  const { state, update } = useStore();
  const { t } = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const expenseCats = state.categories.filter((c) => c.kind === "expense");
  const budgeted = new Set(state.budgets.map((b) => b.categoryId));
  const [form, setForm] = useState<BudgetForm>(() =>
    target === "new"
      ? {
          editingId: null,
          categoryId: expenseCats.find((c) => !budgeted.has(c.id))?.id ?? "",
          limit: "",
          rollover: false,
          currency: state.settings.baseCurrency,
        }
      : {
          editingId: target.categoryId,
          categoryId: target.categoryId,
          limit: String(target.limit),
          currency: target.currency,
          rollover: target.rollover === true,
        },
  );
  const options = expenseCats.filter((c) => !budgeted.has(c.id) || c.id === form.editingId);
  const categoryGroups = useCategoryGroups(options, ["expense"]);

  const limit = parseAmount(form.limit);
  const valid = Number.isFinite(limit) && limit > 0 && form.categoryId !== "";
  const problem = valid ? null : form.categoryId === "" ? t("problem.category") : t("tx.budget.problem.limit");

  const save = () => {
    if (!valid) return;
    const entry: Budget = { categoryId: form.categoryId, limit, currency: form.currency, rollover: form.rollover || undefined };
    update((s) => ({
      ...s,
      budgets: [...s.budgets.filter((b) => b.categoryId !== form.editingId && b.categoryId !== form.categoryId), entry],
    }));
    onClose();
  };

  const remove = () => {
    const id = form.editingId;
    if (!id) return;
    update((s) => ({ ...s, budgets: s.budgets.filter((b) => b.categoryId !== id) }), t("tx.budget.deleted"));
    onClose();
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        onSubmit={save}
        problem={problem}
        title={form.editingId ? t("tx.budget.edit") : t("tx.budget.new")}
        footer={
          <>
            {form.editingId && (
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
        <Field label={t("tx.budget.category")} hint={t("tx.budget.category.hint")}>
          <OptionPicker
            label={t("tx.budget.category")}
            value={form.categoryId}
            onChange={(categoryId) => setForm({ ...form, categoryId })}
            groups={categoryGroups}
          />
        </Field>
        <Field label={t("tx.budget.limit")}>
          <TextInput
            inputMode="decimal"
            placeholder="0"
            prefix={CURRENCY_SYMBOL[form.currency]}
            value={form.limit}
            onChange={(e) => setForm({ ...form, limit: e.target.value })}
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
        <div className="flex items-start justify-between gap-3 rounded-field bg-ghost p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-1">{t("tx.budget.rollover")}</p>
            <p className="caption">{t("tx.budget.rollover.hint")}</p>
          </div>
          <Switch checked={form.rollover} onChange={(rollover) => setForm({ ...form, rollover })} label={t("tx.budget.rollover")} />
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t("tx.budget.deleteTitle")}
        message={t("tx.budget.deleteMessage")}
      />
    </>
  );
}
