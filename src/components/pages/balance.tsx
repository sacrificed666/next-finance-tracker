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
  IconDisc,
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
import {
  ACCOUNT_KINDS,
  accountKind,
  CURRENCIES,
  CURRENCY_SYMBOL,
  ICON_CHOICES,
  INVESTMENT_KINDS,
  investmentKind,
  investmentColorSlot,
  accountColorSlot,
  debtColorSlot,
  valuationOf,
} from "@/lib/constants";
import { COINS, coinInfo, fetchCoinPrices } from "@/lib/crypto";
import {
  addMonths,
  dateInMonth,
  currentMonth,
  formatDate,
  formatDateTime,
  formatMonthCompact,
  monthDiff,
  monthOf,
  todayISO,
} from "@/lib/date";
import {
  accountBalances,
  debtPayoff,
  investmentAt,
  investmentProjectedAt,
  netWorth,
  netWorthByKind,
} from "@/lib/finmath";
import { convert, formatMoney, formatPercent, parseAmount } from "@/lib/money";
import { accountUsage, deleteAccount, uid, useStore } from "@/lib/store";
import type {
  AccountKind,
  Compounding,
  CompoundingFreq,
  Currency,
  Debt,
  DebtKind,
  Investment,
  InvestmentKind,
  SavingsAccount,
  Settings,
} from "@/lib/types";

/* ---------- account form ---------- */

