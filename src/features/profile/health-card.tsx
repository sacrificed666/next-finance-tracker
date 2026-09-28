"use client";

import Link from "next/link";
import { Card, Icon, ProgressMeter } from "@/components/ui";
import type { HealthPart, HealthPartId } from "@/lib/finance/achievements";
import { formatNumber, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { healthTone, ScoreRing, type Game } from "./shared";

const HEALTH_LINK: Record<HealthPartId, string> = {
  savings: "/transactions",
  cushion: "/accounts",
  debt: "/accounts",
  budgets: "/transactions",
  stability: "/transactions",
  diversity: "/investments",
  investing: "/investments",
};

export function HealthCard({ g }: { g: Game }) {
  const { t } = useT();
  const f = g.facts;
  const tone = healthTone(g.health.grade);

  const partValue = (p: HealthPart): string => {
    switch (p.id) {
      case "savings":
        return formatPercent(p.value);
      case "cushion":
        return t("profile.health.months", { n: formatNumber(p.value, 1) });
      case "debt":
        return f.debts === 0 ? t("profile.health.noDebt") : formatPercent(p.value, 0);
      case "budgets":
        return f.budgetsTrackedLastMonth > 0
          ? `${f.budgetsWithinLastMonth}/${f.budgetsTrackedLastMonth}`
          : t("profile.health.noBudgets");
      case "stability":
        return `${f.positiveMonths6}/${f.completeMonths6}`;
      case "diversity":
        return formatNumber(p.value, 0);
      case "investing":
        return formatPercent(p.value, 0);
    }
  };

  return (
    <Card title={t("profile.health.title")} subtitle={t("profile.health.subtitle")} icon="heart">
      <div className="flex flex-wrap items-center gap-5">
        <ScoreRing score={g.health.score} tone={tone} />
        <div className="min-w-0 flex-1">
          <p className="num-md" style={{ color: tone }}>
            {t(`health.grade.${g.health.grade}`)}
          </p>
          <p className="mt-1 text-sm text-ink-2">{t(`health.grade.${g.health.grade}.hint`)}</p>
          {!g.health.enoughData && <p className="mt-1.5 text-xs text-warning">{t("profile.health.fewData")}</p>}
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {g.health.parts.map((p) => (
          <li key={p.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink-2">{t(`health.part.${p.id}`)}</span>
              <span className="tnum shrink-0 text-xs text-ink-3">
                {partValue(p)} · <span className="font-semibold text-ink-1">{Math.round(p.score)}</span>/{p.max}
              </span>
            </div>
            <div className="mt-1.5">
              <ProgressMeter value={p.score} max={p.max} label={t(`health.part.${p.id}`)} />
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-3">{t(`health.part.${p.id}.hint`)}</p>
          </li>
        ))}
      </ul>
      {g.health.tips.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-hairline pt-3">
          <p className="card-title mb-1">{t("profile.health.tips")}</p>
          {g.health.tips.map((id) => (
            <Link
              key={id}
              href={HEALTH_LINK[id]}
              className="row-tap flex items-start gap-2.5 px-2 py-2 text-sm text-ink-2 hover:text-ink-1"
            >
              <Icon name="sparkle" size={16} className="mt-0.5 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">{t(`health.tip.${id}`)}</span>
              <Icon name="chevronRight" size={15} className="mt-0.5 shrink-0 text-ink-3" />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
