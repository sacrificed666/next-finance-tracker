"use client";

import { useState } from "react";
import { OptionPicker } from "@/components/forms/option-picker";
import { useCategoryGroups } from "@/components/forms/picker-groups";
import {
  Button,
  Callout,
  ConfirmDialog,
  Field,
  FieldSet,
  SegmentedControl,
  Select,
  Sheet,
  Switch,
  TextInput,
  TripleMoney,
} from "@/components/ui";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { breakdownTotal } from "@/lib/finance/finmath";
import { formatMoney, formatPercent, parseAmount } from "@/lib/finance/money";
import { profileFromRegime, taxBreakdown, taxRegime, TAX_REGIMES } from "@/lib/finance/tax";
import { useT, type MessageKey } from "@/lib/i18n";
import { uid, useStore } from "@/lib/state/store";
import type { AppState, Currency, IncomeBreakdown, IncomeTax, TaxProfile, TaxRegimeId, Transaction } from "@/lib/types";
import { parseOptional, regimeOfStoredTax } from "./helpers";

type Mode = "amount" | "contract";

interface IncomeForm {
  id: string | null;
  mode: Mode;
  categoryId: string;
  currency: Currency;
  date: string;
  note: string;
  accountId: string;
  taxRegime: TaxRegimeId;
  taxRate: string;
  taxFixed: string;
  taxVat: string;
  taxLabel: string;
  amount: string;
  days: string;
  dailyRate: string;
  premium: string;
  compensations: string;
  cutoffs: string;
}

function blankForm(state: AppState): IncomeForm {
  const { settings } = state;
  return {
    id: null,
    mode: "amount",
    categoryId: state.categories.find((c) => c.kind === "income")?.id ?? "",
    currency: settings.baseCurrency,
    date: todayISO(),
    note: "",
    accountId: state.savings[0]?.id ?? "",
    taxRegime: settings.tax.regime,
    taxRate: String(settings.tax.ratePct),
    taxFixed: String(settings.tax.fixedUAH),
    taxVat: String(settings.tax.vatPct),
    taxLabel: settings.tax.label,
    amount: "",
    days: "",
    dailyRate: "",
    premium: "",
    compensations: "",
    cutoffs: "",
  };
}

function formFor(state: AppState, tx: Transaction): IncomeForm {
  const { settings } = state;
  const b = tx.breakdown;
  return {
    ...blankForm(state),
    id: tx.id,
    mode: b ? "contract" : "amount",
    categoryId: tx.categoryId,
    currency: tx.currency,
    date: tx.date,
    note: tx.note ?? "",
    accountId: tx.accountId ?? "",
    taxRegime: tx.tax ? regimeOfStoredTax(tx.tax) : "none",
    taxRate: tx.tax ? String(tx.tax.ratePct) : String(settings.tax.ratePct),
    taxFixed: tx.tax ? String(tx.tax.fixedUAH) : String(settings.tax.fixedUAH),
    taxVat: tx.tax ? String(tx.tax.vatPct ?? 0) : String(settings.tax.vatPct),
    taxLabel: tx.tax?.label ?? "",
    amount: b ? "" : String(tx.tax ? tx.tax.gross : tx.amount),
    days: b ? String(b.days) : "",
    dailyRate: b ? String(b.dailyRate) : "",
    premium: b?.premium ? String(b.premium) : "",
    compensations: b?.compensations ? String(b.compensations) : "",
    cutoffs: b?.cutoffs ? String(b.cutoffs) : "",
  };
}

function profileOf(f: IncomeForm): TaxProfile | null {
  if (f.taxRegime === "none") return null;
  const r = taxRegime(f.taxRegime);
  if (!r.editable) return profileFromRegime(f.taxRegime);
  return {
    regime: "custom",
    ratePct: parseOptional(f.taxRate),
    fixedUAH: parseOptional(f.taxFixed),
    vatPct: parseOptional(f.taxVat),
    label: f.taxLabel.trim(),
  };
}

