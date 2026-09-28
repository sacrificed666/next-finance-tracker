"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Field,
  FieldSet,
  Icon,
  MonthInput,
  ProgressMeter,
  SegmentedControl,
  TextInput,
} from "@/components/ui";
import { CURRENCY_SYMBOL, displayCurrencies } from "@/lib/constants";
import { addMonths, formatMonthCompact, monthDiff } from "@/lib/date";
import { convert, formatMoney, formatPercent, parseAmount } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Currency } from "@/lib/types";
import type { Forecast } from "./use-forecast";

const positive = (s: string) => {
  const v = parseAmount(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** A target amount: when the projection reaches it and what it takes to get there sooner. */
export function GoalCard({
  f,
  view,
  years,
  returnPct,
}: {
  f: Forecast;
  view: Currency;
  years: number;
  returnPct: number;
}) {
  const { t, tp } = useT();
  const { base, settings, projection, assetsNow, startMonth } = f;
  const currencyOptions = displayCurrencies(f.state).map((c) => ({ value: c, label: c }));

  const [goalAmount, setGoalAmount] = useState("");
  const [goalCurrency, setGoalCurrency] = useState<Currency>(base);
  const [goalBy, setGoalBy] = useState(addMonths(startMonth, 36));

  const goalBase = convert(positive(goalAmount), goalCurrency, base, settings.rates);
  const goalHitIndex = goalBase > 0 ? projection.findIndex((p) => p.net >= goalBase) : -1;
  const goalHitMonth = goalHitIndex >= 0 ? projection[goalHitIndex].month : null;
  const alreadyThere = goalBase > 0 && assetsNow >= goalBase;
  const goalMonths = Math.max(1, monthDiff(startMonth, goalBy));

  const neededMonthly = (() => {
    if (goalBase <= 0 || alreadyThere) return null;
    const without = f.projectionFor(returnPct);
    const reached = without[Math.min(goalMonths, without.length - 1)]?.net ?? 0;
    const gap = goalBase - reached;
    if (gap <= 0) return 0;
    const r = returnPct / 100 / 12;
    const factor = r === 0 ? goalMonths : (Math.pow(1 + r, goalMonths) - 1) / r;
    return gap / Math.max(1, factor);
  })();

  const presets = (() => {
    const anchor = Math.max(convert(assetsNow, base, goalCurrency, settings.rates), 1);
    const step = 10 ** Math.floor(Math.log10(anchor));
    return [2, 5, 10].map((m) => Math.round(m * step));
  })();

  const milestones = (() => {
    const top = f.endPoint?.net ?? 0;
    if (top <= assetsNow) return [];
    const step = 10 ** Math.floor(Math.log10(Math.max(top, 1)));
    const out: Array<{ amount: number; month: string }> = [];
    for (let target = step; target <= top && out.length < 3; target += step) {
      if (target <= assetsNow) continue;
      const at = projection.findIndex((p) => p.net >= target);
      if (at >= 0) out.push({ amount: convert(target, base, view, settings.rates), month: projection[at].month });
    }
    return out;
  })();

  return (
    <Card title={t("forecast.goal")} subtitle={t("forecast.goal.subtitle")} icon="target">
      <div className="space-y-3">
        <Field label={t("balance.goal.target")}>
          <TextInput
            inputMode="decimal"
            prefix={CURRENCY_SYMBOL[goalCurrency]}
            value={goalAmount}
            onChange={(e) => setGoalAmount(e.target.value)}
            placeholder={t("forecast.goal.placeholder")}
          />
        </Field>
        <FieldSet label={t("common.currency")}>
          <SegmentedControl label={t("common.currency")} options={currencyOptions} value={goalCurrency} onChange={setGoalCurrency} />
        </FieldSet>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <Button key={preset} variant="ghost" size="sm" onClick={() => setGoalAmount(String(preset))}>
            {formatMoney(preset, goalCurrency, { compact: true })}
          </Button>
        ))}
      </div>

      {goalBase > 0 && !alreadyThere && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
            <span className="text-ink-2">{t("forecast.goal.progress")}</span>
            <span className="tnum font-semibold text-ink-1">{formatPercent(Math.min(100, (assetsNow / goalBase) * 100), 0)}</span>
          </div>
          <ProgressMeter
            value={assetsNow}
            max={goalBase}
            label={t("forecast.goal.progressTo", { amount: formatMoney(goalBase, base, { compact: true }) })}
          />
        </div>
      )}

      <div className="glass-well mt-4 rounded-field p-4 text-center">
        {goalBase <= 0 ? (
          <p className="text-sm text-ink-3">{t("forecast.goal.enter")}</p>
        ) : alreadyThere ? (
          <>
            <span aria-hidden className="mx-auto flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Icon name="check" size={20} strokeWidth={2.6} />
            </span>
            <p className="mt-2 text-sm font-semibold text-income">{t("forecast.goal.there")}</p>
          </>
        ) : goalHitMonth ? (
          <>
            <p className="card-title">{t("forecast.goal.reached")}</p>
            <p className="hero-number num-md mt-1">{formatMonthCompact(goalHitMonth)}</p>
            <p className="mt-1 text-xs text-ink-3">{tp("forecast.goal.inMonths", goalHitIndex)}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-ink-1">{tp("forecast.goal.notWithin", years)}</p>
            <p className="mt-1 text-xs text-ink-3">{t("forecast.goal.notWithin.hint")}</p>
          </>
        )}
      </div>

      {goalBase > 0 && !alreadyThere && (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="card-title mb-2">{t("forecast.goal.byWhen")}</p>
          <MonthInput name={t("forecast.goal.byWhen")} value={goalBy} onChange={setGoalBy} />
          <p className="mt-2 text-sm text-ink-2">
            {neededMonthly === null || neededMonthly === 0
              ? t("forecast.goal.alreadyOnTrack")
              : t("forecast.goal.needMonthly", {
                  amount: formatMoney(convert(neededMonthly, base, view, settings.rates), view, { compact: true }),
                  months: goalMonths,
                })}
          </p>
        </div>
      )}

      {milestones.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="card-title">{t("forecast.milestones")}</p>
          <ul className="mt-2 space-y-1.5">
            {milestones.map((m) => (
              <li key={m.amount} className="flex items-center justify-between gap-3 text-sm">
                <span className="tnum text-ink-2">{formatMoney(m.amount, view, { compact: true })}</span>
                <span className="font-medium text-ink-1">{formatMonthCompact(m.month)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
