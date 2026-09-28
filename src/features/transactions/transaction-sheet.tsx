"use client";

import { useState } from "react";
import { OptionPicker } from "@/components/forms/option-picker";
import { useAccountGroups, useCategoryGroups } from "@/components/forms/picker-groups";
import { ReceiptPhotos } from "@/components/forms/receipt-photos";
import { TagInput } from "@/components/forms/tag-input";
import { Button, ConfirmDialog, Field, FieldSet, Icon, SegmentedControl, Sheet, TextInput } from "@/components/ui";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { currentMonth, dateInMonth, todayISO } from "@/lib/date";
import { categoryTree } from "@/lib/finance/categories";
import { convert, formatMoney, parseAmount } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { uid, useStore } from "@/lib/state/store";
import type { AppState, CategoryKind, Currency, Transaction, TxType } from "@/lib/types";
import { CURRENCY_OPTIONS } from "./shared";

interface TxForm {
  id: string | null;
  type: TxType;
  amount: string;
  currency: Currency;
  categoryId: string;
  date: string;
  note: string;
  accountId: string;
  toAccountId: string;
  toAmount: string;
  tags: string[];
  attachmentIds: string[];
  /** Extra pieces of the same purchase, each with its own category. */
  splits: Array<{ key: string; categoryId: string; amount: string }>;
}

const firstCategoryId = (state: AppState, kind: CategoryKind) =>
  categoryTree(state.categories, kind)[0]?.parent.id ?? "";

function initialForm(
  state: AppState,
  target: Transaction | "new",
  month: string,
  date?: string,
  asked: TxType = "expense",
): TxForm {
  if (target === "new") {
    // A transfer needs two accounts to move money between.
    const type = asked === "transfer" && state.savings.length < 2 ? "expense" : asked;
    return {
      id: null,
      type,
      amount: "",
      currency: state.settings.baseCurrency,
      categoryId: type === "transfer" ? "" : firstCategoryId(state, type),
      date: date ?? (month === currentMonth() ? todayISO() : dateInMonth(month, 1)),
      note: "",
      accountId: state.savings[0]?.id ?? "",
      toAccountId: state.savings[1]?.id ?? "",
      toAmount: "",
      tags: [],
      attachmentIds: [],
      splits: [],
    };
  }
  return {
    id: target.id,
    type: target.type,
    amount: String(target.amount),
    currency: target.currency,
    categoryId: target.categoryId,
    date: target.date,
    note: target.note ?? "",
    accountId: target.accountId ?? "",
    toAccountId: target.toAccountId ?? "",
    toAmount: target.toAmount != null ? String(target.toAmount) : "",
    tags: target.tags ?? [],
    attachmentIds: target.attachmentIds ?? [],
    splits: [],
  };
}

