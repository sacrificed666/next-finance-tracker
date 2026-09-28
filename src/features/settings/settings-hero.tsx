"use client";

import { PageHero } from "@/components/layout/hero";
import { CURRENCY_SYMBOL, FOREIGN_CURRENCIES } from "@/lib/constants";
import { formatMonth, monthOf } from "@/lib/date";
import { formatNumber } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import { ratesOrigin } from "./rates-card";

/** How much lives in the database, the rates everything converts at, and what the records are made of. */
export function SettingsHero() {
  const { state } = useStore();
  const { settings } = state;
  const { t, tp } = useT();
  const first = state.transactions.reduce<string | null>((min, tx) => (!min || tx.date < min ? tx.date : min), null);
  const expenseCategories = state.categories.filter((c) => c.kind === "expense").length;

  return (
    <PageHero
      icon="database"
      label={t("settings.hero")}
      value={tp("common.entries", state.transactions.length)}
      sub={first ? t("settings.hero.since", { month: formatMonth(monthOf(first)) }) : undefined}
      note={t("settings.hero.note")}
      aside={
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="card-title">{t("settings.rates.title")}</p>
            <p className="text-xs text-ink-2">{ratesOrigin(settings, t)}</p>
          </div>
          <ul className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            {FOREIGN_CURRENCIES.map((c) => (
              <li key={c} className="rounded-field bg-ghost px-3 py-2.5">
                <p className="text-xs text-ink-3">1 {CURRENCY_SYMBOL[c]} · {c}</p>
                <p className="num-lg mt-0.5 text-ink-1">{formatNumber(settings.rates[c], 2)} ₴</p>
                {settings.ratesMeta?.[c] && (
                  <p className="tnum mt-0.5 text-xs text-ink-3">
                    {t("settings.rates.buySell", { buy: settings.ratesMeta[c].buy, sell: settings.ratesMeta[c].sell })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      }
      stats={[
        {
          label: t("settings.about.accounts"),
          icon: "bank",
          href: "/accounts",
          value: String(state.savings.length),
        },
        {
          label: t("settings.about.investments"),
          icon: "bars",
          href: "/investments",
          value: String(state.investments.length),
        },
        {
          label: t("settings.categories.title"),
          icon: "tag",
          value: String(state.categories.length),
          hint: `${t("tx.type.expense")} ${expenseCategories} · ${t("tx.type.income")} ${state.categories.length - expenseCategories}`,
        },
        {
          label: t("tx.subs"),
          icon: "device",
          value: String(state.subscriptions.length),
          hint: tp("settings.categories.rules", state.recurring.length),
        },
      ]}
    />
  );
}
