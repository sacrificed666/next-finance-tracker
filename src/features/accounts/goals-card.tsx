"use client";

import { Card, IconDisc, ProgressMeter, SummaryPanel } from "@/components/ui";
import { accountColorSlot } from "@/lib/constants";
import { formatDate, todayISO } from "@/lib/date";
import { formatMoney, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import { AccountMark } from "./account-mark";
import { goalsSummary } from "./helpers";

const SHOWN = 4;

export function GoalsCard({ className = "" }: { className?: string }) {
  const { state } = useStore();
  const { t } = useT();
  const base = state.settings.baseCurrency;
  const { goals, reached, haveTotal, targetTotal, perMonth } = goalsSummary(state, todayISO());
  if (goals.length === 0) return null;

  const closest = goals
    .filter((g) => g.progress < 1)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, SHOWN);

  return (
    <Card
      title={t("balance.goals")}
      subtitle={t("balance.goals.subtitle", { reached, total: goals.length })}
      icon="target"
      className={className}
    >
      <SummaryPanel
        value={formatMoney(haveTotal, base, { compact: true })}
        meta={`/ ${formatMoney(targetTotal, base, { compact: true })} · ${formatPercent((haveTotal / targetTotal) * 100, 0)}`}
      >
        <ProgressMeter value={haveTotal} max={targetTotal} label={t("balance.goals")} />
        {perMonth > 0.5 && (
          <p className="caption mt-2">{t("balance.goals.monthly", { amount: formatMoney(perMonth, base, { compact: true }) })}</p>
        )}
      </SummaryPanel>

      {closest.length > 0 && (
        <div className="mt-4">
          <p className="card-title mb-2">{t("balance.goals.closest")}</p>
          <ul className="rows">
            {closest.map((g) => (
              <li key={g.acc.id} className="flex items-center gap-3 px-2.5 py-2">
                <IconDisc colorSlot={accountColorSlot(g.acc.kind)} className="size-8 rounded-field text-sm">
                  <AccountMark acc={g.acc} />
                </IconDisc>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink-1">{g.acc.name}</span>
                    <span className="tnum shrink-0 text-xs text-ink-3">{formatPercent(g.progress * 100, 0)}</span>
                  </span>
                  <span className="mt-1.5 block">
                    <ProgressMeter value={g.have} max={g.target} label={t("balance.goal.label", { name: g.acc.name })} />
                  </span>
                  <span className="tnum mt-1 block truncate text-xs text-ink-3">
                    {formatMoney(g.have, g.acc.currency)} / {formatMoney(g.target, g.acc.currency)}
                    {g.acc.goal?.deadline ? ` · ${t("balance.goal.by", { date: formatDate(g.acc.goal.deadline) })}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