/** Tags used so far, most frequent first — offered as one-tap suggestions. */
function knownTags(state: AppState): string[] {
  const counts = new Map<string, number>();
  for (const tx of state.transactions) for (const tag of tx.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}

/** Add or edit one expense, income or transfer between accounts. */
export function TransactionSheet({
  target,
  month,
  date,
  type,
  onClose,
}: {
  target: Transaction | "new";
  month: string;
  /** A new entry's day, when it is added from a particular day (the calendar). */
  date?: string;
  /** A new entry's type, when the way in already says it (an install shortcut, the command palette). */
  type?: TxType;
  onClose: () => void;
}) {
  const { state, update } = useStore();
  const { t, category } = useT();
  const { settings } = state;
  const [form, setForm] = useState<TxForm>(() => initialForm(state, target, month, date, type));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const expenseCategoryGroups = useCategoryGroups(state.categories, ["expense"]);
  const incomeCategoryGroups = useCategoryGroups(state.categories, ["income"]);
  const accountGroups = useAccountGroups(state.savings);
  const optionalAccountGroups = useAccountGroups(state.savings, [{ value: "", label: t("common.notAssigned") }]);
  const accountById = new Map(state.savings.map((a) => [a.id, a]));

  const switchType = (f: TxForm, type: TxType): TxForm =>
    type === "transfer"
      ? {
          ...f,
          type,
          categoryId: "",
          accountId: f.accountId || state.savings[0]?.id || "",
          toAccountId:
            f.toAccountId || state.savings.find((a) => a.id !== (f.accountId || state.savings[0]?.id))?.id || "",
        }
      : { ...f, type, categoryId: firstCategoryId(state, type) };

  const canTransfer = state.savings.length >= 2;
  const typeOptions: Array<{ value: TxType; label: string }> = [
    { value: "expense", label: t("tx.type.expense") },
    { value: "income", label: t("tx.type.income") },
    ...(canTransfer ? [{ value: "transfer" as const, label: t("tx.type.transfer") }] : []),
  ];

  const fromAccount = accountById.get(form.accountId);
  const toAccount = accountById.get(form.toAccountId);
  const crossCurrency =
    form.type === "transfer" && fromAccount != null && toAccount != null && fromAccount.currency !== toAccount.currency;
  const amount = parseAmount(form.amount);
  const toAmount = parseAmount(form.toAmount);

  const impliedRate =
    crossCurrency && fromAccount && toAccount && Number.isFinite(amount) && amount > 0
      ? formatMoney(convert(amount, fromAccount.currency, toAccount.currency, settings.rates) / amount, toAccount.currency, {
          exact: true,
        })
      : null;

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(form.date);
  // A split keeps the main entry and carves pieces off it; the rest stays in the main category.
  const scheduled = target !== "new" && (target.recurringId !== undefined || target.subscriptionId !== undefined);
  const canSplit = form.type !== "transfer" && !scheduled;
  const splitAmounts = form.splits.map((sp) => parseAmount(sp.amount));
  const splitTotal = splitAmounts.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  const rest = amount - splitTotal;
  const splitsValid =
    form.splits.length === 0 ||
    (splitAmounts.every((v) => Number.isFinite(v) && v > 0) && form.splits.every((sp) => sp.categoryId !== "") && rest > 0);
  const siblings =
    target !== "new" && target.splitId ? state.transactions.filter((tx) => tx.splitId === target.splitId) : [];
  const valid =
    splitsValid &&
    Number.isFinite(amount) &&
    amount > 0 &&
    validDate &&
    (form.type === "transfer"
      ? form.accountId !== "" &&
        form.toAccountId !== "" &&
        form.accountId !== form.toAccountId &&
        (!crossCurrency || (Number.isFinite(toAmount) && toAmount > 0))
      : form.categoryId !== "");

  const problem: string | null = (() => {
    if (valid) return null;
    if (!Number.isFinite(amount) || amount <= 0) return t("problem.amount");
    if (!splitsValid) return t("tx.split.problem");
    if (!validDate) return t("problem.date");
    if (form.type !== "transfer") return t("problem.category");
    if (form.accountId === "" || form.toAccountId === "") return t("tx.problem.bothAccounts");
    if (form.accountId === form.toAccountId) return t("tx.problem.sameAccount");
    return t("tx.problem.arrived", { name: toAccount?.name ?? t("tx.destination") });
  })();

  const save = () => {
    if (!valid) return;
    const patch: Omit<Transaction, "id"> =
      form.type === "transfer"
        ? {
            type: "transfer",
            amount,
            currency: fromAccount?.currency ?? form.currency,
            categoryId: "",
            date: form.date,
            note: form.note.trim() || undefined,
            accountId: form.accountId,
            toAccountId: form.toAccountId,
            toAmount: crossCurrency ? toAmount : amount,
          }
        : {
            type: form.type,
            amount: form.splits.length > 0 ? rest : amount,
            currency: form.currency,
            categoryId: form.categoryId,
            date: form.date,
            note: form.note.trim() || undefined,
            accountId: form.accountId || undefined,
          };
    const shared = {
      tags: form.tags.length > 0 ? form.tags : undefined,
      attachmentIds: form.attachmentIds.length > 0 ? form.attachmentIds : undefined,
    };
    const splitId = form.splits.length > 0 ? ((target !== "new" && target.splitId) || uid()) : target !== "new" ? target.splitId : undefined;
    const pieces: Transaction[] = form.splits.map((sp, i) => ({
      ...(patch as Transaction),
      id: uid(),
      amount: splitAmounts[i],
      categoryId: sp.categoryId,
      tags: shared.tags,
      splitId,
    }));
    update((s) => ({
      ...s,
      transactions: [
        ...(form.id
          ? s.transactions.map((tx) =>
              tx.id === form.id
                ? {
                    id: tx.id,
                    recurringId: tx.recurringId,
                    subscriptionId: tx.subscriptionId,
                    externalId: tx.externalId,
                    ...patch,
                    ...shared,
                    splitId,
                  }
                : tx,
            )
          : [...s.transactions, { id: uid(), ...patch, ...shared, splitId }]),
        ...pieces,
      ],
    }));
    onClose();
  };

  const remove = () => {
    const id = form.id;
    if (!id) return;
    update((s) => ({ ...s, transactions: s.transactions.filter((tx) => tx.id !== id) }), t("tx.deleted"));
    onClose();
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        onSubmit={save}
        problem={problem}
        title={form.id ? t("tx.edit") : t("tx.new")}
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
        <SegmentedControl label={t("tx.kind")} options={typeOptions} value={form.type} onChange={(type) => setForm(switchType(form, type))} />
        {!canTransfer && <p className="caption -mt-1">{t("tx.transferNeedsTwo")}</p>}

        {form.type === "transfer" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("tx.fromAccount")}>
                <OptionPicker
                  label={t("tx.fromAccount")}
                  value={form.accountId}
                  onChange={(accountId) =>
                    setForm({ ...form, accountId, currency: accountById.get(accountId)?.currency ?? form.currency })
                  }
                  groups={accountGroups}
                />
              </Field>
              <Field label={t("tx.toAccount")}>
                <OptionPicker
                  label={t("tx.toAccount")}
                  value={form.toAccountId}
                  onChange={(toAccountId) => setForm({ ...form, toAccountId })}
                  groups={accountGroups}
                />
              </Field>
            </div>
            <Field label={fromAccount ? t("tx.amountSentIn", { currency: fromAccount.currency }) : t("tx.amountSent")}>
              <TextInput
                inputMode="decimal"
                placeholder="0"
                prefix={CURRENCY_SYMBOL[fromAccount?.currency ?? form.currency]}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            {crossCurrency && (
              <Field
                label={t("tx.amountReceived", { currency: toAccount?.currency ?? "" })}
                hint={impliedRate ? t("tx.impliedRate", { rate: impliedRate }) : undefined}
              >
                <TextInput
                  inputMode="decimal"
                  placeholder="0"
                  prefix={toAccount ? CURRENCY_SYMBOL[toAccount.currency] : undefined}
                  value={form.toAmount}
                  onChange={(e) => setForm({ ...form, toAmount: e.target.value })}
                />
              </Field>
            )}
          </>
        ) : (
          <>
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
            {canSplit && (
              <FieldSet
                label={t("tx.split")}
                hint={
                  form.splits.length > 0 && Number.isFinite(rest)
                    ? t("tx.split.rest", {
                        amount: formatMoney(Math.max(0, rest), form.currency),
                        category: category(state.categories.find((c) => c.id === form.categoryId)),
                      })
                    : siblings.length > 1
                      ? t("tx.split.partOf", {
                          n: siblings.length,
                          total: formatMoney(
                            siblings.reduce((sum, tx) => sum + convert(tx.amount, tx.currency, form.currency, settings.rates), 0),
                            form.currency,
                          ),
                        })
                      : undefined
                }
              >
                <div className="space-y-2">
                  {form.splits.map((sp, i) => (
                    <div key={sp.key} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2">
                      <OptionPicker
                        size="sm"
                        label={t("common.category")}
                        value={sp.categoryId}
                        onChange={(categoryId) =>
                          setForm({ ...form, splits: form.splits.map((x, j) => (j === i ? { ...x, categoryId } : x)) })
                        }
                        groups={form.type === "income" ? incomeCategoryGroups : expenseCategoryGroups}
                      />
                      <TextInput
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={t("common.amount")}
                        value={sp.amount}
                        onChange={(e) =>
                          setForm({ ...form, splits: form.splits.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })
                        }
                      />
                      <button
                        type="button"
                        aria-label={t("tx.split.remove")}
                        onClick={() => setForm({ ...form, splits: form.splits.filter((_, j) => j !== i) })}
                        className="icon-btn size-9 text-ink-3"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm({ ...form, splits: [...form.splits, { key: uid(), categoryId: "", amount: "" }] })
                    }
                  >
                    <Icon name="plus" size={14} />
                    {t("tx.split.add")}
                  </Button>
                </div>
              </FieldSet>
            )}
            <Field label={t("common.account")} hint={state.savings.length === 0 ? t("tx.account.none") : t("tx.account.hint")}>
              <OptionPicker
                label={t("common.account")}
                value={form.accountId}
                onChange={(accountId) => setForm({ ...form, accountId })}
                groups={optionalAccountGroups}
              />
            </Field>
          </>
        )}

        <Field label={t("common.date")}>
          <TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label={t("common.note")}>
          <TextInput
            placeholder={t("common.optional")}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
        <FieldSet label={t("tx.tags")} hint={t("tx.tags.hint")}>
          <TagInput
            value={form.tags}
            onChange={(tags) => setForm({ ...form, tags })}
            suggestions={knownTags(state)}
            placeholder={t("tx.tags.placeholder")}
            removeLabel={(tag) => t("tx.tags.remove", { tag })}
          />
        </FieldSet>
        {form.type !== "transfer" && (
          <FieldSet label={t("tx.receipt")}>
            <ReceiptPhotos
              value={form.attachmentIds}
              onChange={(attachmentIds) => setForm({ ...form, attachmentIds })}
              labels={{
                add: t("tx.receipt.add"),
                remove: t("tx.receipt.remove"),
                open: t("tx.receipt.open"),
                uploading: t("tx.receipt.uploading"),
                failed: t("tx.receipt.failed"),
              }}
            />
          </FieldSet>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t("tx.deleteTitle")}
        message={t("common.deletePermanent")}
      />
    </>
  );
}
