"use client";

import { useState } from "react";
import { Sparkline, StatTile } from "@/components/charts";
import {
  Button,
  ConfirmDialog,
  CurrencyCells,
  EmptyState,
  Field,
  FieldSet,
  GlassCard,
  Money,
  OptionChips,
  PageHeader,
  ProgressMeter,
  SegmentedControl,
  Select,
  Sheet,
  Switch,
  TextInput,
  TripleMoney,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { CURRENCIES, CURRENCY_SYMBOL, ICON_CHOICES } from "@/lib/constants";
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
import { accountUsage, deleteAccount, uid, useStore } from "@/lib/store";
import type {
  Compounding,
  CompoundingFreq,
  Currency,
  Debt,
  DebtKind,
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
  /** maturity; "" = open-ended */
  endDate: string;
  compounding: Compounding;
  freq: CompoundingFreq;
  contribution: string;
  note: string;
}

/* ---------- debt form ---------- */

const DEBT_KIND_OPTIONS: Array<{ value: DebtKind; label: string }> = [
  { value: "mortgage", label: "Mortgage" },
  { value: "loan", label: "Loan" },
  { value: "card", label: "Credit card" },
];

const DEBT_KIND_ICON: Record<DebtKind, string> = {
  mortgage: "🏠",
  loan: "🏦",
  card: "💳",
};

const DEBT_KIND_LABEL: Record<DebtKind, string> = {
  mortgage: "Mortgage",
  loan: "Loan",
  card: "Credit card",
};

interface DebtForm {
  id: string | null;
  name: string;
  kind: DebtKind;
  currency: Currency;
  balance: string;
  principal: string;
  rate: string;
  monthlyPayment: string;
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
  const [accDeleteId, setAccDeleteId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [moveAmount, setMoveAmount] = useState("");

  /* ---------- investments state ---------- */
  const [invForm, setInvForm] = useState<InvestmentForm | null>(null);
  const [invDeleteId, setInvDeleteId] = useState<string | null>(null);

  /* ---------- debts state ---------- */
  const [debtForm, setDebtForm] = useState<DebtForm | null>(null);
  const [debtDeleteId, setDebtDeleteId] = useState<string | null>(null);

  /* ---------- investments totals ---------- */
  // `earnedInYear` is what the same positions add over the next twelve months
  // if nothing changes — the figure that answers "so what?" next to a balance
  const oneYearOut = dateInMonth(addMonths(monthOf(today), 12), Number(today.slice(8, 10)));
  const invTotals = state.investments.reduce(
    (acc, inv) => {
      const snap = investmentAt(inv, today);
      const ahead = investmentAt(inv, oneYearOut);
      const earned = snap.accrued + snap.paidOut;
      acc.invested += convert(snap.invested, inv.currency, base, settings.rates);
      acc.value += convert(snap.value, inv.currency, base, settings.rates);
      acc.earned += convert(earned, inv.currency, base, settings.rates);
      acc.earnedInYear += convert(
        ahead.accrued + ahead.paidOut - earned,
        inv.currency,
        base,
        settings.rates,
      );
      return acc;
    },
    { invested: 0, value: 0, earned: 0, earnedInYear: 0 },
  );

  /* ---------- account handlers ---------- */

  const openAddAccount = () =>
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

  const openEditAccount = (acc: SavingsAccount) =>
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

  /**
   * Every form on this page now says why Save is off before you press it, in
   * one place, next to the button — rather than validating on click and
   * printing the answer at the bottom of a panel that scrolls independently of
   * the footer. On the ten-field investment form that answer was reliably
   * off-screen, so Save read as broken.
   */
  const accProblem: string | null = (() => {
    if (!accForm) return null;
    if (!accForm.name.trim()) return "Name the account.";
    const opening = parseAmount(
      accForm.openingBalance.trim() === "" ? "0" : accForm.openingBalance,
    );
    if (!Number.isFinite(opening)) return "The opening balance has to be a number.";
    if (accForm.goalEnabled) {
      const target = parseAmount(accForm.target);
      if (!Number.isFinite(target) || target <= 0)
        return "The goal target has to be greater than zero.";
    }
    return null;
  })();
  const accValid = accForm !== null && accProblem === null;

  const submitAccount = () => {
    if (!accForm || !accValid) return;
    const name = accForm.name.trim();
    const openingBalance = parseAmount(
      accForm.openingBalance.trim() === "" ? "0" : accForm.openingBalance,
    );
    const goal: SavingsAccount["goal"] = accForm.goalEnabled
      ? { target: parseAmount(accForm.target), deadline: accForm.deadline || undefined }
      : undefined;
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
    // everything that pointed at the account is resolved with it, so no row is
    // left describing a place that no longer exists — see `deleteAccount`
    update((s) => deleteAccount(s, accDeleteId), "Account deleted");
    setAccDeleteId(null);
    setAccForm(null);
  };

  const moveAccount = state.savings.find((a) => a.id === moveId) ?? null;
  const moveCurrent = moveAccount ? (balances.get(moveAccount.id) ?? 0) : 0;
  const moveDelta = parseAmount(moveAmount) - moveCurrent;
  /** where an adjustment is booked: "Other" of the right kind, or any category */
  const adjustCategoryId = (up: boolean) =>
    (up
      ? (state.categories.find((c) => c.id === "cat-other-inc") ??
        state.categories.find((c) => c.kind === "income"))
      : (state.categories.find((c) => c.id === "cat-other-exp") ??
        state.categories.find((c) => c.kind === "expense")))?.id;

  const moveProblem: string | null = (() => {
    if (!moveAccount) return null;
    if (moveAmount.trim() === "" || !Number.isFinite(parseAmount(moveAmount)))
      return "Enter the balance your bank shows.";
    if (Math.abs(moveDelta) < 0.005) return "That already matches — nothing to adjust.";
    if (!adjustCategoryId(moveDelta > 0))
      return "Add an income and an expense category first.";
    return null;
  })();
  const moveValid = moveAccount !== null && moveProblem === null;

  /**
   * Reconciliation: you type what the bank actually shows and the difference
   * is booked as a transaction, so the balance always has a paper trail
   * instead of being silently overwritten.
   */
  const submitMove = () => {
    if (!moveAccount || !moveValid) return;
    const delta = moveDelta;
    const categoryId = adjustCategoryId(delta > 0)!;
    const accountId = moveAccount.id;
    update(
      (s) => ({
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
      }),
      "Balance adjusted",
    );
    setMoveId(null);
    setMoveAmount("");
  };

  /* ---------- investment handlers ---------- */

  const openAddInvestment = () =>
    setInvForm({
      id: null,
      name: "",
      currency: "UAH",
      principal: "",
      rate: "",
      startDate: today,
      endDate: "",
      compounding: "reinvest",
      freq: "monthly",
      contribution: "",
      note: "",
    });

  const openEditInvestment = (inv: Investment) => {
    setInvForm({
      id: inv.id,
      name: inv.name,
      currency: inv.currency,
      principal: String(inv.principal),
      rate: String(inv.annualRatePct),
      startDate: inv.startDate,
      endDate: inv.endDate ?? "",
      compounding: inv.compounding,
      freq: inv.compoundingFreq,
      contribution:
        inv.monthlyContribution != null ? String(inv.monthlyContribution) : "",
      note: inv.note ?? "",
    });
  };

  const invProblem: string | null = (() => {
    if (!invForm) return null;
    if (!invForm.name.trim()) return "Name the investment.";
    const principal = parseAmount(invForm.principal);
    if (!Number.isFinite(principal) || principal <= 0)
      return "The principal has to be greater than zero.";
    const rate = parseAmount(invForm.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 200)
      return "The rate has to be between 0 and 200% a year.";
    if (!invForm.startDate) return "Pick a start date.";
    if (invForm.endDate && invForm.endDate < invForm.startDate)
      return "Maturity has to come after the start date.";
    if (invForm.contribution.trim() !== "") {
      const c = parseAmount(invForm.contribution);
      if (!Number.isFinite(c) || c < 0) return "The monthly top-up has to be zero or more.";
    }
    return null;
  })();
  const invValid = invForm !== null && invProblem === null;

  const submitInvestment = () => {
    if (!invForm || !invValid) return;
    const name = invForm.name.trim();
    const principal = parseAmount(invForm.principal);
    const rate = parseAmount(invForm.rate);
    const typed = invForm.contribution.trim() === "" ? 0 : parseAmount(invForm.contribution);
    const contribution = typed > 0 ? typed : undefined;
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
                endDate: invForm.endDate || undefined,
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
        endDate: invForm.endDate || undefined,
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
    update(
      (s) => ({
        ...s,
        investments: s.investments.filter((inv) => inv.id !== invDeleteId),
      }),
      "Investment deleted",
    );
    setInvDeleteId(null);
    setInvForm(null);
  };

  /* ---------- debt handlers ---------- */

  const openAddDebt = () => {
    setDebtForm({
      id: null,
      name: "",
      kind: "mortgage",
      currency: "UAH",
      balance: "",
      principal: "",
      rate: "",
      monthlyPayment: "",
      note: "",
    });
  };

  const openEditDebt = (debt: Debt) => {
    setDebtForm({
      id: debt.id,
      name: debt.name,
      kind: debt.kind,
      currency: debt.currency,
      balance: String(debt.balance),
      principal: debt.principal != null ? String(debt.principal) : "",
      rate: debt.annualRatePct != null ? String(debt.annualRatePct) : "",
      monthlyPayment: debt.monthlyPayment != null ? String(debt.monthlyPayment) : "",
      note: debt.note ?? "",
    });
  };

  /** an optional number field: blank is fine, and so is zero — both mean "unset" */
  const optionalNumber = (raw: string): number | undefined =>
    raw.trim() === "" ? undefined : parseAmount(raw) || undefined;
  const optionalOutOfRange = (raw: string, max: number) => {
    if (raw.trim() === "") return false;
    const v = parseAmount(raw);
    return !Number.isFinite(v) || v < 0 || v > max;
  };

  const debtProblem: string | null = (() => {
    if (!debtForm) return null;
    if (!debtForm.name.trim()) return "Name the debt.";
    const balance = parseAmount(debtForm.balance);
    if (!Number.isFinite(balance) || balance < 0)
      return "The outstanding balance has to be zero or more.";
    if (optionalOutOfRange(debtForm.principal, 1e12)) return "The original amount looks off.";
    if (optionalOutOfRange(debtForm.rate, 200))
      return "The rate has to be between 0 and 200% a year.";
    if (optionalOutOfRange(debtForm.monthlyPayment, 1e12))
      return "The monthly payment looks off.";
    return null;
  })();
  const debtValid = debtForm !== null && debtProblem === null;

  const submitDebt = () => {
    if (!debtForm || !debtValid) return;
    const name = debtForm.name.trim();
    const balance = parseAmount(debtForm.balance);
    const principal = optionalNumber(debtForm.principal);
    const rate = optionalNumber(debtForm.rate);
    const monthlyPayment = optionalNumber(debtForm.monthlyPayment);
    const note = debtForm.note.trim();

    const fields = {
      name,
      icon: DEBT_KIND_ICON[debtForm.kind],
      kind: debtForm.kind,
      currency: debtForm.currency,
      balance,
      principal,
      annualRatePct: rate,
      monthlyPayment,
      note: note || undefined,
    };

    if (debtForm.id) {
      const id = debtForm.id;
      update((s) => ({
        ...s,
        debts: s.debts.map((d) => (d.id === id ? { ...d, ...fields } : d)),
      }));
    } else {
      update((s) => ({ ...s, debts: [...s.debts, { id: uid(), ...fields }] }));
    }
    setDebtForm(null);
  };

  const confirmDeleteDebt = () => {
    if (!debtDeleteId) return;
    update(
      (s) => ({ ...s, debts: s.debts.filter((d) => d.id !== debtDeleteId) }),
      "Debt deleted",
    );
    setDebtDeleteId(null);
    setDebtForm(null);
  };

  const deletingAccount = state.savings.find((a) => a.id === accDeleteId);
  const deletingInvestment = state.investments.find((i) => i.id === invDeleteId);
  const deletingDebt = state.debts.find((d) => d.id === debtDeleteId);

  /**
   * What deleting this account would touch. An account is rarely alone: a year
   * of groceries and every transfer it ever took part in point at it, and the
   * dialog is the last place to say so before they are all rewritten.
   */
  const accountImpact = (() => {
    if (!deletingAccount) return "";
    const use = accountUsage(state, deletingAccount.id);
    const parts = [
      use.entries > 0 &&
        `${use.entries} ${use.entries === 1 ? "transaction keeps" : "transactions keep"} its amount but stops moving a balance`,
      use.transfers > 0 &&
        `${use.transfers} ${use.transfers === 1 ? "transfer becomes" : "transfers become"} a plain income or expense on the other account`,
      use.recurring > 0 &&
        `${use.recurring} recurring ${use.recurring === 1 ? "rule" : "rules"} lose their account`,
      use.subscriptions > 0 &&
        `${use.subscriptions} ${use.subscriptions === 1 ? "subscription loses its" : "subscriptions lose their"} account`,
    ].filter(Boolean);
    return parts.length > 0 ? ` ${parts.join("; ")}.` : "";
  })();

  const isEmpty =
    state.savings.length === 0 &&
    state.investments.length === 0 &&
    state.debts.length === 0;

  return (
    <>
      <PageHeader
        title="Balance"
        subtitle="Everything you own and owe — net worth at a glance"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={openAddDebt}>
              + Debt
            </Button>
            <Button variant="ghost" onClick={openAddInvestment}>
              + Investment
            </Button>
            <Button onClick={openAddAccount}>+ Account</Button>
          </div>
        }
      />
      <div className="stagger space-y-4 sm:space-y-5">
        {/* three columns only from 1280: at 1152 a third of the row could not
            hold "768,776.07 ₴" on one line, and the accounts table lost its
            account names to ellipses. Below that the hero splits internally
            instead — see the grid inside it. */}
        <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-3">
          {/* net worth hero */}
          <GlassCard className="glow xl:col-span-1">
            {/* side by side while the card owns a wide row, stacked again once
                it is one narrow column of three */}
            <div className="sm:grid sm:grid-cols-2 sm:items-center sm:gap-8 xl:block">
            <div>
            <p className="card-title">Net worth</p>
            <div className="mt-2">
              <TripleMoney amount={worth.total} currency={base} settings={settings} size="lg" />
            </div>
            </div>
            <div className="mt-4 space-y-2.5 border-t border-hairline pt-3.5 text-sm sm:mt-0 sm:border-t-0 sm:pt-0 xl:mt-4 xl:border-t xl:pt-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ink-2">
                  <span aria-hidden className="size-2.5 rounded-sm bg-series-1" />
                  Accounts
                </span>
                <span className="tnum font-semibold text-ink-1">
                  {formatMoney(worth.savings, base, { compact: true })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ink-2">
                  <span aria-hidden className="size-2.5 rounded-sm bg-series-2" />
                  Investments
                </span>
                <span className="tnum font-semibold text-ink-1">
                  {formatMoney(worth.investments, base, { compact: true })}
                </span>
              </div>
              {worth.assets > 0 && (
                <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
                  <div
                    className="bar-slice bg-series-1"
                    style={{ width: `${(worth.savings / worth.assets) * 100}%` }}
                  />
                  <div
                    className="bar-slice bg-series-2"
                    style={{ width: `${(worth.investments / worth.assets) * 100}%` }}
                  />
                </div>
              )}
              {worth.debts > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2.5">
                  <span className="text-ink-2">Debts</span>
                  <span className="tnum font-semibold text-expense">
                    −{formatMoney(worth.debts, base, { compact: true })}
                  </span>
                </div>
              )}
              {worth.debts > 0 && worth.assets > 0 && (
                <p className="text-xs text-ink-3">
                  Debt is {formatPercent((worth.debts / worth.assets) * 100, 0)} of what you
                  own — {formatMoney(worth.assets - worth.debts, base, { compact: true })} is
                  really yours.
                </p>
              )}
            </div>
            </div>
          </GlassCard>

          {!isEmpty && (
            <div className="xl:col-span-2">
            {/* accounts balance sheet */}
            <GlassCard
              title="Accounts"
              subtitle="Where your money sits"
              icon={<Icon name="bank" />}
              action={
                <Button variant="ghost" onClick={openAddAccount}>
                  + Add
                </Button>
              }
            >
              {state.savings.length === 0 ? (
                <EmptyState
                  icon={<Icon name="card" />}
                  title="No accounts yet"
                  hint="Cards, cash, crypto — anything that holds value."
                  action={<Button variant="ghost" onClick={openAddAccount}>+ Add</Button>}
                />
              ) : (
                <div className="space-y-1">
                  <div className="hidden grid-cols-[minmax(0,1fr)_repeat(3,7.5rem)] gap-3 px-2 pb-1 sm:grid">
                    <span className="label">Account</span>
                    <span className="text-right label">₴</span>
                    <span className="text-right label">$</span>
                    <span className="text-right label">€</span>
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
                              className="flex size-10 shrink-0 items-center justify-center rounded-field bg-ghost text-lg"
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
                            <ProgressMeter
                              value={shown}
                              max={goal.target}
                              label={`${acc.name} savings goal`}
                            />
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
                    <span className="text-sm font-semibold text-ink-1">
                      Net worth {worth.debts > 0 ? "(after debts)" : "(incl. investments)"}
                    </span>
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

        {/* debts / liabilities */}
        {state.debts.length > 0 && (
          <GlassCard
            title="Debts"
            subtitle={`You owe ${formatMoney(worth.debts, base, { compact: true })} across ${state.debts.length} ${state.debts.length === 1 ? "liability" : "liabilities"}`}
            icon={<Icon name="card" />}
            action={
              <Button variant="ghost" onClick={openAddDebt}>
                + Add
              </Button>
            }
          >
            <div className="space-y-1">
              {state.debts.map((debt) => {
                const principal = debt.principal ?? 0;
                const hasProgress = principal > 0;
                const paid = Math.max(0, principal - debt.balance);
                return (
                  <button
                    key={debt.id}
                    type="button"
                    onClick={() => openEditDebt(debt)}
                    className="row-tap block w-full px-3 py-2.5 text-left"
                  >
                    <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden
                          className="flex size-10 shrink-0 items-center justify-center rounded-field bg-ghost text-lg"
                        >
                          {debt.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink-1">
                            {debt.name}
                          </span>
                          <span className="block text-xs text-ink-3">
                            {DEBT_KIND_LABEL[debt.kind]}
                            {debt.annualRatePct ? ` · ${formatPercent(debt.annualRatePct)}/yr` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="tnum block text-sm font-semibold text-expense">
                          −{formatMoney(debt.balance, debt.currency, { exact: true })}
                        </span>
                        {debt.currency !== base && (
                          <span className="tnum block text-xs text-ink-3">
                            −{formatMoney(convert(debt.balance, debt.currency, base, settings.rates), base, { compact: true })}
                          </span>
                        )}
                      </span>
                    </span>
                    {hasProgress && (
                      <span className="mt-2 block pl-13 pr-1">
                        <ProgressMeter
                          value={paid}
                          max={principal}
                          label={`${debt.name} paid off`}
                        />
                        <span className="tnum mt-1 block text-xs text-ink-3">
                          {formatMoney(paid, debt.currency, { compact: true })} of{" "}
                          {formatMoney(principal, debt.currency, { compact: true })} paid off (
                          {formatPercent((paid / principal) * 100, 0)})
                          {debt.monthlyPayment
                            ? ` · ${formatMoney(debt.monthlyPayment, debt.currency, { compact: true })}/mo`
                            : ""}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-hairline px-2 pt-2.5">
                <span className="text-sm font-semibold text-ink-1">Total owed</span>
                <span className="tnum text-sm font-semibold text-expense">
                  −{formatMoney(worth.debts, base, { exact: true })}
                </span>
              </div>
            </div>
          </GlassCard>
        )}

        {isEmpty ? (
          <GlassCard>
            <EmptyState
              icon={<Icon name="bank" />}
              title="Nothing here yet"
              hint="Add your accounts (cards, cash, even CS2 skins), interest-bearing investments and any debts to see your full balance sheet."
              action={<Button onClick={openAddAccount}>+ Add account</Button>}
            />
          </GlassCard>
        ) : (
          <>

            {/* investments */}
            {state.investments.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3">
                  <StatTile
                    label="Invested"
                    value={formatMoney(invTotals.invested, base, { compact: true })}
                    hint={`across ${state.investments.length} position${state.investments.length === 1 ? "" : "s"}`}
                  />
                  <StatTile
                    label="Current value"
                    value={formatMoney(invTotals.value, base, { compact: true })}
                    hint={
                      invTotals.invested > 0
                        ? `${formatPercent((invTotals.value / invTotals.invested - 1) * 100)} on what you put in`
                        : undefined
                    }
                  />
                  <StatTile
                    className="col-span-2 md:col-span-1"
                    label="Earned"
                    value={formatMoney(invTotals.earned, base, { compact: true, sign: true })}
                    tone={invTotals.earned > 0 ? "income" : undefined}
                    hint={`${formatMoney(invTotals.earnedInYear, base, { compact: true, sign: true })} expected over the next year`}
                  />
                </div>

                {/* one position keeps the full width — half a card with an empty
                    half-page beside it reads worse than a wide one — and lays
                    its details out in two columns instead; from two they pair */}
                <div
                  className={`grid gap-4 sm:gap-5 ${
                    state.investments.length > 1 ? "xl:grid-cols-2" : ""
                  }`}
                >
                  {state.investments.map((inv) => {
                    const snap = investmentAt(inv, today);
                    const inYear = investmentAt(
                      inv,
                      dateInMonth(addMonths(monthOf(today), 12), Number(today.slice(8, 10))),
                    );
                    const matured = inv.endDate != null && inv.endDate <= today;
                    const caption = matured
                      ? `Matured ${formatDate(inv.endDate!)} · no longer earning`
                      : inv.compounding === "reinvest"
                        ? `Compound interest · ${FREQ_ADVERB[inv.compoundingFreq]} reinvestment`
                        : "Simple interest · paid out to you";
                    const earned = snap.accrued + snap.paidOut;
                    const gainPct = snap.invested > 0 ? (earned / snap.invested) * 100 : 0;
                    const projGain =
                      inYear.accrued - snap.accrued + (inYear.paidOut - snap.paidOut);
                    return (
                      <GlassCard key={inv.id} className="flex flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {/* h2, like every other card title on the page: as
                                an h3 under a page whose only other heading is
                                the h1 it skipped a level */}
                            <h2 className="truncate font-semibold text-ink-1">{inv.name}</h2>
                            <p className="mt-0.5 text-xs text-ink-2">{caption}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-ghost px-2 py-0.5 text-xs font-medium text-ink-2">
                            {inv.currency}
                          </span>
                        </div>

                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <Money
                              amount={snap.value}
                              currency={inv.currency}
                              exact
                              className="num-lg block text-ink-1"
                            />
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  earned >= 0 ? "bg-income/12 text-income" : "bg-expense/12 text-expense"
                                }`}
                              >
                                {earned >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(gainPct))}
                              </span>
                              <span className="tnum text-xs text-ink-3">
                                {formatMoney(earned, inv.currency, { sign: true, compact: true })} earned
                              </span>
                            </div>
                          </div>
                          <Sparkline values={sparkValues(inv, today)} width={116} height={46} />
                        </div>

                        {/* a lone position owns the full page width, and a
                            single column of label-on-the-left rows then spans a
                            metre of nothing; split it in two so the figures
                            stay next to their labels */}
                        <div
                          className={`mt-4 text-sm ${
                            state.investments.length === 1
                              ? "grid gap-x-10 gap-y-1.5 sm:grid-cols-2"
                              : "space-y-1.5"
                          }`}
                        >
                          <InfoRow label="Rate">{formatPercent(inv.annualRatePct)} / year</InfoRow>
                          <InfoRow label="Invested">
                            <Money amount={snap.invested} currency={inv.currency} exact />
                          </InfoRow>
                          {inv.monthlyContribution != null && inv.monthlyContribution > 0 && (
                            <InfoRow label="Top-up">
                              {formatMoney(inv.monthlyContribution, inv.currency)}/mo
                            </InfoRow>
                          )}
                          {/* a matured position has no "in 1 year" — it is
                              finished, and printing +0 beside it read as a
                              rounding error rather than as the end of a term */}
                          {!matured && (
                            <InfoRow label="In 1 year">
                              <span>
                                <Money amount={inYear.value} currency={inv.currency} exact />{" "}
                                <span className="text-income">
                                  (+{formatMoney(projGain, inv.currency)})
                                </span>
                              </span>
                            </InfoRow>
                          )}
                          <InfoRow label="Since">{formatDate(inv.startDate)}</InfoRow>
                          {inv.endDate && (
                            <InfoRow label={matured ? "Matured" : "Matures"}>
                              {formatDate(inv.endDate)}
                            </InfoRow>
                          )}
                        </div>

                        {inv.note && <p className="mt-3 text-xs text-ink-3">{inv.note}</p>}

                        {/* actions sized to their words: stretched across the
                            card they read as the main thing on it */}
                        <div className="mt-auto flex justify-end gap-2 pt-4">
                          <Button variant="ghost" onClick={() => openEditInvestment(inv)}>
                            Edit
                          </Button>
                          <Button variant="danger" onClick={() => setInvDeleteId(inv.id)}>
                            Delete
                          </Button>
                        </div>
                      </GlassCard>
                    );
                  })}

                {/* spans the pair only when there is a pair to span: in the
                    single-column case col-span-2 conjured a second implicit
                    column and squeezed the position card into half the row */}
                <details
                  className={`glass rounded-card px-5 py-3.5 ${
                    state.investments.length > 1 ? "xl:col-span-2" : ""
                  }`}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink-2 transition-colors hover:text-ink-1">
                    <Icon name="info" size={16} />
                    How interest is calculated — reinvest vs payout
                  </summary>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-2">
                    Reinvest means compound interest: accrued interest joins the principal at the
                    chosen frequency and keeps earning, and monthly top-ups compound from the month
                    they land. Payout means simple interest: interest on the invested amount is paid
                    out to you, so the position itself does not grow (the forecast adds payouts to
                    your savings instead).
                  </p>
                </details>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* account sheet */}
      {accForm && (
        <Sheet
          open
          onClose={() => setAccForm(null)}
          onSubmit={submitAccount}
          problem={accProblem}
          title={accForm.id ? "Edit account" : "New account"}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAccForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!accValid}>
                Save
              </Button>
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
          <FieldSet label="Icon">
            <OptionChips
              label="Icon"
              size="lg"
              options={ICON_CHOICES.map((icon) => ({ value: icon, label: icon }))}
              value={accForm.icon}
              onChange={(icon) => setAccForm({ ...accForm, icon })}
            />
          </FieldSet>
          <FieldSet label="Currency">
            <SegmentedControl
              label="Currency"
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={accForm.currency}
              onChange={(v) => setAccForm({ ...accForm, currency: v })}
            />
          </FieldSet>
          <Field
            label="Opening balance"
            hint="What the account held when you started tracking — transactions take it from there"
          >
            <TextInput
              inputMode="decimal"
              prefix={CURRENCY_SYMBOL[accForm.currency]}
              value={accForm.openingBalance}
              onChange={(e) => setAccForm({ ...accForm, openingBalance: e.target.value })}
              placeholder="0"
            />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <span className="body-strong">Savings goal</span>
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
                  prefix={CURRENCY_SYMBOL[accForm.currency]}
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
          {accForm.id && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setMoveId(accForm.id);
                  setMoveAmount("");
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
        onSubmit={submitMove}
        problem={moveProblem}
        title={`Reconcile ${moveAccount?.name ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveId(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!moveValid}>
              Adjust
            </Button>
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
            prefix={moveAccount ? CURRENCY_SYMBOL[moveAccount.currency] : undefined}
            value={moveAmount}
            onChange={(e) => setMoveAmount(e.target.value)}
            placeholder={moveAccount ? String(Math.round(moveCurrent)) : "0"}
          />
        </Field>
      </Sheet>

      {/* investment sheet */}
      {invForm && (
        <Sheet
          open
          onClose={() => setInvForm(null)}
          onSubmit={submitInvestment}
          problem={invProblem}
          title={invForm.id ? "Edit investment" : "New investment"}
          footer={
            <>
              <Button variant="ghost" onClick={() => setInvForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!invValid}>
                Save
              </Button>
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
          <FieldSet label="Currency">
            <SegmentedControl
              label="Currency"
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={invForm.currency}
              onChange={(v) => setInvForm({ ...invForm, currency: v })}
            />
          </FieldSet>
          <Field label="Principal">
            <TextInput
              inputMode="decimal"
              prefix={CURRENCY_SYMBOL[invForm.currency]}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date">
              <TextInput
                type="date"
                value={invForm.startDate}
                onChange={(e) => setInvForm({ ...invForm, startDate: e.target.value })}
              />
            </Field>
            <Field
              label="Matures"
              hint="optional · leave empty for an open-ended holding"
            >
              <TextInput
                type="date"
                value={invForm.endDate}
                min={invForm.startDate || undefined}
                onChange={(e) => setInvForm({ ...invForm, endDate: e.target.value })}
              />
            </Field>
          </div>
          <FieldSet label="Interest type">
            <SegmentedControl
              label="Interest type"
              options={COMPOUNDING_OPTIONS}
              value={invForm.compounding}
              onChange={(v) => setInvForm({ ...invForm, compounding: v })}
            />
          </FieldSet>
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
              prefix={CURRENCY_SYMBOL[invForm.currency]}
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

      {/* debt sheet */}
      {debtForm && (
        <Sheet
          open
          onClose={() => setDebtForm(null)}
          onSubmit={submitDebt}
          problem={debtProblem}
          title={debtForm.id ? "Edit debt" : "New debt"}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDebtForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!debtValid}>
                Save
              </Button>
            </>
          }
        >
          <Field label="Name">
            <TextInput
              value={debtForm.name}
              onChange={(e) => setDebtForm({ ...debtForm, name: e.target.value })}
              placeholder="Apartment mortgage"
            />
          </Field>
          <FieldSet label="Type">
            <SegmentedControl
              label="Type of debt"
              options={DEBT_KIND_OPTIONS}
              value={debtForm.kind}
              onChange={(v) => setDebtForm({ ...debtForm, kind: v })}
            />
          </FieldSet>
          <FieldSet label="Currency">
            <SegmentedControl
              label="Currency"
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={debtForm.currency}
              onChange={(v) => setDebtForm({ ...debtForm, currency: v })}
            />
          </FieldSet>
          <Field
            label="Outstanding balance"
            hint="What you still owe today — this is what lowers your net worth"
          >
            <TextInput
              inputMode="decimal"
              prefix={CURRENCY_SYMBOL[debtForm.currency]}
              value={debtForm.balance}
              onChange={(e) => setDebtForm({ ...debtForm, balance: e.target.value })}
              placeholder="850 000"
            />
          </Field>
          <Field label="Original amount" hint="optional · shows a payoff progress bar">
            <TextInput
              inputMode="decimal"
              prefix={CURRENCY_SYMBOL[debtForm.currency]}
              value={debtForm.principal}
              onChange={(e) => setDebtForm({ ...debtForm, principal: e.target.value })}
              placeholder="1 000 000"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Interest rate" hint="% per year · optional">
              <TextInput
                inputMode="decimal"
                value={debtForm.rate}
                onChange={(e) => setDebtForm({ ...debtForm, rate: e.target.value })}
                placeholder="12.5"
              />
            </Field>
            <Field label="Monthly payment" hint="optional">
              <TextInput
                inputMode="decimal"
                prefix={CURRENCY_SYMBOL[debtForm.currency]}
                value={debtForm.monthlyPayment}
                onChange={(e) => setDebtForm({ ...debtForm, monthlyPayment: e.target.value })}
                placeholder="15 000"
              />
            </Field>
          </div>
          <Field label="Note">
            <TextInput
              value={debtForm.note}
              onChange={(e) => setDebtForm({ ...debtForm, note: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          {debtForm.id && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => setDebtDeleteId(debtForm.id)}
            >
              Delete debt
            </Button>
          )}
        </Sheet>
      )}

      <ConfirmDialog
        open={accDeleteId !== null}
        onClose={() => setAccDeleteId(null)}
        onConfirm={confirmDeleteAccount}
        title="Delete this account?"
        message={`“${deletingAccount?.name ?? ""}” will be removed.${accountImpact}`}
      />
      <ConfirmDialog
        open={invDeleteId !== null}
        onClose={() => setInvDeleteId(null)}
        onConfirm={confirmDeleteInvestment}
        title="Delete this investment?"
        message={`“${deletingInvestment?.name ?? ""}” will be removed from your balance sheet.`}
      />
      <ConfirmDialog
        open={debtDeleteId !== null}
        onClose={() => setDebtDeleteId(null)}
        onConfirm={confirmDeleteDebt}
        title="Delete this debt?"
        message={`“${deletingDebt?.name ?? ""}” will be removed and stop lowering your net worth.`}
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
