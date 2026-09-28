"use client";

import { useState, type ReactNode } from "react";
import { signIn, signOut } from "next-auth/react";
import { PasswordField } from "@/components/forms/password-field";
import { Badge, Button, Card, Field, Icon, IconDisc, type IconName } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { passwordStrength } from "@/lib/password-meter";
import type { Profile } from "./shared";

export function SignInCard({ profile, onPassword }: { profile: Profile; onPassword: () => void }) {
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
    <Card title={t("profile.signin")} subtitle={t("profile.signin.subtitle")} icon="shield">
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
    </Card>
  );
}
