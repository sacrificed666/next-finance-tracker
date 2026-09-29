"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, IconDisc, SUBJECT_SLOT, type IconName } from "@/components/ui";

export interface HeroStat {
  label: string;
  icon?: IconName;
  value: string;
  tone?: "income" | "expense";
  delta?: { text: string; good: boolean };
  hint?: string;
  href?: string;
}

const TONE = { income: "text-income", expense: "text-expense" } as const;

function StatCell({ stat, className }: { stat: HeroStat; className: string }) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs text-ink-3">
        {stat.icon && <Icon name={stat.icon} size={13} className="shrink-0" />}
        <span className="min-w-0 truncate">{stat.label}</span>
        {stat.href && (
          <Icon
            name="arrowRight"
            size={12}
            strokeWidth={2.4}
            className="ml-auto shrink-0 transition-transform group-hover:translate-x-0.5"
          />
        )}
      </p>
      <p className={`num-md mt-1 text-balance break-words ${stat.tone ? TONE[stat.tone] : "text-ink-1"}`}>{stat.value}</p>
      {stat.delta && (
        <p className={`mt-1 text-xs font-medium ${stat.delta.good ? "text-income" : "text-expense"}`}>{stat.delta.text}</p>
      )}
      {stat.hint && <p className={`text-xs text-ink-3 ${stat.delta ? "mt-0.5" : "mt-1"}`}>{stat.hint}</p>}
    </>
  );
  const shell = "min-w-0 rounded-field bg-ghost px-3 py-2.5";
  return (
    <li className={className}>
      {stat.href ? (
        <Link href={stat.href} className={`group block h-full transition-colors hover:bg-fill-hover ${shell}`}>
          {body}
        </Link>
      ) : (
        <div className={`h-full ${shell}`}>{body}</div>
      )}
    </li>
  );
}

export function PageHero({
  label,
  icon,
  action,
  value,
  sub,
  delta,
  note,
  lead,
  aside,
  stats = [],
}: {
  label?: string;
  icon?: IconName;
  action?: ReactNode;
  value?: string;
  sub?: string;
  delta?: { text: string; good: boolean };
  note?: string;
  lead?: ReactNode;
  aside?: ReactNode;
  stats?: HeroStat[];
}) {
  const threeUp = stats.length === 3;
  return (
    <section className="glass glow flex min-w-0 flex-col rounded-card p-4 sm:p-5">
      {(label || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {label && (
            <div className="flex min-w-0 items-center gap-2.5">
              {icon && (
                <IconDisc colorSlot={SUBJECT_SLOT[icon]} className={`size-8 rounded-chip ${SUBJECT_SLOT[icon] ? "" : "text-ink-2"}`}>
                  <Icon name={icon} size={15} />
                </IconDisc>
              )}
              <h2 className="card-title truncate">{label}</h2>
            </div>
          )}
          {action}
        </div>
      )}

      <div className={`grid items-center gap-x-10 gap-y-5 ${aside ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
        <div className="min-w-0">
          {lead ?? (
            <>
              <p className="hero-number num-hero">{value}</p>
              {sub && <p className="tnum mt-1.5 text-[15px] text-ink-2">{sub}</p>}
              {delta && (
                <p className={`tnum mt-2.5 text-sm font-semibold ${delta.good ? "text-income" : "text-expense"}`}>
                  {delta.text}
                </p>
              )}
              {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}
            </>
          )}
        </div>
        {aside && <div className="min-w-0">{aside}</div>}
      </div>

      {stats.length > 0 && (
        <ul className={`mt-4 grid grid-cols-2 gap-2.5 border-t border-hairline pt-4 ${threeUp ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
          {stats.map((stat, i) => (
            <StatCell
              key={stat.label}
              stat={stat}
              className={threeUp && i === 2 ? "col-span-2 md:col-span-1" : ""}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
