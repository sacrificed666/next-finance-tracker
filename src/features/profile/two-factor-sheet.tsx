"use client";

import { useEffect, useState } from "react";
import { Button, Field, Sheet, TextInput } from "@/components/ui";
import { downloadFile } from "@/lib/download";
import { useT } from "@/lib/i18n";
import { QrCode } from "./qr-code";

type Step = { kind: "loading" } | { kind: "scan"; secret: string; uri: string } | { kind: "codes"; codes: string[] } | { kind: "off" };

export function TwoFactorSheet({
  mode,
  email,
  onDone,
  onClose,
}: {
  mode: "enable" | "disable";
  email: string | null;
  onDone: (enabled: boolean, recoveryLeft: number) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [step, setStep] = useState<Step>(mode === "enable" ? { kind: "loading" } : { kind: "off" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (mode !== "enable") return;
    let alive = true;
    void fetch("/api/profile/two-factor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "begin" }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { secret: string; uri: string }) => alive && setStep({ kind: "scan", ...body }))
      .catch(() => alive && setProblem(t("profile.twofa.failed")));
    return () => {
      alive = false;
    };
  }, [mode, t]);

  const send = async (action: "confirm" | "disable") => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/profile/two-factor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code }),
      });
      const body = (await res.json().catch(() => ({}))) as { recovery?: string[]; error?: string };
      if (!res.ok) {
        setProblem(body.error === "wait" ? t("profile.twofa.wait") : t("profile.twofa.wrong"));
        return;
      }
      if (action === "confirm" && body.recovery) {
        setStep({ kind: "codes", codes: body.recovery });
        onDone(true, body.recovery.length);
      } else {
        onDone(false, 0);
        onClose();
      }
    } catch {
      setProblem(t("profile.twofa.failed"));
    } finally {
      setBusy(false);
    }
  };

  const codesText = (codes: string[]) => [t("profile.twofa.recoveryTitle"), email ?? "", "", ...codes, ""].join("\n");
  const copy = async (codes: string[]) => {
    await navigator.clipboard.writeText(codesText(codes)).catch(() => {});
    setCopied(true);
  };
  const download = (codes: string[]) => downloadFile("finances-recovery-codes.txt", codesText(codes), "text/plain;charset=utf-8");

  const typed = code.replace(/\s/g, "");
  const title = mode === "disable" ? t("profile.twofa.disableTitle") : step.kind === "codes" ? t("profile.twofa.recoveryTitle") : t("profile.twofa.setupTitle");

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      onSubmit={step.kind === "scan" ? () => void send("confirm") : step.kind === "off" ? () => void send("disable") : undefined}
      problem={problem}
      footer={
        step.kind === "codes" ? (
          <Button onClick={onClose}>{t("profile.twofa.saved")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              variant={mode === "disable" ? "danger" : "primary"}
              disabled={busy || step.kind === "loading" || (step.kind === "scan" ? !/^\d{6}$/.test(typed) : typed.length < 6)}
            >
              {mode === "disable" ? t("profile.twofa.disable") : t("profile.twofa.enable")}
            </Button>
          </>
        )
      }
    >
      {step.kind === "scan" && (
        <>
          <p className="text-sm text-ink-2">{t("profile.twofa.scan")}</p>
          <div className="flex justify-center">
            <QrCode value={step.uri} label={t("profile.twofa.qr")} />
          </div>
          <Field label={t("profile.twofa.key")}>
            <p className="tnum select-all break-all rounded-field bg-ghost px-3 py-2 font-mono text-sm tracking-wider text-ink-1">
              {step.secret.replace(/(.{4})/g, "$1 ").trim()}
            </p>
          </Field>
          <Field label={t("profile.twofa.code")}>
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123 456"
              maxLength={7}
            />
          </Field>
        </>
      )}
      {step.kind === "loading" && <p className="py-8 text-center text-sm text-ink-3">{t("common.loading")}</p>}
      {step.kind === "codes" && (
        <>
          <p className="text-sm text-ink-2">{t("profile.twofa.recoveryHint")}</p>
          <ul className="grid grid-cols-2 gap-2">
            {step.codes.map((c) => (
              <li key={c} className="tnum rounded-field bg-ghost px-3 py-2 text-center font-mono text-sm text-ink-1">
                {c}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => void copy(step.codes)}>
              {copied ? t("profile.twofa.copied") : t("profile.twofa.copy")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => download(step.codes)}>
              {t("profile.twofa.download")}
            </Button>
          </div>
        </>
      )}
      {step.kind === "off" && (
        <>
          <p className="text-sm text-ink-2">{t("profile.twofa.disableHint")}</p>
          <Field label={t("profile.twofa.codeOrRecovery")}>
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              placeholder="123 456"
              maxLength={11}
            />
          </Field>
        </>
      )}
    </Sheet>
  );
}
