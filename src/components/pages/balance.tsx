"use client";

import { useState } from "react";
import { Sparkline, StatTile } from "@/components/charts";
import {
  Button,
  ConfirmDialog,
  CurrencyCells,
  EmptyState,
  Field,
  GlassCard,
  Money,
  PageHeader,
  ProgressMeter,
  SegmentedControl,
  Select,
  Sheet,
  Switch,
  TextInput,
  TripleMoney,
} from "@/components/ui";
import { CURRENCIES, ICON_CHOICES } from "@/lib/constants";
import {
  addMonths,
  dateInMonth,
  formatDate,
  monthDiff,
  monthOf,
  todayISO,
} from "@/lib/date";
import { accountBalances, investmentAt, netWorth } from "@/lib/finmath";
import { convert, formatMoney, formatPercent, parseAmount } from "@/lib/money";
import { uid, useStore } from "@/lib/store";
import type {
  Compounding,
  CompoundingFreq,
  Currency,
  Investment,
  SavingsAccount,
} from "@/lib/types";

/* ---------- account form ---------- */

interface AccountForm {
  id: string | null;
  name: string;
  icon: string;
  currency: Currency;
  openingBalance: string;
  goalEnabled: boolean;
  target: string;
  deadline: string;
}

/* ---------- investment form ---------- */

