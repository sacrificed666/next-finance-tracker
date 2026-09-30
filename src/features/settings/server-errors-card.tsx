"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { formatDateShort, formatTime } from "@/lib/date";
import { useT } from "@/lib/i18n";

interface ServerError {
  at: string;
  route: string;
  message: string;
}

export function ServerErrorsCard() {
  const { t, tp } = useT();
  const [data, setData] = useState<{ errors: ServerError[]; total: number } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/errors", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => alive && setData(body))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!data || data.total === 0) return null;

  const clear = async () => {
    const res = await fetch("/api/errors", { method: "DELETE" }).catch(() => null);
    if (res?.ok) setData({ errors: [], total: 0 });
  };

  return (
    <Card
      title={t("errors.title")}
      subtitle={tp("errors.subtitle", data.total)}
      icon="warning"
      action={
        <Button variant="ghost" size="sm" onClick={() => void clear()}>
          {t("errors.clear")}
        </Button>
      }
    >
      <p className="caption mb-2">{t("errors.hint")}</p>
      <ul className="rows">
        {data.errors.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className="row-tap block w-full px-2.5 py-2 text-left">
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-mono text-xs text-ink-1">{e.route}</span>
                <span className="tnum shrink-0 text-xs text-ink-3">
                  {formatDateShort(e.at.slice(0, 10))}, {formatTime(e.at)}
                </span>
              </span>
              <span className={`mt-0.5 block text-xs text-ink-2 ${open === i ? "break-words" : "truncate"}`}>{e.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
