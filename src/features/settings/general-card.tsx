"use client";

import { LanguagePicker } from "@/components/forms/language-picker";
import { Card, FieldSet, SegmentedControl } from "@/components/ui";
import { CURRENCIES } from "@/lib/constants";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { Currency, Locale, ThemePref } from "@/lib/types";

export function GeneralCard() {
  const { state, update } = useStore();
  const { settings } = state;
  const { t } = useT();

  const themeOptions: Array<{ value: ThemePref; label: string }> = [
    { value: "system", label: t("theme.system.short") },
    { value: "light", label: t("theme.light.short") },
    { value: "dark", label: t("theme.dark.short") },
  ];

  return (
    <Card title={t("settings.general.title")} subtitle={t("settings.general.subtitle")} icon="gear">
      <div className="min-w-0 space-y-4">
        <FieldSet label={t("settings.language")} hint={t("settings.language.hint")}>
          <LanguagePicker
            value={settings.locale}
            onChange={(locale: Locale) => update((s) => ({ ...s, settings: { ...s.settings, locale } }))}
          />
        </FieldSet>
        <FieldSet label={t("settings.baseCurrency")} hint={t("settings.baseCurrency.hint")}>
          <SegmentedControl
            label={t("settings.baseCurrency")}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={settings.baseCurrency}
            onChange={(v: Currency) => update((s) => ({ ...s, settings: { ...s.settings, baseCurrency: v } }))}
          />
        </FieldSet>
        <FieldSet label={t("theme.label")}>
          <SegmentedControl
            label={t("theme.label")}
            options={themeOptions}
            value={settings.theme}
            onChange={(v: ThemePref) => update((s) => ({ ...s, settings: { ...s.settings, theme: v } }))}
          />
        </FieldSet>
      </div>
    </Card>
  );
}
