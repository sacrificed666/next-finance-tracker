"use client";

import type { ReactNode } from "react";
import { Card, Slider, Switch } from "@/components/ui";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Forecast } from "./use-forecast";

function SliderRow({ label, value, hint, children }: { label: string; value: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="tnum text-sm font-semibold text-ink-1">{value}</span>
      </div>
      {children}
      {hint && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function ToggleRow({ title, hint, children }: { title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-3">
      <div className="min-w-0">
        <p className="body-strong">{title}</p>
        <p className="caption mt-0.5">{hint}</p>
      </div>
      {children}
    </div>
  );
}

export function AssumptionsCard({
  f,
  years,
  setYears,
  returnPct,
  setReturnPct,
  spreadPct,
  setSpreadPct,
  inflationOn,
  setInflationOn,
  withDebts,
  setWithDebts,
}: {
  f: Forecast;
  years: number;
  setYears: (v: number) => void;
  returnPct: number;
  setReturnPct: (v: number) => void;
  spreadPct: number;
  setSpreadPct: (v: number) => void;
  inflationOn: boolean;
  setInflationOn: (v: boolean) => void;
  withDebts: boolean;
  setWithDebts: (v: boolean) => void;
}) {
  const { t, tp } = useT();
  const { inflationMix } = f;
  return (
    <Card title={t("forecast.assumptions")} subtitle={t("forecast.assumptions.subtitle")} icon="sliders">
      <div className="grid gap-x-6 gap-y-5 lg:grid-cols-3">
        <SliderRow label={t("forecast.horizon")} value={tp("forecast.years", years)}>
          <Slider min={1} max={40} value={years} onChange={setYears} label={t("forecast.horizon")} />
        </SliderRow>
        <SliderRow label={t("forecast.return")} value={t("balance.perYear", { pct: formatPercent(returnPct) })}>
          <Slider min={0} max={25} step={0.5} value={returnPct} onChange={setReturnPct} label={t("forecast.return")} />
        </SliderRow>
        <SliderRow label={t("forecast.spread")} value={`±${formatPercent(spreadPct)}`} hint={t("forecast.spread.hint")}>
          <Slider min={0} max={10} step={0.5} value={spreadPct} onChange={setSpreadPct} label={t("forecast.spread")} />
        </SliderRow>

        <ToggleRow
          title={t("forecast.real")}
          hint={
            <>
              {t("forecast.real.hint", { pct: formatPercent(inflationMix.pct, 1) })}
              {inflationMix.shares && inflationMix.shares.length > 1 && (
                <>
                  {": "}
                  {inflationMix.shares
                    .map((sh) => `${formatPercent(sh.share * 100, 0)} ${CURRENCY_SYMBOL[sh.currency]}`)
                    .join(" · ")}
                </>
              )}
            </>
          }
        >
          <Switch checked={inflationOn} onChange={setInflationOn} label={t("forecast.real")} />
        </ToggleRow>

        {f.state.debts.length > 0 && (
          <ToggleRow title={t("forecast.debts")} hint={t("forecast.debts.hint")}>
            <Switch checked={withDebts} onChange={setWithDebts} label={t("forecast.debts")} />
          </ToggleRow>
        )}
      </div>
    </Card>
  );
}
