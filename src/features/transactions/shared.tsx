"use client";

import { Badge } from "@/components/ui";
import { CURRENCIES } from "@/lib/constants";
import type { SubscriptionStatus } from "@/lib/finance/finmath";
import { useT } from "@/lib/i18n";
import type { RecurringRule } from "@/lib/types";

export const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

export type RecurringView = "now" | "upcoming" | "ended" | "all";

export function recurringStatus(rule: RecurringRule, month: string): Exclude<RecurringView, "all"> {
  if (rule.startMonth > month) return "upcoming";
  if (rule.endMonth && rule.endMonth < month) return "ended";
  return "now";
}

export function StatusBadge({ status }: { status: SubscriptionStatus | Exclude<RecurringView, "all"> }) {
  const { t } = useT();
  if (status === "active" || status === "now") return null;
  const label =
    status === "upcoming" ? t("tx.status.upcoming") : status === "ended" ? t("tx.status.ended") : t("tx.status.paused");
  return <Badge tone={status === "ended" ? "neutral" : status === "paused" ? "warning" : "accent"}>{label}</Badge>;
}
