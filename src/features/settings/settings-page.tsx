"use client";

import { PageBody, Split } from "@/components/layout/page";
import { Card, PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { CategoriesCard } from "./categories-card";
import { DataCard } from "./data-card";
import { GeneralCard } from "./general-card";
import { ImportCard } from "./import-card";
import { NotificationsCard } from "./notifications-card";
import { RatesCard } from "./rates-card";
import { RulesCard } from "./rules-card";
import { ServerErrorsCard } from "./server-errors-card";
import { SettingsHero } from "./settings-hero";

function AboutCard() {
  const { t } = useT();
  return (
    <Card title={t("settings.about.title")} subtitle={t("settings.about.subtitle")} icon="info">
      <p className="text-sm leading-relaxed text-ink-2">{t("settings.about.body")}</p>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <PageBody>
        <SettingsHero />
        <Split
          sideFirst
          main={
            <>
              <CategoriesCard />
              <ImportCard />
              <RulesCard />
              <DataCard />
            </>
          }
          side={
            <>
              <GeneralCard />
              <NotificationsCard />
              <ServerErrorsCard />
              <RatesCard />
              <AboutCard />
            </>
          }
        />
      </PageBody>
    </>
  );
}
