"use client";

import { useEffect, useState } from "react";
import { Button, Fact, Facts, Field, FieldSet, Icon, SegmentedControl, Select, Sheet, TextInput } from "@/components/ui";
import { CURRENCIES, CURRENCY_SYMBOL, INVESTMENT_KINDS, valuationOf } from "@/lib/constants";
import { addDays, addMonths, dateInMonth, monthOf, todayISO, wholeMonthsBetween } from "@/lib/date";
import { investmentAt } from "@/lib/finance/finmath";
import { convert, formatMoney, formatNumber, formatPercent, parseAmount } from "@/lib/finance/money";
import { returnPolicy, type ReturnPolicy } from "@/lib/finance/returns";
import { useT, type MessageKey } from "@/lib/i18n";
import { COINS } from "@/lib/market/crypto";
import { fetchInzhurQuotes, INZHUR_FUNDS, inzhurFund, type InzhurQuote } from "@/lib/market/inzhur";
import { uid, useStore } from "@/lib/state/store";
import type { Compounding, CompoundingFreq, Currency, Investment, InvestmentKind } from "@/lib/types";
import { returnLabel, yieldRange } from "./helpers";

interface InvestmentForm {
  id: string | null;
  name: string;
  kind: InvestmentKind;
  currency: Currency;
  marketValue: string;
  coin: string;
  fund: string;
  quantity: string;
  nav: number | null;
  navAt: string | null;
  quote: InzhurQuote | null;
  principal: string;
  rate: string;
  startDate: string;
  endDate: string;
  compounding: Compounding;
  freq: CompoundingFreq;
  contribution: string;
  note: string;
}

function initialForm(target: Investment | "new"): InvestmentForm {
  if (target === "new") {
    return {
      id: null,
      name: "",
      kind: "deposit",
      currency: "UAH",
      marketValue: "",
      coin: COINS[0].id,
      fund: INZHUR_FUNDS[0].id,
      quantity: "",
      nav: null,
      navAt: null,
      quote: null,
      principal: "",
      rate: "",
      startDate: todayISO(),
      endDate: "",
      compounding: "reinvest",
      freq: "monthly",
      contribution: "",
      note: "",
    };
  }
  return {
    id: target.id,
    name: target.name,
    kind: target.kind,
    currency: target.currency,
    marketValue: target.marketValue != null ? String(target.marketValue) : "",
    coin: target.coin ?? COINS[0].id,
    fund: target.fund ?? INZHUR_FUNDS[0].id,
    quantity: target.quantity != null ? String(target.quantity) : "",
    nav: null,
    navAt: null,
    quote: null,
    principal: String(target.principal),
    rate: String(target.annualRatePct),
    startDate: target.startDate,
    endDate: target.endDate ?? "",
    compounding: target.compounding,
    freq: target.compoundingFreq,
    contribution: target.monthlyContribution != null ? String(target.monthlyContribution) : "",
    note: target.note ?? "",
  };
}

/** The same term again, starting the day the old one ended. */
function nextTerm(start: string, end: string): string {
  const months = wholeMonthsBetween(start, end);
  if (months > 0 && start.slice(8) === end.slice(8)) {
    return dateInMonth(addMonths(monthOf(end), months), Number(end.slice(8)));
  }
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  return addDays(end, Math.max(1, days));
}

/**
 * A matured position put back to work: what it was worth at maturity becomes the
 * new principal, and the new term runs as long as the old one did.
 */
function renewForm(inv: Investment & { endDate: string }): InvestmentForm {
  const form = initialForm(inv);
  const value = Math.round(investmentAt(inv, inv.endDate).value * 100) / 100;
  return {
    ...form,
    principal: valuationOf(inv.kind) === "market" ? form.principal : String(value),
    marketValue: valuationOf(inv.kind) === "market" ? String(value) : form.marketValue,
    startDate: inv.endDate,
    endDate: nextTerm(inv.startDate, inv.endDate),
    contribution: "",
  };
}

