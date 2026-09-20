"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import {
  Badge,
  Button,
  Field,
  FilterPills,
  GlassCard,
  IconDisc,
  PageHeader,
  ProgressMeter,
  TextArea,
  TextInput,
} from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { useStore } from "@/lib/store";
import { passwordStrength } from "@/lib/password-meter";
import { PasswordField } from "@/components/password-field";
import { useT } from "@/lib/i18n";
import { formatDate, formatMonth } from "@/lib/date";
import { convert, formatMoney, formatNumber, formatPercent } from "@/lib/money";
import {
  ACHIEVEMENT_GROUPS,
  gamification,
  type AchievementGroup,
  type AchievementState,
  type HealthPart,
  type HealthPartId,
  type Tier,
} from "@/lib/achievements";

interface Profile {
  id: string;
  email: string | null;
  emailVerified: string | null;
  name: string | null;
  image: string | null;
  about: string | null;
  occupation: string | null;
  location: string | null;
  website: string | null;
  birthday: string | null;
  locale: string | null;
  createdAt: string;
  hasPassword: boolean;
  providers: string[];
}

type Game = ReturnType<typeof gamification>;
type AchievementView = "all" | "unlocked" | "locked";

const ABOUT_MAX = 500;
const PREVIEW_COUNT = 12;

const TIERS: Tier[] = ["bronze", "silver", "gold", "platinum"];

const TIER_COLOR: Record<Tier, string> = {
  bronze: "#c07a3e",
  silver: "#a8b0b8",
  gold: "#e0b43a",
  platinum: "#7fd4e6",
};

const HEALTH_LINK: Record<HealthPartId, string> = {
  savings: "/transactions",
  cushion: "/balance",
  debt: "/balance",
  budgets: "/transactions",
  stability: "/transactions",
  diversity: "/balance",
  investing: "/balance",
};

function Avatar({ name, email, image, size = 64 }: { name: string; email: string; image: string; size?: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  const initial = (name || email || "?").trim().charAt(0).toUpperCase();
  if (!image || broken === image) {
    return (
      <span
        aria-hidden
        className="btn-gradient flex shrink-0 items-center justify-center rounded-field font-black shadow-md"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {initial}
      </span>
    );
  }
  return (
    <img
      src={image}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setBroken(image)}
      className="shrink-0 rounded-field object-cover"
      style={{ width: size, height: size }}
    />
  );
}

function ScoreRing({ score, tone }: { score: number; tone: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <svg width={108} height={108} viewBox="0 0 108 108" role="img" aria-label={`${score}/100`} className="shrink-0">
      <circle cx={54} cy={54} r={r} fill="none" stroke="var(--fill-ghost)" strokeWidth={10} />
      <circle
        cx={54}
        cy={54}
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform="rotate(-90 54 54)"
        style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.22,0.68,0.24,1)" }}
      />
      <text x={54} y={54} textAnchor="middle" dominantBaseline="central" className="fill-ink-1" fontSize={28} fontWeight={800}>
        {score}
      </text>
    </svg>
  );
}

function ageFrom(birthday: string): number {
  const born = new Date(`${birthday}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

function healthTone(grade: Game["health"]["grade"]): string {
  return grade === "excellent" || grade === "good"
    ? "var(--income)"
    : grade === "fair"
      ? "var(--warning)"
      : "var(--expense)";
}

function Chip({ icon, children, color }: { icon: IconName; children: ReactNode; color?: string }) {
  return (
    <span className="glass-el inline-flex min-h-9 items-center gap-1.5 rounded-full border border-hairline px-3 text-xs font-semibold text-ink-1">
      <span className="inline-flex shrink-0" style={color ? { color } : undefined}>
        <Icon name={icon} size={14} />
      </span>
      {children}
    </span>
  );
}

function TierMedal({ tier, icon, unlocked, size = 48 }: { tier: Tier; icon: string; unlocked: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full ${unlocked ? "" : "grayscale"}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.48,
        background: `color-mix(in oklab, ${TIER_COLOR[tier]} ${unlocked ? 22 : 8}%, transparent)`,
        boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${TIER_COLOR[tier]} ${unlocked ? 75 : 22}%, transparent)`,
      }}
    >
      {icon}
    </span>
  );
}

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

