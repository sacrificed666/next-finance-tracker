"use client";

import { useEffect, useState } from "react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { Button, Icon, IconDisc, Sheet } from "@/components/ui";
import { formatDate } from "@/lib/date";
import { useT } from "@/lib/i18n";

interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function PasskeysSheet({ onCount, onClose }: { onCount: (count: number) => void; onClose: () => void }) {
  const { t } = useT();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && browserSupportsWebAuthn();

  useEffect(() => {
    let alive = true;
    void fetch("/api/passkeys", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { passkeys: [] }))
      .then((body: { passkeys: Passkey[] }) => alive && setPasskeys(body.passkeys))
      .catch(() => alive && setPasskeys([]));
    return () => {
      alive = false;
    };
  }, []);

  const apply = (list: Passkey[]) => {
    setPasskeys(list);
    onCount(list.length);
  };

  const add = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const options = await fetch("/api/passkeys/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "register" }),
      }).then((res) => (res.ok ? res.json() : Promise.reject(new Error("options"))));
      const response = await startRegistration({ optionsJSON: options });
      const res = await fetch("/api/passkeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!res.ok) throw new Error("verify");
      apply(((await res.json()) as { passkeys: Passkey[] }).passkeys);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      setProblem(
        name === "NotAllowedError" ? t("profile.passkeys.cancelled") : name === "InvalidStateError" ? t("profile.passkeys.exists") : t("profile.passkeys.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setProblem(null);
    const res = await fetch("/api/passkeys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    if (res?.ok) apply(((await res.json()) as { passkeys: Passkey[] }).passkeys);
    else setProblem(t("profile.passkeys.failed"));
    setRemoving(null);
    setBusy(false);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("profile.passkeys.title")}
      problem={problem}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("dash.layout.done")}
          </Button>
          {supported && (
            <Button onClick={() => void add()} disabled={busy}>
              <Icon name="plus" size={15} />
              {t("profile.passkeys.add")}
            </Button>
          )}
        </>
      }
    >
      <p className="text-sm text-ink-2">{t("profile.passkeys.hint")}</p>
      {!supported && <p className="rounded-field bg-ghost px-3 py-2.5 text-sm text-ink-2">{t("profile.passkeys.unsupported")}</p>}
      {passkeys === null ? (
        <p className="py-4 text-center text-sm text-ink-3">{t("common.loading")}</p>
      ) : passkeys.length === 0 ? (
        <p className="caption">{t("profile.passkeys.empty")}</p>
      ) : (
        <ul className="rows">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 px-2.5 py-2">
              <IconDisc colorSlot={5} className="size-9 rounded-chip">
                <Icon name="key" size={17} />
              </IconDisc>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-1">{p.name || t("profile.signins.unknown")}</span>
                <span className="caption block truncate">
                  {t("profile.passkeys.added", { date: formatDate(p.createdAt.slice(0, 10)) })} ·{" "}
                  {p.lastUsedAt ? t("profile.passkeys.used", { date: formatDate(p.lastUsedAt.slice(0, 10)) }) : t("profile.passkeys.never")}
                </span>
              </span>
              {removing === p.id ? (
                <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove(p.id)}>
                  {t("profile.passkeys.removeConfirm")}
                </Button>
              ) : (
                <button
                  type="button"
                  aria-label={t("profile.passkeys.remove", { name: p.name })}
                  onClick={() => setRemoving(p.id)}
                  className="icon-btn size-8 bg-ghost text-ink-3"
                >
                  <Icon name="trash" size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
