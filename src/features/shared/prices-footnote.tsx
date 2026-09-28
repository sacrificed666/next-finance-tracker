"use client";

import { Icon } from "@/components/ui";
import { formatDateTime, nextHourLabel } from "@/lib/date";
import { useT } from "@/lib/i18n";
import { lastPricedAt, pricedPositions } from "@/lib/market/refresh";
import { useStore } from "@/lib/state/store";

/** When live prices were last pulled and when they refresh next. Hidden when nothing on the page is priced. */
export function PricesFootnote({ scope }: { scope: "accounts" | "investments" }) {
  const { state } = useStore();
  const { t } = useT();
  const priced = pricedPositions(state);
  const count =
    scope === "accounts" ? priced.coinAccounts.length : priced.coinInvestments.length + priced.inzhurInvestments.length;
  if (count === 0) return null;
  const pricedAt = lastPricedAt(state);
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-1 text-xs text-ink-3">
      <Icon name="refresh" size={13} className="shrink-0" />
      <span>{pricedAt ? t("balance.prices.pricedAt", { when: formatDateTime(pricedAt) }) : t("balance.prices.never")}</span>
      <span aria-hidden>·</span>
      <span>{t("prices.nextUpdate", { time: nextHourLabel() })}</span>
    </p>
  );
}
