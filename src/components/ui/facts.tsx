import type { ReactNode } from "react";

export function Facts({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <dl className={`grid grid-cols-2 gap-1.5 ${className}`}>{children}</dl>;
}

export function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-field bg-ghost px-3 py-2 ${wide ? "col-span-2" : ""}`}>
      <dt className="truncate text-[11px] text-ink-3">{label}</dt>
      <dd className="tnum mt-0.5 text-[13px] font-semibold text-ink-1">{children}</dd>
    </div>
  );
}