const FREQ_OPTIONS: Array<{ value: CompoundingFreq; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

const FREQ_ADVERB: Record<CompoundingFreq, string> = {
  monthly: "monthly",
  quarterly: "quarterly",
  annually: "annual",
};

const COMPOUNDING_OPTIONS: Array<{ value: Compounding; label: string }> = [
  { value: "reinvest", label: "Reinvest" },
  { value: "payout", label: "Payout" },
];

interface InvestmentForm {
  id: string | null;
  name: string;
  currency: Currency;
  principal: string;
  rate: string;
  startDate: string;
  compounding: Compounding;
  freq: CompoundingFreq;
  contribution: string;
  note: string;
}

/** value trajectory in own currency: monthly points over the last year */
function sparkValues(inv: Investment, today: string): number[] {
  const nowMonth = monthOf(today);
  const yearAgo = addMonths(nowMonth, -12);
  const startMonth = monthOf(inv.startDate);
  const from = monthDiff(yearAgo, startMonth) > 0 ? startMonth : yearAgo;
  const day = Number(today.slice(8, 10));
  const values: number[] = [];
  for (let m = from; monthDiff(m, nowMonth) >= 0; m = addMonths(m, 1)) {
    const at = m === nowMonth ? today : dateInMonth(m, day);
    values.push(investmentAt(inv, at).value);
  }
  return values;
}

export function BalancePage() {
  const { state, update } = useStore();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();

  const worth = netWorth(state, today);
  // live balances: opening balance plus everything recorded against the account
  const balances = accountBalances(state, today);

  /* ---------- accounts state ---------- */
  const [accForm, setAccForm] = useState<AccountForm | null>(null);
  const [accError, setAccError] = useState<string | null>(null);
  const [accDeleteId, setAccDeleteId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [moveAmount, setMoveAmount] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);

  /* ---------- investments state ---------- */
  const [invForm, setInvForm] = useState<InvestmentForm | null>(null);
  const [invError, setInvError] = useState<string | null>(null);
  const [invDeleteId, setInvDeleteId] = useState<string | null>(null);

  /* ---------- investments totals ---------- */
  const invTotals = state.investments.reduce(
    (acc, inv) => {
      const snap = investmentAt(inv, today);
      acc.invested += convert(snap.invested, inv.currency, base, settings.rates);
      acc.value += convert(snap.value, inv.currency, base, settings.rates);
      acc.earned += convert(snap.accrued + snap.paidOut, inv.currency, base, settings.rates);
      return acc;
    },
    { invested: 0, value: 0, earned: 0 },
  );

  /* ---------- account handlers ---------- */

  const openAddAccount = () => {
    setAccForm({
      id: null,
      name: "",
      icon: ICON_CHOICES[0],
      currency: "UAH",
      openingBalance: "",
      goalEnabled: false,
      target: "",
      deadline: "",
    });
    setAccError(null);
  };

  const openEditAccount = (acc: SavingsAccount) => {
    setAccForm({
      id: acc.id,
      name: acc.name,
      icon: acc.icon,
      currency: acc.currency,
      openingBalance: String(acc.openingBalance),
      goalEnabled: acc.goal != null,
      target: acc.goal ? String(acc.goal.target) : "",
      deadline: acc.goal?.deadline ?? "",
    });
    setAccError(null);
  };

  const submitAccount = () => {
    if (!accForm) return;
    const name = accForm.name.trim();
    if (!name) {
      setAccError("Name the account.");
      return;
    }
    const openingBalance = parseAmount(
      accForm.openingBalance.trim() === "" ? "0" : accForm.openingBalance,
    );
    if (!Number.isFinite(openingBalance)) {
      setAccError("Balance must be a non-negative number.");
      return;
    }
    let goal: SavingsAccount["goal"];
    if (accForm.goalEnabled) {
      const target = parseAmount(accForm.target);
      if (!Number.isFinite(target) || target <= 0) {
        setAccError("Goal target must be greater than zero.");
        return;
      }
      goal = { target, deadline: accForm.deadline || undefined };
    }
    if (accForm.id) {
      const id = accForm.id;
      update((s) => ({
        ...s,
        savings: s.savings.map((a) =>
          a.id === id
            ? { ...a, name, icon: accForm.icon, currency: accForm.currency, openingBalance, goal }
            : a,
        ),
      }));
    } else {
      const acc: SavingsAccount = {
        id: uid(),
        name,
        icon: accForm.icon,
        currency: accForm.currency,
        openingBalance,
        goal,
      };
      update((s) => ({ ...s, savings: [...s.savings, acc] }));
    }
    setAccForm(null);
  };

  const confirmDeleteAccount = () => {
    if (!accDeleteId) return;
    update((s) => ({ ...s, savings: s.savings.filter((a) => a.id !== accDeleteId) }));
    setAccDeleteId(null);
    setAccForm(null);
  };

  const moveAccount = state.savings.find((a) => a.id === moveId) ?? null;
  const moveCurrent = moveAccount ? (balances.get(moveAccount.id) ?? 0) : 0;

  /**
   * Reconciliation: you type what the bank actually shows and the difference
   * is booked as a transaction, so the balance always has a paper trail
   * instead of being silently overwritten.
   */
  const submitMove = () => {
    if (!moveAccount) return;
    const actual = parseAmount(moveAmount);
    if (!Number.isFinite(actual)) {
      setMoveError("Enter the balance your bank shows.");
      return;
    }
    const delta = actual - moveCurrent;
    if (Math.abs(delta) < 0.005) {
      setMoveError("That already matches — nothing to adjust.");
      return;
    }
    const categoryId =
      delta > 0
        ? (state.categories.find((c) => c.id === "cat-other-inc") ??
            state.categories.find((c) => c.kind === "income"))?.id
        : (state.categories.find((c) => c.id === "cat-other-exp") ??
            state.categories.find((c) => c.kind === "expense"))?.id;
    if (!categoryId) {
      setMoveError("Add an income and an expense category first.");
      return;
    }
    const accountId = moveAccount.id;
    update((s) => ({
      ...s,
      transactions: [
        ...s.transactions,
        {
          id: uid(),
          type: delta > 0 ? ("income" as const) : ("expense" as const),
          amount: Math.abs(delta),
          currency: moveAccount.currency,
          categoryId,
          date: today,
          note: `Balance adjustment · ${moveAccount.name}`,
          accountId,
        },
      ],
    }));
    setMoveId(null);
    setMoveAmount("");
    setMoveError(null);
  };

  /* ---------- investment handlers ---------- */

  const openAddInvestment = () => {
    setInvForm({
      id: null,
      name: "",
      currency: "UAH",
      principal: "",
      rate: "",
      startDate: today,
      compounding: "reinvest",
      freq: "monthly",
      contribution: "",
      note: "",
    });
    setInvError(null);
  };

  const openEditInvestment = (inv: Investment) => {
    setInvForm({
      id: inv.id,
      name: inv.name,
      currency: inv.currency,
      principal: String(inv.principal),
      rate: String(inv.annualRatePct),
      startDate: inv.startDate,
      compounding: inv.compounding,
      freq: inv.compoundingFreq,
      contribution:
        inv.monthlyContribution != null ? String(inv.monthlyContribution) : "",
      note: inv.note ?? "",
    });
    setInvError(null);
  };

  const submitInvestment = () => {
    if (!invForm) return;
    const name = invForm.name.trim();
    if (!name) {
      setInvError("Name the investment.");
      return;
    }
    const principal = parseAmount(invForm.principal);
    if (!Number.isFinite(principal) || principal <= 0) {
      setInvError("Principal must be greater than zero.");
      return;
    }
    const rate = parseAmount(invForm.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 200) {
      setInvError("Rate must be between 0 and 200% per year.");
      return;
    }
    if (!invForm.startDate) {
      setInvError("Pick a start date.");
      return;
    }
    let contribution: number | undefined;
    if (invForm.contribution.trim() !== "") {
      const c = parseAmount(invForm.contribution);
      if (!Number.isFinite(c) || c < 0) {
        setInvError("Monthly top-up must be a non-negative number.");
        return;
      }
      contribution = c > 0 ? c : undefined;
    }
    const note = invForm.note.trim();

    if (invForm.id) {
      const id = invForm.id;
      update((s) => ({
        ...s,
        investments: s.investments.map((inv) =>
          inv.id === id
            ? {
                ...inv,
                name,
                currency: invForm.currency,
                principal,
                annualRatePct: rate,
                startDate: invForm.startDate,
                compounding: invForm.compounding,
                compoundingFreq: invForm.freq,
                monthlyContribution: contribution,
                note: note || undefined,
              }
            : inv,
        ),
      }));
    } else {
      const inv: Investment = {
        id: uid(),
        name,
        currency: invForm.currency,
        principal,
        annualRatePct: rate,
        startDate: invForm.startDate,
        compounding: invForm.compounding,
        compoundingFreq: invForm.freq,
        monthlyContribution: contribution,
        note: note || undefined,
      };
      update((s) => ({ ...s, investments: [...s.investments, inv] }));
    }
    setInvForm(null);
  };

  const confirmDeleteInvestment = () => {
    if (!invDeleteId) return;
    update((s) => ({
      ...s,
      investments: s.investments.filter((inv) => inv.id !== invDeleteId),
    }));
    setInvDeleteId(null);
    setInvForm(null);
  };

  const deletingAccount = state.savings.find((a) => a.id === accDeleteId);
  const deletingInvestment = state.investments.find((i) => i.id === invDeleteId);

  const isEmpty = state.savings.length === 0 && state.investments.length === 0;

  return (
    <>
      <PageHeader
        title="Balance"
        subtitle="Everything you hold — accounts and investments"
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={openAddInvestment}>
              + Investment
            </Button>
            <Button onClick={openAddAccount}>+ Account</Button>
          </div>
        }
      />
      <div className="space-y-4">
        <div className="grid items-start gap-4 xl:grid-cols-3">
          {/* net worth hero */}
          <GlassCard className="glow xl:col-span-1">
            <p className="card-title">Net worth</p>
            <div className="mt-2">
              <TripleMoney amount={worth.total} currency={base} settings={settings} size="lg" />
            </div>
            <p className="mt-3 border-t border-hairline pt-3 text-sm text-ink-2">
              Accounts {formatMoney(worth.savings, base, { compact: true })} · Investments{" "}
              {formatMoney(worth.investments, base, { compact: true })}
            </p>
          </GlassCard>

          {!isEmpty && (
            <div className="xl:col-span-2">
            {/* accounts balance sheet */}
            <GlassCard
              title="Accounts"
              action={
                <Button variant="ghost" onClick={openAddAccount}>
                  + Add
                </Button>
              }
            >
              {state.savings.length === 0 ? (
                <EmptyState
                  icon="💳"
                  title="No accounts yet"
                  hint="Cards, cash, crypto — anything that holds value."
                  action={<Button variant="ghost" onClick={openAddAccount}>+ Add</Button>}
                />
              ) : (
                <div className="space-y-1">
                  <div className="hidden grid-cols-[minmax(0,1fr)_repeat(3,7.5rem)] gap-3 px-2 pb-1 sm:grid">
                    <span className="text-[13px] font-medium text-ink-2">Account</span>
                    <span className="text-right text-[13px] font-medium text-ink-2">₴</span>
                    <span className="text-right text-[13px] font-medium text-ink-2">$</span>
                    <span className="text-right text-[13px] font-medium text-ink-2">€</span>
                  </div>
                  {state.savings.map((acc) => {
                    const goal = acc.goal;
                    const shown = balances.get(acc.id) ?? 0;
                    const reached = goal != null && shown >= goal.target;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => openEditAccount(acc)}
                        className="row-tap block w-full px-3 py-2.5 text-left"
                      >
                        <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,7.5rem)]">
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              aria-hidden
                              className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-ghost text-lg"
                            >
                              {acc.icon}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-ink-1">
                                {acc.name}
                              </span>
                              <span className="block text-xs text-ink-3">{acc.currency}</span>
                            </span>
                          </span>
                          <span className="tnum text-right text-sm font-semibold text-ink-1 sm:hidden">
                            {formatMoney(shown, acc.currency, { exact: true })}
                          </span>
                          <span className="hidden sm:contents">
                            <CurrencyCells
                              amount={shown}
                              currency={acc.currency}
                              settings={settings}
                            />
                          </span>
                        </span>
                        {goal && (
                          <span className="mt-2 block pl-13 pr-1">
                            <ProgressMeter value={shown} max={goal.target} />
                            <span
                              className={`tnum mt-1 block text-xs ${
                                reached ? "font-medium text-income" : "text-ink-3"
                              }`}
                            >
                              {reached
                                ? "Goal reached 🎉"
                                : `${formatMoney(shown, acc.currency)} of ${formatMoney(goal.target, acc.currency)} (${formatPercent((shown / goal.target) * 100, 0)})${goal.deadline ? ` · by ${formatDate(goal.deadline)}` : ""}`}
                            </span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <div className="mt-1 hidden grid-cols-[minmax(0,1fr)_repeat(3,7.5rem)] gap-3 border-t border-hairline px-2 pt-2.5 sm:grid">
                    <span className="text-sm font-semibold text-ink-1">Total incl. investments</span>
                    {CURRENCIES.map((c) => (
                      <span key={c} className="tnum text-right text-sm font-semibold text-ink-1">
                        {formatMoney(convert(worth.total, base, c, settings.rates), c, {
                          exact: true,
                        })}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
            </div>
          )}
        </div>

        {isEmpty ? (
          <GlassCard>
            <EmptyState
              icon="🏦"
              title="Nothing here yet"
              hint="Add your accounts (cards, cash, even CS2 skins) and interest-bearing investments to see your full balance sheet."
              action={<Button onClick={openAddAccount}>+ Add account</Button>}
            />
          </GlassCard>
        ) : (
          <>

            {/* investments */}
            {state.investments.length > 0 && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <StatTile
                    label="Invested"
                    value={formatMoney(invTotals.invested, base, { compact: true })}
                  />
                  <StatTile
                    label="Current value"
                    value={formatMoney(invTotals.value, base, { compact: true })}
                  />
                  <StatTile
                    label="Earned"
                    value={formatMoney(invTotals.earned, base, { compact: true, sign: true })}
                    tone={invTotals.earned > 0 ? "income" : undefined}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {state.investments.map((inv) => {
                    const snap = investmentAt(inv, today);
                    const inYear = investmentAt(
                      inv,
                      dateInMonth(addMonths(monthOf(today), 12), Number(today.slice(8, 10))),
                    );
                    const caption =
                      inv.compounding === "reinvest"
                        ? `Compound interest · ${FREQ_ADVERB[inv.compoundingFreq]} reinvestment`
                        : "Simple interest · paid out to you";
                    return (
                      <GlassCard key={inv.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold text-ink-1">{inv.name}</h3>
                            <p className="mt-0.5 text-xs text-ink-2">{caption}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-ghost px-2 py-0.5 text-xs font-medium text-ink-2">
                            {inv.currency}
                          </span>
                        </div>

                        <div className="mt-3 flex items-end justify-between gap-3">
                          <Money
                            amount={snap.value}
                            currency={inv.currency}
                            exact
                            className="text-[26px] font-bold leading-tight tracking-tight text-ink-1"
                          />
                          <Sparkline values={sparkValues(inv, today)} />
                        </div>

                        <div className="mt-4 space-y-1.5 text-sm">
                          <InfoRow label="Rate">{formatPercent(inv.annualRatePct)} / year</InfoRow>
                          <InfoRow label="Invested">
                            <Money amount={snap.invested} currency={inv.currency} exact />
                          </InfoRow>
                          {inv.compounding === "reinvest" ? (
                            <InfoRow label="Accrued">
                              <Money
                                amount={snap.accrued}
                                currency={inv.currency}
                                sign
                                exact
                                className="text-income"
                              />
                            </InfoRow>
                          ) : (
                            <InfoRow label="Interest paid out">
                              <Money
                                amount={snap.paidOut}
                                currency={inv.currency}
                                exact
                                className="text-income"
                              />
                            </InfoRow>
                          )}
                          {inv.monthlyContribution != null && inv.monthlyContribution > 0 && (
                            <InfoRow label="Top-up">
                              {formatMoney(inv.monthlyContribution, inv.currency)}/mo
                            </InfoRow>
                          )}
                          <InfoRow label="In 1 year">
                            <span>
                              <Money amount={inYear.value} currency={inv.currency} exact />{" "}
                              <span className="text-income">
                                (+
                                {formatMoney(
                                  inYear.accrued - snap.accrued + (inYear.paidOut - snap.paidOut),
                                  inv.currency,
                                )}
                                )
                              </span>
                            </span>
                          </InfoRow>
                          <InfoRow label="Since">{formatDate(inv.startDate)}</InfoRow>
                        </div>

                        {inv.note && <p className="mt-3 text-xs text-ink-3">{inv.note}</p>}

                        <div className="mt-4 flex gap-2">
                          <Button
                            variant="ghost"
                            className="flex-1"
                            onClick={() => openEditInvestment(inv)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            className="flex-1"
                            onClick={() => setInvDeleteId(inv.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              </>
            )}

            <GlassCard title="How interest is calculated">
              <p className="text-sm leading-relaxed text-ink-2">
                Reinvest means compound interest: accrued interest joins the principal at the
                chosen frequency and keeps earning, and monthly top-ups compound from the month
                they land. Payout means simple interest: interest on the invested amount is paid
                out to you, so the position itself does not grow (the forecast adds payouts to
                your savings instead).
              </p>
            </GlassCard>
          </>
        )}
      </div>

      {/* account sheet */}
      {accForm && (
        <Sheet
          open
          onClose={() => setAccForm(null)}
          title={accForm.id ? "Edit account" : "New account"}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAccForm(null)}>
                Cancel
              </Button>
              <Button onClick={submitAccount}>Save</Button>
            </>
          }
        >
          <Field label="Name">
            <TextInput
              value={accForm.name}
              onChange={(e) => setAccForm({ ...accForm, name: e.target.value })}
              placeholder="Monobank card"
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Icon</span>
            <div className="flex flex-wrap gap-2">
              {ICON_CHOICES.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  aria-pressed={accForm.icon === icon}
                  onClick={() => setAccForm({ ...accForm, icon })}
                  className={`flex size-10 items-center justify-center rounded-full text-xl transition-colors ${
                    accForm.icon === icon
                      ? "bg-accent-soft ring-2 ring-accent"
                      : "bg-ghost hover:bg-ghost-2"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <Field label="Currency">
            <SegmentedControl
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={accForm.currency}
              onChange={(v) => setAccForm({ ...accForm, currency: v })}
            />
          </Field>
          <Field
            label="Opening balance"
            hint="What the account held when you started tracking — transactions take it from there"
          >
            <TextInput
              inputMode="decimal"
              value={accForm.openingBalance}
              onChange={(e) => setAccForm({ ...accForm, openingBalance: e.target.value })}
              placeholder="0"
            />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-medium text-ink-1">Savings goal</span>
            <Switch
              checked={accForm.goalEnabled}
              onChange={(v) => setAccForm({ ...accForm, goalEnabled: v })}
              label="Savings goal"
            />
          </div>
          {accForm.goalEnabled && (
            <>
              <Field label="Target amount">
                <TextInput
                  inputMode="decimal"
                  value={accForm.target}
                  onChange={(e) => setAccForm({ ...accForm, target: e.target.value })}
                  placeholder="50 000"
                />
              </Field>
              <Field label="Deadline" hint="optional">
                <TextInput
                  type="date"
                  value={accForm.deadline}
                  onChange={(e) => setAccForm({ ...accForm, deadline: e.target.value })}
                />
              </Field>
            </>
          )}
          {accError && <p className="text-sm text-expense">{accError}</p>}
          {accForm.id && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setMoveId(accForm.id);
                  setMoveAmount("");
                  setMoveError(null);
                  setAccForm(null);
                }}
              >
                Reconcile
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => setAccDeleteId(accForm.id)}
              >
                Delete
              </Button>
            </div>
          )}
        </Sheet>
      )}

      {/* top-up / withdraw sheet */}
      <Sheet
        open={moveAccount != null}
        onClose={() => setMoveId(null)}
        title={`Reconcile ${moveAccount?.name ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveId(null)}>
              Cancel
            </Button>
            <Button onClick={submitMove}>Adjust</Button>
          </>
        }
      >
        {moveAccount && (
          <p className="text-sm text-ink-2">
            The app currently shows{" "}
            <Money
              amount={moveCurrent}
              currency={moveAccount.currency}
              exact
              className="font-semibold text-ink-1"
            />
            .
          </p>
        )}
        <Field
          label="Balance your bank shows"
          hint="The difference is recorded as a transaction, so the change stays traceable"
        >
          <TextInput
            inputMode="decimal"
            value={moveAmount}
            onChange={(e) => setMoveAmount(e.target.value)}
            placeholder={moveAccount ? String(Math.round(moveCurrent)) : "0"}
          />
        </Field>
        {moveError && <p className="text-sm text-expense">{moveError}</p>}
      </Sheet>

      {/* investment sheet */}
      {invForm && (
        <Sheet
          open
          onClose={() => setInvForm(null)}
          title={invForm.id ? "Edit investment" : "New investment"}
          footer={
            <>
              <Button variant="ghost" onClick={() => setInvForm(null)}>
                Cancel
              </Button>
              <Button onClick={submitInvestment}>Save</Button>
            </>
          }
        >
          <Field label="Name">
            <TextInput
              value={invForm.name}
              onChange={(e) => setInvForm({ ...invForm, name: e.target.value })}
              placeholder="Government bonds"
            />
          </Field>
          <Field label="Currency">
            <SegmentedControl
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={invForm.currency}
              onChange={(v) => setInvForm({ ...invForm, currency: v })}
            />
          </Field>
          <Field label="Principal">
            <TextInput
              inputMode="decimal"
              value={invForm.principal}
              onChange={(e) => setInvForm({ ...invForm, principal: e.target.value })}
              placeholder="50 000"
            />
          </Field>
          <Field label="Rate" hint="% per year">
            <TextInput
              inputMode="decimal"
              value={invForm.rate}
              onChange={(e) => setInvForm({ ...invForm, rate: e.target.value })}
              placeholder="15.3"
            />
          </Field>
          <Field label="Start date">
            <TextInput
              type="date"
              value={invForm.startDate}
              onChange={(e) => setInvForm({ ...invForm, startDate: e.target.value })}
            />
          </Field>
          <Field label="Interest type">
            <SegmentedControl
              options={COMPOUNDING_OPTIONS}
              value={invForm.compounding}
              onChange={(v) => setInvForm({ ...invForm, compounding: v })}
            />
          </Field>
          {invForm.compounding === "reinvest" && (
            <Field label="Compounding frequency">
              <Select
                value={invForm.freq}
                onChange={(e) =>
                  setInvForm({ ...invForm, freq: e.target.value as CompoundingFreq })
                }
              >
                {FREQ_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Monthly top-up" hint="optional">
            <TextInput
              inputMode="decimal"
              value={invForm.contribution}
              onChange={(e) => setInvForm({ ...invForm, contribution: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Note">
            <TextInput
              value={invForm.note}
              onChange={(e) => setInvForm({ ...invForm, note: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          {invError && <p className="text-sm text-expense">{invError}</p>}
          {invForm.id && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => setInvDeleteId(invForm.id)}
            >
              Delete investment
            </Button>
          )}
        </Sheet>
      )}

      <ConfirmDialog
        open={accDeleteId !== null}
        onClose={() => setAccDeleteId(null)}
        onConfirm={confirmDeleteAccount}
        title="Delete this account?"
        message={`“${deletingAccount?.name ?? ""}” will be removed permanently. This cannot be undone.`}
      />
      <ConfirmDialog
        open={invDeleteId !== null}
        onClose={() => setInvDeleteId(null)}
        onConfirm={confirmDeleteInvestment}
        title="Delete this investment?"
        message={`“${deletingInvestment?.name ?? ""}” will be removed permanently. This cannot be undone.`}
      />
    </>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-2">{label}</span>
      <span className="tnum text-right font-medium text-ink-1">{children}</span>
    </div>
  );
}
