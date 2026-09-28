import { monthDiff, monthOf } from "@/lib/date";
import { accountBalances } from "@/lib/finance/finmath";
import { convert, formatNumber } from "@/lib/finance/money";
import { coinInfo } from "@/lib/market/crypto";
import { uid } from "@/lib/state/store";
import type { AppState, CoinHolding, DebtKind } from "@/lib/types";

export const HTTPS_URL = /^https:\/\/\S{3,480}$/;

export const DEBT_KIND_ICON: Record<DebtKind, string> = {
  mortgage: "🏠",
  loan: "🏦",
  card: "💳",
};

/** One coin line in the account form; `key` keeps rows stable while coins change. */
export interface HoldingDraft {
  key: string;
  coin: string;
  quantity: string;
  price?: number;
  icon?: string;
}

export function holdingDrafts(holdings: CoinHolding[] | undefined): HoldingDraft[] {
  return (holdings ?? []).map((h) => ({ key: uid(), coin: h.coin, quantity: String(h.quantity), price: h.price, icon: h.icon }));
}

export function holdingsSummary(holdings: CoinHolding[] | undefined): string {
  return (holdings ?? [])
    .map((h) => `${formatNumber(h.quantity, 8)} ${coinInfo(h.coin)?.symbol ?? h.coin.toUpperCase()}`)
    .join(" · ");
}

/**
 * Every account goal, in the account's currency and in the base currency, plus
 * the totals: how much of all goals is saved and what it takes each month to
 * meet every deadline.
 */
export function goalsSummary(state: AppState, today: string) {
  const { settings } = state;
  const base = settings.baseCurrency;
  const balances = accountBalances(state, today);
  const goals = state.savings
    .filter((acc) => acc.goal && acc.goal.target > 0)
    .map((acc) => {
      const have = Math.max(0, balances.get(acc.id) ?? 0);
      const target = acc.goal!.target;
      const toBase = (n: number) => convert(n, acc.currency, base, settings.rates);
      const left = Math.max(0, target - have);
      const monthsLeft = acc.goal!.deadline ? Math.max(1, monthDiff(monthOf(today), monthOf(acc.goal!.deadline))) : null;
      return {
        acc,
        have,
        target,
        progress: Math.min(1, have / target),
        haveBase: toBase(Math.min(have, target)),
        targetBase: toBase(target),
        perMonthBase: monthsLeft && left > 0 ? toBase(left) / monthsLeft : 0,
      };
    });
  return {
    goals,
    reached: goals.filter((g) => g.progress >= 1).length,
    haveTotal: goals.reduce((s, g) => s + g.haveBase, 0),
    targetTotal: goals.reduce((s, g) => s + g.targetBase, 0),
    perMonth: goals.reduce((s, g) => s + g.perMonthBase, 0),
  };
}
