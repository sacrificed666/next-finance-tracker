export type StrengthLevel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  rules: { length: boolean; mix: boolean; symbol: boolean };
  score: number;
  level: StrengthLevel;
}

export const STRENGTH_COLOR: Record<StrengthLevel, string> = {
  weak: "var(--expense)",
  fair: "var(--warning)",
  good: "var(--accent)",
  strong: "var(--income)",
};

export function passwordStrength(password: string): PasswordStrength {
  const rules = {
    length: password.length >= 10,
    mix: /\p{L}/u.test(password) && /\d/.test(password),
    symbol: /[^\p{L}\p{N}]/u.test(password),
  };
  const score =
    Number(rules.length) + Number(rules.mix) + Number(rules.symbol) + Number(password.length >= 16);
  const level: StrengthLevel = score <= 1 ? "weak" : score === 2 ? "fair" : score === 3 ? "good" : "strong";
  return { rules, score, level };
}
