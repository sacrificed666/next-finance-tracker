"use client";

import { useEffect, useState } from "react";
import { Button, Card, Switch } from "@/components/ui";
import { useT } from "@/lib/i18n";

type Status = "loading" | "unsupported" | "ios" | "dev" | "server" | "denied" | "off" | "on";

const bytes = (base64url: string) => {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((v, i) => v === b[i]);
};

async function registration(): Promise<ServiceWorkerRegistration | null> {
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

async function send(method: "PUT" | "DELETE", body: unknown): Promise<boolean> {
  const res = await fetch("/api/push", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return Boolean(res?.ok);
}

export function NotificationsCard() {
  const { t } = useT();
  const [status, setStatus] = useState<Status>("loading");
  const [hour, setHour] = useState(9);
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const settle = (next: Status) => alive && setStatus(next);
    void (async () => {
      const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!capable) {
        const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) && !matchMedia("(display-mode: standalone)").matches;
        return settle(apple ? "ios" : "unsupported");
      }
      if (process.env.NODE_ENV !== "production") return settle("dev");
      const res = await fetch("/api/push", { cache: "no-store" }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { key: string | null; hour: number } | null;
      if (!body?.key) return settle("server");
      const serverKey = bytes(body.key);
      if (alive) {
        setKey(serverKey);
        setHour(body.hour);
      }
      if (Notification.permission === "denied") return settle("denied");
      const current = await (await registration())?.pushManager.getSubscription();
      if (current && sameKey(current.options.applicationServerKey, serverKey)) {
        await send("PUT", { subscription: current.toJSON() });
        return settle("on");
      }
      if (current) await current.unsubscribe().catch(() => false);
      settle("off");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const turnOn = async () => {
    if (!key) return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus(permission === "denied" ? "denied" : "off");
      return;
    }
    const reg = await registration();
    const subscription = await reg?.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource })
      .catch(() => null);
    if (subscription && (await send("PUT", { subscription: subscription.toJSON() }))) {
      setStatus("on");
      return;
    }
    await subscription?.unsubscribe().catch(() => false);
    setNote({ ok: false, text: t("settings.push.failed") });
  };

  const turnOff = async () => {
    const subscription = await (await registration())?.pushManager.getSubscription();
    if (subscription) {
      await send("DELETE", { endpoint: subscription.endpoint });
      await subscription.unsubscribe().catch(() => false);
    }
    setStatus("off");
  };

  const toggle = async (on: boolean) => {
    setBusy(true);
    setNote(null);
    try {
      await (on ? turnOn() : turnOff());
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setNote(null);
    const subscription = await (await registration())?.pushManager.getSubscription();
    const res = subscription
      ? await fetch("/api/push/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => null)
      : null;
    setNote(
      res?.ok
        ? { ok: true, text: t("settings.push.testSent") }
        : { ok: false, text: res?.status === 429 ? t("settings.push.wait") : t("settings.push.failed") },
    );
    setBusy(false);
  };

  const blocked: Partial<Record<Status, string>> = {
    unsupported: t("settings.push.unsupported"),
    ios: t("settings.push.ios"),
    dev: t("settings.push.dev"),
    server: t("settings.push.server"),
    denied: t("settings.push.denied"),
  };
  const reason = blocked[status];

  return (
    <Card title={t("settings.push.title")} subtitle={t("settings.push.subtitle")} icon="bell">
      <div className="space-y-3">
        <p className="text-sm text-ink-2">{t("settings.push.hint", { hour: String(hour) })}</p>
        {reason ? (
          <p className="rounded-field bg-ghost px-3 py-2.5 text-sm text-ink-2">{reason}</p>
        ) : (
          <div className="flex items-start gap-3 border-t border-hairline pt-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-1">{t("settings.push.switch")}</p>
              <p className="caption">
                {status === "loading" ? t("common.loading") : status === "on" ? t("settings.push.on") : t("settings.push.off")}
              </p>
            </div>
            <Switch checked={status === "on"} onChange={(on) => !busy && status !== "loading" && void toggle(on)} label={t("settings.push.switch")} />
          </div>
        )}
        {status === "on" && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void test()}>
            {t("settings.push.test")}
          </Button>
        )}
        {note && <p className={`text-sm ${note.ok ? "text-income" : "text-expense"}`}>{note.text}</p>}
      </div>
    </Card>
  );
}
