"use client";

import { Card, Icon, type IconName } from "@/components/ui";
import { formatMonth } from "@/lib/date";
import { convert, formatMoney, formatNumber, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { Game } from "./shared";

export function StatsCard({ g }: { g: Game }) {
  const { state } = useStore();
  const { t, tp, category } = useT();
  const f = g.facts;
  const base = state.settings.baseCurrency;
  const money = (uah: number) => formatMoney(convert(uah, "UAH", base, state.settings.rates), base, { compact: true });
  const top = f.topCategoryId ? state.categories.find((c) => c.id === f.topCategoryId) : undefined;
  const rateDelta = f.savingsRate3 - f.savingsRatePrev3;

  const tiles: Array<{ icon: IconName; label: string; value: string; sub?: string; tone?: "good" | "bad" }> = [
    {
      icon: "calendar",
      label: t("profile.stats.since"),
      value: f.firstMonth ? formatMonth(f.firstMonth) : "—",
      sub: tp("profile.stats.monthsValue", f.monthsTracked),
    },
    {
      icon: "edit",
      label: t("profile.stats.logged"),
      value: formatNumber(f.manualTransactions, 0),
      sub: t("profile.stats.loggedMonth", { n: f.manualThisMonth }),
    },
    {
      icon: "sparkle",
      label: t("profile.stats.activeDays"),
      value: `${f.activeDays30}/30`,
      sub: t("profile.stats.activeDays.sub"),
    },
    {
      icon: "target",
      label: t("profile.stats.savingsRate"),
      value: formatPercent(f.savingsRate3),
      sub: t("profile.stats.before", { value: formatPercent(f.savingsRatePrev3) }),
      tone: rateDelta >= 0 ? "good" : "bad",
    },
    { icon: "arrowDown", label: t("profile.stats.avgIncome"), value: money(f.avgIncomeUAH), sub: t("profile.stats.sixMonths") },
    { icon: "spend", label: t("profile.stats.avgSpend"), value: money(f.avgExpenseUAH), sub: t("profile.stats.sixMonths") },
    {
      icon: "pie",
      label: t("profile.stats.topCategory"),
      value: top ? `${top.icon} ${category(top)}` : "—",
      sub: top ? t("profile.stats.topShare", { pct: formatPercent(f.topCategoryShare, 0) }) : undefined,
    },
    {
      icon: "banknote",
      label: t("profile.stats.passive"),
      value: `${money(f.passiveMonthlyUAH)}${t("common.perMonth")}`,
      sub: t("profile.stats.passive.sub"),
    },
  ];

  return (
    <Card title={t("profile.stats.title")} subtitle={t("profile.stats.subtitle")} icon="chart">
      <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {tiles.map((s) => (
          <div key={s.label} className="min-w-0 rounded-field bg-ghost px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-ink-3">
              <Icon name={s.icon} size={13} className="shrink-0" />
              <span className="truncate">{s.label}</span>
            </dt>
            <dd className="num-sm mt-1 truncate text-ink-1">{s.value}</dd>
            {s.sub && (
              <p
                className={`tnum mt-0.5 truncate text-[11px] ${
                  s.tone === "good" ? "text-income" : s.tone === "bad" ? "text-expense" : "text-ink-3"
                }`}
              >
                {s.sub}
              </p>
            )}
          </div>
        ))}
      </dl>
    </Card>
  );
}
