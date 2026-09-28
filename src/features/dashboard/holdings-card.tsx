"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { CategoryBreakdown, type BreakdownSegment } from "@/components/charts";
import { Card, CardLink, EmptyState, Icon, LinkButton } from "@/components/ui";
import { holdings, netWorth } from "@/lib/finance/finmath";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useMonthSummary } from "./use-month-summary";

/** The largest holdings, one row each, and the accounts/investments split underneath. */
export function HoldingsCard({ className = "" }: { className?: string }) {
  const { state, base, today } = useMonthSummary();
  const { t, tp } = useT();
  const worth = netWorth(state, today);

  const all = holdings(state, today);
  const slotOf = new Map(all.map((h, i) => [h.id, (i % 13) + 1]));
  const rows = all.filter((h) => h.base > 0).sort((a, b) => b.base - a.base);
  const holdingSegments: BreakdownSegment[] = rows.map((h) => ({
    id: h.id,
    label: h.label,
    icon: h.icon,
    value: h.base,
    colorSlot: slotOf.get(h.id) ?? 1,
  }));

  const native = (id: string): ReactNode => {
    const row = rows.find((h) => h.id === id);
    if (!row || row.currency === base) return null;
    return <p className="tnum mt-0.5 pl-5 text-xs text-ink-3">{formatMoney(row.native, row.currency, { exact: true })}</p>;
  };

  return (
    <Card title={t("dash.worthByHolding")} icon="bank" action={<CardLink href="/accounts" />} className={className}>
      {holdingSegments.length > 0 ? (
        <>
          <CategoryBreakdown segments={holdingSegments} currency={base} maxSegments={7} rowExtra={native} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              {
                href: "/accounts",
                label: t("balance.accounts"),
                value: worth.savings,
                hint: tp("dash.accountsCount", state.savings.length),
              },
              {
                href: "/investments",
                label: t("balance.investments"),
                value: worth.investments,
                hint: tp("balance.inv.positions", state.investments.length),
              },
            ].map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className="group min-w-0 rounded-field bg-ghost px-3 py-2.5 transition-colors hover:bg-fill-hover"
              >
                <span className="flex items-center justify-between gap-2 text-xs text-ink-3">
                  {tile.label}
                  <Icon name="arrowRight" size={12} strokeWidth={2.4} className="transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="num-sm mt-1 block text-ink-1">{formatMoney(tile.value, base, { compact: true })}</span>
                <span className="mt-0.5 block truncate text-xs text-ink-3">{tile.hint}</span>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Icon name="bank" />}
          title={t("dash.holdings.empty")}
          hint={t("dash.holdings.empty.hint")}
          action={<LinkButton href="/accounts">{t("dash.holdings.add")}</LinkButton>}
        />
      )}
    </Card>
  );
}
