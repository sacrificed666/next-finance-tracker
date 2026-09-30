"use client";

import { useEffect, useState } from "react";
import { PageBody, Split } from "@/components/layout/page";
import { Card, PageHeader } from "@/components/ui";
import { gamification } from "@/lib/finance/achievements";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import { AchievementsCard } from "./achievements-card";
import { DetailsCard } from "./details-card";
import { HealthCard } from "./health-card";
import { ProfileHero } from "./profile-hero";
import type { Profile } from "./shared";
import { SignInCard } from "./sign-in-card";
import { SignInsCard } from "./sign-ins-card";
import { StatsCard } from "./stats-card";

export function ProfilePage() {
  const { state } = useStore();
  const { t } = useT();
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
        <Card>
          <p className="text-sm text-ink-2">{error ?? t("common.loading")}</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("nav.profile")} subtitle={t("profile.subtitle")} />

      <PageBody>
        <ProfileHero profile={profile} g={g} />
        <Split
          main={
            <>
              <AchievementsCard g={g} />
              <StatsCard g={g} />
            </>
          }
          side={
            <>
              <HealthCard g={g} />
              <SignInCard profile={profile} onChange={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))} />
              <SignInsCard />
            </>
          }
        />
        <DetailsCard profile={profile} onSaved={setProfile} />
      </PageBody>
    </>
  );
}
