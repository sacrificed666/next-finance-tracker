"use client";

import { HeroSplit } from "@/components/charts";
import { PageHero } from "@/components/layout/hero";
import { formatMonthCompact } from "@/lib/date";
import { convert, formatMoney, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Currency } from "@/lib/types";
import type { Forecast } from "./use-forecast";

/** Where the base scenario ends, what the end figure is made of, and the scenarios around it. */
export function ForecastHero({
  f,
  view,
  years,
  returnPct,
  spreadPct,
  inflationOn,
}: {
  f: Forecast;
  view: Currency;
  years: number;
  returnPct: number;
  spreadPct: number;
  inflationOn: boolean;
}) {
  const { t, tp } = useT();
  const diff = f.endTotal - f.nowTotal;
  const split = f.contributionSplit;
  const now = f.projection[0];
  const nowShare = now.savings + now.investments > 0 ? (now.investments / (now.savings + now.investments)) * 100 : 0;
  // The scenarios only differ where a return rate applies; when they collapse, a range says nothing.
  const compact = (v: number) => formatMoney(v, view, { compact: true });
  const hasRange = compact(f.endLow) !== compact(f.endHigh);
  const vsBase = (v: number) => t("forecast.hero.vsBase", { delta: formatMoney(v - f.endTotal, view, { compact: true, sign: true }) });

  return (
    <PageHero
      icon="calendar"
      label={inflationOn ? t("forecast.inYearsReal", { n: years }) : t("forecast.inYears", { n: years })}
      value={formatMoney(f.endTotal, view)}
      sub={hasRange ? t("forecast.range", { low: compact(f.endLow), high: compact(f.endHigh) }) : undefined}
      delta={
        f.nowTotal > 0
          ? {
              text: `${formatMoney(diff, view, { compact: true, sign: true })} · ${tp("forecast.overYears", years, {
                pct: `${diff >= 0 ? "+" : ""}${formatPercent((diff / f.nowTotal) * 100)}`,
              })}`,
              good: diff >= 0,
            }
          : undefined
      }
      aside={
        <HeroSplit
          title={t("forecast.sources")}
          segments={[
            { id: "have", label: t("forecast.have"), value: split.start, colorSlot: 1 },
            { id: "add", label: t("forecast.add"), value: split.deposits, colorSlot: 2 },
            { id: "earns", label: t("forecast.earns"), value: split.growth, colorSlot: 3 },
          ]}
          currency={view}
          columns={3}
        />
      }
      stats={[
        {
          label: t("forecast.now"),
          icon: "wallet",
          value: formatMoney(f.nowTotal, view, { compact: true }),
          hint: t("forecast.hero.invested", { pct: formatPercent(nowShare, 0) }),
        },
        {
          label: t("forecast.scenario.low"),
          icon: "shield",
          value: formatMoney(f.endLow, view, { compact: true }),
          hint: `${vsBase(f.endLow)} · ${t("balance.perYear", { pct: formatPercent(Math.max(0, returnPct - spreadPct)) })}`,
        },
        {
          label: t("forecast.scenario.high"),
          icon: "trend",
          value: formatMoney(f.endHigh, view, { compact: true }),
          tone: "income",
          hint: `${vsBase(f.endHigh)} · ${t("balance.perYear", { pct: formatPercent(returnPct + spreadPct) })}`,
        },
        {
          label: t("forecast.freedom"),
          icon: "target",
          value: f.freedomMonth ? formatMonthCompact(f.freedomMonth) : f.avgSpend > 0 ? t("forecast.freedom.beyond") : "—",
          hint:
            f.avgSpend > 0
              ? t("forecast.freedom.hint", {
                  covered: formatPercent(f.coverNow, 0),
                  spend: formatMoney(convert(f.avgSpend, f.base, view, f.settings.rates), view, { compact: true }),
                })
              : t("forecast.freedom.noSpend"),
        },
      ]}
    />
  );
}
