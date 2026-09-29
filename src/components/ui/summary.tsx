import type { ReactNode } from "react";

const TONE = { income: "text-income", expense: "text-expense" } as const;

export function SummaryPanel({
  value,
  tone,
  meta,
  children,
  className = "",
}: {
  value: ReactNode;
  tone?: "income" | "expense";
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-field bg-ghost p-3 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className={`num-sm whitespace-nowrap ${tone ? TONE[tone] : "text-ink-1"}`}>{value}</p>
        {meta && <p className="caption text-right">{meta}</p>}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function Unit({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium text-ink-3">{children}</span>;
}