interface AccountForm {
  id: string | null;
  name: string;
  icon: string;
  kind: AccountKind;
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
  kind: InvestmentKind;
  currency: Currency;
  /** what the holding is worth today, on market-valued kinds */
  marketValue: string;
  /** crypto only: which coin, and how many units of it */
  coin: string;
  quantity: string;
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

/**
 * Each asset class's share of the portfolio, in base currency.
 *
 * The first attempt here drew a twelve-month sparkline per tile, and it was
 * wrong: a position contributes nothing before its start date, so a portfolio
 * opened this month renders as twelve zeros and a cliff — a chart saying "you
 * had nothing for a year", which is not what the data means. Composition needs
 * no history and is true on day one.
 */
function investmentsByKind(
  investments: Investment[],
  today: string,
  settings: Settings,
): Array<{ kind: InvestmentKind; invested: number; value: number; earned: number }> {
  const acc = new Map<InvestmentKind, { invested: number; value: number; earned: number }>();
  for (const inv of investments) {
    const snap = investmentAt(inv, today);
    const to = (n: number) =>
      convert(n, inv.currency, settings.baseCurrency, settings.rates);
    const row = acc.get(inv.kind) ?? { invested: 0, value: 0, earned: 0 };
    row.invested += to(snap.invested);
    row.value += to(snap.value);
    row.earned += to(snap.accrued + snap.paidOut);
    acc.set(inv.kind, row);
  }
  return [...acc.entries()]
    .map(([kind, row]) => ({ kind, ...row }))
    .sort((x, y) => y.value - x.value);
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
  const [pricing, setPricing] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  /* ---------- crypto prices ---------- */
  const cryptoPositions = state.investments.filter(
    (i) => i.kind === "crypto" && i.coin && (i.quantity ?? 0) > 0,
  );
  /** newest moment any crypto position was priced, for the freshness line */
  const lastPricedAt = cryptoPositions.reduce<string | undefined>(
    (newest, i) => (i.pricedAt && (!newest || i.pricedAt > newest) ? i.pricedAt : newest),
    undefined,
  );

  /**
   * Re-price every crypto holding from CoinGecko. Coins are quoted directly in
   * the position's own currency, so nothing is converted twice, and a coin the
   * response does not carry keeps whatever it was last worth rather than
   * dropping to zero.
   */
  const refreshPrices = async () => {
    if (cryptoPositions.length === 0) return;
    setPricing(true);
    setPriceError(null);
    try {
      const byCurrency = new Map<Currency, string[]>();
      for (const inv of cryptoPositions) {
        const list = byCurrency.get(inv.currency) ?? [];
        list.push(inv.coin!);
        byCurrency.set(inv.currency, list);
      }
      const quotes = new Map<string, number>();
      for (const [currency, ids] of byCurrency) {
        const prices = await fetchCoinPrices(ids, currency);
        for (const [id, price] of Object.entries(prices)) {
          quotes.set(`${currency}:${id}`, price);
        }
      }
      if (quotes.size === 0) throw new Error("No prices came back for these coins.");
      const pricedAt = new Date().toISOString();
      update((st) => ({
        ...st,
        investments: st.investments.map((inv) => {
          if (inv.kind !== "crypto" || !inv.coin) return inv;
          const price = quotes.get(`${inv.currency}:${inv.coin}`);
          if (price === undefined) return inv;
          return { ...inv, marketValue: (inv.quantity ?? 0) * price, pricedAt };
        }),
      }));
    } catch (err) {
      setPriceError(
        err instanceof Error ? err.message : "Could not reach the price feed.",
      );
    } finally {
      setPricing(false);
    }
  };

  /* ---------- debts state ---------- */
  const [debtForm, setDebtForm] = useState<DebtForm | null>(null);
  const [debtDeleteId, setDebtDeleteId] = useState<string | null>(null);

  const nowMonth = currentMonth();

  /**
   * What the debts cost as a schedule rather than as a balance: the monthly
   * outgoing they commit you to, the month the last of them clears, and the
   * interest still ahead. All three come out of figures already on each row.
   */
  const debtSchedule = state.debts.reduce(
    (acc, d) => {
      acc.payment += convert(d.monthlyPayment ?? 0, d.currency, base, settings.rates);
      const payoff = debtPayoff(d, nowMonth);
      if (payoff && !payoff.neverPaysOff) {
        acc.interest += convert(payoff.interest, d.currency, base, settings.rates);
        if (!acc.lastMonth || payoff.finalMonth > acc.lastMonth) {
          acc.lastMonth = payoff.finalMonth;
        }
      }
      return acc;
    },
    { payment: 0, interest: 0, lastMonth: "" as string },
  );

  /** net worth grouped by asset class, for the allocation strip in the hero */
  const kindRows = netWorthByKind(state, today);

  /* ---------- investments totals ---------- */
  // `earnedInYear` is what the same positions add over the next twelve months
  // if nothing changes — the figure that answers "so what?" next to a balance
  const oneYearOut = dateInMonth(addMonths(monthOf(today), 12), Number(today.slice(8, 10)));
  const invTotals = state.investments.reduce(
    (acc, inv) => {
      const snap = investmentAt(inv, today);
      const ahead = investmentAt(inv, oneYearOut);
      const earned = snap.accrued + snap.paidOut;
      const forward =
        valuationOf(inv.kind) === "market"
          ? investmentProjectedAt(inv, today, oneYearOut) - snap.value
          : ahead.accrued + ahead.paidOut - earned;
      acc.invested += convert(snap.invested, inv.currency, base, settings.rates);
      acc.value += convert(snap.value, inv.currency, base, settings.rates);
      acc.earned += convert(earned, inv.currency, base, settings.rates);
      acc.earnedInYear += convert(forward, inv.currency, base, settings.rates);
      return acc;
    },
    { invested: 0, value: 0, earned: 0, earnedInYear: 0 },
  );
  const invByKind = investmentsByKind(state.investments, today, settings);
  /*
   * Gross movement, split. A per-class bar here printed "Bonds 100%" while the
   * tile above it read −6: the losing class was filtered out by the same
   * `value > 0` rule that keeps a bar from rendering backwards, so the chart
   * silently claimed everything was up. Gains against losses is the honest
   * decomposition, and it is the one that explains the net figure.
   */
  const gains = invByKind.reduce((sum, row) => sum + Math.max(0, row.earned), 0);
  const losses = invByKind.reduce((sum, row) => sum + Math.max(0, -row.earned), 0);

  const kindBar = (pick: "invested" | "value" | "earned") =>
    invByKind
      .filter((row) => row[pick] > 0)
      .map((row) => ({
        label: investmentKind(row.kind).label,
        value: row[pick],
        colorSlot: investmentColorSlot(row.kind),
      }));

  /* ---------- account handlers ---------- */

  const openAddAccount = () =>
    setAccForm({
      id: null,
      name: "",
      icon: ICON_CHOICES[0],
      kind: "card",
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
      kind: acc.kind,
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
            ? {
                ...a,
                name,
                icon: accForm.icon,
                kind: accForm.kind,
                currency: accForm.currency,
                openingBalance,
                goal,
              }
            : a,
        ),
      }));
    } else {
      const acc: SavingsAccount = {
        id: uid(),
        name,
        icon: accForm.icon,
        kind: accForm.kind,
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
      kind: "deposit",
      currency: "UAH",
      marketValue: "",
      coin: COINS[0].id,
      quantity: "",
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
      kind: inv.kind,
      currency: inv.currency,
      marketValue: inv.marketValue != null ? String(inv.marketValue) : "",
      coin: inv.coin ?? COINS[0].id,
      quantity: inv.quantity != null ? String(inv.quantity) : "",
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

  // A deposit is valued from a rate; a crypto holding from a quantity and a
  // live price; everything else from a figure you state. Each branch reads only
  // its own fields, so switching kind can never smuggle the other kind's data in.
  const invMarket = invForm != null && valuationOf(invForm.kind) === "market";
  const invCrypto = invForm?.kind === "crypto";

  const invProblem: string | null = (() => {
    if (!invForm) return null;
    if (!invForm.name.trim()) return "Name the investment.";
    const principal = parseAmount(invForm.principal);
    if (!Number.isFinite(principal) || principal <= 0)
      return "What you put in has to be greater than zero.";
    if (!invForm.startDate) return "Pick a start date.";
    if (invMarket && invForm.rate.trim() !== "") {
      const expected = parseAmount(invForm.rate);
      if (!Number.isFinite(expected) || expected < 0 || expected > 200)
        return "The expected return has to be between 0 and 200% a year.";
    }
    if (invCrypto) {
      const q = parseAmount(invForm.quantity);
      if (!Number.isFinite(q) || q <= 0) return "Enter how many coins you hold.";
      return null;
    }
    if (invForm.contribution.trim() !== "") {
      const c = parseAmount(invForm.contribution);
      if (!Number.isFinite(c) || c < 0) return "The monthly top-up has to be zero or more.";
    }
    if (invMarket) {
      if (invForm.marketValue.trim() === "") return null; // falls back to cost
      const v = parseAmount(invForm.marketValue);
      if (!Number.isFinite(v) || v < 0) return "The current value has to be zero or more.";
      return null;
    }
    const rate = parseAmount(invForm.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 200)
      return "The rate has to be between 0 and 200% a year.";
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
    const note = invForm.note.trim();
    const market = valuationOf(invForm.kind) === "market";
    const crypto = invForm.kind === "crypto";

    // on a market kind this is an assumption, not a contract — blank means
    // "no view", which projects the holding flat
    const typedRate = parseAmount(invForm.rate);
    const rate =
      market && (invForm.rate.trim() === "" || !Number.isFinite(typedRate))
        ? 0
        : typedRate;
    const typed =
      invForm.contribution.trim() === "" ? 0 : parseAmount(invForm.contribution);
    const contribution = typed > 0 ? typed : undefined;
    const quantity = crypto ? parseAmount(invForm.quantity) : undefined;
    // a fresh crypto position has no price yet — it shows its cost basis until
    // the first refresh, rather than a zero that looks like a wiped-out holding
    const stated = parseAmount(invForm.marketValue);
    const marketValue = !market
      ? undefined
      : crypto
        ? (invForm.id ? state.investments.find((i) => i.id === invForm.id)?.marketValue : undefined) ??
          principal
        : invForm.marketValue.trim() === "" || !Number.isFinite(stated)
          ? principal
          : stated;

    const kindFields = {
      kind: invForm.kind,
      marketValue,
      coin: crypto ? invForm.coin : undefined,
      quantity: crypto ? quantity : undefined,
      endDate: invForm.endDate || undefined,
      monthlyContribution: contribution,
    };

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
                note: note || undefined,
                ...kindFields,
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
        note: note || undefined,
        ...kindFields,
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
            {/* a whole glass panel to hold one button and a timestamp was three
                times the height of the thing it did; the timestamp is a title
                and the action is just an action */}
            {cryptoPositions.length > 0 && (
              <Button
                variant="ghost"
                disabled={pricing}
                title={
                  priceError ??
                  (lastPricedAt
                    ? `Crypto priced ${formatDateTime(lastPricedAt)}`
                    : "Crypto has never been priced — showing what you paid")
                }
                onClick={() => void refreshPrices()}
              >
                <Icon name="repeat" size={15} />
                {pricing ? "Pricing…" : "Prices"}
              </Button>
            )}
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
          <GlassCard title="Net worth" icon="wallet" className="glow xl:col-span-1">
            {/* side by side while the card owns a wide row, stacked again once
                it is one narrow column of three */}
            <div className="sm:grid sm:grid-cols-2 sm:items-center sm:gap-8 xl:block">
            <div>
            <div>
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
              {/* Two slices said cash-versus-not, which on a balance sheet that
                  now knows deposits from crypto is the least interesting cut of
                  it. One strip per asset class answers the question a balance
                  sheet is for: how concentrated am I, and in what. */}
              {worth.assets > 0 && kindRows.length > 0 && (
                <div>
                  <div
                    className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
                    role="img"
                    aria-label="Net worth by asset class"
                  >
                    {kindRows.map((row, i) => (
                      <div
                        key={row.id}
                        className="bar-slice"
                        title={`${row.label}: ${formatMoney(row.base, base, { compact: true })}`}
                        style={{
                          width: `${(row.base / worth.assets) * 100}%`,
                          background: `var(--series-${row.colorSlot})`,
                          "--i": i,
                        } as React.CSSProperties}
                      />
                    ))}
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {kindRows.map((row) => (
                      <li key={row.id} className="flex items-center gap-1.5 text-xs text-ink-2">
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-sm"
                          style={{ background: `var(--series-${row.colorSlot})` }}
                        />
                        {row.label}
                        <span className="tnum text-ink-3">
                          {formatPercent((row.base / worth.assets) * 100, 0)}
                        </span>
                      </li>
                    ))}
                  </ul>
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
              icon="bank"
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
                            <IconDisc
                              colorSlot={accountColorSlot(acc.kind)}
                              className="size-10 rounded-field text-lg"
                            >
                              {acc.icon}
                            </IconDisc>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-ink-1">
                                {acc.name}
                              </span>
                              <span className="block text-xs text-ink-3">
                                {accountKind(acc.kind).label} · {acc.currency}
                              </span>
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
            icon="debt"
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
                // the card showed how far you had come and never once said when
                // it ends — which is the only thing a debt is really asking
                const payoff = debtPayoff(debt, nowMonth);
                return (
                  <button
                    key={debt.id}
                    type="button"
                    onClick={() => openEditDebt(debt)}
                    className="row-tap block w-full px-3 py-2.5 text-left"
                  >
                    <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <IconDisc
                          colorSlot={debtColorSlot(debt.kind)}
                          className="size-10 rounded-field text-lg"
                        >
                          {debt.icon}
                        </IconDisc>
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
                    {payoff && (
                      <span className="mt-1.5 block pl-13 pr-1 text-xs">
                        {payoff.neverPaysOff ? (
                          <span className="text-expense">
                            The payment does not cover the monthly interest — this
                            balance grows.
                          </span>
                        ) : (
                          <span className="tnum text-ink-2">
                            Clear by{" "}
                            <span className="font-semibold text-ink-1">
                              {formatMonthCompact(payoff.finalMonth)}
                            </span>{" "}
                            · {payoff.months} payment{payoff.months === 1 ? "" : "s"}
                            {payoff.interest > 0.5 && (
                              <>
                                {" "}
                                · {formatMoney(payoff.interest, debt.currency, { compact: true })}{" "}
                                interest left
                              </>
                            )}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-hairline px-2 pt-2.5">
                <span className="text-sm font-semibold text-ink-1">Total owed</span>
                <span className="tnum text-sm font-semibold text-expense">
                  −{formatMoney(worth.debts, base, { exact: true })}
                </span>
                {debtSchedule.payment > 0 && (
                  <span className="caption w-full">
                    {formatMoney(debtSchedule.payment, base, { compact: true })}/mo scheduled
                    {debtSchedule.lastMonth &&
                      ` · last payment ${formatMonthCompact(debtSchedule.lastMonth)}`}
                    {debtSchedule.interest > 0.5 &&
                      ` · ${formatMoney(debtSchedule.interest, base, { compact: true })} interest still to pay`}
                  </span>
                )}
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
                  {/* Three parts of one sentence: what went in, what it is
                      worth, what the difference is. The middle tile carries the
                      return as a `delta` rather than a grey hint — it is a
                      verdict, and it was the one number here printed in the same
                      ink as the boilerplate under it. */}
                  <StatTile
                    label="Invested"
                    icon="arrowDown"
                    value={formatMoney(invTotals.invested, base, { compact: true })}
                    bar={kindBar("invested")}
                    hint={`across ${state.investments.length} position${state.investments.length === 1 ? "" : "s"}`}
                  />
                  <StatTile
                    label="Current value"
                    icon="banknote"
                    value={formatMoney(invTotals.value, base, { compact: true })}
                    bar={[
                      { label: "Paid in", value: invTotals.invested, colorSlot: 6 },
                      { label: "Earned", value: Math.max(0, invTotals.earned), colorSlot: 4 },
                    ]}
                    delta={
                      invTotals.invested > 0
                        ? {
                            text: `${formatPercent((invTotals.value / invTotals.invested - 1) * 100)} on what you put in`,
                            good: invTotals.value >= invTotals.invested,
                          }
                        : undefined
                    }
                  />
                  <StatTile
                    className="col-span-2 md:col-span-1"
                    label="Earned"
                    icon="trend"
                    value={formatMoney(invTotals.earned, base, { compact: true, sign: true })}
                    bar={[
                      { label: "Gains", value: gains, color: "var(--income)" },
                      { label: "Losses", value: losses, color: "var(--expense)" },
                    ]}
                    // a loss was printed in the same ink as a gain
                    tone={
                      invTotals.earned > 0 ? "income" : invTotals.earned < 0 ? "expense" : undefined
                    }
                    hint={
                      invTotals.earnedInYear !== 0
                        ? `${formatMoney(invTotals.earnedInYear, base, { compact: true, sign: true })} expected over the next year`
                        : "market holdings are shown at what they are worth, not projected"
                    }
                  />
                </div>

                {/* one position keeps the full width — half a card with an empty
                    half-page beside it reads worse than a wide one — and lays
                    its details out in two columns instead; from two they pair */}
                {/* Positions are a list of small facts, not a set of hero
                    cards: a 28px figure and five label/value rows do not need
                    half a desktop each. Three across from `xl`, two from `md`,
                    and a lone position stops at half — the table inside it has
                    fixed rails, so a card a metre wide just stretches the gap
                    between every label and its own number. */}
                <div
                  className={`grid gap-4 sm:gap-5 ${
                    state.investments.length > 1
                      ? "md:grid-cols-2 xl:grid-cols-3"
                      : "md:grid-cols-2"
                  }`}
                >
                  {state.investments.map((inv) => {
                    const snap = investmentAt(inv, today);
                    const inYear = investmentAt(
                      inv,
                      dateInMonth(addMonths(monthOf(today), 12), Number(today.slice(8, 10))),
                    );
                    const market = valuationOf(inv.kind) === "market";
                    const coin = coinInfo(inv.coin);
                    const matured = inv.endDate != null && inv.endDate <= today;
                    const kindMeta = investmentKind(inv.kind);
                    const slot = investmentColorSlot(inv.kind);
    /*
     * The sentence that used to sit under the table said almost nothing the
     * table did not already say: it repeated the rate, the quantity and the
     * maturity date, and wrapped them in prose. What was genuinely only in
     * there is how the return behaves — compounded or simple, kept or paid out
     * — and when a live-priced holding was last valued. Both are facts, so both
     * are rows now, and the paragraph is gone.
     */
                    const returnMode = market
                      ? inv.compounding === "reinvest"
                        ? "Reinvested"
                        : "Paid out"
                      : inv.compounding === "reinvest"
                        ? `Compound · ${FREQ_ADVERB[inv.compoundingFreq]}`
                        : "Simple · paid out";
                    const earned = snap.accrued + snap.paidOut;
                    const gainPct = snap.invested > 0 ? (earned / snap.invested) * 100 : 0;
                    const projValue = investmentProjectedAt(inv, today, oneYearOut);
                    /*
                     * The RETURN, not the change in value. On a position with a
                     * monthly top-up those are wildly different numbers: a REIT
                     * worth $250 that you pay $100 a month into reaches $1,540 in
                     * a year, and calling the $1,291 difference "gain" credits
                     * the market with twelve deposits you made yourself.
                     *
                     * The accrual branch never had the bug — `accrued` is value
                     * minus invested, and invested already counts contributions.
                     * The market branch had no such subtraction.
                     */
                    const yearDeposits = (inv.monthlyContribution ?? 0) * 12;
                    const projGain =
                      valuationOf(inv.kind) === "market"
                        ? projValue - snap.value - yearDeposits
                        : inYear.accrued - snap.accrued + (inYear.paidOut - snap.paidOut);
                    return (
                      <GlassCard key={inv.id} className="flex flex-col">
                        <div className="flex items-start gap-3">
                          {/* The kind wearing its own chart colour — the same
                              one it owns in the asset-class strip on both
                              heroes, so a position is recognisable before you
                              have read its name. */}
                          <IconDisc colorSlot={slot} className="size-11 rounded-field text-xl">
                            {kindMeta.icon}
                          </IconDisc>
                          <div className="min-w-0 flex-1">
                            {/* h2, like every other card title on the page: as
                                an h3 under a page whose only other heading is
                                the h1 it skipped a level */}
                            <h2 className="truncate font-semibold text-ink-1">{inv.name}</h2>
                            <p className="mt-0.5 truncate text-xs font-medium text-ink-3">
                              {kindMeta.label} · {inv.currency}
                            </p>
                          </div>
                          {/* The verdict, in the corner two grey pills used to
                              waste. It was buried under the figure, which is
                              where you look last; the corner is where the eye
                              lands after the name. */}
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                              earned >= 0
                                ? "bg-income/12 text-income ring-income/20"
                                : "bg-expense/12 text-expense ring-expense/20"
                            }`}
                          >
                            {/* the trend glyph, mirrored for a fall: the same
                                line going the other way */}
                            <Icon
                              name="trend"
                              size={13}
                              className={earned >= 0 ? "" : "-scale-y-100"}
                            />
                            {formatPercent(Math.abs(gainPct))}
                          </span>
                        </div>

                        {/* the one line on the card that is genuinely prose —
                            yours, not the app's — so it sits with the name
                            rather than stranded below the table */}
                        {inv.note && (
                          <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-3 italic">
                            {inv.note}
                          </p>
                        )}

                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <Money
                              amount={snap.value}
                              currency={inv.currency}
                              exact
                              className="num-md block text-ink-1"
                            />
                            <p className="tnum mt-1.5 text-xs text-ink-3">
                              {formatMoney(earned, inv.currency, { sign: true, compact: true })}{" "}
                              earned
                            </p>
                          </div>
                          {!market && <Sparkline values={sparkValues(inv, today)} width={116} height={46} />}
                        </div>

                        {/* A real table rather than a stack of floating pairs:
                            one recessed well, a hairline between rows, labels
                            and figures on fixed rails. Eight facts in a bare
                            column with nothing between them made the eye count
                            lines to keep a label with its number. */}
                        {/* `mb-4` is load-bearing: the actions below use
                            `mt-auto`, which collapses to zero the moment the
                            card's content fills its height — and then the
                            footer's hairline landed flush on the well's own
                            bottom edge and read as a line drawn through the
                            table. */}
                        <dl className="glass-well mt-4 mb-4 divide-y divide-hairline overflow-hidden rounded-field text-sm">
                          {/* a market holding has no rate and no projection —
                              printing either would be inventing a return the
                              app has no way to know */}
                          {(!market || inv.annualRatePct > 0) && (
                            <InfoRow label={market ? "Expected" : "Rate"}>
                              {formatPercent(inv.annualRatePct)} / year
                            </InfoRow>
                          )}
                          {/* how the return behaves, not just how big it is:
                              a deposit that pays out and one that compounds
                              are different instruments at the same rate */}
                          {!matured && (!market || inv.annualRatePct > 0) && (
                            <InfoRow label="Return">{returnMode}</InfoRow>
                          )}
                          {coin && inv.quantity ? (
                            <InfoRow label="Holding">
                              {inv.quantity} {coin.symbol}
                            </InfoRow>
                          ) : null}
                          {coin && inv.quantity && inv.marketValue ? (
                            <InfoRow label="Price">
                              <Money
                                amount={inv.marketValue / inv.quantity}
                                currency={inv.currency}
                                exact
                              />
                            </InfoRow>
                          ) : null}
                          {inv.pricedAt && (
                            <InfoRow label="Priced">{formatDateTime(inv.pricedAt)}</InfoRow>
                          )}
                          <InfoRow label={market ? "Paid" : "Invested"}>
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
                          {/* a projection needs something to project with: a
                              contracted rate, or an expected return you stated.
                              A market holding with no view stays where it is. */}
                          {!matured && (!market || inv.annualRatePct > 0 || yearDeposits > 0) && (
                            <InfoRow label="In 1 year">
                              <span>
                                <Money
                                  amount={market ? projValue : inYear.value}
                                  currency={inv.currency}
                                  exact
                                />{" "}
                                {projGain > 0.5 && (
                                  <span className="text-income">
                                    (+{formatMoney(projGain, inv.currency)} earned)
                                  </span>
                                )}
                              </span>
                            </InfoRow>
                          )}
                          {/* deposits are yours, so they are named as yours
                              rather than folded into the figure beside them */}
                          {yearDeposits > 0 && (
                            <InfoRow label="You add">
                              {formatMoney(yearDeposits, inv.currency, { compact: true })} a year
                            </InfoRow>
                          )}
                          <InfoRow label="Since">{formatDate(inv.startDate)}</InfoRow>
                          {inv.endDate && (
                            <InfoRow label={matured ? "Matured" : "Matures"}>
                              {formatDate(inv.endDate)}
                            </InfoRow>
                          )}
                        </dl>

                        {/* Stretched to the card's own edges and split evenly.
                            Huddled at the right they left a bar of dead space
                            under the table and read as an afterthought; at full
                            width the pair reads as the card's footer, and the
                            hairline above says where the facts stop and the
                            actions begin. */}
                        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-hairline pt-4">
                          <Button
                            variant="ghost"
                            className="w-full"
                            onClick={() => openEditInvestment(inv)}
                          >
                            <Icon name="edit" size={15} />
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            className="w-full"
                            onClick={() => setInvDeleteId(inv.id)}
                          >
                            <Icon name="trash" size={15} />
                            Delete
                          </Button>
                        </div>
                      </GlassCard>
                    );
                  })}

                {/* Spans the full row when there are cards above it to span.
                    With a single position it stays one cell wide instead and
                    sits beside that card, which is the only thing left to fill
                    the empty half of the row. */}
                <details
                  className={`glass rounded-card px-5 py-3.5 ${
                    state.investments.length > 1 ? "md:col-span-2 xl:col-span-3" : ""
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
          {/* changes no arithmetic — it is what lets the balance sheet say where
              the cash is instead of lumping every account into one figure */}
          <Field label="Kind">
            <Select
              value={accForm.kind}
              onChange={(e) =>
                setAccForm({ ...accForm, kind: e.target.value as AccountKind })
              }
            >
              {ACCOUNT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.icon} {k.label}
                </option>
              ))}
            </Select>
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
          {/* the kind comes first because it decides what the rest of the form
              is even allowed to ask: a deposit has a rate, a coin has a
              quantity, and neither should be able to hold the other's data */}
          <Field label="Type" hint={investmentKind(invForm.kind).hint}>
            <Select
              value={invForm.kind}
              onChange={(e) =>
                setInvForm({ ...invForm, kind: e.target.value as InvestmentKind })
              }
            >
              {INVESTMENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.icon} {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name">
            <TextInput
              value={invForm.name}
              onChange={(e) => setInvForm({ ...invForm, name: e.target.value })}
              placeholder={invCrypto ? "Cold wallet" : "Government bonds"}
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

          {invCrypto && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Coin">
                <Select
                  value={invForm.coin}
                  onChange={(e) => setInvForm({ ...invForm, coin: e.target.value })}
                >
                  {COINS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.symbol} — {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="How many" hint="units held, not their value">
                <TextInput
                  inputMode="decimal"
                  value={invForm.quantity}
                  onChange={(e) => setInvForm({ ...invForm, quantity: e.target.value })}
                  placeholder="0.25"
                />
              </Field>
            </div>
          )}

          <Field
            label={invMarket ? "What you paid" : "Principal"}
            hint={invMarket ? "your cost basis — the gain is measured against it" : undefined}
          >
            <TextInput
              inputMode="decimal"
              prefix={CURRENCY_SYMBOL[invForm.currency]}
              value={invForm.principal}
              onChange={(e) => setInvForm({ ...invForm, principal: e.target.value })}
              placeholder="50 000"
            />
          </Field>

          {invMarket && !invCrypto && (
            <Field
              label="Worth today"
              hint="restate it whenever you check — nothing here moves it on its own"
            >
              <TextInput
                inputMode="decimal"
                prefix={CURRENCY_SYMBOL[invForm.currency]}
                value={invForm.marketValue}
                onChange={(e) => setInvForm({ ...invForm, marketValue: e.target.value })}
                placeholder={invForm.principal || "0"}
              />
            </Field>
          )}

          <Field
            label={invMarket ? "Expected return" : "Rate"}
            hint={
              invMarket
                ? "% per year · optional — used only to project forward, never to value it today"
                : "% per year"
            }
          >
            <TextInput
              inputMode="decimal"
              value={invForm.rate}
              onChange={(e) => setInvForm({ ...invForm, rate: e.target.value })}
              placeholder={invMarket ? "0" : "15.3"}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={invMarket ? "Bought on" : "Start date"}>
              <TextInput
                type="date"
                value={invForm.startDate}
                onChange={(e) => setInvForm({ ...invForm, startDate: e.target.value })}
              />
            </Field>
            {/* a fund you plan to sell in 2030 has an end as surely as a deposit
                does — this was accrual-only for no reason */}
            <Field
              label={invMarket ? "Held until" : "Matures"}
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

          {/* a REIT's dividend either buys more units or lands in your account,
              and the two make very different curves — the same choice a deposit
              has always had */}
          <FieldSet
            label={invMarket ? "Returns" : "Interest type"}
            hint={
              invMarket
                ? "Reinvest buys more of the position; payout sends it to your savings"
                : undefined
            }
          >
            <SegmentedControl
              label={invMarket ? "Returns" : "Interest type"}
              options={COMPOUNDING_OPTIONS}
              value={invForm.compounding}
              onChange={(v) => setInvForm({ ...invForm, compounding: v })}
            />
          </FieldSet>
          {!invMarket && invForm.compounding === "reinvest" && (
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
          <Field
            label="Monthly top-up"
            hint={
              invMarket
                ? "optional · what you keep buying each month, used by the forecast"
                : "optional"
            }
          >
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

/**
 * One row of a position's table. A wrapping div around dt/dd is valid inside a
 * `<dl>`, and it gives the divider between rows something to sit on.
 */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="text-ink-2">{label}</dt>
      <dd className="tnum text-right font-medium text-ink-1">{children}</dd>
    </div>
  );
}
