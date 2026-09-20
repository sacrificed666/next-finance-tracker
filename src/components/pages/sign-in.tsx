"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Field, GlassCard, TextInput } from "@/components/ui";
import { PasswordField } from "@/components/password-field";
import { LanguagePicker as LocaleMenu } from "@/components/language-picker";
import { Icon } from "@/components/icons";
import { useT } from "@/lib/i18n";
import { LOCALE_COOKIE } from "@/lib/i18n/locales";
import { passwordStrength } from "@/lib/password-meter";
import type { Locale } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function LanguagePicker() {
  const { locale } = useT();
  const router = useRouter();
  return (
    <LocaleMenu
      compact
      value={locale}
      onChange={(next: Locale) => {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    />
  );
}

export function SignInPage({
  mode,
  googleEnabled,
}: {
  mode: "login" | "register";
  googleEnabled: boolean;
}) {
  const { t } = useT();
  const register = mode === "register";
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailOk = EMAIL_RE.test(email.trim());
  const passwordOk = register ? passwordStrength(password).rules.length : password.length > 0;
  const emailProblem = touched && email.trim() !== "" && !emailOk ? t("auth.error.email") : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (register) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? t("auth.error.create"));
          return;
        }
      }
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError(register ? t("auth.error.createdButFailed") : t("auth.error.wrong"));
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError(t("auth.error.network"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-14">
      <div className="fixed right-4 top-4 z-40">
        <LanguagePicker />
      </div>

      <div className="mb-6 flex items-center gap-3">
        <span
          aria-hidden
          className="btn-gradient flex size-12 shrink-0 items-center justify-center rounded-chip text-xl font-black shadow-md"
        >
          ₴
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-ink-1">{t("app.name")}</h1>
          <p className="truncate text-sm text-ink-3">
            {register ? t("auth.register.subtitle") : t("auth.login.subtitle")}
          </p>
        </div>
      </div>

      <GlassCard className="glow">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (emailOk && passwordOk && !busy) void submit();
          }}
        >
          {register && (
            <Field label={t("common.name")} hint={t("common.optional")}>
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Illia"
                autoComplete="name"
                maxLength={80}
              />
            </Field>
          )}
          <Field label={t("auth.email")} hint={emailProblem ?? undefined}>
            <TextInput
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
            />
          </Field>
          <Field label={t("auth.password")} hint={register ? t("auth.password.hint") : undefined}>
            <PasswordField
              value={password}
              onChange={setPassword}
              required
              meter={register}
              autoComplete={register ? "new-password" : "current-password"}
              placeholder="••••••••••"
            />
          </Field>

          {error && (
            <p className="flex items-start gap-2 rounded-field bg-expense/12 px-3 py-2 text-sm text-expense">
              <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t("auth.working") : register ? t("auth.register.submit") : t("auth.login.submit")}
          </Button>
        </form>

        {googleEnabled && (
          <>
            <div className="my-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-hairline" />
              <span className="caption">{t("auth.or")}</span>
              <span className="h-px flex-1 bg-hairline" />
            </div>
            <Button
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => void signIn("google", { redirectTo: next })}
            >
              <Icon name="globe" size={16} />
              {t("auth.google")}
            </Button>
          </>
        )}
      </GlassCard>

      <p className="mt-5 text-center text-sm text-ink-2">
        {register ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
        <Link
          href={register ? "/login" : "/register"}
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          {register ? t("auth.login.submit") : t("auth.createOne")}
        </Link>
      </p>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-3">
        <Icon name="lock" size={13} />
        {t("auth.privacy")}
      </p>
    </main>
  );
}
