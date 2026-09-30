"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Icon, IconDisc, type IconName } from "@/components/ui";
import { formatDateShort, formatTime, pad, todayISO } from "@/lib/date";
import { useT } from "@/lib/i18n";

interface SignIn {
  id: string;
  at: string;
  method: "password" | "google" | "passkey";
  device: string;
  ip: string;
}

const METHOD_ICON: Record<SignIn["method"], IconName> = { password: "lock", google: "globe", passkey: "key" };

export function SignInsCard() {
  const { t } = useT();
  const [data, setData] = useState<{ current: string | null; entries: SignIn[] } | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/profile/sign-ins", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => alive && setData(body))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!data || data.entries.length === 0) return null;
  const today = todayISO();
  const when = (iso: string) => {
    const at = new Date(iso);
    const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
    return day === today ? formatTime(iso) : `${formatDateShort(day)}, ${formatTime(iso)}`;
  };

  return (
    <Card title={t("profile.signins.title")} subtitle={t("profile.signins.subtitle")} icon="monitor">
      <ul className="rows">
        {data.entries.map((e) => (
          <li key={e.id} className="flex items-center gap-2.5 px-2.5 py-2">
            <IconDisc colorSlot={5} className="size-8 rounded-chip">
              <Icon name={METHOD_ICON[e.method]} size={15} />
            </IconDisc>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink-1">{e.device || t("profile.signins.unknown")}</span>
              <span className="caption block truncate">
                {[t(`profile.signins.method.${e.method}`), e.ip].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="tnum text-xs text-ink-2">{when(e.at)}</span>
              {e.id === data.current && <Badge tone="income">{t("profile.signins.thisDevice")}</Badge>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
