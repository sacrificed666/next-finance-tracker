"use client";

import Link from "next/link";
import { todayISO } from "@/lib/date";
import { netWorth } from "@/lib/finance/finmath";
import { formatMoney } from "@/lib/finance/money";
import { useStore, useSyncStatus, type SyncStatus } from "@/lib/state/store";
import { useT } from "@/lib/i18n";

export function syncTitle(sync: SyncStatus, t: ReturnType<typeof useT>["t"]): string {
  return sync === "conflict"
    ? t("sync.conflictTitle")
    : sync === "error"
      ? t("sync.errorTitle")
      : t("sync.savingTitle");
}

export function SyncDot({ sync }: { sync: SyncStatus }) {
  const { t } = useT();
  if (sync === "idle") return null;
  const bad = sync === "error" || sync === "conflict";
  const label =
    sync === "conflict" ? t("sync.outOfDate") : sync === "error" ? t("sync.notSaved") : t("sync.saving");
  const title = syncTitle(sync, t);
  return (
    <span
      title={title}
      className={`hidden items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-xs font-semibold sm:inline-flex ${
        bad ? "bg-expense/12 text-expense" : "bg-ghost text-ink-2"
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${bad ? "bg-expense" : "animate-pulse bg-income"}`}
      />
      {label}
    </span>
  );
}

export function Brand() {
  const { state, hydrated } = useStore();
  const { sync } = useSyncStatus();
  const { t } = useT();
  const worth = netWorth(state, todayISO());
  const bad = sync === "error" || sync === "conflict";
  return (
    <Link
      href="/"
      className="row-tap flex shrink-0 items-center gap-3 p-2"
      aria-label={t("nav.dashboard")}
    >
      <span className="relative shrink-0">
        <span
          aria-hidden
          className="btn-gradient flex size-9 items-center justify-center rounded-chip text-base font-black shadow-md"
        >
          ₴
        </span>
        {sync !== "idle" && (
          <span
            title={syncTitle(sync, t)}
            className={`absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-(--card) ${
              bad ? "bg-expense" : "animate-pulse bg-income"
            }`}
          />
        )}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-bold tracking-tight text-ink-1">{t("app.name")}</span>
        {hydrated && (
          <span className="tnum block text-xs text-ink-3">
            {formatMoney(worth.total, state.settings.baseCurrency, { compact: true })}
          </span>
        )}
      </span>
    </Link>
  );
}
