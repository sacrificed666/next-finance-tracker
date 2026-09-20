"use client";

import { useState } from "react";
import {
  CategoryBreakdown,
  MonthlyColumns,
  PeriodTabs,
  StatTile,
  type BreakdownSegment,
} from "@/components/charts";
import {
  AddButton,
  Button,
  Callout,
  ConfirmDialog,
  EmptyState,
  Field,
  FieldSet,
  GlassCard,
  IconDisc,
  PageHeader,
  ProgressMeter,
  SearchInput,
  SegmentedControl,
  Select,
  Sheet,
  SortSelect,
  Switch,
  TextInput,
  Toolbar,
  ToolbarSlot,
  TripleMoney,
} from "@/components/ui";
import { descendantsOf, useCategoryGroups } from "@/components/category-select";
import { OptionPicker } from "@/components/picker";
import { Icon } from "@/components/icons";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/constants";
import {
  addMonths,
  currentMonth,
  formatDateShort,
  formatMonth,
  formatMonthShort,
  monthOf,
  todayISO,
} from "@/lib/date";
import {
  breakdownTotal,
  incomeByCategory,
  monthlySeries,
  rollupToParents,
  taxPaid,
} from "@/lib/finmath";
import { convert, formatMoney, formatPercent, parseAmount } from "@/lib/money";
import { uid, useStore } from "@/lib/store";
import { useT, type MessageKey } from "@/lib/i18n";
import { matchesQuery, oneOf, sortItems, usePersistentState } from "@/lib/listing";
import {
  profileFromRegime,
  regimeAnnualHeadroom,
  taxBreakdown,
  taxRegime,
  TAX_REGIMES,
} from "@/lib/tax";
import type {
  Currency,
  IncomeBreakdown,
  IncomeTax,
  TaxProfile,
  TaxRegimeId,
  Transaction,
} from "@/lib/types";

type Mode = "amount" | "contract";
type SortKey = "date" | "amount";

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

function parseOptional(input: string): number {
  if (input.trim() === "") return 0;
  return parseAmount(input);
}

function breakdownSummary(b: IncomeBreakdown, currency: Currency, dayUnit: string): string {
  const parts = [`${b.days}${dayUnit} × ${formatMoney(b.dailyRate, currency, { exact: true })}`];
  if (b.premium) parts.push(`+${formatMoney(b.premium, currency)}`);
  if (b.compensations) parts.push(`+${formatMoney(b.compensations, currency)}`);
  if (b.cutoffs) parts.push(`−${formatMoney(b.cutoffs, currency)}`);
  return parts.join("  ");
}

function regimeOfStoredTax(tax: IncomeTax): TaxRegimeId {
  if (tax.regime && tax.regime !== "custom") {
    const r = taxRegime(tax.regime);
    const same =
      Math.abs(r.ratePct - tax.ratePct) < 1e-9 &&
      Math.abs(r.fixedUAH - tax.fixedUAH) < 1e-6 &&
      Math.abs(r.vatPct - (tax.vatPct ?? 0)) < 1e-9;
    if (same) return tax.regime;
  }
  return "custom";
}

