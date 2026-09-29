"use client";

import { Badge, Icon, ProgressMeter, type IconName } from "@/components/ui";
import { formatNumber } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { Game } from "./shared";

export function LevelSummary({ g }: { g: Game }) {
  const { t, tk } = useT();
  const sources: Array<{ id: "tracking" | "consistency" | "results" | "achievements"; icon: IconName }> = [
    { id: "tracking", icon: "edit" },
    { id: "consistency", icon: "calendar" },
    { id: "results", icon: "trend" },
    { id: "achievements", icon: "trophy" },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-5">
        <div
          className="relative flex size-28 shrink-0 flex-col items-center justify-center rounded-full"
          style={{
            background: "conic-gradient(var(--accent) calc(var(--p) * 1%), var(--fill-ghost) 0)",
            ["--p" as string]: Math.round(g.level.progress * 100),
          }}
        >
          <span className="absolute inset-2 rounded-full bg-(--card-strong)" />
          <span className="relative text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            {t("profile.level.label")}
          </span>
          <span className="relative text-4xl font-black leading-none text-ink-1">{g.level.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="num-md text-ink-1">{tk(`level.rank.${g.level.rank}`, "")}</p>
          <p className="tnum mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            {t("profile.level.xp", { xp: formatNumber(g.level.xp, 0) })}
            {g.xp.thisMonth > 0 && (
              <Badge tone="accent">{t("profile.level.thisMonth", { xp: formatNumber(g.xp.thisMonth, 0) })}</Badge>
            )}
          </p>
          <div className="mt-2.5">
            <ProgressMeter value={g.level.progress} max={1} label={t("profile.level.progress")} />
          </div>
          <p className="tnum mt-1.5 text-xs text-ink-3">
            {t("profile.level.toNext", {
              xp: formatNumber(g.level.next - g.level.xp, 0),
              level: g.level.level + 1,
            })}
          </p>
          {g.level.nextRankLevel !== null && (
            <p className="mt-0.5 text-xs text-ink-3">
              {t("profile.level.nextRank", {
                rank: tk(`level.rank.${g.level.rank + 1}`, ""),
                level: g.level.nextRankLevel,
              })}
            </p>
          )}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {sources.map((s) => (
          <div key={s.id} className="rounded-field bg-ghost px-3 py-2" title={t(`profile.level.source.${s.id}.hint`)}>
            <dt className="flex items-center gap-1.5 text-xs text-ink-3">
              <Icon name={s.icon} size={13} />
              {t(`profile.level.source.${s.id}`)}
            </dt>
            <dd className="tnum mt-0.5 text-sm font-semibold text-ink-1">{formatNumber(g.xp[s.id], 0)} XP</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
