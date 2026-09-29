"use client";

import { useState } from "react";
import { Button, Field, FieldSet, MonthInput, OptionChips, SegmentedControl, Sheet, TextInput } from "@/components/ui";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { parseAmount } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { uid, useStore } from "@/lib/state/store";
import type { Currency, WishItem, WishPriority } from "@/lib/types";

const ICONS = ["🎁", "💻", "📱", "🎮", "🚗", "✈️", "🏠", "🛋️", "📷", "⌚", "🎧", "🚲"];

export function WishSheet({ target, onClose }: { target: WishItem | "new"; onClose: () => void }) {
  const { update } = useStore();
  const { t } = useT();
  const [form, setForm] = useState(() =>
    target === "new"
      ? { name: "", icon: "🎁", price: "", currency: "UAH" as Currency, priority: "normal" as WishPriority, url: "", month: "", note: "" }
      : {
          name: target.name,
          icon: target.icon,
          price: String(target.price),
          currency: target.currency,
          priority: target.priority,
          url: target.url ?? "",
          month: target.month ?? "",
          note: target.note ?? "",
        },
  );
  const price = parseAmount(form.price);
  const problem = !form.name.trim()
    ? t("wish.problem.name")
    : !Number.isFinite(price) || price <= 0
      ? t("wish.problem.price")
      : form.url && !/^https:\/\/\S{3,}$/.test(form.url)
        ? t("wish.problem.url")
        : null;

  const save = () => {
    if (problem) return;
    const fields = {
      name: form.name.trim(),
      icon: form.icon,
      price,
      currency: form.currency,
      priority: form.priority,
      url: form.url.trim() || undefined,
      month: form.month || undefined,
      note: form.note.trim() || undefined,
    };
    update((s) => ({
      ...s,
      wishlist:
        target === "new"
          ? [...s.wishlist, { id: uid(), createdAt: todayISO(), ...fields }]
          : s.wishlist.map((w) => (w.id === target.id ? { ...w, ...fields } : w)),
    }));
    onClose();
  };
  const remove = () => {
    if (target === "new") return;
    update((s) => ({ ...s, wishlist: s.wishlist.filter((w) => w.id !== target.id) }), t("wish.deleted"));
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      onSubmit={save}
      problem={problem}
      title={target === "new" ? t("wish.new") : t("wish.edit")}
      footer={
        <>
          {target !== "new" && (
            <Button variant="danger" className="mr-auto" onClick={remove}>
              {t("common.delete")}
            </Button>
          )}
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
        <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("wish.namePlaceholder")} maxLength={80} />
      </Field>
      <FieldSet label={t("common.icon")}>
        <OptionChips
          label={t("common.icon")}
          options={ICONS.map((i) => ({ value: i, label: i }))}
          value={form.icon}
          onChange={(icon) => setForm({ ...form, icon })}
        />
      </FieldSet>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("wish.price")}>
          <TextInput
            inputMode="decimal"
            prefix={CURRENCY_SYMBOL[form.currency]}
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="0"
          />
        </Field>
        <FieldSet label={t("common.currency")}>
          <SegmentedControl
            label={t("common.currency")}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={form.currency}
            onChange={(currency) => setForm({ ...form, currency })}
          />
        </FieldSet>
      </div>
      <FieldSet label={t("wish.priority")}>
        <SegmentedControl
          label={t("wish.priority")}
          options={(["high", "normal", "low"] as const).map((p) => ({ value: p, label: t(`wish.priority.${p}`) }))}
          value={form.priority}
          onChange={(priority) => setForm({ ...form, priority })}
        />
      </FieldSet>
      <FieldSet label={t("wish.month")} hint={t("wish.month.hint")}>
        <MonthInput name={t("wish.month")} value={form.month} onChange={(month) => setForm({ ...form, month })} allowEmpty />
      </FieldSet>
      <Field label={t("wish.url")} hint={t("common.optional")}>
        <TextInput value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" inputMode="url" />
      </Field>
      <Field label={t("common.note")}>
        <TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t("common.optional")} />
      </Field>
    </Sheet>
  );
}
