"use client";

import { PageHero } from "@/components/layout/hero";
import { Icon } from "@/components/ui";
import { formatDate } from "@/lib/date";
import { formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { LevelSummary } from "./level-summary";
import { ageFrom, Avatar, type Game, type Profile } from "./shared";

/** Who you are and your level, with health, achievements and both streaks underneath. */
export function ProfileHero({ profile, g }: { profile: Profile; g: Game }) {
  const { t, tp, tk } = useT();
  const unlocked = g.achievements.filter((a) => a.unlocked).length;
  const nextUp = g.achievements.filter((a) => !a.unlocked).sort((a, b) => b.progress - a.progress)[0];
  const healthy = g.health.grade === "excellent" || g.health.grade === "good";

  return (
    <PageHero
      lead={
        <div className="flex items-center gap-4">
          <Avatar name={profile.name ?? ""} email={profile.email ?? ""} image={profile.image ?? ""} />
          <div className="min-w-0 flex-1">
            <p className="num-md truncate text-ink-1">{profile.name || t("profile.unnamed")}</p>
            <p className="mt-1 truncate text-sm text-ink-2">{profile.email}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
              {[
                profile.occupation,
                profile.location,
                profile.birthday ? t("profile.age", { n: ageFrom(profile.birthday) }) : null,
                t("profile.memberSince", { date: formatDate(profile.createdAt) }),
              ]
                .filter(Boolean)
                .map((part, i, list) => (
                  <span key={part as string} className="flex items-center gap-2">
                    {part}
                    {i < list.length - 1 && <span aria-hidden>·</span>}
                  </span>
                ))}
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                >
                  <Icon name="globe" size={12} />
                  {profile.website.replace(/^https:\/\//, "")}
                </a>
              )}
            </p>
            {profile.about && <p className="mt-1.5 line-clamp-2 text-xs text-ink-2">{profile.about}</p>}
          </div>
        </div>
      }
      aside={<LevelSummary g={g} />}
      stats={[
        {
          label: t("profile.health.label"),
          icon: "heart",
          value: `${g.health.score}/100`,
          tone: healthy ? "income" : g.health.grade === "weak" ? "expense" : undefined,
          hint: t(`health.grade.${g.health.grade}`),
        },
        {
          label: t("profile.ach.title"),
          icon: "trophy",
          value: `${unlocked}/${g.achievements.length}`,
          hint: nextUp
            ? `${t("dash.nextAchievement", { name: tk(`ach.${nextUp.id}.title`, nextUp.id) })} · ${formatPercent(nextUp.progress * 100, 0)}`
            : undefined,
        },
        {
          label: t("profile.stats.weekStreak"),
          icon: "flame",
          value: tp("profile.stats.weeksValue", g.facts.weekStreak),
          hint: t("profile.stats.best", { value: tp("profile.stats.weeksValue", g.facts.bestWeekStreak) }),
        },
        {
          label: t("profile.stats.streak"),
          icon: "trend",
          value: tp("profile.stats.monthsValue", g.facts.positiveStreak),
          hint: t("profile.stats.best", { value: tp("profile.stats.monthsValue", g.facts.bestStreak) }),
        },
      ]}
    />
  );
}
