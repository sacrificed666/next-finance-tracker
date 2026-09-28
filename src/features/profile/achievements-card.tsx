"use client";

import { useState } from "react";
import { Badge, Button, Card, FilterPills, Icon, ProgressMeter } from "@/components/ui";
import {
  ACHIEVEMENT_GROUPS,
  type AchievementGroup,
  type AchievementState,
} from "@/lib/finance/achievements";
import { formatNumber } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { TIER_COLOR, TierMedal, TIERS, type Game } from "./shared";

type AchievementView = "all" | "unlocked" | "locked";

const PREVIEW_COUNT = 12;

function AchievementTile({ a }: { a: AchievementState }) {
  const { t, tk } = useT();
  const pct = Math.round(a.progress * 100);
  return (
    <li
      className={`glass-el flex gap-3 rounded-field border border-hairline p-3 ${a.unlocked ? "" : "opacity-75"}`}
    >
      <TierMedal tier={a.tier} icon={a.icon} unlocked={a.unlocked} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-ink-1">{tk(`ach.${a.id}.title`, a.id)}</span>
          <span
            className="rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide"
            style={{
              color: TIER_COLOR[a.tier],
              background: `color-mix(in oklab, ${TIER_COLOR[a.tier]} 14%, transparent)`,
            }}
          >
            {t(`profile.ach.tier.${a.tier}`)}
          </span>
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-ink-3">{tk(`ach.${a.id}.desc`, "")}</span>
        {a.unlocked ? (
          <span className="mt-1.5 inline-flex">
            <Badge tone="income">
              <Icon name="check" size={11} strokeWidth={3} />
              {t("profile.ach.unlocked")}
            </Badge>
          </span>
        ) : (
          <span className="mt-2 block">
            <ProgressMeter value={a.progress} max={1} label={tk(`ach.${a.id}.title`, a.id)} />
            <span className="tnum mt-1 flex justify-between text-[11px] text-ink-3">
              <span>
                {formatNumber(Math.min(a.current, a.target), 1)} / {formatNumber(a.target, 1)}
              </span>
              <span>{pct}%</span>
            </span>
          </span>
        )}
      </span>
      <span className="tnum shrink-0 self-start rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
        +{formatNumber(a.xp, 0)} XP
      </span>
    </li>
  );
}

export function AchievementsCard({ g }: { g: Game }) {
  const { t, tk } = useT();
  const [view, setView] = useState<AchievementView>("all");
  const [group, setGroup] = useState<AchievementGroup | "all">("all");
  const [expanded, setExpanded] = useState(false);
  const list = g.achievements;
  const unlocked = list.filter((a) => a.unlocked);
  const inGroup = list.filter((a) => group === "all" || a.group === group);
  const visible = inGroup
    .filter((a) => (view === "unlocked" ? a.unlocked : view === "locked" ? !a.unlocked : true))
    .sort(
      (a, b) =>
        Number(b.unlocked) - Number(a.unlocked) ||
        (a.unlocked ? TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier) : b.progress - a.progress),
    );
  const nextUp = list
    .filter((a) => !a.unlocked && a.progress > 0)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);

  return (
    <Card
      title={t("profile.ach.title")}
      subtitle={t("profile.ach.count", { n: unlocked.length, total: list.length })}
      icon="trophy"
      className="xl:col-span-2"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TIERS.map((tier) => {
          const all = list.filter((a) => a.tier === tier);
          const got = all.filter((a) => a.unlocked).length;
          return (
            <div key={tier} className="rounded-field bg-ghost px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: TIER_COLOR[tier] }}>
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: TIER_COLOR[tier] }} />
                {t(`profile.ach.tier.${tier}`)}
              </p>
              <p className="tnum mt-0.5 text-sm font-semibold text-ink-1">
                {got}/{all.length}
              </p>
            </div>
          );
        })}
      </div>

      {nextUp.length > 0 && (
        <div className="mt-4">
          <p className="card-title mb-2">{t("profile.ach.nextUp")}</p>
          <ul className="grid gap-2 md:grid-cols-3">
            {nextUp.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 rounded-field bg-ghost px-3 py-2.5">
                <TierMedal tier={a.tier} icon={a.icon} unlocked={false} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-ink-1">{tk(`ach.${a.id}.title`, a.id)}</span>
                  <span className="mt-1 block">
                    <ProgressMeter value={a.progress} max={1} label={tk(`ach.${a.id}.title`, a.id)} />
                  </span>
                </span>
                <span className="tnum shrink-0 text-xs font-semibold text-ink-2">{Math.round(a.progress * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <FilterPills
          label={t("profile.ach.title")}
          options={[
            { value: "all" as const, label: t("filter.all"), count: inGroup.length },
            {
              value: "unlocked" as const,
              label: t("profile.ach.unlockedPlural"),
              count: inGroup.filter((a) => a.unlocked).length,
            },
            { value: "locked" as const, label: t("profile.ach.locked"), count: inGroup.filter((a) => !a.unlocked).length },
          ]}
          value={view}
          onChange={setView}
        />
        <FilterPills
          label={t("profile.ach.groups")}
          options={[
            { value: "all" as const, label: t("profile.ach.group.all") },
            ...ACHIEVEMENT_GROUPS.map((id) => ({
              value: id,
              label: t(`profile.ach.group.${id}`),
              count: list.filter((a) => a.group === id && a.unlocked).length,
            })),
          ]}
          value={group}
          onChange={setGroup}
        />
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-2">{t("profile.ach.none")}</p>
      ) : (
        <>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {(expanded ? visible : visible.slice(0, PREVIEW_COUNT)).map((a) => (
              <AchievementTile key={a.id} a={a} />
            ))}
          </ul>
          {visible.length > PREVIEW_COUNT && (
            <div className="mt-3 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
                <Icon name="chevronDown" size={14} className={expanded ? "-scale-y-100" : ""} />
                {expanded ? t("profile.ach.showLess") : t("profile.ach.showAll", { n: visible.length })}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
