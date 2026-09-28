"use client";

import { displayCurrencies } from "@/lib/constants";
import { convert, formatMoney } from "@/lib/finance/money";
import { useStore } from "@/lib/state/store";
import type { Currency, Settings } from "@/lib/types";

export function Money({
  amount,
  currency,
  compact,
  sign,
  exact,
  className = "",
}: {
  amount: number;
  currency: Currency;
  compact?: boolean;
  sign?: boolean;
  exact?: boolean;
  className?: string;
}) {
  return (
    <span className={`tnum ${className}`}>
      {formatMoney(amount, currency, { compact, sign, exact })}
    </span>
  );
}

export function TripleMoney({
  amount,
  currency,
  settings,
  size = "md",
}: {
  amount: number;
  currency: Currency;
  settings: Settings;
  size?: "md" | "lg";
}) {
  const { state } = useStore();
  const others = displayCurrencies(state).filter((c) => c !== currency);
  return (
    <div>
      <Money
        amount={amount}
        currency={currency}
        exact
        className={size === "lg" ? "hero-number num-xl block" : "num-sm block text-ink-1"}
      />
      <p className={`tnum mt-1 text-ink-2 ${size === "lg" ? "text-sm" : "text-xs"}`}>
        {others
          .map((c) =>
            formatMoney(convert(amount, currency, c, settings.rates), c, { exact: true }),
          )
          .join("  ·  ")}
      </p>
    </div>
  );
}

export function CurrencyCells({
  amount,
  currency,
  settings,
}: {
  amount: number;
  currency: Currency;
  settings: Settings;
}) {
  const { state } = useStore();
  return (
    <>
      {displayCurrencies(state).map((c) => (
        <span
          key={c}
          className={`tnum text-right text-sm ${
            c === currency ? "font-semibold text-ink-1" : "text-ink-3"
          }`}
        >
          {formatMoney(convert(amount, currency, c, settings.rates), c, { exact: true })}
        </span>
      ))}
    </>
  );
}
