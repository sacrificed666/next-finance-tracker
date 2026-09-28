"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { Icon, SUBJECT_SLOT, type IconName } from "./icon";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Card({
  title,
  subtitle,
  icon,
  action,
  children,
  footer,
  glow = false,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  icon?: IconName;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Accent glow for the one card per page that carries the headline number. */
  glow?: boolean;
  className?: string;
}) {
  return (
    <section className={`glass ${glow ? "glow" : ""} flex min-w-0 flex-col rounded-card p-3.5 sm:p-4 ${className}`}>
      {(title || action || icon) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && (
              <IconDisc
                colorSlot={SUBJECT_SLOT[icon]}
                className={`size-8 rounded-chip ${SUBJECT_SLOT[icon] ? "" : "text-ink-2"}`}
              >
                <Icon name={icon} size={15} />
              </IconDisc>
            )}
            {(title || subtitle) && (
              <div className="min-w-0">
                {title && <h2 className="card-title truncate">{title}</h2>}
                {subtitle && <p className="caption mt-0.5 truncate">{subtitle}</p>}
              </div>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
      {footer && (
        <div className="caption mt-auto border-t border-hairline pt-3">{footer}</div>
      )}
    </section>
  );
}

export function IconDisc({
  colorSlot,
  className = "",
  children,
}: {
  colorSlot?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center ${colorSlot ? "" : "glass-el"} ${className}`}
      style={
        colorSlot
          ? {
              background: `color-mix(in oklab, var(--series-${colorSlot}) 14%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--series-${colorSlot}) 30%, transparent), inset 0 1px 0 color-mix(in oklab, var(--rim-light) 50%, transparent)`,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span
        aria-hidden
        className="glass-well mb-1 flex size-11 items-center justify-center rounded-full text-ink-3 [&_svg]:size-5"
      >
        {icon}
      </span>
      <p className="font-medium text-ink-1">{title}</p>
      {hint && <p className="max-w-sm text-sm leading-relaxed text-ink-2">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function CardLink({ href, label }: { href: string; label?: string }) {
  const { t } = useT();
  return (
    <Link
      href={href}
      className="glass-el group inline-flex min-h-8 items-center gap-1 rounded-full border border-hairline px-2.5 text-xs font-semibold text-ink-2 transition-[background-color,border-color,box-shadow,color] duration-150 hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] hover:bg-fill-hover hover:text-ink-1"
    >
      {label ?? t("dash.all")}
      <Icon name="arrowRight" size={13} strokeWidth={2.4} className="transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}