function LevelCard({ g }: { g: Game }) {
  const { t, tk } = useT();
  const sources: Array<{ id: "tracking" | "consistency" | "results" | "achievements"; icon: IconName }> = [
    { id: "tracking", icon: "edit" },
    { id: "consistency", icon: "calendar" },
    { id: "results", icon: "trend" },
    { id: "achievements", icon: "trophy" },
  ];
  return (
    <GlassCard title={t("profile.level.title")} icon="star" className="glow">
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
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {sources.map((s) => (
          <div key={s.id} className="rounded-field bg-ghost px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-ink-3">
              <Icon name={s.icon} size={13} />
              {t(`profile.level.source.${s.id}`)}
            </dt>
            <dd className="tnum mt-0.5 text-sm font-semibold text-ink-1">{formatNumber(g.xp[s.id], 0)} XP</dd>
            <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{t(`profile.level.source.${s.id}.hint`)}</p>
          </div>
        ))}
      </dl>
    </GlassCard>
  );
}

function HealthCard({ g }: { g: Game }) {
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
    <GlassCard title={t("profile.health.title")} subtitle={t("profile.health.subtitle")} icon="heart">
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
    </GlassCard>
  );
}

function AchievementsCard({ g }: { g: Game }) {
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
    <GlassCard
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
          <ul className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
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
    </GlassCard>
  );
}

function StatsCard({ g }: { g: Game }) {
  const { state } = useStore();
  const { t, tp, category } = useT();
  const f = g.facts;
  const base = state.settings.baseCurrency;
  const money = (uah: number) => formatMoney(convert(uah, "UAH", base, state.settings.rates), base, { compact: true });
  const top = f.topCategoryId ? state.categories.find((c) => c.id === f.topCategoryId) : undefined;
  const rateDelta = f.savingsRate3 - f.savingsRatePrev3;

  const tiles: Array<{ icon: IconName; label: string; value: string; sub?: string; tone?: "good" | "bad" }> = [
    {
      icon: "calendar",
      label: t("profile.stats.since"),
      value: f.firstMonth ? formatMonth(f.firstMonth) : "—",
      sub: tp("profile.stats.monthsValue", f.monthsTracked),
    },
    {
      icon: "edit",
      label: t("profile.stats.logged"),
      value: formatNumber(f.manualTransactions, 0),
      sub: t("profile.stats.loggedMonth", { n: f.manualThisMonth }),
    },
    {
      icon: "flame",
      label: t("profile.stats.weekStreak"),
      value: tp("profile.stats.weeksValue", f.weekStreak),
      sub: t("profile.stats.best", { value: tp("profile.stats.weeksValue", f.bestWeekStreak) }),
    },
    {
      icon: "sparkle",
      label: t("profile.stats.activeDays"),
      value: `${f.activeDays30}/30`,
      sub: t("profile.stats.activeDays.sub"),
    },
    {
      icon: "trend",
      label: t("profile.stats.streak"),
      value: tp("profile.stats.monthsValue", f.positiveStreak),
      sub: t("profile.stats.best", { value: tp("profile.stats.monthsValue", f.bestStreak) }),
    },
    {
      icon: "target",
      label: t("profile.stats.savingsRate"),
      value: formatPercent(f.savingsRate3),
      sub: t("profile.stats.before", { value: formatPercent(f.savingsRatePrev3) }),
      tone: rateDelta >= 0 ? "good" : "bad",
    },
    { icon: "arrowDown", label: t("profile.stats.avgIncome"), value: money(f.avgIncomeUAH), sub: t("profile.stats.sixMonths") },
    { icon: "spend", label: t("profile.stats.avgSpend"), value: money(f.avgExpenseUAH), sub: t("profile.stats.sixMonths") },
    {
      icon: "pie",
      label: t("profile.stats.topCategory"),
      value: top ? `${top.icon} ${category(top)}` : "—",
      sub: top ? t("profile.stats.topShare", { pct: formatPercent(f.topCategoryShare, 0) }) : undefined,
    },
    {
      icon: "device",
      label: t("profile.stats.subscriptions"),
      value: `${money(f.subscriptionsMonthlyUAH)}${t("common.perMonth")}`,
      sub: f.avgIncomeUAH > 0 ? t("profile.stats.ofIncome", { pct: formatPercent(f.subsShareOfIncome) }) : undefined,
    },
    {
      icon: "wallet",
      label: t("profile.stats.netWorth"),
      value: money(f.netWorthUAH),
      sub:
        f.netWorthChange6UAH !== null
          ? t("profile.stats.growth", {
              amount: formatMoney(convert(f.netWorthChange6UAH, "UAH", base, state.settings.rates), base, {
                compact: true,
                sign: true,
              }),
            })
          : t("profile.stats.growth.na"),
      tone: f.netWorthChange6UAH === null ? undefined : f.netWorthChange6UAH >= 0 ? "good" : "bad",
    },
    {
      icon: "banknote",
      label: t("profile.stats.passive"),
      value: `${money(f.passiveMonthlyUAH)}${t("common.perMonth")}`,
      sub: t("profile.stats.passive.sub"),
    },
  ];

  return (
    <GlassCard title={t("profile.stats.title")} subtitle={t("profile.stats.subtitle")} icon="chart" className="xl:col-span-2">
      <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
        {tiles.map((s) => (
          <div key={s.label} className="min-w-0 rounded-field bg-ghost px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-ink-3">
              <Icon name={s.icon} size={13} className="shrink-0" />
              <span className="truncate">{s.label}</span>
            </dt>
            <dd className="num-sm mt-1 truncate text-ink-1">{s.value}</dd>
            {s.sub && (
              <p
                className={`tnum mt-0.5 truncate text-[11px] ${
                  s.tone === "good" ? "text-income" : s.tone === "bad" ? "text-expense" : "text-ink-3"
                }`}
              >
                {s.sub}
              </p>
            )}
          </div>
        ))}
      </dl>
    </GlassCard>
  );
}

