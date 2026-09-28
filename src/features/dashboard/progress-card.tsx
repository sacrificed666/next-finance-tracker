"use client";

import { Card, CardLink, ProgressMeter } from "@/components/ui";
import { gamification } from "@/lib/finance/achievements";
import { formatNumber, formatPercent } from "@/lib/finance/money";
import { useStore } from "@/lib/state/store";
import { useT } from "@/lib/i18n";

/** Level, health score and the achievement closest to unlocking. */
export function ProgressCard({ className = "" }: { className?: string }) {
  const { state } = useStore();
  const { t, tk } = useT();
  const g = gamification(state);
  const unlocked = g.achievements.filter((a) => a.unlocked).length;
  const nextUp = g.achievements.filter((a) => !a.unlocked).sort((a, b) => b.progress - a.progress)[0];
  const tone =
    g.health.grade === "excellent" || g.health.grade === "good"
      ? "text-income"
      : g.health.grade === "fair"
        ? "text-warning"
        : "text-expense";

  return (
    <Card
      title={t("dash.progress")}
      icon="trophy"
      action={<CardLink href="/profile" label={t("nav.profile")} />}
      className={className}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-field bg-ghost p-3">
          <p className="caption">{t("profile.level.label")}</p>
          <p className="num-md mt-1 text-ink-1">{g.level.level}</p>
          <p className="truncate text-xs text-ink-3">{tk(`level.rank.${g.level.rank}`, "")}</p>
        </div>
        <div className="rounded-field bg-ghost p-3">
          <p className="caption">{t("profile.health.label")}</p>
          <p className={`num-md mt-1 ${tone}`}>{g.health.score}</p>
          <p className="truncate text-xs text-ink-3">{t(`health.grade.${g.health.grade}`)}</p>
        </div>
      </div>
      <div className="mt-3">
        <ProgressMeter value={g.level.progress} max={1} label={t("profile.level.progress")} />
        <p className="tnum mt-1.5 text-xs text-ink-3">
          {t("profile.level.toNext", { xp: formatNumber(g.level.next - g.level.xp, 0), level: g.level.level + 1 })}
          {" · "}
          {t("profile.ach.count", { n: unlocked, total: g.achievements.length })}
        </p>
      </div>
      {nextUp && (
        <p className="mt-3 flex items-center gap-2 rounded-field bg-ghost px-3 py-2 text-sm text-ink-2">
          <span aria-hidden className="text-lg">
            {nextUp.icon}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {t("dash.nextAchievement", { name: tk(`ach.${nextUp.id}.title`, nextUp.id) })}
          </span>
          <span className="tnum text-xs text-ink-3">{formatPercent(nextUp.progress * 100, 0)}</span>
        </p>
      )}
    </Card>
  );
}
