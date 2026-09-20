"use client";

import { useState, type ReactNode } from "react";
import { Sparkline, StatTile } from "@/components/charts";
import {
  AddButton,
  Button,
  Callout,
  ConfirmDialog,
  CurrencyCells,
  EmptyState,
  Field,
  FieldSet,
  FilterPills,
  GlassCard,
  IconDisc,
  Monogram,
  Money,
  OptionChips,
  PageHeader,
  ProgressMeter,
  RemoteLogo,
  SearchInput,
  SegmentedControl,
  Select,
  Sheet,
  SortSelect,
  Switch,
  TextInput,
  Toolbar,
  TripleMoney,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  ACCOUNT_KINDS,
  CURRENCIES,
  CURRENCY_SYMBOL,
  displayCurrencies,
  ICON_CHOICES,
  INVESTMENT_KINDS,
  investmentKind,
  investmentColorSlot,
  accountColorSlot,
  debtColorSlot,
  valuationOf,
} from "@/lib/constants";
import { COINS, coinInfo, holdingsValue } from "@/lib/crypto";
import { lastPricedAt, loadCoinQuotes, pricedPositions } from "@/lib/refresh";
import {
  BANKABLE_KINDS,
  BRAND_GROUP_LABEL_KEY,
  BRAND_GROUP_ORDER,
  BRANDS,
  brandInfo,
  brandLogoSources,
  INZHUR_LOGO,
} from "@/lib/brands";
import { CUSTOM_GAME_ID, GAMES, gameLabel, gameLogoSources } from "@/lib/games";
import { fetchInzhurQuotes, INZHUR_FUNDS, inzhurFund, type InzhurQuote } from "@/lib/inzhur";
import { returnPolicy, type ReturnPolicy } from "@/lib/returns";
import {
  addMonths,
  dateInMonth,
  currentMonth,
  formatDate,
  formatDateTime,
  formatTime,
  formatMonthCompact,
  monthDiff,
  monthOf,
  todayISO,
} from "@/lib/date";
import {
  accountBalances,
  debtPayoff,
  investmentAt,
  netWorth,
  netWorthByKind,
  projectedSnapshot,
} from "@/lib/finmath";
import { convert, formatMoney, formatNumber, formatPercent, parseAmount } from "@/lib/money";
import { accountUsage, deleteAccount, uid, useStore } from "@/lib/store";
import { useT, type MessageKey } from "@/lib/i18n";
import { matchesQuery, oneOf, sortItems, usePersistentState, type SortDirection } from "@/lib/listing";
import type {
  AccountKind,
  CoinHolding,
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

interface AccountForm {
  id: string | null;
  name: string;
  icon: string;
  kind: AccountKind;
  game: string;
  gameName: string;
  gameLogo: string;
  bank: string;
  currency: Currency;
  openingBalance: string;
  holdings: HoldingDraft[];
  pricedAt: string | null;
  goalEnabled: boolean;
  target: string;
  deadline: string;
}

interface HoldingDraft {
  key: string;
  coin: string;
  quantity: string;
  price?: number;
  icon?: string;
}

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

const DEBT_KIND_ICON: Record<DebtKind, string> = {
  mortgage: "🏠",
  loan: "🏦",
  card: "💳",
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

type AccountSort = "name" | "balance" | "kind";
type InvestmentSort = "value" | "gain" | "name" | "start";
type DebtSort = "balance" | "rate" | "payoff" | "name";

const HTTPS_URL = /^https:\/\/\S{3,480}$/;

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

function investmentsByKind(
  investments: Investment[],
  today: string,
  settings: Settings,
): Array<{ kind: InvestmentKind; invested: number; value: number; earned: number }> {
  const acc = new Map<InvestmentKind, { invested: number; value: number; earned: number }>();
  for (const inv of investments) {
    const snap = investmentAt(inv, today);
    const to = (n: number) => convert(n, inv.currency, settings.baseCurrency, settings.rates);
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

function AccountMark({ acc }: { acc: SavingsAccount }) {
  if (acc.kind === "skins") {
    return (
      <RemoteLogo
        sources={gameLogoSources(acc.game, acc.gameLogo)}
        fallback={acc.icon}
        alt={gameLabel(acc.game, acc.gameName) ?? ""}
        rounded="md"
        size={30}
      />
    );
  }
  const brand = brandInfo(acc.bank);
  if (brand) {
    return (
      <RemoteLogo
        sources={brandLogoSources(brand.id)}
        fallback={<Monogram name={brand.name} color={brand.color} />}
        alt={brand.name}
      />
    );
  }
  const coinIcon = acc.kind === "crypto" ? acc.holdings?.find((h) => h.icon)?.icon : undefined;
  if (coinIcon) return <RemoteLogo sources={[coinIcon]} fallback={acc.icon} />;
  return <>{acc.icon}</>;
}

type Translate = ReturnType<typeof useT>["t"];

function returnLabel(policy: ReturnPolicy, kind: InvestmentKind, freq: CompoundingFreq, t: Translate): string {
  switch (policy.style) {
    case "interest":
      return policy.compounding === "reinvest"
        ? t("balance.inv.mode.compound", { freq: t(`freq.${freq}.adverb`) })
        : t("balance.inv.mode.simple");
    case "coupons":
      return t("balance.inv.mode.coupons");
    case "dividends":
      if (policy.compounding === "reinvest") return t("balance.inv.mode.dividendsReinvested");
      return kind === "inzhur" ? t("balance.inv.mode.monthlyDividends") : t("balance.inv.mode.dividends");
    default:
      return t("balance.inv.mode.growth");
  }
}

function yieldRange(min: number, max: number | undefined, currency: string | undefined, t: Translate): string {
  const pct = max && max > min ? `${formatPercent(min)}–${formatPercent(max)}` : formatPercent(min);
  return t("balance.perYear", { pct }) + (currency ? ` · ${currency}` : "");
}

function nextHourLabel(): string {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return formatTime(next.toISOString());
}

function holdingDrafts(holdings: CoinHolding[] | undefined): HoldingDraft[] {
  return (holdings ?? []).map((h) => ({
    key: uid(),
    coin: h.coin,
    quantity: String(h.quantity),
    price: h.price,
    icon: h.icon,
  }));
}

function holdingsSummary(holdings: CoinHolding[] | undefined): string {
  return (holdings ?? [])
    .map((h) => `${formatNumber(h.quantity, 8)} ${coinInfo(h.coin)?.symbol ?? h.coin.toUpperCase()}`)
    .join(" · ");
}

export function BalancePage() {
  const { state, update } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();

  const worth = netWorth(state, today);
  const balances = accountBalances(state, today);
  const shownCurrencies = displayCurrencies(state);
  const currencyGrid = { gridTemplateColumns: `minmax(0,1fr) repeat(${shownCurrencies.length}, 7.25rem)` };

  const [accForm, setAccForm] = useState<AccountForm | null>(null);
  const [coinLoading, setCoinLoading] = useState(false);
  const [coinError, setCoinError] = useState<string | null>(null);
  const [accDeleteId, setAccDeleteId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [moveAmount, setMoveAmount] = useState("");
  const [accQuery, setAccQuery] = useState("");
  const [accKindFilter, setAccKindFilter] = useState<AccountKind | "all">("all");
  const [accSort, setAccSort] = usePersistentState<AccountSort>("acc.sort", "balance", oneOf(["name", "balance", "kind"] as const));
  const [accDir, setAccDir] = usePersistentState<SortDirection>("acc.dir", "desc", oneOf(["asc", "desc"] as const));

  const [invForm, setInvForm] = useState<InvestmentForm | null>(null);
  const [invDeleteId, setInvDeleteId] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [invQuery, setInvQuery] = useState("");
  const [invKindFilter, setInvKindFilter] = useState<InvestmentKind | "all">("all");
  const [invSort, setInvSort] = usePersistentState<InvestmentSort>("inv.sort", "value", oneOf(["value", "gain", "name", "start"] as const));
  const [invDir, setInvDir] = usePersistentState<SortDirection>("inv.dir", "desc", oneOf(["asc", "desc"] as const));

  const [debtForm, setDebtForm] = useState<DebtForm | null>(null);
  const [debtDeleteId, setDebtDeleteId] = useState<string | null>(null);
  const [debtSort, setDebtSort] = usePersistentState<DebtSort>("debt.sort", "balance", oneOf(["balance", "rate", "payoff", "name"] as const));
  const [debtDir, setDebtDir] = usePersistentState<SortDirection>("debt.dir", "desc", oneOf(["asc", "desc"] as const));

  const accountKindLabel = (kind: AccountKind) => t(`accountKind.${kind}`);
  const investmentKindLabel = (kind: InvestmentKind) => t(`investmentKind.${kind}`);

  const priced = pricedPositions(state);
  const pricedCount =
    priced.coinInvestments.length + priced.inzhurInvestments.length + priced.coinAccounts.length;
  const pricedAt = lastPricedAt(state);

  const nowMonth = currentMonth();

  const debtSchedule = state.debts.reduce(
    (acc, d) => {
      acc.payment += convert(d.monthlyPayment ?? 0, d.currency, base, settings.rates);
      const payoff = debtPayoff(d, nowMonth);
      if (payoff && !payoff.neverPaysOff) {
        acc.interest += convert(payoff.interest, d.currency, base, settings.rates);
        if (!acc.lastMonth || payoff.finalMonth > acc.lastMonth) acc.lastMonth = payoff.finalMonth;
      }
      return acc;
    },
    { payment: 0, interest: 0, lastMonth: "" as string },
  );

  const kindRows = netWorthByKind(state, today);
  const kindRowLabel = (id: string) => {
    const [family, value] = id.split(":");
    return family === "acc" ? accountKindLabel(value as AccountKind) : investmentKindLabel(value as InvestmentKind);
  };

  const oneYearOut = dateInMonth(addMonths(monthOf(today), 12), Number(today.slice(8, 10)));
  const invTotals = state.investments.reduce(
    (acc, inv) => {
      const snap = investmentAt(inv, today);
      const ahead = investmentAt(inv, oneYearOut);
      const earned = snap.accrued + snap.paidOut;
      const proj = projectedSnapshot(inv, today, oneYearOut);
      const forward =
        valuationOf(inv.kind) === "market"
          ? proj.value - snap.value - (inv.monthlyContribution ?? 0) * 12 + proj.paidOut
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
  const gains = invByKind.reduce((sum, row) => sum + Math.max(0, row.earned), 0);
  const losses = invByKind.reduce((sum, row) => sum + Math.max(0, -row.earned), 0);

  const kindBar = (pick: "invested" | "value" | "earned") =>
    invByKind
      .filter((row) => row[pick] > 0)
      .map((row) => ({
        label: investmentKindLabel(row.kind),
        value: row[pick],
        colorSlot: investmentColorSlot(row.kind),
      }));

  const accountBase = (acc: SavingsAccount) =>
    convert(balances.get(acc.id) ?? 0, acc.currency, base, settings.rates);
  const accKindCounts = new Map<AccountKind, number>();
  for (const acc of state.savings) accKindCounts.set(acc.kind, (accKindCounts.get(acc.kind) ?? 0) + 1);
  const visibleAccounts = sortItems(
    state.savings.filter(
      (acc) =>
        (accKindFilter === "all" || acc.kind === accKindFilter) &&
        matchesQuery(
          accQuery,
          acc.name,
          accountKindLabel(acc.kind),
          brandInfo(acc.bank)?.name,
          gameLabel(acc.game, acc.gameName),
          acc.currency,
        ),
    ),
    (acc) =>
      accSort === "name"
        ? acc.name.toLocaleLowerCase()
        : accSort === "kind"
          ? `${ACCOUNT_KINDS.findIndex((k) => k.value === acc.kind)}|${acc.name}`
          : accountBase(acc),
    accDir,
  );
  const accountsFiltered = accQuery.trim() !== "" || accKindFilter !== "all";
  const visibleAccountsTotal = visibleAccounts.reduce((s, acc) => s + accountBase(acc), 0);

  const invGain = (inv: Investment) => {
    const snap = investmentAt(inv, today);
    return snap.invested > 0 ? (snap.accrued + snap.paidOut) / snap.invested : 0;
  };
  const invKindCounts = new Map<InvestmentKind, number>();
  for (const inv of state.investments) invKindCounts.set(inv.kind, (invKindCounts.get(inv.kind) ?? 0) + 1);
  const visibleInvestments = sortItems(
    state.investments.filter(
      (inv) =>
        (invKindFilter === "all" || inv.kind === invKindFilter) &&
        matchesQuery(invQuery, inv.name, investmentKindLabel(inv.kind), inv.fund, inv.currency),
    ),
    (inv) =>
      invSort === "name"
        ? inv.name.toLocaleLowerCase()
        : invSort === "gain"
          ? invGain(inv)
          : invSort === "start"
            ? inv.startDate
            : convert(investmentAt(inv, today).value, inv.currency, base, settings.rates),
    invDir,
  );

  const visibleDebts = sortItems(
    state.debts,
    (d) => {
      if (debtSort === "name") return d.name.toLocaleLowerCase();
      if (debtSort === "rate") return d.annualRatePct ?? 0;
      if (debtSort === "payoff") {
        const p = debtPayoff(d, nowMonth);
        return p ? (p.neverPaysOff ? Number.MAX_SAFE_INTEGER : p.months) : Number.MAX_SAFE_INTEGER - 1;
      }
      return convert(d.balance, d.currency, base, settings.rates);
    },
    debtDir,
  );

  const openAddAccount = () => {
    setCoinError(null);
    setAccForm({
      id: null,
      name: "",
      icon: ICON_CHOICES[0],
      kind: "card",
      game: GAMES[0].id,
      gameName: "",
      gameLogo: "",
      bank: "",
      currency: "UAH",
      openingBalance: "",
      holdings: [],
      pricedAt: null,
      goalEnabled: false,
      target: "",
      deadline: "",
    });
  };

  const openEditAccount = (acc: SavingsAccount) => {
    setCoinError(null);
    setAccForm({
      id: acc.id,
      name: acc.name,
      icon: acc.icon,
      kind: acc.kind,
      game: acc.game ?? GAMES[0].id,
      gameName: acc.gameName ?? "",
      gameLogo: acc.gameLogo ?? "",
      bank: acc.bank ?? "",
      currency: acc.currency,
      openingBalance: String(acc.openingBalance),
      holdings: holdingDrafts(acc.holdings),
      pricedAt: acc.pricedAt ?? null,
      goalEnabled: acc.goal != null,
      target: acc.goal ? String(acc.goal.target) : "",
      deadline: acc.goal?.deadline ?? "",
    });
  };

  const setAccKind = (kind: AccountKind) => {
    if (!accForm) return;
    const toCrypto = kind === "crypto" && accForm.kind !== "crypto";
    setAccForm({
      ...accForm,
      kind,
      icon: toCrypto && accForm.icon === ICON_CHOICES[0] ? "🪙" : accForm.icon,
      currency: toCrypto && accForm.currency === "UAH" ? "USD" : accForm.currency,
      bank: kind === "crypto" && brandInfo(accForm.bank)?.group === "ua-bank" ? "" : accForm.bank,
      holdings:
        toCrypto && accForm.holdings.length === 0
          ? [{ key: uid(), coin: COINS[0].id, quantity: "" }]
          : accForm.holdings,
    });
  };

  const setHolding = (key: string, patch: Partial<HoldingDraft>) =>
    setAccForm((f) =>
      f ? { ...f, holdings: f.holdings.map((h) => (h.key === key ? { ...h, ...patch } : h)) } : f,
    );

  const addHolding = () =>
    setAccForm((f) => {
      if (!f) return f;
      const used = new Set(f.holdings.map((h) => h.coin));
      const next = COINS.find((c) => !used.has(c.id));
      return next ? { ...f, holdings: [...f.holdings, { key: uid(), coin: next.id, quantity: "" }] } : f;
    });

  const removeHolding = (key: string) =>
    setAccForm((f) => (f ? { ...f, holdings: f.holdings.filter((h) => h.key !== key) } : f));

  const priceDrafts = async (form: AccountForm): Promise<AccountForm> => {
    const errors: string[] = [];
    const quotes = await loadCoinQuotes(
      form.holdings.map((h) => ({ coin: h.coin, currency: form.currency })),
      errors,
    );
    if (quotes.size === 0) throw new Error(errors[0] ?? t("balance.prices.none"));
    return {
      ...form,
      pricedAt: new Date().toISOString(),
      holdings: form.holdings.map((h) => {
        const quote = quotes.get(`${form.currency}:${h.coin}`);
        return quote ? { ...h, price: quote.price, icon: quote.icon ?? h.icon } : h;
      }),
    };
  };

  const loadAccountPrices = async () => {
    if (!accForm || accForm.holdings.length === 0) return;
    setCoinLoading(true);
    setCoinError(null);
    try {
      const priced = await priceDrafts(accForm);
      setAccForm((f) =>
        f
          ? {
              ...f,
              pricedAt: priced.pricedAt,
              holdings: f.holdings.map((h) => {
                const p = priced.holdings.find((x) => x.coin === h.coin);
                return p?.price ? { ...h, price: p.price, icon: p.icon } : h;
              }),
            }
          : f,
      );
    } catch (err) {
      setCoinError(err instanceof Error ? err.message : t("balance.prices.cryptoFailed"));
    } finally {
      setCoinLoading(false);
    }
  };

  const accProblem: string | null = (() => {
    if (!accForm) return null;
    if (!accForm.name.trim()) return t("balance.acc.problem.name");
    const opening = parseAmount(accForm.openingBalance.trim() === "" ? "0" : accForm.openingBalance);
    if (!Number.isFinite(opening)) return t("balance.acc.problem.opening");
    if (accForm.kind === "crypto") {
      for (const h of accForm.holdings) {
        const q = parseAmount(h.quantity);
        if (!Number.isFinite(q) || q <= 0)
          return t("balance.crypto.problem.amount", { coin: coinInfo(h.coin)?.symbol ?? h.coin });
      }
    }
    if (accForm.kind === "skins" && accForm.game === CUSTOM_GAME_ID) {
      if (!accForm.gameName.trim()) return t("balance.acc.problem.gameName");
      if (accForm.gameLogo.trim() && !HTTPS_URL.test(accForm.gameLogo.trim()))
        return t("balance.acc.problem.gameLogo");
    }
    if (accForm.goalEnabled) {
      const target = parseAmount(accForm.target);
      if (!Number.isFinite(target) || target <= 0) return t("balance.acc.problem.goal");
    }
    return null;
  })();
  const accValid = accForm !== null && accProblem === null;

  const submitAccount = async () => {
    if (!accForm || !accValid) return;
    const crypto = accForm.kind === "crypto";
    const original = accForm.id ? state.savings.find((a) => a.id === accForm.id) : undefined;
    const currencyChanged = original !== undefined && original.currency !== accForm.currency;
    let form = currencyChanged
      ? { ...accForm, holdings: accForm.holdings.map((h) => ({ ...h, price: undefined })) }
      : accForm;
    if (crypto && form.holdings.some((h) => h.price === undefined)) {
      setCoinLoading(true);
      try {
        form = await priceDrafts(form);
      } catch (err) {
        setPriceError(err instanceof Error ? err.message : t("balance.prices.cryptoFailed"));
      } finally {
        setCoinLoading(false);
      }
    }
    const name = form.name.trim();
    const openingBalance = parseAmount(form.openingBalance.trim() === "" ? "0" : form.openingBalance);
    const goal: SavingsAccount["goal"] = form.goalEnabled
      ? { target: parseAmount(form.target), deadline: form.deadline || undefined }
      : undefined;
    const skins = form.kind === "skins";
    const custom = skins && form.game === CUSTOM_GAME_ID;
    const holdings: CoinHolding[] | undefined = crypto
      ? form.holdings.map((h) => ({
          coin: h.coin,
          quantity: parseAmount(h.quantity),
          price: h.price,
          icon: h.icon,
        }))
      : undefined;
    const fields = {
      name,
      icon: form.icon,
      kind: form.kind,
      game: skins ? form.game : undefined,
      gameName: custom ? form.gameName.trim() : undefined,
      gameLogo: custom && form.gameLogo.trim() ? form.gameLogo.trim() : undefined,
      bank: BANKABLE_KINDS.has(form.kind) && form.bank ? form.bank : undefined,
      currency: form.currency,
      openingBalance,
      holdings: holdings?.length ? holdings : undefined,
      pricedAt: crypto ? (form.pricedAt ?? undefined) : undefined,
      goal,
    };
    if (form.id) {
      const id = form.id;
      update((s) => ({
        ...s,
        savings: s.savings.map((a) => (a.id === id ? { ...a, ...fields } : a)),
      }));
    } else {
      update((s) => ({ ...s, savings: [...s.savings, { id: uid(), ...fields }] }));
    }
    setAccForm(null);
  };

  const confirmDeleteAccount = () => {
    if (!accDeleteId) return;
    update((s) => deleteAccount(s, accDeleteId), t("balance.acc.deleted"));
    setAccDeleteId(null);
    setAccForm(null);
  };

  const moveAccount = state.savings.find((a) => a.id === moveId) ?? null;
  const moveCurrent = moveAccount ? (balances.get(moveAccount.id) ?? 0) : 0;
  const moveDelta = parseAmount(moveAmount) - moveCurrent;
  const adjustCategoryId = (up: boolean) =>
    (up
      ? (state.categories.find((c) => c.id === "cat-other-inc") ??
        state.categories.find((c) => c.kind === "income"))
      : (state.categories.find((c) => c.id === "cat-other-exp") ??
        state.categories.find((c) => c.kind === "expense")))?.id;

  const moveProblem: string | null = (() => {
    if (!moveAccount) return null;
    if (moveAmount.trim() === "" || !Number.isFinite(parseAmount(moveAmount)))
      return t("balance.move.problem.enter");
    if (Math.abs(moveDelta) < 0.005) return t("balance.move.problem.matches");
    if (!adjustCategoryId(moveDelta > 0)) return t("balance.move.problem.categories");
    return null;
  })();
  const moveValid = moveAccount !== null && moveProblem === null;

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
            note: t("balance.move.note", { name: moveAccount.name }),
            accountId,
          },
        ],
      }),
      t("balance.move.done"),
    );
    setMoveId(null);
    setMoveAmount("");
  };

  const openAddInvestment = () => {
    setNavError(null);
    setInvForm({
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
      startDate: today,
      endDate: "",
      compounding: "reinvest",
      freq: "monthly",
      contribution: "",
      note: "",
    });
  };

  const openEditInvestment = (inv: Investment) => {
    setNavError(null);
    setInvForm({
      id: inv.id,
      name: inv.name,
      kind: inv.kind,
      currency: inv.currency,
      marketValue: inv.marketValue != null ? String(inv.marketValue) : "",
      coin: inv.coin ?? COINS[0].id,
      fund: inv.fund ?? INZHUR_FUNDS[0].id,
      quantity: inv.quantity != null ? String(inv.quantity) : "",
      nav: null,
      navAt: null,
      quote: null,
      principal: String(inv.principal),
      rate: String(inv.annualRatePct),
      startDate: inv.startDate,
      endDate: inv.endDate ?? "",
      compounding: inv.compounding,
      freq: inv.compoundingFreq,
      contribution: inv.monthlyContribution != null ? String(inv.monthlyContribution) : "",
      note: inv.note ?? "",
    });
    if (inv.kind === "inzhur" && inv.fund) void loadNav(inv.fund);
  };

  const withPolicy = (f: InvestmentForm): InvestmentForm => {
    const policy = returnPolicy({
      kind: f.kind,
      fund: f.kind === "inzhur" ? f.fund : undefined,
      compounding: f.compounding,
      compoundingFreq: f.freq,
    });
    return { ...f, compounding: policy.compounding, freq: policy.compoundingFreq };
  };

  const loadNav = async (fundId: string) => {
    setNavLoading(true);
    setNavError(null);
    try {
      const res = await fetchInzhurQuotes([fundId]);
      const quote = res.quotes.find((q) => q.id === fundId);
      if (!quote) throw new Error(t("balance.inv.inzhur.noQuote"));
      setInvForm((f) =>
        f && f.kind === "inzhur" && f.fund === fundId
          ? {
              ...f,
              nav: quote.navPerCertificate,
              navAt: res.fetchedAt,
              quote,
              rate: String(quote.projectedYieldPct),
            }
          : f,
      );
    } catch (err) {
      setNavError(err instanceof Error ? err.message : t("balance.prices.inzhurFailed"));
    } finally {
      setNavLoading(false);
    }
  };

  const setInvKind = (kind: InvestmentKind) => {
    if (!invForm) return;
    const fund = inzhurFund(invForm.fund) ?? INZHUR_FUNDS[0];
    const toInzhur = kind === "inzhur" && invForm.kind !== "inzhur";
    const fromInzhur = kind !== "inzhur" && invForm.kind === "inzhur";
    setInvForm(
      withPolicy({
        ...invForm,
        kind,
        compounding: kind === "deposit" ? "reinvest" : kind === "reit" ? "payout" : invForm.compounding,
        currency: kind === "inzhur" ? "UAH" : invForm.currency,
        name: toInzhur && !invForm.name.trim() ? fund.name : fromInzhur && invForm.name === fund.name ? "" : invForm.name,
        rate: toInzhur ? String(fund.projectedYieldPct) : fromInzhur ? "" : invForm.rate,
      }),
    );
    if (toInzhur) void loadNav(fund.id);
  };

  const setInvFund = (fundId: string) => {
    if (!invForm) return;
    const prev = inzhurFund(invForm.fund);
    const next = inzhurFund(fundId);
    setInvForm(
      withPolicy({
        ...invForm,
        fund: fundId,
        nav: null,
        navAt: null,
        quote: null,
        compounding: next?.income === "dividends" ? "payout" : "reinvest",
        name: !invForm.name.trim() || invForm.name === prev?.name ? (next?.name ?? invForm.name) : invForm.name,
        rate: next ? String(next.projectedYieldPct) : invForm.rate,
      }),
    );
    void loadNav(fundId);
  };

  const invMarket = invForm != null && valuationOf(invForm.kind) === "market";
  const invCrypto = invForm?.kind === "crypto";
  const invInzhur = invForm?.kind === "inzhur";
  const invUnits = invCrypto || invInzhur;
  const invPolicy: ReturnPolicy | null = invForm
    ? returnPolicy({
        kind: invForm.kind,
        fund: invInzhur ? invForm.fund : undefined,
        compounding: invForm.compounding,
        compoundingFreq: invForm.freq,
      })
    : null;
  const invFund = invInzhur ? inzhurFund(invForm?.fund) : undefined;

  const invProblem: string | null = (() => {
    if (!invForm) return null;
    if (!invForm.name.trim()) return t("balance.inv.problem.name");
    const principal = parseAmount(invForm.principal);
    if (!Number.isFinite(principal) || principal <= 0) return t("balance.inv.problem.principal");
    if (!invForm.startDate) return t("balance.inv.problem.start");
    if (invMarket && invForm.rate.trim() !== "") {
      const expected = parseAmount(invForm.rate);
      if (!Number.isFinite(expected) || expected < 0 || expected > 200) return t("balance.inv.problem.expected");
    }
    if (invUnits) {
      const q = parseAmount(invForm.quantity);
      if (!Number.isFinite(q) || q <= 0)
        return invInzhur ? t("balance.inv.problem.certificates") : t("balance.inv.problem.coins");
      return null;
    }
    if (invForm.contribution.trim() !== "") {
      const c = parseAmount(invForm.contribution);
      if (!Number.isFinite(c) || c < 0) return t("balance.inv.problem.topUp");
    }
    if (invMarket) {
      if (invForm.marketValue.trim() === "") return null;
      const v = parseAmount(invForm.marketValue);
      if (!Number.isFinite(v) || v < 0) return t("balance.inv.problem.value");
      return null;
    }
    const rate = parseAmount(invForm.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 200) return t("balance.inv.problem.rate");
    if (invForm.endDate && invForm.endDate < invForm.startDate) return t("balance.inv.problem.maturity");
    return null;
  })();
  const invValid = invForm !== null && invProblem === null;

  const navPreview =
    invForm && invInzhur && invForm.nav !== null
      ? (() => {
          const q = parseAmount(invForm.quantity);
          const perUnit = convert(invForm.nav, "UAH", invForm.currency, settings.rates);
          return Number.isFinite(q) && q > 0 ? q * perUnit : null;
        })()
      : null;

  const submitInvestment = () => {
    if (!invForm || !invValid) return;
    const name = invForm.name.trim();
    const principal = parseAmount(invForm.principal);
    const note = invForm.note.trim();
    const market = valuationOf(invForm.kind) === "market";
    const crypto = invForm.kind === "crypto";
    const inzhur = invForm.kind === "inzhur";
    const units = crypto || inzhur;

    const typedRate = parseAmount(invForm.rate);
    const rate = market && (invForm.rate.trim() === "" || !Number.isFinite(typedRate)) ? 0 : typedRate;
    const typed = invForm.contribution.trim() === "" ? 0 : parseAmount(invForm.contribution);
    const contribution = typed > 0 ? typed : undefined;
    const quantity = units ? parseAmount(invForm.quantity) : undefined;
    const stated = parseAmount(invForm.marketValue);
    const existing = invForm.id ? state.investments.find((i) => i.id === invForm.id) : undefined;
    const priced = inzhur && navPreview !== null;
    const marketValue = !market
      ? undefined
      : priced
        ? navPreview
        : units
          ? (existing?.kind === invForm.kind && existing.quantity === quantity ? existing.marketValue : undefined) ??
            principal
          : invForm.marketValue.trim() === "" || !Number.isFinite(stated)
            ? principal
            : stated;

    const kindFields = {
      kind: invForm.kind,
      marketValue,
      coin: crypto ? invForm.coin : undefined,
      fund: inzhur ? invForm.fund : undefined,
      quantity: units ? quantity : undefined,
      pricedAt: priced ? (invForm.navAt ?? new Date().toISOString()) : units ? existing?.pricedAt : undefined,
      coinIcon: crypto ? existing?.coinIcon : undefined,
      endDate: invForm.endDate || undefined,
      monthlyContribution: contribution,
    };

    const policy = returnPolicy({
      kind: invForm.kind,
      fund: inzhur ? invForm.fund : undefined,
      compounding: invForm.compounding,
      compoundingFreq: invForm.freq,
    });
    const common = {
      name,
      currency: invForm.currency,
      principal,
      annualRatePct: rate,
      startDate: invForm.startDate,
      compounding: policy.compounding,
      compoundingFreq: policy.compoundingFreq,
      note: note || undefined,
      ...kindFields,
    };

    if (invForm.id) {
      const id = invForm.id;
      update((s) => ({
        ...s,
        investments: s.investments.map((inv) => (inv.id === id ? { ...inv, ...common } : inv)),
      }));
    } else {
      update((s) => ({ ...s, investments: [...s.investments, { id: uid(), ...common }] }));
    }
    setInvForm(null);
  };

  const confirmDeleteInvestment = () => {
    if (!invDeleteId) return;
    update(
      (s) => ({ ...s, investments: s.investments.filter((inv) => inv.id !== invDeleteId) }),
      t("balance.inv.deleted"),
    );
    setInvDeleteId(null);
    setInvForm(null);
  };

  const openAddDebt = () =>
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

  const openEditDebt = (debt: Debt) =>
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

  const optionalNumber = (raw: string): number | undefined =>
    raw.trim() === "" ? undefined : parseAmount(raw) || undefined;
  const optionalOutOfRange = (raw: string, max: number) => {
    if (raw.trim() === "") return false;
    const v = parseAmount(raw);
    return !Number.isFinite(v) || v < 0 || v > max;
  };

  const debtProblem: string | null = (() => {
    if (!debtForm) return null;
    if (!debtForm.name.trim()) return t("balance.debt.problem.name");
    const balance = parseAmount(debtForm.balance);
    if (!Number.isFinite(balance) || balance < 0) return t("balance.debt.problem.balance");
    if (optionalOutOfRange(debtForm.principal, 1e12)) return t("balance.debt.problem.principal");
    if (optionalOutOfRange(debtForm.rate, 200)) return t("balance.inv.problem.rate");
    if (optionalOutOfRange(debtForm.monthlyPayment, 1e12)) return t("balance.debt.problem.payment");
    return null;
  })();
  const debtValid = debtForm !== null && debtProblem === null;

  const submitDebt = () => {
    if (!debtForm || !debtValid) return;
    const fields = {
      name: debtForm.name.trim(),
      icon: DEBT_KIND_ICON[debtForm.kind],
      kind: debtForm.kind,
      currency: debtForm.currency,
      balance: parseAmount(debtForm.balance),
      principal: optionalNumber(debtForm.principal),
      annualRatePct: optionalNumber(debtForm.rate),
      monthlyPayment: optionalNumber(debtForm.monthlyPayment),
      note: debtForm.note.trim() || undefined,
    };
    if (debtForm.id) {
      const id = debtForm.id;
      update((s) => ({ ...s, debts: s.debts.map((d) => (d.id === id ? { ...d, ...fields } : d)) }));
    } else {
      update((s) => ({ ...s, debts: [...s.debts, { id: uid(), ...fields }] }));
    }
    setDebtForm(null);
  };

  const confirmDeleteDebt = () => {
    if (!debtDeleteId) return;
    update((s) => ({ ...s, debts: s.debts.filter((d) => d.id !== debtDeleteId) }), t("balance.debt.deleted"));
    setDebtDeleteId(null);
    setDebtForm(null);
  };

  const deletingAccount = state.savings.find((a) => a.id === accDeleteId);
  const deletingInvestment = state.investments.find((i) => i.id === invDeleteId);
  const deletingDebt = state.debts.find((d) => d.id === debtDeleteId);

  const accountImpact = (() => {
    if (!deletingAccount) return "";
    const use = accountUsage(state, deletingAccount.id);
    const parts = [
      use.entries > 0 && tp("balance.acc.impact.entries", use.entries),
      use.transfers > 0 && tp("balance.acc.impact.transfers", use.transfers),
      use.recurring > 0 && tp("balance.acc.impact.recurring", use.recurring),
      use.subscriptions > 0 && tp("balance.acc.impact.subscriptions", use.subscriptions),
    ].filter(Boolean);
    return parts.length > 0 ? ` ${parts.join("; ")}.` : "";
  })();

  const isEmpty = state.savings.length === 0 && state.investments.length === 0 && state.debts.length === 0;

  const accountKindOptions = [
    { value: "all" as const, label: t("filter.all"), count: state.savings.length },
    ...ACCOUNT_KINDS.filter((k) => accKindCounts.has(k.value)).map((k) => ({
      value: k.value,
      label: `${k.icon} ${accountKindLabel(k.value)}`,
      count: accKindCounts.get(k.value) ?? 0,
    })),
  ];

  const investmentKindOptions = [
    { value: "all" as const, label: t("filter.all"), count: state.investments.length },
    ...INVESTMENT_KINDS.filter((k) => invKindCounts.has(k.value)).map((k) => ({
      value: k.value,
      label: `${k.icon} ${investmentKindLabel(k.value)}`,
      count: invKindCounts.get(k.value) ?? 0,
    })),
  ];

  return (
    <>
      <PageHeader
        title={t("balance.title")}
        subtitle={t("balance.subtitle")}
        action={
          <div className="flex flex-wrap gap-2">
            <AddButton onClick={openAddDebt} label={t("balance.addDebt")} />
            <AddButton onClick={openAddInvestment} label={t("balance.addInvestment")} />
            <AddButton variant="primary" onClick={openAddAccount} label={t("balance.addAccount")} />
          </div>
        }
      />
      <div className="stagger space-y-4 sm:space-y-5">
        {priceError && (
          <Callout tone="warning" title={t("balance.prices.errorTitle")}>
            {priceError}
          </Callout>
        )}
        <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-3">
          <GlassCard title={t("balance.netWorth")} icon="wallet" className="glow xl:col-span-1">
            <div className="sm:grid sm:grid-cols-2 sm:items-center sm:gap-8 xl:block">
              <div>
                <TripleMoney amount={worth.total} currency={base} settings={settings} size="lg" />
              </div>
              <div className="mt-4 space-y-2.5 border-t border-hairline pt-3.5 text-sm sm:mt-0 sm:border-t-0 sm:pt-0 xl:mt-4 xl:border-t xl:pt-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-ink-2">
                    <span aria-hidden className="size-2.5 rounded-sm bg-series-1" />
                    {t("balance.accounts")}
                  </span>
                  <span className="tnum font-semibold text-ink-1">
                    {formatMoney(worth.savings, base, { compact: true })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-ink-2">
                    <span aria-hidden className="size-2.5 rounded-sm bg-series-2" />
                    {t("balance.investments")}
                  </span>
                  <span className="tnum font-semibold text-ink-1">
                    {formatMoney(worth.investments, base, { compact: true })}
                  </span>
                </div>
                {worth.assets > 0 && kindRows.length > 0 && (
                  <div>
                    <div
                      className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
                      role="img"
                      aria-label={t("balance.byClass")}
                    >
                      {kindRows.map((row, i) => (
                        <div
                          key={row.id}
                          className="bar-slice"
                          title={`${kindRowLabel(row.id)}: ${formatMoney(row.base, base, { compact: true })}`}
                          style={
                            {
                              width: `${(row.base / worth.assets) * 100}%`,
                              background: `var(--series-${row.colorSlot})`,
                              "--i": i,
                            } as React.CSSProperties
                          }
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
                          {kindRowLabel(row.id)}
                          <span className="tnum text-ink-3">{formatPercent((row.base / worth.assets) * 100, 0)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {worth.debts > 0 && (
                  <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2.5">
                    <span className="text-ink-2">{t("balance.debts")}</span>
                    <span className="tnum font-semibold text-expense">
                      −{formatMoney(worth.debts, base, { compact: true })}
                    </span>
                  </div>
                )}
                {worth.debts > 0 && worth.assets > 0 && (
                  <p className="text-xs text-ink-3">
                    {t("balance.debtShare", {
                      pct: formatPercent((worth.debts / worth.assets) * 100, 0),
                      yours: formatMoney(worth.assets - worth.debts, base, { compact: true }),
                    })}
                  </p>
                )}
              </div>
            </div>
          </GlassCard>

          {!isEmpty && (
            <div className="xl:col-span-2">
              <GlassCard
                title={t("balance.accounts")}
                subtitle={t("balance.accounts.subtitle")}
                icon="bank"
                action={<AddButton onClick={openAddAccount} label={t("common.add")} />}
              >
                {state.savings.length === 0 ? (
                  <EmptyState
                    icon={<Icon name="card" />}
                    title={t("balance.accounts.empty")}
                    hint={t("balance.accounts.empty.hint")}
                    action={<AddButton onClick={openAddAccount} label={t("common.add")} />}
                  />
                ) : (
                  <div className="space-y-1">
                    {state.savings.length > 3 && (
                      <>
                        <Toolbar>
                          <SearchInput value={accQuery} onChange={setAccQuery} placeholder={t("balance.accounts.search")} />
                          <SortSelect
                            value={accSort}
                            onChange={setAccSort}
                            options={[
                              { value: "balance", label: t("sort.balance") },
                              { value: "name", label: t("sort.name") },
                              { value: "kind", label: t("sort.kind") },
                            ]}
                            direction={accDir}
                            onDirectionChange={setAccDir}
                          />
                        </Toolbar>
                        {accountKindOptions.length > 2 && (
                          <div className="mb-2">
                            <FilterPills
                              label={t("filter.kind")}
                              options={accountKindOptions}
                              value={accKindFilter}
                              onChange={setAccKindFilter}
                            />
                          </div>
                        )}
                      </>
                    )}
                    <div className="hidden gap-3 px-2 pb-1 sm:grid" style={currencyGrid}>
                      <span className="label">{t("common.account")}</span>
                      {shownCurrencies.map((c) => (
                        <span key={c} className="text-right label">
                          {CURRENCY_SYMBOL[c]}
                        </span>
                      ))}
                    </div>
                    {visibleAccounts.length === 0 && (
                      <p className="py-6 text-center text-sm text-ink-2">{t("filter.noMatches")}</p>
                    )}
                    {visibleAccounts.map((acc) => {
                      const goal = acc.goal;
                      const shown = balances.get(acc.id) ?? 0;
                      const reached = goal != null && shown >= goal.target;
                      const brand = brandInfo(acc.bank);
                      const game = acc.kind === "skins" ? gameLabel(acc.game, acc.gameName) : undefined;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => openEditAccount(acc)}
                          className="row-tap block w-full px-3 py-2.5 text-left"
                        >
                          <span className="currency-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3" style={{ "--currency-cols": shownCurrencies.length } as React.CSSProperties}>
                            <span className="flex min-w-0 items-center gap-3">
                              <IconDisc colorSlot={accountColorSlot(acc.kind)} className="size-10 rounded-field text-lg">
                                <AccountMark acc={acc} />
                              </IconDisc>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-ink-1">{acc.name}</span>
                                <span className="block truncate text-xs text-ink-3">
                                  {[accountKindLabel(acc.kind), brand?.name ?? game, acc.currency]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                                {acc.kind === "crypto" && acc.holdings?.length ? (
                                  <span className="tnum block truncate text-xs text-ink-2" title={acc.pricedAt ? t("balance.prices.pricedAt", { when: formatDateTime(acc.pricedAt) }) : undefined}>
                                    {holdingsSummary(acc.holdings)}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                            <span className="tnum text-right text-sm font-semibold text-ink-1 sm:hidden">
                              {formatMoney(shown, acc.currency, { exact: true })}
                            </span>
                            <span className="hidden sm:contents">
                              <CurrencyCells amount={shown} currency={acc.currency} settings={settings} />
                            </span>
                          </span>
                          {goal && (
                            <span className="mt-2 block pl-13 pr-1">
                              <ProgressMeter value={shown} max={goal.target} label={t("balance.goal.label", { name: acc.name })} />
                              <span className={`tnum mt-1 block text-xs ${reached ? "font-medium text-income" : "text-ink-3"}`}>
                                {reached
                                  ? t("balance.goal.reached")
                                  : [
                                      t("balance.goal.progress", {
                                        have: formatMoney(shown, acc.currency),
                                        target: formatMoney(goal.target, acc.currency),
                                        pct: formatPercent((shown / goal.target) * 100, 0),
                                      }),
                                      goal.deadline ? t("balance.goal.by", { date: formatDate(goal.deadline) }) : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                              </span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <div className="mt-1 hidden gap-3 border-t border-hairline px-2 pt-2.5 sm:grid" style={currencyGrid}>
                      <span className="text-sm font-semibold text-ink-1">
                        {accountsFiltered
                          ? t("balance.accounts.shownTotal")
                          : worth.debts > 0
                            ? t("balance.netWorth.afterDebts")
                            : t("balance.netWorth.inclInvestments")}
                      </span>
                      {shownCurrencies.map((c) => (
                        <span key={c} className="tnum text-right text-sm font-semibold text-ink-1">
                          {formatMoney(
                            convert(accountsFiltered ? visibleAccountsTotal : worth.total, base, c, settings.rates),
                            c,
                            { exact: true },
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </GlassCard>
            </div>
          )}
        </div>

        {state.debts.length > 0 && (
          <GlassCard
            title={t("balance.debts")}
            subtitle={tp("balance.debts.subtitle", state.debts.length, {
              amount: formatMoney(worth.debts, base, { compact: true }),
            })}
            icon="debt"
            action={
              <div className="flex flex-wrap items-center gap-2">
                {state.debts.length > 1 && (
                  <SortSelect
                    value={debtSort}
                    onChange={setDebtSort}
                    options={[
                      { value: "balance", label: t("sort.balance") },
                      { value: "rate", label: t("sort.rate") },
                      { value: "payoff", label: t("sort.payoff") },
                      { value: "name", label: t("sort.name") },
                    ]}
                    direction={debtDir}
                    onDirectionChange={setDebtDir}
                  />
                )}
                <AddButton onClick={openAddDebt} label={t("common.add")} />
              </div>
            }
          >
            <div className="space-y-1">
              {visibleDebts.map((debt) => {
                const principal = debt.principal ?? 0;
                const hasProgress = principal > 0;
                const paid = Math.max(0, principal - debt.balance);
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
                        <IconDisc colorSlot={debtColorSlot(debt.kind)} className="size-10 rounded-field text-lg">
                          {debt.icon}
                        </IconDisc>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink-1">{debt.name}</span>
                          <span className="block text-xs text-ink-3">
                            {t(`debtKind.${debt.kind}`)}
                            {debt.annualRatePct ? ` · ${t("balance.perYear", { pct: formatPercent(debt.annualRatePct) })}` : ""}
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
                        <ProgressMeter value={paid} max={principal} label={t("balance.debt.paidLabel", { name: debt.name })} />
                        <span className="tnum mt-1 block text-xs text-ink-3">
                          {t("balance.debt.paidOff", {
                            paid: formatMoney(paid, debt.currency, { compact: true }),
                            principal: formatMoney(principal, debt.currency, { compact: true }),
                            pct: formatPercent((paid / principal) * 100, 0),
                          })}
                          {debt.monthlyPayment
                            ? ` · ${formatMoney(debt.monthlyPayment, debt.currency, { compact: true })}${t("common.perMonth")}`
                            : ""}
                        </span>
                      </span>
                    )}
                    {payoff && (
                      <span className="mt-1.5 block pl-13 pr-1 text-xs">
                        {payoff.neverPaysOff ? (
                          <span className="text-expense">{t("balance.debt.neverPaysOff")}</span>
                        ) : (
                          <span className="tnum text-ink-2">
                            {t("balance.debt.clearBy")}{" "}
                            <span className="font-semibold text-ink-1">{formatMonthCompact(payoff.finalMonth)}</span>
                            {" · "}
                            {tp("balance.debt.payments", payoff.months)}
                            {payoff.interest > 0.5 &&
                              ` · ${t("balance.debt.interestLeft", {
                                amount: formatMoney(payoff.interest, debt.currency, { compact: true }),
                              })}`}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-hairline px-2 pt-2.5">
                <span className="text-sm font-semibold text-ink-1">{t("balance.debt.totalOwed")}</span>
                <span className="tnum text-sm font-semibold text-expense">
                  −{formatMoney(worth.debts, base, { exact: true })}
                </span>
                {debtSchedule.payment > 0 && (
                  <span className="caption w-full">
                    {[
                      t("balance.debt.scheduled", { amount: formatMoney(debtSchedule.payment, base, { compact: true }) }),
                      debtSchedule.lastMonth
                        ? t("balance.debt.lastPayment", { month: formatMonthCompact(debtSchedule.lastMonth) })
                        : null,
                      debtSchedule.interest > 0.5
                        ? t("balance.debt.interestToPay", {
                            amount: formatMoney(debtSchedule.interest, base, { compact: true }),
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
              title={t("balance.empty")}
              hint={t("balance.empty.hint")}
              action={<AddButton variant="primary" onClick={openAddAccount} label={t("balance.addAccount")} />}
            />
          </GlassCard>
        ) : (
          state.investments.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3">
                <StatTile
                  label={t("balance.inv.invested")}
                  icon="arrowDown"
                  value={formatMoney(invTotals.invested, base, { compact: true })}
                  bar={kindBar("invested")}
                  hint={tp("balance.inv.positions", state.investments.length)}
                />
                <StatTile
                  label={t("balance.inv.currentValue")}
                  icon="banknote"
                  value={formatMoney(invTotals.value, base, { compact: true })}
                  bar={[
                    { label: t("balance.inv.paidIn"), value: invTotals.invested, colorSlot: 6 },
                    { label: t("balance.inv.earned"), value: Math.max(0, invTotals.earned), colorSlot: 4 },
                  ]}
                  delta={
                    invTotals.invested > 0
                      ? {
                          text: t("balance.inv.onPrincipal", {
                            pct: formatPercent((invTotals.value / invTotals.invested - 1) * 100),
                          }),
                          good: invTotals.value >= invTotals.invested,
                        }
                      : undefined
                  }
                />
                <StatTile
                  className="col-span-2 md:col-span-1"
                  label={t("balance.inv.earned")}
                  icon="trend"
                  value={formatMoney(invTotals.earned, base, { compact: true, sign: true })}
                  bar={[
                    { label: t("balance.inv.gains"), value: gains, color: "var(--income)" },
                    { label: t("balance.inv.losses"), value: losses, color: "var(--expense)" },
                  ]}
                  tone={invTotals.earned > 0 ? "income" : invTotals.earned < 0 ? "expense" : undefined}
                  hint={
                    invTotals.earnedInYear !== 0
                      ? t("balance.inv.expectedYear", {
                          amount: formatMoney(invTotals.earnedInYear, base, { compact: true, sign: true }),
                        })
                      : t("balance.inv.marketNotProjected")
                  }
                />
              </div>

              <GlassCard
                title={t("balance.investments")}
                subtitle={tp("balance.inv.positions", state.investments.length)}
                icon="trend"
                action={<AddButton onClick={openAddInvestment} label={t("common.add")} />}
              >
                {state.investments.length > 3 && (
                  <>
                    <Toolbar>
                      <SearchInput value={invQuery} onChange={setInvQuery} placeholder={t("balance.inv.search")} />
                      <SortSelect
                        value={invSort}
                        onChange={setInvSort}
                        options={[
                          { value: "value", label: t("sort.value") },
                          { value: "gain", label: t("sort.gain") },
                          { value: "name", label: t("sort.name") },
                          { value: "start", label: t("sort.startDate") },
                        ]}
                        direction={invDir}
                        onDirectionChange={setInvDir}
                      />
                    </Toolbar>
                    {investmentKindOptions.length > 2 && (
                      <div className="mb-2">
                        <FilterPills
                          label={t("filter.kind")}
                          options={investmentKindOptions}
                          value={invKindFilter}
                          onChange={setInvKindFilter}
                        />
                      </div>
                    )}
                  </>
                )}
                {visibleInvestments.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-2">{t("filter.noMatches")}</p>
                ) : (
                  <div
                    className={`grid gap-3 sm:gap-4 ${
                      visibleInvestments.length > 1 ? "sm:grid-cols-2 xl:grid-cols-3" : ""
                    }`}
                  >
                    {visibleInvestments.map((inv) => (
                      <InvestmentCard
                        key={inv.id}
                        inv={inv}
                        today={today}
                        oneYearOut={oneYearOut}
                        onEdit={() => openEditInvestment(inv)}
                        onDelete={() => setInvDeleteId(inv.id)}
                      />
                    ))}
                  </div>
                )}
              </GlassCard>
            </>
          )
        )}

        {pricedCount > 0 && (
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-1 pt-1 text-xs text-ink-3">
            <Icon name="refresh" size={13} className="shrink-0" />
            <span>
              {pricedAt
                ? t("balance.prices.pricedAt", { when: formatDateTime(pricedAt) })
                : t("balance.prices.never")}
            </span>
            <span aria-hidden>·</span>
            <span>{t("prices.nextUpdate", { time: nextHourLabel() })}</span>
          </p>
        )}
      </div>

      {accForm && (
        <Sheet
          open
          onClose={() => setAccForm(null)}
          onSubmit={submitAccount}
          problem={accProblem}
          title={accForm.id ? t("balance.acc.edit") : t("balance.acc.new")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAccForm(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!accValid || coinLoading}>
                {t("common.save")}
              </Button>
            </>
          }
        >
          <Field label={t("common.name")}>
            <TextInput
              value={accForm.name}
              onChange={(e) => setAccForm({ ...accForm, name: e.target.value })}
              placeholder={t("balance.acc.namePlaceholder")}
            />
          </Field>
          <Field label={t("balance.acc.kind")}>
            <Select value={accForm.kind} onChange={(e) => setAccKind(e.target.value as AccountKind)}>
              {ACCOUNT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.icon} {accountKindLabel(k.value)}
                </option>
              ))}
            </Select>
          </Field>
          {BANKABLE_KINDS.has(accForm.kind) && (
            <Field label={t("balance.acc.bank")} hint={t("balance.acc.bank.hint")}>
              <div className="flex items-center gap-2">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-field bg-ghost">
                  {brandInfo(accForm.bank) ? (
                    <RemoteLogo
                      sources={brandLogoSources(accForm.bank)}
                      fallback={<Monogram name={brandInfo(accForm.bank)!.name} color={brandInfo(accForm.bank)!.color} />}
                    />
                  ) : (
                    <span className="text-lg">{accForm.icon}</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <Select value={accForm.bank} onChange={(e) => setAccForm({ ...accForm, bank: e.target.value })}>
                    <option value="">{t("balance.acc.noBank")}</option>
                    {(accForm.kind === "crypto" ? (["crypto", "fintech"] as const) : BRAND_GROUP_ORDER).map((group) => (
                      <optgroup key={group} label={t(BRAND_GROUP_LABEL_KEY[group] as MessageKey)}>
                        {BRANDS.filter((b) => b.group === group).map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </div>
              </div>
            </Field>
          )}
          {accForm.kind === "skins" && (
            <>
              <Field label={t("balance.acc.game")} hint={t("balance.acc.game.hint")}>
                <div className="flex items-center gap-2">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-field bg-ghost">
                    <RemoteLogo
                      sources={gameLogoSources(accForm.game, accForm.gameLogo.trim())}
                      fallback={<Icon name="gamepad" size={20} className="text-ink-3" />}
                      rounded="md"
                      size={30}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Select value={accForm.game} onChange={(e) => setAccForm({ ...accForm, game: e.target.value })}>
                      {GAMES.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                      <option value={CUSTOM_GAME_ID}>{t("balance.acc.game.custom")}</option>
                    </Select>
                  </div>
                </div>
              </Field>
              {accForm.game === CUSTOM_GAME_ID && (
                <>
                  <Field label={t("balance.acc.game.name")}>
                    <TextInput
                      value={accForm.gameName}
                      maxLength={60}
                      onChange={(e) => setAccForm({ ...accForm, gameName: e.target.value })}
                      placeholder="Escape from Tarkov"
                    />
                  </Field>
                  <Field label={t("balance.acc.game.logo")} hint={t("balance.acc.game.logo.hint")}>
                    <TextInput
                      value={accForm.gameLogo}
                      onChange={(e) => setAccForm({ ...accForm, gameLogo: e.target.value })}
                      placeholder="https://…"
                    />
                  </Field>
                </>
              )}
            </>
          )}
          {!(BANKABLE_KINDS.has(accForm.kind) && brandInfo(accForm.bank)) &&
            !(accForm.kind === "skins" && accForm.game !== CUSTOM_GAME_ID) && (
              <FieldSet label={t("balance.acc.icon")} hint={t("balance.acc.icon.hint")}>
                <OptionChips
                  label={t("common.icon")}
                  size="lg"
                  options={ICON_CHOICES.map((icon) => ({ value: icon, label: icon }))}
                  value={accForm.icon}
                  onChange={(icon) => setAccForm({ ...accForm, icon })}
                />
              </FieldSet>
            )}
          <FieldSet label={t("common.currency")}>
            <SegmentedControl
              label={t("common.currency")}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={accForm.currency}
              onChange={(v) => setAccForm({ ...accForm, currency: v })}
            />
          </FieldSet>
          {accForm.kind === "crypto" && (
            <FieldSet label={t("balance.crypto.coins")} hint={t("balance.crypto.coins.hint", { currency: accForm.currency })}>
              <div className="space-y-2">
                {accForm.holdings.length === 0 && (
                  <p className="rounded-field bg-ghost px-3.5 py-3 text-sm text-ink-3">{t("balance.crypto.noCoins")}</p>
                )}
                {accForm.holdings.map((h) => {
                  const info = coinInfo(h.coin);
                  const used = new Set(accForm.holdings.filter((x) => x.key !== h.key).map((x) => x.coin));
                  const qty = parseAmount(h.quantity);
                  const value = h.price && Number.isFinite(qty) && qty > 0 ? qty * h.price : null;
                  return (
                    <div key={h.key} className="rounded-field border border-hairline p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ghost">
                          <RemoteLogo
                            sources={h.icon ? [h.icon] : []}
                            fallback={<span className="text-[11px] font-bold text-ink-2">{info?.symbol ?? "?"}</span>}
                            alt={info?.name ?? h.coin}
                          />
                        </span>
                        <div className="min-w-0 flex-[1_1_11rem]">
                          <Select
                            aria-label={t("balance.crypto.coin")}
                            value={h.coin}
                            onChange={(e) => setHolding(h.key, { coin: e.target.value, price: undefined, icon: undefined })}
                          >
                            {COINS.filter((c) => c.id === h.coin || !used.has(c.id)).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.symbol} — {c.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="flex min-w-0 flex-[1_1_8rem] items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <TextInput
                              inputMode="decimal"
                              aria-label={t("balance.crypto.amount")}
                              value={h.quantity}
                              onChange={(e) => setHolding(h.key, { quantity: e.target.value })}
                              placeholder={t("balance.crypto.amount")}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeHolding(h.key)}
                            aria-label={t("balance.crypto.remove", { coin: info?.symbol ?? h.coin })}
                            className="icon-btn icon-btn-danger size-10 shrink-0 text-ink-3"
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </div>
                      {value !== null && (
                        <p className="tnum mt-1.5 px-1 text-xs text-ink-3">
                          {t("balance.crypto.worth", {
                            value: formatMoney(value, accForm.currency, { exact: true }),
                            price: formatMoney(h.price!, accForm.currency, { exact: true }),
                          })}
                        </p>
                      )}
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addHolding}
                    disabled={accForm.holdings.length >= COINS.length}
                  >
                    <Icon name="plus" size={14} />
                    {t("balance.crypto.addCoin")}
                  </Button>
                  {accForm.holdings.length > 0 && (
                    <Button variant="ghost" size="sm" disabled={coinLoading} onClick={() => void loadAccountPrices()}>
                      <Icon name="refresh" size={14} className={coinLoading ? "animate-spin" : ""} />
                      {coinLoading ? t("common.loading") : t("balance.crypto.loadPrices")}
                    </Button>
                  )}
                </div>
                {accForm.holdings.some((h) => h.price) && (
                  <p className="tnum px-0.5 text-sm text-ink-2">
                    {t("balance.crypto.total", {
                      value: formatMoney(
                        holdingsValue(
                          accForm.holdings.map((h) => ({ coin: h.coin, quantity: parseAmount(h.quantity) || 0, price: h.price })),
                        ),
                        accForm.currency,
                        { exact: true },
                      ),
                    })}
                    {accForm.pricedAt && (
                      <span className="text-xs text-ink-3"> · {formatDateTime(accForm.pricedAt)}</span>
                    )}
                  </p>
                )}
                {coinError && <p className="text-xs text-expense">{coinError}</p>}
              </div>
            </FieldSet>
          )}
          <Field
            label={accForm.kind === "crypto" ? t("balance.crypto.cash") : t("balance.acc.opening")}
            hint={accForm.kind === "crypto" ? t("balance.crypto.cash.hint") : t("balance.acc.opening.hint")}
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
            <span className="body-strong">{t("balance.goal")}</span>
            <Switch
              checked={accForm.goalEnabled}
              onChange={(v) => setAccForm({ ...accForm, goalEnabled: v })}
              label={t("balance.goal")}
            />
          </div>
          {accForm.goalEnabled && (
            <>
              <Field label={t("balance.goal.target")}>
                <TextInput
                  inputMode="decimal"
                  prefix={CURRENCY_SYMBOL[accForm.currency]}
                  value={accForm.target}
                  onChange={(e) => setAccForm({ ...accForm, target: e.target.value })}
                  placeholder="50 000"
                />
              </Field>
              <Field label={t("balance.goal.deadline")} hint={t("common.optional")}>
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
              {accForm.kind !== "crypto" && (
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setMoveId(accForm.id);
                    setMoveAmount("");
                    setAccForm(null);
                  }}
                >
                  {t("balance.acc.reconcile")}
                </Button>
              )}
              <Button variant="danger" className="flex-1" onClick={() => setAccDeleteId(accForm.id)}>
                {t("common.delete")}
              </Button>
            </div>
          )}
        </Sheet>
      )}

      <Sheet
        open={moveAccount != null}
        onClose={() => setMoveId(null)}
        onSubmit={submitMove}
        problem={moveProblem}
        title={t("balance.move.title", { name: moveAccount?.name ?? "" })}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveId(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!moveValid}>
              {t("balance.move.adjust")}
            </Button>
          </>
        }
      >
        {moveAccount && (
          <p className="text-sm text-ink-2">
            {t("balance.move.current")}{" "}
            <Money amount={moveCurrent} currency={moveAccount.currency} exact className="font-semibold text-ink-1" />
          </p>
        )}
        <Field label={t("balance.move.bankShows")} hint={t("balance.move.bankShows.hint")}>
          <TextInput
            inputMode="decimal"
            prefix={moveAccount ? CURRENCY_SYMBOL[moveAccount.currency] : undefined}
            value={moveAmount}
            onChange={(e) => setMoveAmount(e.target.value)}
            placeholder={moveAccount ? String(Math.round(moveCurrent)) : "0"}
          />
        </Field>
      </Sheet>

      {invForm && (
        <Sheet
          open
          onClose={() => setInvForm(null)}
          onSubmit={submitInvestment}
          problem={invProblem}
          title={invForm.id ? t("balance.inv.edit") : t("balance.inv.new")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setInvForm(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!invValid}>
                {t("common.save")}
              </Button>
            </>
          }
        >
          <Field label={t("balance.inv.type")} hint={t(`investmentKind.${invForm.kind}.hint`)}>
            <Select value={invForm.kind} onChange={(e) => setInvKind(e.target.value as InvestmentKind)}>
              {INVESTMENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.icon} {investmentKindLabel(k.value)}
                </option>
              ))}
            </Select>
          </Field>

          {invInzhur && (
            <>
              <Field label={t("balance.inv.inzhur.fund")} hint={t("balance.inv.inzhur.fund.hint")}>
                <Select value={invForm.fund} onChange={(e) => setInvFund(e.target.value)}>
                  {INZHUR_FUNDS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} · {t(f.themeKey as MessageKey)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex flex-wrap items-center gap-3 rounded-field bg-ghost px-3.5 py-3">
                <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                  {invForm.nav !== null ? (
                    <>
                      <p className="font-semibold text-ink-1">
                        {t("balance.inv.inzhur.nav", { nav: formatMoney(invForm.nav, "UAH", { exact: true }) })}
                      </p>
                      {navPreview !== null && (
                        <p className="tnum text-xs text-ink-3">
                          {t("balance.inv.inzhur.worth", {
                            count: formatNumber(parseAmount(invForm.quantity), 4),
                            value: formatMoney(navPreview, invForm.currency, { exact: true }),
                          })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-ink-3">
                      {navLoading ? t("common.loading") : t("balance.inv.inzhur.navHint")}
                    </p>
                  )}
                  {navError && <p className="text-xs text-expense">{navError}</p>}
                </div>
                <Button variant="ghost" size="sm" disabled={navLoading} onClick={() => void loadNav(invForm.fund)}>
                  <Icon name="refresh" size={14} className={navLoading ? "animate-spin" : ""} />
                  {navLoading ? t("common.loading") : t("balance.inv.inzhur.loadNav")}
                </Button>
              </div>
              {invFund && (
                <dl className="glass-well divide-y divide-hairline overflow-hidden rounded-field text-sm">
                  <InfoRow label={t("balance.inv.inzhur.forecast")}>
                    {yieldRange(
                      invForm.quote?.projectedYieldPct ?? invFund.projectedYieldPct,
                      invForm.quote ? invForm.quote.projectedYieldMaxPct : invFund.projectedYieldMaxPct,
                      invForm.quote?.projectedCurrency ?? invFund.linkedCurrency,
                      t,
                    )}
                  </InfoRow>
                  {invForm.quote?.actualYieldPct !== undefined && (
                    <InfoRow label={t("balance.inv.inzhur.actual")}>
                      {t("balance.perYear", { pct: formatPercent(invForm.quote.actualYieldPct) })}
                      {invForm.quote.actualYieldCurrency ? ` · ${invForm.quote.actualYieldCurrency}` : ""}
                    </InfoRow>
                  )}
                  <InfoRow label={t("balance.inv.row.return")}>
                    {returnLabel(invPolicy!, invForm.kind, invForm.freq, t)}
                  </InfoRow>
                </dl>
              )}
            </>
          )}

          <Field label={t("common.name")}>
            <TextInput
              value={invForm.name}
              onChange={(e) => setInvForm({ ...invForm, name: e.target.value })}
              placeholder={invCrypto ? t("balance.inv.placeholder.crypto") : t("balance.inv.placeholder.bonds")}
            />
          </Field>
          <FieldSet label={t("common.currency")} hint={invInzhur ? t("balance.inv.inzhur.currency.hint") : undefined}>
            <SegmentedControl
              label={t("common.currency")}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={invForm.currency}
              onChange={(v) => setInvForm({ ...invForm, currency: v })}
            />
          </FieldSet>

          {invCrypto && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("balance.inv.coin")}>
                <Select value={invForm.coin} onChange={(e) => setInvForm({ ...invForm, coin: e.target.value })}>
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
                  value={invForm.quantity}
                  onChange={(e) => setInvForm({ ...invForm, quantity: e.target.value })}
                  placeholder="0.25"
                />
              </Field>
            </div>
          )}

          {invInzhur && (
            <Field label={t("balance.inv.inzhur.certificates")} hint={t("balance.inv.inzhur.certificates.hint")}>
              <TextInput
                inputMode="decimal"
                value={invForm.quantity}
                onChange={(e) => setInvForm({ ...invForm, quantity: e.target.value })}
                placeholder="1000"
              />
            </Field>
          )}

          <Field
            label={invMarket ? t("balance.inv.paid") : t("balance.inv.principal")}
            hint={invMarket ? t("balance.inv.paid.hint") : undefined}
          >
            <TextInput
              inputMode="decimal"
              prefix={CURRENCY_SYMBOL[invForm.currency]}
              value={invForm.principal}
              onChange={(e) => setInvForm({ ...invForm, principal: e.target.value })}
              placeholder="50 000"
            />
          </Field>

          {invMarket && !invUnits && (
            <Field label={t("balance.inv.worthToday")} hint={t("balance.inv.worthToday.hint")}>
              <TextInput
                inputMode="decimal"
                prefix={CURRENCY_SYMBOL[invForm.currency]}
                value={invForm.marketValue}
                onChange={(e) => setInvForm({ ...invForm, marketValue: e.target.value })}
                placeholder={invForm.principal || "0"}
              />
            </Field>
          )}

          {!invInzhur && (
            <Field
              label={invMarket ? t("balance.inv.expected") : t("balance.inv.rate")}
              hint={invMarket ? t("balance.inv.expected.hint") : t("balance.inv.rate.hint")}
            >
              <TextInput
                inputMode="decimal"
                value={invForm.rate}
                onChange={(e) => setInvForm({ ...invForm, rate: e.target.value })}
                placeholder={invMarket ? "0" : "15.3"}
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={invMarket ? t("balance.inv.boughtOn") : t("balance.inv.startDate")}>
              <TextInput
                type="date"
                value={invForm.startDate}
                onChange={(e) => setInvForm({ ...invForm, startDate: e.target.value })}
              />
            </Field>
            <Field label={invMarket ? t("balance.inv.heldUntil") : t("balance.inv.matures")} hint={t("balance.inv.end.hint")}>
              <TextInput
                type="date"
                value={invForm.endDate}
                min={invForm.startDate || undefined}
                onChange={(e) => setInvForm({ ...invForm, endDate: e.target.value })}
              />
            </Field>
          </div>

          {invPolicy && invPolicy.choices.length > 1 ? (
            <FieldSet
              label={invPolicy.style === "interest" ? t("balance.inv.interestType") : t("balance.inv.dividends")}
              hint={
                invPolicy.style === "interest" ? t("balance.inv.interestType.hint") : t("balance.inv.dividends.hint")
              }
            >
              <SegmentedControl
                label={invPolicy.style === "interest" ? t("balance.inv.interestType") : t("balance.inv.dividends")}
                options={invPolicy.choices.map((c) => ({
                  value: c,
                  label:
                    invPolicy.style === "interest"
                      ? c === "reinvest"
                        ? t("balance.inv.reinvest")
                        : t("balance.inv.payout")
                      : c === "reinvest"
                        ? t("balance.inv.dividends.reinvest")
                        : t("balance.inv.dividends.payout"),
                }))}
                value={invPolicy.compounding}
                onChange={(v) => setInvForm({ ...invForm, compounding: v })}
              />
            </FieldSet>
          ) : invPolicy && !invInzhur ? (
            <div className="flex items-start gap-2.5 rounded-field bg-ghost px-3.5 py-3 text-sm">
              <Icon name="info" size={16} className="mt-0.5 shrink-0 text-ink-3" />
              <div className="min-w-0">
                <p className="font-semibold text-ink-1">{returnLabel(invPolicy, invForm.kind, invForm.freq, t)}</p>
                <p className="text-xs text-ink-3">{t(`balance.inv.style.${invPolicy.style}.hint`)}</p>
              </div>
            </div>
          ) : null}
          {invPolicy?.freqChoice && (
            <Field label={t("balance.inv.frequency")}>
              <Select
                value={invForm.freq}
                onChange={(e) => setInvForm({ ...invForm, freq: e.target.value as CompoundingFreq })}
              >
                {(["monthly", "quarterly", "annually"] as const).map((f) => (
                  <option key={f} value={f}>
                    {t(`freq.${f}`)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label={t("balance.inv.topUp")}
            hint={invMarket ? t("balance.inv.topUp.marketHint") : t("common.optional")}
          >
            <TextInput
              inputMode="decimal"
              prefix={CURRENCY_SYMBOL[invForm.currency]}
              value={invForm.contribution}
              onChange={(e) => setInvForm({ ...invForm, contribution: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label={t("common.note")}>
            <TextInput
              value={invForm.note}
              onChange={(e) => setInvForm({ ...invForm, note: e.target.value })}
              placeholder={t("common.optional")}
            />
          </Field>
          {invForm.id && (
            <Button variant="danger" className="w-full" onClick={() => setInvDeleteId(invForm.id)}>
              {t("balance.inv.delete")}
            </Button>
          )}
        </Sheet>
      )}

      {debtForm && (
        <Sheet
          open
          onClose={() => setDebtForm(null)}
          onSubmit={submitDebt}
          problem={debtProblem}
          title={debtForm.id ? t("balance.debt.edit") : t("balance.debt.new")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDebtForm(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!debtValid}>
                {t("common.save")}
              </Button>
            </>
          }
        >
          <Field label={t("common.name")}>
            <TextInput
              value={debtForm.name}
              onChange={(e) => setDebtForm({ ...debtForm, name: e.target.value })}
              placeholder={t("balance.debt.namePlaceholder")}
            />
          </Field>
          <FieldSet label={t("balance.debt.type")}>
            <SegmentedControl
              label={t("balance.debt.type")}
              options={(["mortgage", "loan", "card"] as const).map((k) => ({ value: k, label: t(`debtKind.${k}`) }))}
              value={debtForm.kind}
              onChange={(v) => setDebtForm({ ...debtForm, kind: v })}
            />
          </FieldSet>
          <FieldSet label={t("common.currency")}>
            <SegmentedControl
              label={t("common.currency")}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={debtForm.currency}
              onChange={(v) => setDebtForm({ ...debtForm, currency: v })}
            />
          </FieldSet>
          <Field label={t("balance.debt.outstanding")} hint={t("balance.debt.outstanding.hint")}>
            <TextInput
              inputMode="decimal"
              prefix={CURRENCY_SYMBOL[debtForm.currency]}
              value={debtForm.balance}
              onChange={(e) => setDebtForm({ ...debtForm, balance: e.target.value })}
              placeholder="850 000"
            />
          </Field>
          <Field label={t("balance.debt.original")} hint={t("balance.debt.original.hint")}>
            <TextInput
              inputMode="decimal"
              prefix={CURRENCY_SYMBOL[debtForm.currency]}
              value={debtForm.principal}
              onChange={(e) => setDebtForm({ ...debtForm, principal: e.target.value })}
              placeholder="1 000 000"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("balance.debt.rate")} hint={t("balance.debt.rate.hint")}>
              <TextInput
                inputMode="decimal"
                value={debtForm.rate}
                onChange={(e) => setDebtForm({ ...debtForm, rate: e.target.value })}
                placeholder="12.5"
              />
            </Field>
            <Field label={t("balance.debt.payment")} hint={t("common.optional")}>
              <TextInput
                inputMode="decimal"
                prefix={CURRENCY_SYMBOL[debtForm.currency]}
                value={debtForm.monthlyPayment}
                onChange={(e) => setDebtForm({ ...debtForm, monthlyPayment: e.target.value })}
                placeholder="15 000"
              />
            </Field>
          </div>
          <Field label={t("common.note")}>
            <TextInput
              value={debtForm.note}
              onChange={(e) => setDebtForm({ ...debtForm, note: e.target.value })}
              placeholder={t("common.optional")}
            />
          </Field>
          {debtForm.id && (
            <Button variant="danger" className="w-full" onClick={() => setDebtDeleteId(debtForm.id)}>
              {t("balance.debt.delete")}
            </Button>
          )}
        </Sheet>
      )}

      <ConfirmDialog
        open={accDeleteId !== null}
        onClose={() => setAccDeleteId(null)}
        onConfirm={confirmDeleteAccount}
        title={t("balance.acc.deleteTitle")}
        message={t("balance.acc.deleteMessage", { name: deletingAccount?.name ?? "" }) + accountImpact}
      />
      <ConfirmDialog
        open={invDeleteId !== null}
        onClose={() => setInvDeleteId(null)}
        onConfirm={confirmDeleteInvestment}
        title={t("balance.inv.deleteTitle")}
        message={t("balance.inv.deleteMessage", { name: deletingInvestment?.name ?? "" })}
      />
      <ConfirmDialog
        open={debtDeleteId !== null}
        onClose={() => setDebtDeleteId(null)}
        onConfirm={confirmDeleteDebt}
        title={t("balance.debt.deleteTitle")}
        message={t("balance.debt.deleteMessage", { name: deletingDebt?.name ?? "" })}
      />
    </>
  );
}

function InvestmentCard({
  inv,
  today,
  oneYearOut,
  onEdit,
  onDelete,
}: {
  inv: Investment;
  today: string;
  oneYearOut: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const snap = investmentAt(inv, today);
  const inYear = investmentAt(inv, oneYearOut);
  const market = valuationOf(inv.kind) === "market";
  const coin = coinInfo(inv.coin);
  const fund = inzhurFund(inv.fund);
  const matured = inv.endDate != null && inv.endDate <= today;
  const kindMeta = investmentKind(inv.kind);
  const slot = investmentColorSlot(inv.kind);
  const returnMode = returnLabel(returnPolicy(inv), inv.kind, inv.compoundingFreq, t);
  const earned = snap.accrued + snap.paidOut;
  const gainPct = snap.invested > 0 ? (earned / snap.invested) * 100 : 0;
  const proj = projectedSnapshot(inv, today, oneYearOut);
  const projValue = proj.value;
  const yearDeposits = (inv.monthlyContribution ?? 0) * 12;
  const projGain = market
    ? projValue - snap.value - yearDeposits + proj.paidOut
    : inYear.accrued - snap.accrued + (inYear.paidOut - snap.paidOut);
  const expectedLabel = fund
    ? yieldRange(
        inv.annualRatePct,
        inv.annualRatePct === fund.projectedYieldPct ? fund.projectedYieldMaxPct : undefined,
        fund.linkedCurrency,
        t,
      )
    : t("balance.perYear", { pct: formatPercent(inv.annualRatePct) });

  let mark: ReactNode = kindMeta.icon;
  if (inv.kind === "crypto" && inv.coinIcon) mark = <RemoteLogo sources={[inv.coinIcon]} fallback={kindMeta.icon} />;
  if (fund) {
    mark = (
      <RemoteLogo
        sources={[INZHUR_LOGO]}
        fallback={<Monogram name={fund.name.replace("Inzhur ", "")} color={fund.accent} size={30} />}
        alt={fund.name}
        rounded="md"
        size={30}
      />
    );
  }

  return (
    <div className="glass-well flex min-w-0 flex-col rounded-field p-4">
      <div className="flex items-start gap-3">
        <IconDisc colorSlot={slot} className="size-11 rounded-field text-xl">
          {mark}
        </IconDisc>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold text-ink-1">{inv.name}</h2>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-3">
            {[t(`investmentKind.${inv.kind}`), fund && fund.name !== inv.name ? fund.name : null, inv.currency]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
            earned >= 0 ? "bg-income/12 text-income ring-income/20" : "bg-expense/12 text-expense ring-expense/20"
          }`}
        >
          <Icon name="trend" size={13} className={earned >= 0 ? "" : "-scale-y-100"} />
          {formatPercent(Math.abs(gainPct))}
        </span>
      </div>

      {inv.note && <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-3 italic">{inv.note}</p>}

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Money amount={snap.value} currency={inv.currency} exact className="num-md block text-ink-1" />
          <p className="tnum mt-1.5 text-xs text-ink-3">
            {t("balance.inv.earnedLine", { amount: formatMoney(earned, inv.currency, { sign: true, compact: true }) })}
          </p>
        </div>
        {!market && <Sparkline values={sparkValues(inv, today)} width={116} height={46} />}
      </div>

      <dl className="mt-4 mb-4 divide-y divide-hairline overflow-hidden rounded-field border border-hairline text-sm">
        {(!market || inv.annualRatePct > 0) && (
          <InfoRow label={market ? t("balance.inv.row.expected") : t("balance.inv.row.rate")}>
            {expectedLabel}
          </InfoRow>
        )}
        {!matured && (!market || inv.annualRatePct > 0) && (
          <InfoRow label={t("balance.inv.row.return")}>{returnMode}</InfoRow>
        )}
        {coin && inv.quantity ? (
          <InfoRow label={t("balance.inv.row.holding")}>
            {formatNumber(inv.quantity, 8)} {coin.symbol}
          </InfoRow>
        ) : null}
        {fund && inv.quantity ? (
          <InfoRow label={t("balance.inv.row.certificates")}>{formatNumber(inv.quantity, 4)}</InfoRow>
        ) : null}
        {(coin || fund) && inv.quantity && inv.marketValue ? (
          <InfoRow label={fund ? t("balance.inv.row.nav") : t("balance.inv.row.price")}>
            <Money amount={inv.marketValue / inv.quantity} currency={inv.currency} exact />
          </InfoRow>
        ) : null}
        {inv.pricedAt && <InfoRow label={t("balance.inv.row.priced")}>{formatDateTime(inv.pricedAt)}</InfoRow>}
        <InfoRow label={market ? t("balance.inv.row.paid") : t("balance.inv.row.invested")}>
          <Money amount={snap.invested} currency={inv.currency} exact />
        </InfoRow>
        {inv.monthlyContribution != null && inv.monthlyContribution > 0 && (
          <InfoRow label={t("balance.inv.row.topUp")}>
            {formatMoney(inv.monthlyContribution, inv.currency)}
            {t("common.perMonth")}
          </InfoRow>
        )}
        {!matured && (!market || inv.annualRatePct > 0 || yearDeposits > 0) && (
          <InfoRow label={t("balance.inv.row.inYear")}>
            <span>
              <Money amount={market ? projValue : inYear.value} currency={inv.currency} exact />{" "}
              {projGain > 0.5 && (
                <span className="text-income">
                  {t("balance.inv.row.inYearEarned", { amount: formatMoney(projGain, inv.currency) })}
                </span>
              )}
            </span>
          </InfoRow>
        )}
        {yearDeposits > 0 && (
          <InfoRow label={t("balance.inv.row.youAdd")}>
            {t("balance.inv.row.perYear", { amount: formatMoney(yearDeposits, inv.currency, { compact: true }) })}
          </InfoRow>
        )}
        <InfoRow label={t("balance.inv.row.since")}>{formatDate(inv.startDate)}</InfoRow>
        {inv.endDate && (
          <InfoRow label={matured ? t("balance.inv.row.matured") : t("balance.inv.row.matures")}>
            {formatDate(inv.endDate)}
          </InfoRow>
        )}
      </dl>

      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-hairline pt-4">
        <Button variant="ghost" className="w-full" onClick={onEdit}>
          <Icon name="edit" size={15} />
          {t("common.edit")}
        </Button>
        <Button variant="danger" className="w-full" onClick={onDelete}>
          <Icon name="trash" size={15} />
          {t("common.delete")}
        </Button>
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="text-ink-2">{label}</dt>
      <dd className="tnum text-right font-medium text-ink-1">{children}</dd>
    </div>
  );
}
