import { inzhurFund } from "./inzhur";
import type { Compounding, CompoundingFreq, Investment, InvestmentKind } from "./types";

export type ReturnStyle = "interest" | "coupons" | "dividends" | "growth";

export interface ReturnPolicy {
  style: ReturnStyle;
  choices: Compounding[];
  compounding: Compounding;
  compoundingFreq: CompoundingFreq;
  freqChoice: boolean;
}

const BY_KIND: Record<InvestmentKind, { style: ReturnStyle; choices: Compounding[] }> = {
  deposit: { style: "interest", choices: ["reinvest", "payout"] },
  bonds: { style: "coupons", choices: ["payout"] },
  reit: { style: "dividends", choices: ["payout", "reinvest"] },
  inzhur: { style: "dividends", choices: ["payout", "reinvest"] },
  stocks: { style: "growth", choices: ["reinvest"] },
  crypto: { style: "growth", choices: ["reinvest"] },
  other: { style: "growth", choices: ["reinvest"] },
};

const GROWTH = { style: "growth" as const, choices: ["reinvest" as const] };

export function returnPolicy(
  inv: Pick<Investment, "kind" | "fund" | "compounding" | "compoundingFreq">,
): ReturnPolicy {
  const base =
    inv.kind === "inzhur" && inzhurFund(inv.fund)?.income !== "dividends"
      ? GROWTH
      : (BY_KIND[inv.kind] ?? GROWTH);
  const compounding = base.choices.includes(inv.compounding) ? inv.compounding : base.choices[0];
  const freqChoice = base.style === "interest" && compounding === "reinvest";
  const compoundingFreq: CompoundingFreq = freqChoice
    ? inv.compoundingFreq
    : inv.kind === "inzhur" && base.style === "dividends"
      ? "monthly"
      : base.style === "growth"
        ? "annually"
        : inv.compoundingFreq;
  return { style: base.style, choices: base.choices, compounding, compoundingFreq, freqChoice };
}
