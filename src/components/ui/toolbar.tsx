"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import type { SortDirection } from "@/lib/state/listing";
import { controlBase, controlSize, Select } from "./form";
import { Icon } from "./icon";

export type { SortDirection } from "@/lib/state/listing";

export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mb-2.5 flex min-w-0 flex-wrap items-center gap-2 ${className}`}>{children}</div>
  );
}

export function ToolbarSlot({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 flex-[1_1_10rem] ${className}`}>{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div className={`relative min-w-0 flex-[999_1_14rem] ${className}`}>
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
        <Icon name="search" size={15} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t("filter.search")}
        aria-label={placeholder ?? t("filter.search")}
        className={`${controlBase} ${controlSize.sm} pl-9 pr-9`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("filter.clearSearch")}
          className="icon-btn absolute right-1.5 top-1/2 size-7 -translate-y-1/2 text-ink-3"
        >
          <Icon name="close" size={13} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

export function SortSelect<T extends string>({
  value,
  onChange,
  options,
  direction,
  onDirectionChange,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  direction: SortDirection;
  onDirectionChange: (direction: SortDirection) => void;
}) {
  const { t } = useT();
  return (
    <div className="flex min-w-0 flex-[1_1_11rem] items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <Select
          size="sm"
          value={value}
          aria-label={t("filter.sortBy")}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <button
        type="button"
        onClick={() => onDirectionChange(direction === "asc" ? "desc" : "asc")}
        aria-label={direction === "asc" ? t("filter.ascending") : t("filter.descending")}
        title={direction === "asc" ? t("filter.ascending") : t("filter.descending")}
        className="icon-btn glass-el size-9 shrink-0 rounded-full border border-hairline text-ink-2"
      >
        <Icon
          name="sort"
          size={16}
          className={`transition-transform duration-200 ${direction === "asc" ? "-scale-y-100" : ""}`}
        />
      </button>
    </div>
  );
}