export function IncomeSheet({ target, onClose }: { target: Transaction | "new"; onClose: () => void }) {
  const { state, update } = useStore();
  const { t } = useT();
  const { settings } = state;
  const categoryGroups = useCategoryGroups(state.categories, ["income"]);
  const [form, setForm] = useState<IncomeForm>(() =>
    target === "new" ? blankForm(state) : formFor(state, target),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const defaultRegime: TaxRegimeId = settings.tax.regime === "none" ? "fop3" : settings.tax.regime;
  const selectedRegime = taxRegime(form.taxRegime);

  const gross = (() => {
    if (form.mode === "amount") return parseAmount(form.amount);
    const days = parseOptional(form.days);
    const rate = parseOptional(form.dailyRate);
    if (!Number.isFinite(days) || !Number.isFinite(rate)) return NaN;
    return days * rate + parseOptional(form.premium) + parseOptional(form.compensations) - parseOptional(form.cutoffs);
  })();
  const profile = profileOf(form);
  const breakdown = profile && Number.isFinite(gross) ? taxBreakdown(gross, form.currency, profile, settings) : null;
  const net = breakdown ? breakdown.net : gross;

  const problem: string | null = (() => {
    if (!form.categoryId) return t("income.problem.category");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return t("income.problem.date");
    if (form.mode === "contract") {
      const days = parseOptional(form.days);
      if (!Number.isFinite(days) || days < 0 || days > 31) return t("income.problem.days");
      if (
        [form.dailyRate, form.premium, form.compensations, form.cutoffs]
          .map(parseOptional)
          .some((n) => !Number.isFinite(n) || n < 0)
      )
        return t("income.problem.nonNegative");
    }
    if (profile) {
      if (!Number.isFinite(profile.ratePct) || profile.ratePct < 0 || profile.ratePct >= 100)
        return t("income.problem.taxRate");
      if (!Number.isFinite(profile.fixedUAH) || profile.fixedUAH < 0) return t("income.problem.taxFixed");
      if (!Number.isFinite(profile.vatPct) || profile.vatPct < 0 || profile.vatPct >= 100)
        return t("income.problem.taxVat");
    }
    if (!Number.isFinite(gross) || gross <= 0) return t("income.problem.amount");
    if (!Number.isFinite(net) || net <= 0) return t("income.problem.afterTax");
    return null;
  })();
  const valid = problem === null;

  const submit = () => {
    if (!valid) return;
    const contract: IncomeBreakdown | undefined =
      form.mode === "contract"
        ? {
            days: parseOptional(form.days),
            dailyRate: parseOptional(form.dailyRate),
            premium: parseOptional(form.premium),
            compensations: parseOptional(form.compensations),
            cutoffs: parseOptional(form.cutoffs),
          }
        : undefined;

    const grossTotal = contract ? breakdownTotal(contract) : parseAmount(form.amount);
    const p = profileOf(form);
    const txTax: IncomeTax | undefined = p
      ? {
          ratePct: p.ratePct,
          fixedUAH: p.fixedUAH,
          gross: grossTotal,
          regime: p.regime,
          vatPct: p.vatPct || undefined,
          label: p.label || undefined,
        }
      : undefined;
    const netTotal = p ? taxBreakdown(grossTotal, form.currency, p, settings).net : grossTotal;

    const patch = {
      type: "income" as const,
      amount: netTotal,
      currency: form.currency,
      categoryId: form.categoryId,
      date: form.date,
      note: form.note.trim() || undefined,
      accountId: form.accountId || undefined,
      breakdown: contract,
      tax: txTax,
    };

    update((s) => ({
      ...s,
      settings: form.id ? s.settings : { ...s.settings, tax: p ?? profileFromRegime("none", s.settings.tax) },
      transactions: form.id
        ? s.transactions.map((tx) => (tx.id === form.id ? { ...tx, ...patch } : tx))
        : [...s.transactions, { id: uid(), ...patch }],
    }));
    onClose();
  };

  const deleteIncome = () => {
    const id = form.id;
    if (!id) return;
    update((s) => ({ ...s, transactions: s.transactions.filter((tx) => tx.id !== id) }), t("income.deleted"));
    onClose();
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        onSubmit={submit}
        problem={problem}
        title={form.id ? t("income.edit") : t("income.new")}
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
        <SegmentedControl
          label={t("income.mode.label")}
          options={[
            { value: "amount", label: t("income.mode.amount") },
            { value: "contract", label: t("income.mode.contract") },
          ]}
          value={form.mode}
          onChange={(mode) => setForm({ ...form, mode })}
        />
        {form.mode === "contract" && <p className="caption -mt-1">{t("income.mode.contract.hint")}</p>}

        <Field label={t("common.category")}>
          <OptionPicker
            label={t("common.category")}
            value={form.categoryId}
            onChange={(categoryId) => setForm({ ...form, categoryId })}
            groups={categoryGroups}
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

        {form.mode === "amount" ? (
          <Field label={profile ? t("income.grossAmount") : t("common.amount")}>
            <TextInput
              inputMode="decimal"
              prefix={CURRENCY_SYMBOL[form.currency]}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0"
            />
          </Field>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("income.days")}>
                <TextInput
                  inputMode="decimal"
                  value={form.days}
                  onChange={(e) => setForm({ ...form, days: e.target.value })}
                  placeholder="21"
                />
              </Field>
              <Field label={t("income.dailyRate")}>
                <TextInput
                  inputMode="decimal"
                  prefix={CURRENCY_SYMBOL[form.currency]}
                  value={form.dailyRate}
                  onChange={(e) => setForm({ ...form, dailyRate: e.target.value })}
                  placeholder="56"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label={t("income.premium")}>
                <TextInput
                  inputMode="decimal"
                  value={form.premium}
                  onChange={(e) => setForm({ ...form, premium: e.target.value })}
                  placeholder="0"
                />
              </Field>
              <Field label={t("income.compensations")}>
                <TextInput
                  inputMode="decimal"
                  value={form.compensations}
                  onChange={(e) => setForm({ ...form, compensations: e.target.value })}
                  placeholder="0"
                />
              </Field>
              <Field label={t("income.cutoffs")}>
                <TextInput
                  inputMode="decimal"
                  value={form.cutoffs}
                  onChange={(e) => setForm({ ...form, cutoffs: e.target.value })}
                  placeholder="0"
                />
              </Field>
            </div>
          </>
        )}

        <Field label={form.mode === "contract" ? t("income.source") : t("common.note")}>
          <TextInput
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder={form.mode === "contract" ? t("income.source.placeholder") : t("common.optional")}
          />
        </Field>

        <Field label={t("common.date")}>
          <TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>

        <Field
          label={t("income.landedIn")}
          hint={state.savings.length === 0 ? t("income.landedIn.none") : t("income.landedIn.hint")}
        >
          <Select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
            <option value="">{t("common.notAssigned")}</option>
            {state.savings.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name} ({a.currency})
              </option>
            ))}
          </Select>
        </Field>

        <div className="space-y-3 rounded-field bg-ghost px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="body-strong">{t("income.applyTax")}</p>
              <p className="caption mt-0.5">{t("income.applyTax.hint")}</p>
            </div>
            <Switch
              checked={form.taxRegime !== "none"}
              onChange={(v) => setForm({ ...form, taxRegime: v ? defaultRegime : "none" })}
              label={t("income.applyTax")}
            />
          </div>
          {form.taxRegime !== "none" && (
            <>
              <Field label={t("tax.field.regime")} hint={t(selectedRegime.hintKey as MessageKey)}>
                <Select
                  value={form.taxRegime}
                  onChange={(e) => setForm({ ...form, taxRegime: e.target.value as TaxRegimeId })}
                >
                  {TAX_REGIMES.filter((r) => r.id !== "none").map((r) => (
                    <option key={r.id} value={r.id}>
                      {t(r.labelKey as MessageKey)}
                    </option>
                  ))}
                </Select>
              </Field>
              {selectedRegime.editable && (
                <>
                  <Field label={t("tax.field.label")}>
                    <TextInput
                      value={form.taxLabel}
                      maxLength={60}
                      placeholder={t("tax.field.label.placeholder")}
                      onChange={(e) => setForm({ ...form, taxLabel: e.target.value })}
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label={t("tax.field.rate")}>
                      <TextInput
                        inputMode="decimal"
                        value={form.taxRate}
                        onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                        placeholder="6"
                      />
                    </Field>
                    <Field label={t("tax.field.fixed")}>
                      <TextInput
                        inputMode="decimal"
                        prefix="₴"
                        value={form.taxFixed}
                        onChange={(e) => setForm({ ...form, taxFixed: e.target.value })}
                        placeholder="0"
                      />
                    </Field>
                    <Field label={t("tax.field.vat")}>
                      <TextInput
                        inputMode="decimal"
                        value={form.taxVat}
                        onChange={(e) => setForm({ ...form, taxVat: e.target.value })}
                        placeholder="0"
                      />
                    </Field>
                  </div>
                </>
              )}
              {profile && profile.fixedUAH > 0 && <Callout tone="tip">{t("income.fixedPerEntry")}</Callout>}
            </>
          )}
        </div>

        {Number.isFinite(net) && net > 0 && (
          <div className="rounded-field bg-ghost p-4">
            {breakdown && (
              <dl className="mb-3 space-y-1 border-b border-hairline pb-3 text-sm">
                <Line label={t("income.gross")} value={formatMoney(breakdown.gross, form.currency, { exact: true })} />
                {breakdown.vat > 0 && (
                  <Line
                    label={t("income.vat", { pct: formatPercent(profile?.vatPct ?? 0) })}
                    value={`−${formatMoney(breakdown.vat, form.currency, { exact: true })}`}
                    expense
                  />
                )}
                {breakdown.percentPart > 0 && (
                  <Line
                    label={t("income.percentPart", { pct: formatPercent(profile?.ratePct ?? 0) })}
                    value={`−${formatMoney(breakdown.percentPart, form.currency, { exact: true })}`}
                    expense
                  />
                )}
                {breakdown.fixedPart > 0 && (
                  <Line
                    label={t("income.fixedPart")}
                    value={`−${formatMoney(breakdown.fixedPart, form.currency, { exact: true })}`}
                    expense
                  />
                )}
                <Line label={t("income.effectiveRate")} value={formatPercent(breakdown.effectivePct)} />
              </dl>
            )}
            <p className="label mb-1">{breakdown ? t("income.netTakeHome") : t("income.everyCurrency")}</p>
            <TripleMoney amount={net} currency={form.currency} settings={settings} />
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteIncome}
        title={t("income.deleteTitle")}
        message={t("common.deletePermanent")}
      />
    </>
  );
}

function Line({ label, value, expense }: { label: string; value: string; expense?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className={`tnum ${expense ? "text-expense" : "text-ink-1"}`}>{value}</dd>
    </div>
  );
}