export function IncomePage() {
  const { state, update } = useStore();
  const { t, tp, category } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const nowMonth = currentMonth();

  const incomeCategories = state.categories.filter((c) => c.kind === "income");
  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const accountById = new Map(state.savings.map((a) => [a.id, a]));
  const firstIncomeCat = incomeCategories[0]?.id ?? "";

  const [form, setForm] = useState<IncomeForm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortKey, setSortKey] = usePersistentState<SortKey>("income.sort", "date", oneOf(["date", "amount"] as const));
  const [sortDir, setSortDir] = usePersistentState<"asc" | "desc">("income.dir", "desc", oneOf(["asc", "desc"] as const));

  const categoryGroups = useCategoryGroups(state.categories, ["income"]);
  const filterCategoryGroups = useCategoryGroups(state.categories, ["income"], [
    { value: "", label: t("filter.allCategories") },
  ]);

  const incomeTx = state.transactions.filter((tx) => tx.type === "income");
  const today = todayISO();
  const plannedCount = incomeTx.filter((tx) => tx.date > today).length;
  const [scope, setScope] = useState<"received" | "planned" | "all">("received");
  const inCategory = categoryFilter ? descendantsOf(state.categories, categoryFilter) : null;
  const visibleTx = incomeTx.filter((tx) => {
    if (scope === "planned" ? tx.date <= today : scope === "received" ? tx.date > today : false) return false;
    if (inCategory && !inCategory.has(tx.categoryId)) return false;
    const cat = catById.get(tx.categoryId);
    const account = tx.accountId ? accountById.get(tx.accountId) : undefined;
    return matchesQuery(query, tx.note, cat ? category(cat) : undefined, account?.name, tx.tax?.label);
  });
  const filtering = query.trim() !== "" || categoryFilter !== "";

  const byMonth = new Map<string, Transaction[]>();
  for (const tx of visibleTx) {
    const m = monthOf(tx.date);
    const list = byMonth.get(m);
    if (list) list.push(tx);
    else byMonth.set(m, [tx]);
  }
  const months = sortItems([...byMonth.keys()], (m) => m, sortDir);
  const flatByAmount = sortItems(
    visibleTx,
    (tx) => convert(tx.amount, tx.currency, base, settings.rates),
    sortDir,
  );

  const series = monthlySeries(state.transactions, nowMonth, 12, settings);
  const [chartMonths, setChartMonths] = useState(12);
  const chartSeries = monthlySeries(state.transactions, nowMonth, chartMonths, settings);
  const thisMonth = series[series.length - 1].income;
  const withIncome = series.filter((m) => m.income > 0).slice(-6);
  const avg6 = withIncome.reduce((s, m) => s + m.income, 0) / Math.max(1, withIncome.length);
  const ytdMonths = series.filter((m) => m.month.slice(0, 4) === nowMonth.slice(0, 4));
  const ytd = ytdMonths.reduce((s, m) => s + m.income, 0);
  const monthsSoFar = Math.max(1, ytdMonths.length);
  const bestMonth = series.reduce<(typeof series)[number] | null>(
    (best, m) => (m.income > 0 && (!best || m.income > best.income) ? m : best),
    null,
  );

  const trailingStart = addMonths(nowMonth, -11);
  const byCategory = rollupToParents(
    incomeByCategory(state.transactions, trailingStart, nowMonth, settings),
    state.categories,
  );
  const last12Total = [...byCategory.values()].reduce((s, v) => s + v, 0);
  const catSegments: BreakdownSegment[] = [...byCategory.entries()].map(([categoryId, value]) => {
    const cat = catById.get(categoryId);
    return {
      id: categoryId,
      label: category(cat),
      icon: cat?.icon ?? "💰",
      value,
      colorSlot: cat?.colorSlot ?? 3,
    };
  });

  const byCurrency = CURRENCIES.map((currency) => {
    const rows = incomeTx.filter(
      (tx) => tx.currency === currency && tx.date <= today && monthOf(tx.date) >= trailingStart,
    );
    const native = rows.reduce((sum, tx) => sum + tx.amount, 0);
    return {
      currency,
      native,
      base: convert(native, currency, base, settings.rates),
      count: rows.length,
    };
  }).filter((c) => c.native > 0);
  const byCurrencyTotal = byCurrency.reduce((s, c) => s + c.base, 0);

  const yearStart = `${nowMonth.slice(0, 4)}-01`;
  const tax = taxPaid(state.transactions, yearStart, nowMonth, settings);

  const defaultRegime: TaxRegimeId =
    settings.tax.regime === "none" ? "fop3" : settings.tax.regime;

  const grossByRegime = new Map<TaxRegimeId, number>();
  for (const tx of incomeTx) {
    if (!tx.tax || tx.date > today || monthOf(tx.date) < yearStart) continue;
    const regime: TaxRegimeId = tx.tax.regime ?? "custom";
    const gross = convert(tx.tax.gross, tx.currency, "UAH", settings.rates);
    grossByRegime.set(regime, (grossByRegime.get(regime) ?? 0) + gross);
  }
  const limits = [...grossByRegime.entries()]
    .map(([regime, gross]) => ({ regime, headroom: regimeAnnualHeadroom(regime, gross) }))
    .filter((row): row is { regime: TaxRegimeId; headroom: NonNullable<typeof row.headroom> } => row.headroom !== null)
    .sort((a, b) => b.headroom.pct - a.headroom.pct);

  const blankForm = (): IncomeForm => ({
    id: null,
    mode: "amount",
    categoryId: firstIncomeCat,
    currency: base,
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
  });

  const openAdd = () => setForm(blankForm());

  const openEdit = (tx: Transaction) => {
    const b = tx.breakdown;
    const amountField = b ? "" : String(tx.tax ? tx.tax.gross : tx.amount);
    setForm({
      ...blankForm(),
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
      amount: amountField,
      days: b ? String(b.days) : "",
      dailyRate: b ? String(b.dailyRate) : "",
      premium: b?.premium ? String(b.premium) : "",
      compensations: b?.compensations ? String(b.compensations) : "",
      cutoffs: b?.cutoffs ? String(b.cutoffs) : "",
    });
  };

  const closeSheet = () => setForm(null);

  const profileOf = (f: IncomeForm): TaxProfile | null => {
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
  };

  const gross = (() => {
    if (!form) return NaN;
    if (form.mode === "amount") return parseAmount(form.amount);
    const days = parseOptional(form.days);
    const rate = parseOptional(form.dailyRate);
    if (!Number.isFinite(days) || !Number.isFinite(rate)) return NaN;
    return (
      days * rate +
      parseOptional(form.premium) +
      parseOptional(form.compensations) -
      parseOptional(form.cutoffs)
    );
  })();
  const profile = form ? profileOf(form) : null;
  const breakdown =
    form && profile && Number.isFinite(gross)
      ? taxBreakdown(gross, form.currency, profile, settings)
      : null;
  const net = breakdown ? breakdown.net : gross;

  const problem: string | null = (() => {
    if (!form) return null;
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
      if (!Number.isFinite(profile.fixedUAH) || profile.fixedUAH < 0)
        return t("income.problem.taxFixed");
      if (!Number.isFinite(profile.vatPct) || profile.vatPct < 0 || profile.vatPct >= 100)
        return t("income.problem.taxVat");
    }
    if (!Number.isFinite(gross) || gross <= 0) return t("income.problem.amount");
    if (!Number.isFinite(net) || net <= 0) return t("income.problem.afterTax");
    return null;
  })();
  const valid = form !== null && problem === null;

  const submit = () => {
    if (!form || !valid) return;

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
    closeSheet();
  };

  const deleteIncome = () => {
    const id = form?.id;
    if (!id) return;
    update(
      (s) => ({
        ...s,
        transactions: s.transactions.filter((tx) => tx.id !== id),
      }),
      t("income.deleted"),
    );
    closeSheet();
  };

  const hasIncome = incomeTx.length > 0;
  const addButton = <AddButton variant="primary" onClick={openAdd} label={t("income.add")} />;

  const taxLabelOf = (txTax: IncomeTax) =>
    txTax.label || (txTax.regime ? t(taxRegime(txTax.regime).shortKey as MessageKey) : t("income.tax"));

  const renderRow = (tx: Transaction) => {
    const cat = catById.get(tx.categoryId);
    const account = tx.accountId ? accountById.get(tx.accountId) : undefined;
    const details = [
      tx.note ? category(cat) : null,
      account?.name ?? null,
      tx.breakdown ? breakdownSummary(tx.breakdown, tx.currency, t("income.dayUnit")) : null,
      tx.tax
        ? t("income.netOfTax", {
            amount: formatMoney(tx.tax.gross - tx.amount, tx.currency),
            regime: taxLabelOf(tx.tax),
          })
        : null,
    ].filter(Boolean);
    if (details.length === 0) details.push(formatMonth(monthOf(tx.date)));
    return (
      <li key={tx.id}>
        <button
          type="button"
          onClick={() => openEdit(tx)}
          className="row-tap flex w-full items-center gap-3 px-2 py-2 text-left"
        >
          <IconDisc colorSlot={cat?.colorSlot} className="size-9 rounded-full text-base">
            {cat?.icon ?? "💰"}
          </IconDisc>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink-1">
              {tx.note || (cat ? category(cat) : t("income.fallbackName"))}
            </span>
            <span className="block truncate text-xs text-ink-3">{details.join(" · ")}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="tnum block text-sm font-semibold text-income">
              {formatMoney(tx.amount, tx.currency, { sign: true, exact: true })}
            </span>
            <span className="block text-xs text-ink-3">
              {tx.currency !== base && (
                <span className="tnum">
                  ≈ {formatMoney(convert(tx.amount, tx.currency, base, settings.rates), base, { compact: true })}
                  {" · "}
                </span>
              )}
              {formatDateShort(tx.date)}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const selectedRegime = form ? taxRegime(form.taxRegime) : null;

  return (
    <>
      <PageHeader title={t("income.title")} subtitle={t("income.subtitle")} action={addButton} />

      <div className="stagger grid grid-cols-2 items-start gap-4 sm:gap-5 xl:grid-cols-12">
        <StatTile
          className="xl:col-span-3"
          label={t("income.thisMonth")}
          value={formatMoney(thisMonth, base, { compact: true })}
          tone="income"
          spark={series.map((m) => m.income)}
          delta={{
            text: t("income.vsAverage", { delta: formatMoney(thisMonth - avg6, base, { compact: true, sign: true }) }),
            good: thisMonth >= avg6,
          }}
        />
        <StatTile
          className="xl:col-span-3"
          label={t("income.average6")}
          value={formatMoney(avg6, base, { compact: true })}
          spark={series.slice(-6).map((m) => m.income)}
          hint={
            bestMonth
              ? t("income.best", {
                  amount: formatMoney(bestMonth.income, base, { compact: true }),
                  month: formatMonthShort(bestMonth.month),
                })
              : undefined
          }
        />
        <StatTile
          className="xl:col-span-3"
          label={t("income.ytd", { year: nowMonth.slice(0, 4) })}
          value={formatMoney(ytd, base, { compact: true })}
          hint={tp("income.ytdHint", monthsSoFar, {
            amount: formatMoney(ytd / monthsSoFar, base, { compact: true }),
          })}
        />
        <StatTile
          className="xl:col-span-3"
          label={t("income.taxYear", { year: nowMonth.slice(0, 4) })}
          value={tax.entries > 0 ? formatMoney(tax.tax, base, { compact: true }) : "—"}
          tone={tax.entries > 0 ? "expense" : undefined}
          hint={
            tax.entries > 0
              ? [
                  t("income.taxHint", {
                    pct: formatPercent((tax.tax / Math.max(1, tax.gross - tax.vat)) * 100),
                    gross: formatMoney(tax.gross, base, { compact: true }),
                  }),
                  tp("income.taxedEntries", tax.entries),
                  tax.vat > 0 ? t("income.vatHint", { vat: formatMoney(tax.vat, base, { compact: true }) }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : t("income.noTaxYet")
          }
        />

        <GlassCard
          title={t("income.byMonth")}
          subtitle={t("income.byMonth.subtitle")}
          icon="chart"
          action={<PeriodTabs value={chartMonths} onChange={setChartMonths} />}
          className="col-span-2 xl:col-span-12"
        >
          {hasIncome ? (
            <MonthlyColumns
              data={chartSeries.map((m) => ({ month: m.month, income: m.income, expense: m.expense }))}
              currency={base}
            />
          ) : (
            <EmptyState
              icon={<Icon name="chart" />}
              title={t("income.empty.chart")}
              hint={t("income.empty.chart.hint")}
              action={addButton}
            />
          )}
        </GlassCard>

        <GlassCard
          title={t("income.all")}
          subtitle={
            scope === "planned"
              ? t("income.scope.planned.subtitle")
              : scope === "all"
                ? t("income.scope.all.subtitle")
                : t("income.scope.received.subtitle")
          }
          icon="banknote"
          action={
            plannedCount > 0 ? (
              <SegmentedControl
                size="sm"
                label={t("income.scope.label")}
                options={[
                  { value: "received", label: t("income.scope.received") },
                  { value: "planned", label: `${t("income.scope.planned")} (${plannedCount})` },
                  { value: "all", label: t("income.scope.all") },
                ]}
                value={scope}
                onChange={setScope}
              />
            ) : undefined
          }
          className="order-2 col-span-2 xl:order-1 xl:col-span-8"
        >
          {!hasIncome ? (
            <EmptyState
              icon={<Icon name="banknote" />}
              title={t("income.empty.list")}
              hint={t("income.empty.list.hint")}
              action={addButton}
            />
          ) : (
            <>
              <Toolbar>
                <SearchInput value={query} onChange={setQuery} placeholder={t("income.search")} />
                <ToolbarSlot>
                  <OptionPicker
                    size="sm"
                    label={t("filter.category")}
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    groups={filterCategoryGroups}
                  />
                </ToolbarSlot>
                <SortSelect
                  value={sortKey}
                  onChange={setSortKey}
                  options={[
                    { value: "date", label: t("sort.date") },
                    { value: "amount", label: t("sort.amount") },
                  ]}
                  direction={sortDir}
                  onDirectionChange={setSortDir}
                />
              </Toolbar>
              {filtering && (
                <p className="mb-2 px-1 text-xs text-ink-3">
                  {tp("filter.shown", visibleTx.length, { total: incomeTx.length })}
                  <button
                    type="button"
                    className="ml-2 font-semibold text-accent"
                    onClick={() => {
                      setQuery("");
                      setCategoryFilter("");
                    }}
                  >
                    {t("filter.reset")}
                  </button>
                </p>
              )}
              {visibleTx.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-2">{t("filter.noMatches")}</p>
              ) : sortKey === "amount" ? (
                <ul className="space-y-0.5">{flatByAmount.map(renderRow)}</ul>
              ) : (
                <div className="stagger space-y-5">
                  {months.map((month) => {
                    const rows = sortItems(
                      byMonth.get(month)!,
                      (tx) => `${tx.date}|${tx.id}`,
                      sortDir,
                    );
                    const subtotal = rows.reduce(
                      (sum, tx) => sum + convert(tx.amount, tx.currency, base, settings.rates),
                      0,
                    );
                    return (
                      <section key={month}>
                        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                          <h3 className="label font-semibold text-ink-1">{formatMonth(month)}</h3>
                          <span className="tnum label font-semibold text-income">
                            {formatMoney(subtotal, base, { sign: true })}
                          </span>
                        </div>
                        <ul className="space-y-0.5">{rows.map(renderRow)}</ul>
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </GlassCard>

        <div className="order-1 col-span-2 flex min-w-0 flex-col gap-4 self-start sm:gap-5 xl:order-2 xl:col-span-4">
          {limits.length > 0 && (
            <GlassCard
              title={t("tax.limit.title", { year: nowMonth.slice(0, 4) })}
              subtitle={tp("tax.limit.regimes", limits.length)}
              icon="shield"
            >
              <ul className="space-y-3.5">
                {limits.map(({ regime, headroom }) => (
                  <li key={regime}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm font-medium text-ink-1">
                        {t(taxRegime(regime).shortKey as MessageKey)}
                      </span>
                      <span className="tnum text-xs text-ink-3">
                        {formatMoney(headroom.used, "UAH", { compact: true })}{" "}
                        {t("tax.limit.of", { limit: formatMoney(headroom.limit, "UAH", { compact: true }) })}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <ProgressMeter
                        value={headroom.used}
                        max={headroom.limit}
                        tone="budget"
                        label={t(taxRegime(regime).shortKey as MessageKey)}
                      />
                    </div>
                    <p className={`tnum mt-1 text-xs ${headroom.pct >= 90 ? "text-warning" : "text-ink-3"}`}>
                      {t("tax.limit.left", {
                        pct: formatPercent(headroom.pct),
                        left: formatMoney(headroom.remaining, "UAH", { compact: true }),
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
          <GlassCard title={t("income.bySource")} subtitle={t("common.last12")} icon="pie">
            {catSegments.length > 0 ? (
              <>
                <div className="mb-3.5 flex items-end justify-between gap-3">
                  <p className="num-md whitespace-nowrap text-ink-1">
                    {formatMoney(last12Total, base, { compact: true })}
                  </p>
                  <p className="text-xs text-ink-3">
                    {tp("income.sources", catSegments.length)} ·{" "}
                    {t("income.perMonthAvg", { amount: formatMoney(last12Total / 12, base, { compact: true }) })}
                  </p>
                </div>
                <CategoryBreakdown segments={catSegments} currency={base} maxSegments={7} />
              </>
            ) : (
              <EmptyState
                icon={<Icon name="pie" />}
                title={t("income.empty.sources")}
                hint={t("income.empty.sources.hint")}
              />
            )}
          </GlassCard>

          {byCurrency.length > 0 && (
            <GlassCard title={t("income.byCurrency")} subtitle={t("income.byCurrency.subtitle")} icon="exchange">
              <ul className="space-y-3">
                {byCurrency.map((c) => (
                  <li key={c.currency}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-ink-1">{c.currency}</span>
                      <span className="tnum text-sm font-semibold text-ink-1">
                        {formatMoney(c.native, c.currency, { compact: true })}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ghost"
                      role="img"
                      aria-label={`${c.currency}: ${formatPercent((c.base / Math.max(1, byCurrencyTotal)) * 100, 0)}`}
                    >
                      <div
                        className="bar-slice h-full rounded-full bg-income"
                        style={{ width: `${(c.base / Math.max(1, byCurrencyTotal)) * 100}%` }}
                      />
                    </div>
                    <p className="tnum mt-1 text-xs text-ink-3">
                      {c.currency === base
                        ? tp("common.entries", c.count)
                        : `≈ ${formatMoney(c.base, base, { compact: true })} · ${tp("common.entries", c.count)}`}
                    </p>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
        </div>
      </div>

      {form && (
        <Sheet
          open
          onClose={closeSheet}
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
              <Button variant="ghost" onClick={closeSheet}>
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
          {form.mode === "contract" && (
            <p className="-mt-1 text-xs text-ink-3">{t("income.mode.contract.hint")}</p>
          )}

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
            <TextInput
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>

          <Field
            label={t("income.landedIn")}
            hint={state.savings.length === 0 ? t("income.landedIn.none") : t("income.landedIn.hint")}
          >
            <Select
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
            >
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
                <p className="mt-0.5 text-xs text-ink-3">{t("income.applyTax.hint")}</p>
              </div>
              <Switch
                checked={form.taxRegime !== "none"}
                onChange={(v) => setForm({ ...form, taxRegime: v ? defaultRegime : "none" })}
                label={t("income.applyTax")}
              />
            </div>
            {form.taxRegime !== "none" && selectedRegime && (
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
                {profile && profile.fixedUAH > 0 && (
                  <Callout tone="tip">{t("income.fixedPerEntry")}</Callout>
                )}
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
                  <Line
                    label={t("income.effectiveRate")}
                    value={formatPercent(breakdown.effectivePct)}
                  />
                </dl>
              )}
              <p className="mb-1 label">{breakdown ? t("income.netTakeHome") : t("income.everyCurrency")}</p>
              <TripleMoney amount={net} currency={form.currency} settings={settings} />
            </div>
          )}
        </Sheet>
      )}

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
