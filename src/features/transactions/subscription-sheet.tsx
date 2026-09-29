"use client";

import { useState } from "react";
import { OptionPicker } from "@/components/forms/option-picker";
import { useAccountGroups } from "@/components/forms/picker-groups";
import {
  Button,
  Callout,
  ConfirmDialog,
  Field,
  FieldSet,
  Icon,
  MonthInput,
  OptionChips,
  SegmentedControl,
  Sheet,
  TextInput,
} from "@/components/ui";
import { CURRENCY_SYMBOL, ICON_CHOICES } from "@/lib/constants";
import { currentMonth, formatMonth } from "@/lib/date";
import { formatMoney, parseAmount } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { deleteSchedule, remateralizeRecurring, syncSchedule, uid, useStore } from "@/lib/state/store";
import type { Currency, Subscription, SubscriptionPeriod } from "@/lib/types";
import { CURRENCY_OPTIONS } from "./shared";

interface SubscriptionForm {
  id: string | null;
  name: string;
  icon: string;
  price: string;
  currency: Currency;
  period: SubscriptionPeriod;
  accountId: string;
  day: string;
  startMonth: string;
  endMonth: string;
}

export function SubscriptionSheet({
  target,
  draft,
  onClose,
}: {
  target: Subscription | "new";
  draft?: { name: string; price: number; currency: Subscription["currency"]; dayOfMonth: number; startMonth: string; accountId?: string };
  onClose: () => void;
}) {
  const { state, update } = useStore();
  const { t, tp } = useT();
  const nowMonth = currentMonth();
  const optionalAccountGroups = useAccountGroups(state.savings, [{ value: "", label: t("common.notAssigned") }]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<SubscriptionForm>(() =>
    target === "new"
      ? {
          id: null,
          name: draft?.name ?? "",
          icon: "📱",
          price: draft ? String(draft.price) : "",
          currency: draft?.currency ?? "UAH",
          period: "monthly",
          accountId: draft?.accountId ?? state.savings[0]?.id ?? "",
          day: draft ? String(draft.dayOfMonth) : "1",
          startMonth: draft?.startMonth ?? nowMonth,
          endMonth: "",
        }
      : {
          id: target.id,
          name: target.name,
          icon: target.icon,
          price: String(target.price),
          currency: target.currency,
          period: target.period,
          accountId: target.accountId ?? "",
          day: String(target.dayOfMonth),
          startMonth: target.startMonth,
          endMonth: target.endMonth ?? "",
        },
  );

  const price = parseAmount(form.price);
  const day = Number(form.day.trim());
  const valid =
    form.name.trim() !== "" &&
    Number.isFinite(price) &&
    price > 0 &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= 31 &&
    /^\d{4}-\d{2}$/.test(form.startMonth) &&
    (form.endMonth === "" || form.endMonth >= form.startMonth);
  const problem: string | null = valid
    ? null
    : form.name.trim() === ""
      ? t("tx.subs.problem.name")
      : !Number.isFinite(price) || price <= 0
        ? t("tx.subs.problem.price")
        : !Number.isInteger(day) || day < 1 || day > 31
          ? t("problem.day")
          : t("problem.endBeforeStart");

  const editing = form.id ? state.subscriptions.find((s) => s.id === form.id) : undefined;
  const posted = form.id ? state.transactions.filter((tx) => tx.subscriptionId === form.id).length : 0;

  const save = () => {
    if (!valid) return;
    const patch = {
      name: form.name.trim(),
      icon: form.icon,
      price,
      currency: form.currency,
      period: form.period,
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
          subscriptions: form.id
            ? s.subscriptions.map((sub) => (sub.id === id ? { ...sub, ...patch } : sub))
            : [...s.subscriptions, { id, ...patch, active: true }],
        },
        "subscription",
        id,
      ),
    );
    onClose();
  };

  const resume = () => {
    const id = form.id;
    if (!id) return;
    update(
      (s) =>
        remateralizeRecurring({
          ...s,
          subscriptions: s.subscriptions.map((sub) => (sub.id === id ? { ...sub, active: true } : sub)),
        }),
      t("tx.subs.resumed"),
    );
  };

  const remove = () => {
    const id = form.id;
    if (!id) return;
    update((s) => deleteSchedule(s, "subscription", id), t("tx.subs.deleted"));
    onClose();
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        onSubmit={save}
        problem={problem}
        title={form.id ? t("tx.subs.edit") : t("tx.subs.new")}
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
        {editing && !editing.active && (
          <Callout tone="warning" title={t("tx.subs.pausedTitle")}>
            <p>{t("tx.subs.pausedNote")}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={resume}>
              <Icon name="refresh" size={14} />
              {t("tx.subs.resume")}
            </Button>
          </Callout>
        )}
        {form.id && (
          <p className="rounded-field bg-ghost px-3 py-2.5 text-xs leading-snug text-ink-2">{t("tx.subs.rewriteNote")}</p>
        )}
        <Field label={t("common.name")}>
          <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="YouTube Premium" />
        </Field>
        <FieldSet label={t("common.icon")}>
          <OptionChips
            label={t("common.icon")}
            size="lg"
            options={ICON_CHOICES.map((icon) => ({ value: icon, label: icon }))}
            value={form.icon}
            onChange={(icon) => setForm({ ...form, icon })}
          />
        </FieldSet>
        <FieldSet label={t("tx.subs.period")}>
          <SegmentedControl
            label={t("tx.subs.period")}
            options={[
              { value: "monthly" as const, label: t("tx.subs.period.monthly") },
              { value: "yearly" as const, label: t("tx.subs.period.yearly") },
            ]}
            value={form.period}
            onChange={(p) => setForm({ ...form, period: p })}
          />
        </FieldSet>
        <Field
          label={form.period === "yearly" ? t("tx.subs.pricePerYear") : t("tx.subs.pricePerMonth")}
          hint={
            form.period === "yearly" && Number.isFinite(price) && price > 0
              ? t("tx.subs.postedAs", { amount: formatMoney(price / 12, form.currency, { exact: true }) })
              : undefined
          }
        >
          <TextInput
            inputMode="decimal"
            prefix={CURRENCY_SYMBOL[form.currency]}
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder={form.period === "yearly" ? "1188" : "99"}
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
        <Field label={t("common.account")} hint={t("tx.schedule.accountHint")}>
          <OptionPicker
            label={t("common.account")}
            value={form.accountId}
            onChange={(accountId) => setForm({ ...form, accountId })}
            groups={optionalAccountGroups}
          />
        </Field>
        <Field label={t("tx.subs.chargeDay")} hint={t("tx.schedule.dayHint")}>
          <TextInput inputMode="numeric" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
        </Field>
        <FieldSet label={t("tx.subs.billingFrom")} hint={t("tx.subs.billingFrom.hint")}>
          <MonthInput
            name={t("tx.subs.billingFrom")}
            value={form.startMonth}
            onChange={(startMonth) => setForm({ ...form, startMonth })}
          />
        </FieldSet>
        <FieldSet label={t("tx.schedule.until")} hint={t("tx.subs.until.hint")}>
          <MonthInput
            name={t("tx.schedule.until")}
            allowEmpty
            value={form.endMonth}
            onChange={(endMonth) => setForm({ ...form, endMonth })}
          />
          {form.id && form.startMonth <= nowMonth && form.endMonth !== nowMonth && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setForm({ ...form, endMonth: nowMonth })}>
              <Icon name="close" size={13} strokeWidth={2.4} />
              {t("tx.subs.endThisMonth", { month: formatMonth(nowMonth) })}
            </Button>
          )}
        </FieldSet>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t("tx.subs.deleteTitle")}
        message={tp("tx.subs.deleteMessage", posted)}
      />
    </>
  );
}