function SignInCard({ profile, onPassword }: { profile: Profile; onPassword: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const google = profile.providers.includes("google");
  const strength = passwordStrength(next);
  const mismatch = repeat.length > 0 && repeat !== next;
  const ready = strength.rules.length && next === repeat && (!profile.hasPassword || current.length > 0);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: t("profile.password.updated") });
        setCurrent("");
        setNext("");
        setRepeat("");
        setOpen(false);
        onPassword();
      } else {
        setMsg({ ok: false, text: body.error ?? t("profile.password.failed") });
      }
    } finally {
      setBusy(false);
    }
  };

  const methods: Array<{ id: string; icon: IconName; slot: number; title: string; status: string; on: boolean; action?: ReactNode }> = [
    {
      id: "password",
      icon: "lock",
      slot: 10,
      title: t("profile.signin.password"),
      status: profile.hasPassword ? t("profile.password.set") : t("profile.password.notSet"),
      on: profile.hasPassword,
    },
    {
      id: "google",
      icon: "globe",
      slot: 4,
      title: "Google",
      status: google ? t("profile.google.linked") : t("profile.google.notLinked"),
      on: google,
      action: !google ? (
        <Button variant="ghost" size="sm" onClick={() => void signIn("google", { redirectTo: "/profile" })}>
          {t("profile.google.link")}
        </Button>
      ) : undefined,
    },
  ];

  return (
    <GlassCard title={t("profile.signin")} subtitle={t("profile.signin.subtitle")} icon="shield">
      <div className="rounded-field bg-ghost px-3.5 py-3">
        <p className="caption">{t("profile.signin.as")}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-1">
          <span className="min-w-0 truncate">{profile.email ?? "—"}</span>
          {profile.emailVerified && (
            <Badge tone="income">
              <Icon name="check" size={11} strokeWidth={3} />
              {t("profile.verified")}
            </Badge>
          )}
        </p>
      </div>

      <ul className="mt-3 space-y-2">
        {methods.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-field border border-hairline px-3 py-2.5">
            <IconDisc colorSlot={m.slot} className="size-9 rounded-chip">
              <Icon name={m.icon} size={17} />
            </IconDisc>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-medium text-ink-1">{m.title}</span>
              <span className="caption">{m.status}</span>
            </span>
            {m.action ?? (
              <Badge tone={m.on ? "income" : "neutral"}>{m.on ? t("profile.signin.active") : t("profile.signin.off")}</Badge>
            )}
          </li>
        ))}
      </ul>

      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-income" : "text-expense"}`}>{msg.text}</p>}

      {open ? (
        <form
          className="mt-4 space-y-4 border-t border-hairline pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !busy) void submit();
          }}
        >
          {profile.hasPassword && (
            <Field label={t("profile.password.current")}>
              <PasswordField value={current} onChange={setCurrent} autoComplete="current-password" />
            </Field>
          )}
          <Field label={profile.hasPassword ? t("profile.password.new") : t("profile.password.setNew")}>
            <PasswordField value={next} onChange={setNext} meter autoComplete="new-password" />
          </Field>
          <Field label={t("profile.password.repeat")}>
            <PasswordField value={repeat} onChange={setRepeat} autoComplete="new-password" />
          </Field>
          {mismatch && <p className="text-sm text-expense">{t("profile.password.mismatch")}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !ready}>
              {busy ? t("common.saving") : profile.hasPassword ? t("profile.password.change") : t("profile.password.setButton")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setCurrent("");
                setNext("");
                setRepeat("");
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4">
          <Button
            variant="ghost"
            onClick={() => {
              setMsg(null);
              setOpen(true);
            }}
          >
            <Icon name="lock" size={15} />
            {profile.hasPassword ? t("profile.password.change") : t("profile.password.setButton")}
          </Button>
          <Button variant="danger" onClick={() => void signOut({ redirectTo: "/login" })}>
            <Icon name="logout" size={15} />
            {t("nav.signOut")}
          </Button>
        </div>
      )}
    </GlassCard>
  );
}

function DetailsCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const { t } = useT();
  const stored = {
    name: profile.name ?? "",
    image: profile.image ?? "",
    about: profile.about ?? "",
    occupation: profile.occupation ?? "",
    location: profile.location ?? "",
    website: profile.website ?? "",
    birthday: profile.birthday ?? "",
  };
  const [fields, setFields] = useState(stored);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const google = profile.providers.includes("google");
  const dirty = (Object.keys(stored) as Array<keyof typeof stored>).some(
    (key) => fields[key].trim() !== stored[key],
  );
  const set = (key: keyof typeof stored, value: string) => setFields((f) => ({ ...f, [key]: value }));

  const reset = () => {
    setFields(stored);
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? t("profile.saveFailed"));
      else {
        onSaved(body);
        setFields({
          name: body.name ?? "",
          image: body.image ?? "",
          about: body.about ?? "",
          occupation: body.occupation ?? "",
          location: body.location ?? "",
          website: body.website ?? "",
          birthday: body.birthday ?? "",
        });
        setSaved(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard title={t("profile.details")} subtitle={t("profile.details.subtitle")} icon="user">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !busy) void save();
        }}
      >
        <div className="flex items-center gap-3 rounded-field bg-ghost px-3.5 py-3">
          <Avatar name={fields.name} email={profile.email ?? ""} image={fields.image.trim()} size={52} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-1">{fields.name.trim() || t("profile.unnamed")}</p>
            <p className="truncate text-xs text-ink-3">{profile.email}</p>
            <p className="caption">{t("profile.memberSince", { date: formatDate(profile.createdAt) })}</p>
          </div>
        </div>
        <Field label={t("profile.displayName")} hint={t("profile.displayName.hint")}>
          <TextInput
            value={fields.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Illia"
            maxLength={80}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("profile.occupation")} hint={t("profile.occupation.hint")}>
            <TextInput
              value={fields.occupation}
              onChange={(e) => set("occupation", e.target.value)}
              placeholder={t("profile.occupation.placeholder")}
              maxLength={80}
            />
          </Field>
          <Field label={t("profile.location")} hint={t("profile.location.hint")}>
            <TextInput
              value={fields.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder={t("profile.location.placeholder")}
              maxLength={80}
            />
          </Field>
          <Field label={t("profile.birthday")} hint={t("profile.birthday.hint")}>
            <TextInput type="date" value={fields.birthday} onChange={(e) => set("birthday", e.target.value)} />
          </Field>
          <Field label={t("profile.website")} hint={t("profile.website.hint")}>
            <TextInput
              value={fields.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          </Field>
        </div>
        <Field label={t("profile.avatar")} hint={google ? t("profile.avatar.google") : t("profile.avatar.hint")}>
          <TextInput
            value={fields.image}
            onChange={(e) => set("image", e.target.value)}
            placeholder="https://…"
            inputMode="url"
          />
        </Field>
        <Field label={t("profile.about")} hint={t("profile.about.hint")}>
          <TextArea
            value={fields.about}
            rows={3}
            maxLength={ABOUT_MAX}
            onChange={(e) => set("about", e.target.value)}
            placeholder={t("profile.about.placeholder")}
          />
        </Field>
        <p className="tnum -mt-2 text-right text-[11px] text-ink-3">
          {fields.about.length}/{ABOUT_MAX}
        </p>

        {error && <p className="text-sm text-expense">{error}</p>}
        {saved && !dirty && !error && (
          <p className="flex items-center gap-1.5 text-sm text-income">
            <Icon name="check" size={14} strokeWidth={2.6} />
            {t("profile.saved")}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !dirty}>
            {busy ? t("common.saving") : t("profile.saveChanges")}
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={reset}>
              {t("profile.discard")}
            </Button>
          )}
        </div>
      </form>
    </GlassCard>
  );
}

