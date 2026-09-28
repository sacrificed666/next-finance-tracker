"use client";

import { useEffect, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "income" | "expense" | "warning" | "accent";
}) {
  const tones = {
    neutral: "bg-ghost-2 text-ink-2",
    income: "bg-income/12 text-income",
    expense: "bg-expense/12 text-expense",
    warning: "bg-warning/15 text-warning",
    accent: "bg-accent-soft text-accent",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

type CalloutTone = "info" | "warning" | "success" | "danger" | "tip";

const CALLOUT_STYLE: Record<CalloutTone, { icon: IconName; className: string }> = {
  info: { icon: "info", className: "border-[color-mix(in_oklab,var(--series-10)_35%,transparent)] bg-[color-mix(in_oklab,var(--series-10)_9%,transparent)] text-ink-1" },
  tip: { icon: "sparkle", className: "border-[color-mix(in_oklab,var(--series-3)_35%,transparent)] bg-[color-mix(in_oklab,var(--series-3)_9%,transparent)] text-ink-1" },
  success: { icon: "check", className: "border-income/30 bg-income/8 text-ink-1" },
  warning: { icon: "warning", className: "border-warning/35 bg-warning/10 text-ink-1" },
  danger: { icon: "warning", className: "border-expense/30 bg-expense/8 text-ink-1" },
};

export function Callout({
  tone = "info",
  title,
  children,
  className = "",
}: {
  tone?: CalloutTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const style = CALLOUT_STYLE[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "note"}
      className={`flex gap-2.5 rounded-field border px-3 py-2.5 text-sm ${style.className} ${className}`}
    >
      <Icon name={style.icon} size={17} className="mt-0.5 opacity-80" />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
    </div>
  );
}

export function ProgressMeter({
  value,
  max,
  tone = "accent",
  label,
}: {
  value: number;
  max: number;
  tone?: "accent" | "budget";
  label?: string;
}) {
  const ratio = max > 0 ? value / max : 0;
  const clamped = Math.min(1, Math.max(0, ratio));
  const color =
    tone === "budget"
      ? ratio > 1
        ? "bg-expense"
        : ratio > 0.85
          ? "bg-warning"
          : "bg-accent"
      : "bg-accent";
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="glass-well block h-1.5 w-full overflow-hidden rounded-full"
    >
      <span
        className={`block h-full rounded-full ${color} transition-[width] duration-300`}
        style={{ width: `${clamped * 100}%` }}
      />
    </span>
  );
}

export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  timeoutMs = 9000,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss?: () => void;
  timeoutMs?: number;
}) {
  const { t } = useT();
  useEffect(() => {
    if (!onDismiss) return;
    const id = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(id);
  }, [message, onDismiss, timeoutMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-20 z-50 flex justify-center md:inset-x-0 md:bottom-6 md:pl-60"
    >
      <div className="glass-strong flex w-full max-w-sm items-center gap-2 rounded-full py-2 pl-4 pr-2 shadow-lg">
        <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{message}</span>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => {
            onAction();
            onDismiss?.();
          }}
        >
          {actionLabel}
        </Button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("common.dismiss")}
            className="icon-btn size-8 shrink-0 text-ink-3"
          >
            <Icon name="close" size={13} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}