/** Snap compounding and frequency to what this kind of investment actually supports. */
function withPolicy(f: InvestmentForm): InvestmentForm {
  const policy = returnPolicy({
    kind: f.kind,
    fund: f.kind === "inzhur" ? f.fund : undefined,
    compounding: f.compounding,
    compoundingFreq: f.freq,
  });
  return { ...f, compounding: policy.compounding, freq: policy.compoundingFreq };
}

async function fetchNav(fundId: string, noQuote: string) {
  const res = await fetchInzhurQuotes([fundId]);
  const quote = res.quotes.find((q) => q.id === fundId);
  if (!quote) throw new Error(noQuote);
  return { quote, fetchedAt: res.fetchedAt };
}

/** Add or edit an investment; the fields adapt to how that kind of asset earns. */
export function InvestmentSheet({
  target,
  renew = false,
  onClose,
  onDelete,
}: {
  target: Investment | "new";
  /** Open a matured position for another term instead of editing it as it is. */
  renew?: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { state, update } = useStore();
  const { t } = useT();
  const { settings } = state;
  const initialFund = target !== "new" && target.kind === "inzhur" ? target.fund : undefined;
  const [form, setForm] = useState<InvestmentForm>(() =>
    renew && target !== "new" && target.endDate ? renewForm({ ...target, endDate: target.endDate }) : initialForm(target),
  );
  const [navLoading, setNavLoading] = useState(Boolean(initialFund));
  const [navError, setNavError] = useState<string | null>(null);
  const kindLabel = (kind: InvestmentKind) => t(`investmentKind.${kind}`);

  const applyQuote = (fundId: string, quote: InzhurQuote, fetchedAt: string) =>
    setForm((f) =>
      f.kind === "inzhur" && f.fund === fundId
        ? { ...f, nav: quote.navPerCertificate, navAt: fetchedAt, quote, rate: String(quote.projectedYieldPct) }
        : f,
    );

  const loadNav = async (fundId: string) => {
    setNavLoading(true);
    setNavError(null);
    try {
      const { quote, fetchedAt } = await fetchNav(fundId, t("balance.inv.inzhur.noQuote"));
      applyQuote(fundId, quote, fetchedAt);
    } catch (err) {
      setNavError(err instanceof Error ? err.message : t("balance.prices.inzhurFailed"));
    } finally {
      setNavLoading(false);
    }
  };

  // An Inzhur position opens with a fresh NAV.
  useEffect(() => {
    if (!initialFund) return;
    let live = true;
    fetchNav(initialFund, t("balance.inv.inzhur.noQuote"))
      .then(({ quote, fetchedAt }) => live && applyQuote(initialFund, quote, fetchedAt))
      .catch((err) => live && setNavError(err instanceof Error ? err.message : t("balance.prices.inzhurFailed")))
      .finally(() => live && setNavLoading(false));
    return () => {
      live = false;
    };
    // Runs once per opened sheet; `t` changing mid-edit must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFund]);

  const setKind = (kind: InvestmentKind) => {
    const fund = inzhurFund(form.fund) ?? INZHUR_FUNDS[0];
    const toInzhur = kind === "inzhur" && form.kind !== "inzhur";
    const fromInzhur = kind !== "inzhur" && form.kind === "inzhur";
    setForm(
      withPolicy({
        ...form,
        kind,
        compounding: kind === "deposit" ? "reinvest" : kind === "reit" ? "payout" : form.compounding,
        currency: kind === "inzhur" ? "UAH" : form.currency,
        name: toInzhur && !form.name.trim() ? fund.name : fromInzhur && form.name === fund.name ? "" : form.name,
        rate: toInzhur ? String(fund.projectedYieldPct) : fromInzhur ? "" : form.rate,
      }),
    );
    if (toInzhur) void loadNav(fund.id);
  };

  const setFund = (fundId: string) => {
    const prev = inzhurFund(form.fund);
    const next = inzhurFund(fundId);
    setForm(
      withPolicy({
        ...form,
        fund: fundId,
        nav: null,
        navAt: null,
        quote: null,
        compounding: next?.income === "dividends" ? "payout" : "reinvest",
        name: !form.name.trim() || form.name === prev?.name ? (next?.name ?? form.name) : form.name,
        rate: next ? String(next.projectedYieldPct) : form.rate,
      }),
    );
    void loadNav(fundId);
  };

  const market = valuationOf(form.kind) === "market";
  const crypto = form.kind === "crypto";
  const inzhur = form.kind === "inzhur";
  const units = crypto || inzhur;
  const policy: ReturnPolicy = returnPolicy({
    kind: form.kind,
    fund: inzhur ? form.fund : undefined,
    compounding: form.compounding,
    compoundingFreq: form.freq,
  });
  const fund = inzhur ? inzhurFund(form.fund) : undefined;

  const problem: string | null = (() => {
    if (!form.name.trim()) return t("balance.inv.problem.name");
    const principal = parseAmount(form.principal);
    if (!Number.isFinite(principal) || principal <= 0) return t("balance.inv.problem.principal");
    if (!form.startDate) return t("balance.inv.problem.start");
    if (market && form.rate.trim() !== "") {
      const expected = parseAmount(form.rate);
      if (!Number.isFinite(expected) || expected < 0 || expected > 200) return t("balance.inv.problem.expected");
    }
    if (units) {
      const q = parseAmount(form.quantity);
      if (!Number.isFinite(q) || q <= 0) return inzhur ? t("balance.inv.problem.certificates") : t("balance.inv.problem.coins");
      return null;
    }
    if (form.contribution.trim() !== "") {
      const c = parseAmount(form.contribution);
      if (!Number.isFinite(c) || c < 0) return t("balance.inv.problem.topUp");
    }
    if (market) {
      if (form.marketValue.trim() === "") return null;
      const v = parseAmount(form.marketValue);
      if (!Number.isFinite(v) || v < 0) return t("balance.inv.problem.value");
      return null;
    }
    const rate = parseAmount(form.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 200) return t("balance.inv.problem.rate");
    if (form.endDate && form.endDate < form.startDate) return t("balance.inv.problem.maturity");
    return null;
  })();

  const navPreview =
    inzhur && form.nav !== null
      ? (() => {
          const q = parseAmount(form.quantity);
          const perUnit = convert(form.nav, "UAH", form.currency, settings.rates);
          return Number.isFinite(q) && q > 0 ? q * perUnit : null;
        })()
      : null;

  const submit = () => {
    if (problem) return;
    const principal = parseAmount(form.principal);
    const note = form.note.trim();
    const typedRate = parseAmount(form.rate);
    const rate = market && (form.rate.trim() === "" || !Number.isFinite(typedRate)) ? 0 : typedRate;
    const typed = form.contribution.trim() === "" ? 0 : parseAmount(form.contribution);
    const quantity = units ? parseAmount(form.quantity) : undefined;
    const stated = parseAmount(form.marketValue);
    const existing = form.id ? state.investments.find((i) => i.id === form.id) : undefined;
    const priced = inzhur && navPreview !== null;
    const marketValue = !market
      ? undefined
      : priced
        ? navPreview
        : units
          ? ((existing?.kind === form.kind && existing.quantity === quantity ? existing.marketValue : undefined) ?? principal)
          : form.marketValue.trim() === "" || !Number.isFinite(stated)
            ? principal
            : stated;
    const finalPolicy = returnPolicy({
      kind: form.kind,
      fund: inzhur ? form.fund : undefined,
      compounding: form.compounding,
      compoundingFreq: form.freq,
    });
    const fields = {
      name: form.name.trim(),
      currency: form.currency,
      principal,
      annualRatePct: rate,
      startDate: form.startDate,
      compounding: finalPolicy.compounding,
      compoundingFreq: finalPolicy.compoundingFreq,
      note: note || undefined,
      kind: form.kind,
      marketValue,
      coin: crypto ? form.coin : undefined,
      fund: inzhur ? form.fund : undefined,
      quantity: units ? quantity : undefined,
      pricedAt: priced ? (form.navAt ?? new Date().toISOString()) : units ? existing?.pricedAt : undefined,
      coinIcon: crypto ? existing?.coinIcon : undefined,
      endDate: form.endDate || undefined,
      monthlyContribution: typed > 0 ? typed : undefined,
    };
    if (form.id) {
      const id = form.id;
      update((s) => ({ ...s, investments: s.investments.map((inv) => (inv.id === id ? { ...inv, ...fields } : inv)) }));
    } else {
      update((s) => ({ ...s, investments: [...s.investments, { id: uid(), ...fields }] }));
    }
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      onSubmit={submit}
      problem={problem}
      title={renew ? t("investments.renew.title") : form.id ? t("balance.inv.edit") : t("balance.inv.new")}
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
      <Field label={t("balance.inv.type")} hint={t(`investmentKind.${form.kind}.hint`)}>
        <Select value={form.kind} onChange={(e) => setKind(e.target.value as InvestmentKind)}>
          {INVESTMENT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.icon} {kindLabel(k.value)}
            </option>
          ))}
        </Select>
      </Field>

      {inzhur && (
        <>
          <Field label={t("balance.inv.inzhur.fund")} hint={t("balance.inv.inzhur.fund.hint")}>
            <Select value={form.fund} onChange={(e) => setFund(e.target.value)}>
              {INZHUR_FUNDS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {t(f.themeKey as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap items-center gap-3 rounded-field bg-ghost px-3.5 py-3">
            <div className="min-w-0 flex-1 space-y-0.5 text-sm">
              {form.nav !== null ? (
                <>
                  <p className="font-semibold text-ink-1">
                    {t("balance.inv.inzhur.nav", { nav: formatMoney(form.nav, "UAH", { exact: true }) })}
                  </p>
                  {navPreview !== null && (
                    <p className="tnum text-xs text-ink-3">
                      {t("balance.inv.inzhur.worth", {
                        count: formatNumber(parseAmount(form.quantity), 4),
                        value: formatMoney(navPreview, form.currency, { exact: true }),
                      })}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-ink-3">{navLoading ? t("common.loading") : t("balance.inv.inzhur.navHint")}</p>
              )}
              {navError && <p className="text-xs text-expense">{navError}</p>}
            </div>
            <Button variant="ghost" size="sm" disabled={navLoading} onClick={() => void loadNav(form.fund)}>
              <Icon name="refresh" size={14} className={navLoading ? "animate-spin" : ""} />
              {navLoading ? t("common.loading") : t("balance.inv.inzhur.loadNav")}
            </Button>
          </div>
          {fund && (
            <Facts>
              <Fact label={t("balance.inv.inzhur.forecast")} wide>
                {yieldRange(
                  form.quote?.projectedYieldPct ?? fund.projectedYieldPct,
                  form.quote ? form.quote.projectedYieldMaxPct : fund.projectedYieldMaxPct,
                  form.quote?.projectedCurrency ?? fund.linkedCurrency,
                  t,
                )}
              </Fact>
              {form.quote?.actualYieldPct !== undefined && (
                <Fact label={t("balance.inv.inzhur.actual")}>
                  {t("balance.perYear", { pct: formatPercent(form.quote.actualYieldPct) })}
                  {form.quote.actualYieldCurrency ? ` · ${form.quote.actualYieldCurrency}` : ""}
                </Fact>
              )}
              <Fact label={t("balance.inv.row.return")}>{returnLabel(policy, form.kind, form.freq, t)}</Fact>
            </Facts>
          )}
        </>
      )}

      <Field label={t("common.name")}>
        <TextInput
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={crypto ? t("balance.inv.placeholder.crypto") : t("balance.inv.placeholder.bonds")}
        />
      </Field>
      <FieldSet label={t("common.currency")} hint={inzhur ? t("balance.inv.inzhur.currency.hint") : undefined}>
        <SegmentedControl
          label={t("common.currency")}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={form.currency}
          onChange={(v) => setForm({ ...form, currency: v })}
        />
      </FieldSet>

      {crypto && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("balance.inv.coin")}>
            <Select value={form.coin} onChange={(e) => setForm({ ...form, coin: e.target.value })}>
              {COINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.symbol} — {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("balance.inv.howMany")} hint={t("balance.inv.howMany.hint")}>
            <TextInput
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="0.25"
            />
          </Field>
        </div>
      )}

      {inzhur && (
        <Field label={t("balance.inv.inzhur.certificates")} hint={t("balance.inv.inzhur.certificates.hint")}>
          <TextInput
            inputMode="decimal"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="1000"
          />
        </Field>
      )}

      <Field label={market ? t("balance.inv.paid") : t("balance.inv.principal")} hint={market ? t("balance.inv.paid.hint") : undefined}>
        <TextInput
          inputMode="decimal"
          prefix={CURRENCY_SYMBOL[form.currency]}
          value={form.principal}
          onChange={(e) => setForm({ ...form, principal: e.target.value })}
          placeholder="50 000"
        />
      </Field>

      {market && !units && (
        <Field label={t("balance.inv.worthToday")} hint={t("balance.inv.worthToday.hint")}>
          <TextInput
            inputMode="decimal"
            prefix={CURRENCY_SYMBOL[form.currency]}
            value={form.marketValue}
            onChange={(e) => setForm({ ...form, marketValue: e.target.value })}
            placeholder={form.principal || "0"}
          />
        </Field>
      )}

      {!inzhur && (
        <Field
          label={market ? t("balance.inv.expected") : t("balance.inv.rate")}
          hint={market ? t("balance.inv.expected.hint") : t("balance.inv.rate.hint")}
        >
          <TextInput
            inputMode="decimal"
            value={form.rate}
            onChange={(e) => setForm({ ...form, rate: e.target.value })}
            placeholder={market ? "0" : "15.3"}
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={market ? t("balance.inv.boughtOn") : t("balance.inv.startDate")}>
          <TextInput type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label={market ? t("balance.inv.heldUntil") : t("balance.inv.matures")} hint={t("balance.inv.end.hint")}>
          <TextInput
            type="date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
          />
        </Field>
      </div>

      {policy.choices.length > 1 ? (
        <FieldSet
          label={policy.style === "interest" ? t("balance.inv.interestType") : t("balance.inv.dividends")}
          hint={policy.style === "interest" ? t("balance.inv.interestType.hint") : t("balance.inv.dividends.hint")}
        >
          <SegmentedControl
            label={policy.style === "interest" ? t("balance.inv.interestType") : t("balance.inv.dividends")}
            options={policy.choices.map((c) => ({
              value: c,
              label:
                policy.style === "interest"
                  ? c === "reinvest"
                    ? t("balance.inv.reinvest")
                    : t("balance.inv.payout")
                  : c === "reinvest"
                    ? t("balance.inv.dividends.reinvest")
                    : t("balance.inv.dividends.payout"),
            }))}
            value={policy.compounding}
            onChange={(v) => setForm({ ...form, compounding: v })}
          />
        </FieldSet>
      ) : !inzhur ? (
        <div className="flex items-start gap-2.5 rounded-field bg-ghost px-3.5 py-3 text-sm">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-ink-3" />
          <div className="min-w-0">
            <p className="font-semibold text-ink-1">{returnLabel(policy, form.kind, form.freq, t)}</p>
            <p className="text-xs text-ink-3">{t(`balance.inv.style.${policy.style}.hint`)}</p>
          </div>
        </div>
      ) : null}
      {policy.freqChoice && (
        <Field label={t("balance.inv.frequency")}>
          <Select value={form.freq} onChange={(e) => setForm({ ...form, freq: e.target.value as CompoundingFreq })}>
            {(["monthly", "quarterly", "annually"] as const).map((f) => (
              <option key={f} value={f}>
                {t(`freq.${f}`)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={t("balance.inv.topUp")} hint={market ? t("balance.inv.topUp.marketHint") : t("common.optional")}>
        <TextInput
          inputMode="decimal"
          prefix={CURRENCY_SYMBOL[form.currency]}
          value={form.contribution}
          onChange={(e) => setForm({ ...form, contribution: e.target.value })}
          placeholder="0"
        />
      </Field>
      <Field label={t("common.note")}>
        <TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t("common.optional")} />
      </Field>
      {form.id && !renew && (
        <Button variant="danger" className="w-full" onClick={() => onDelete(form.id!)}>
          {t("balance.inv.delete")}
        </Button>
      )}
    </Sheet>
  );
}