export function ProfilePage() {
  const { state } = useStore();
  const { t, tk } = useT();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (res.ok) setProfile(await res.json());
      else setError(t("profile.loadFailed"));
    })();
  }, [t]);

  const g = gamification(state);

  if (!profile) {
    return (
      <>
        <PageHeader title={t("nav.profile")} subtitle={t("profile.subtitle")} />
        <GlassCard>
          <p className="text-sm text-ink-2">{error ?? t("common.loading")}</p>
        </GlassCard>
      </>
    );
  }

  const unlocked = g.achievements.filter((a) => a.unlocked).length;

  return (
    <>
      <PageHeader title={t("nav.profile")} subtitle={t("profile.subtitle")} />

      <div className="stagger grid items-start gap-4 sm:gap-5 xl:grid-cols-2">
        <GlassCard className="glow xl:col-span-2">
          <div className="flex flex-wrap items-center gap-4">
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
            <div className="flex flex-wrap gap-2">
              <Chip icon="star" color="var(--series-14)">
                {t("profile.chip.level", { level: g.level.level, rank: tk(`level.rank.${g.level.rank}`, "") })}
              </Chip>
              <Chip icon="heart" color={healthTone(g.health.grade)}>
                {t("profile.chip.health", { score: g.health.score })}
              </Chip>
              <Chip icon="trophy" color="var(--series-8)">
                {t("profile.chip.achievements", { n: unlocked, total: g.achievements.length })}
              </Chip>
            </div>
          </div>
        </GlassCard>

        <LevelCard g={g} />
        <HealthCard g={g} />
        <AchievementsCard g={g} />
        <StatsCard g={g} />
        <DetailsCard profile={profile} onSaved={setProfile} />
        <SignInCard profile={profile} onPassword={() => setProfile((p) => (p ? { ...p, hasPassword: true } : p))} />
      </div>
    </>
  );
}
