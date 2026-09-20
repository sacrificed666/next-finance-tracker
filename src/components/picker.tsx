"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { useT } from "@/lib/i18n";

export interface PickerItem {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  child?: boolean;
}

export interface PickerGroup {
  label?: string;
  items: PickerItem[];
}

interface PickerProps {
  value: string;
  onChange: (value: string) => void;
  groups: PickerGroup[];
  label: string;
  placeholder?: string;
  size?: "sm" | "md";
  searchable?: boolean;
  className?: string;
}

const SEARCH_THRESHOLD = 8;

function matches(item: PickerItem, query: string): boolean {
  if (query === "") return true;
  const needle = query.toLocaleLowerCase();
  return (
    item.label.toLocaleLowerCase().includes(needle) ||
    (item.hint ?? "").toLocaleLowerCase().includes(needle)
  );
}

export function OptionPicker({
  value,
  onChange,
  groups,
  label,
  placeholder,
  size = "md",
  searchable,
  className = "",
}: PickerProps) {
  const { t } = useT();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const all = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, items: g.items.filter((item) => matches(item, query)) }))
        .filter((g) => g.items.length > 0),
    [groups, query],
  );
  const flat = useMemo(() => visibleGroups.flatMap((g) => g.items), [visibleGroups]);
  const selected = all.find((item) => item.value === value);
  const showSearch = searchable ?? all.length > SEARCH_THRESHOLD;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const focusTarget = showSearch ? searchRef.current : listRef.current;
    focusTarget?.focus();
  }, [open, showSearch]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openMenu = () => {
    setActive(Math.max(0, all.findIndex((item) => item.value === value)));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const choose = (next: string) => {
    onChange(next);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + flat.length) % flat.length);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, flat.length - 1));
      return;
    }
    if (e.key === "Enter" || (e.key === " " && !showSearch)) {
      e.preventDefault();
      const item = flat[active];
      if (item) choose(item.value);
    }
  };

  const sizing = size === "sm" ? "min-h-10 px-3 text-base sm:text-sm" : "min-h-11 px-3.5 text-base sm:text-[15px]";

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}${selected ? `: ${selected.label}` : ""}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openMenu();
          }
        }}
        className={`glass-el flex w-full items-center gap-2 rounded-field border border-hairline text-left text-ink-1 outline-none transition-[border-color,box-shadow] duration-150 hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] focus-visible:ring-4 focus-visible:ring-accent-soft ${sizing}`}
      >
        {selected?.icon !== undefined && <span className="shrink-0 text-base leading-none">{selected.icon}</span>}
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-ink-3"}`}>
          {selected?.label ?? placeholder ?? label}
        </span>
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ghost-2 text-ink-2"
        >
          <Icon
            name="chevronDown"
            size={16}
            strokeWidth={2.4}
            className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="glass-strong absolute z-50 mt-1.5 flex max-h-[min(24rem,60vh)] w-full min-w-56 flex-col overflow-hidden rounded-field border border-hairline p-1 shadow-lg">
          {showSearch && (
            <div className="relative p-1">
              <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">
                <Icon name="search" size={14} />
              </span>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={t("filter.search")}
                aria-label={t("filter.search")}
                className="glass-el w-full rounded-[10px] border border-hairline py-2 pl-8 pr-2.5 text-sm text-ink-1 outline-none placeholder:text-ink-3 focus:border-[color-mix(in_oklab,var(--accent)_45%,var(--hairline))]"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            onKeyDown={onKeyDown}
            className="min-h-0 flex-1 overflow-y-auto outline-none"
          >
            {flat.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-ink-3">{t("filter.noMatches")}</li>
            )}
            {visibleGroups.map((group, gi) => (
              <li key={group.label ?? gi}>
                {group.label && (
                  <p className="label px-2.5 pb-1 pt-2.5 text-ink-3">{group.label}</p>
                )}
                <ul role="group" aria-label={group.label}>
                  {group.items.map((item) => {
                    const index = flat.indexOf(item);
                    const isActive = index === active;
                    const isSelected = item.value === value;
                    return (
                      <li
                        key={item.value}
                        role="option"
                        aria-selected={isSelected}
                        data-active={isActive}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(item.value)}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm ${
                          item.child ? "pl-7" : ""
                        } ${isActive ? "bg-fill-hover" : ""} ${
                          isSelected ? "font-semibold text-ink-1" : "text-ink-2"
                        }`}
                      >
                        {item.icon !== undefined && (
                          <span aria-hidden className="shrink-0 text-base leading-none">
                            {item.icon}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.hint && <span className="shrink-0 text-xs text-ink-3">{item.hint}</span>}
                        {isSelected && (
                          <Icon name="check" size={14} strokeWidth={2.6} className="shrink-0 text-accent" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
