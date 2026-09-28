"use client";

import { useState } from "react";
import { Button, Card, Field, Icon, TextArea, TextInput } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { Profile } from "./shared";

const ABOUT_MAX = 500;

export function DetailsCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
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
    <Card title={t("profile.details")} subtitle={t("profile.details.subtitle")} icon="user">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !busy) void save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label={t("profile.displayName")} hint={t("profile.displayName.hint")}>
            <TextInput
              value={fields.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Illia"
              maxLength={80}
            />
          </Field>
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
          <Field label={t("profile.avatar")} hint={google ? t("profile.avatar.google") : t("profile.avatar.hint")}>
            <TextInput
              value={fields.image}
              onChange={(e) => set("image", e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          </Field>
        </div>
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
    </Card>
  );
}
