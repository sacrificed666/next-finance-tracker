"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons";
import { useT } from "@/lib/i18n";
import { flagUrl, LOCALES, localeInfo } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/types";

export function Flag({ country, size = 20 }: { country: string; size?: number }) {
  return (
    <img
      src={flagUrl(country)}
      alt=""
      width={Math.round(size * 1.333)}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_var(--hairline)]"
      style={{ width: Math.round(size * 1.333), height: size }}
    />
  );
}

export function LanguagePicker({
  value,
  onChange,
  compact = false,
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
  compact?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, LOCALES.findIndex((l) => l.code === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = localeInfo(value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    listRef.current?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (locale: Locale) => {
    setOpen(false);
    buttonRef.current?.focus();
    if (locale !== value) onChange(locale);
  };

  const openList = () => {
    setActive(Math.max(0, LOCALES.findIndex((l) => l.code === value)));
    setOpen(true);
  };

  const onListKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % LOCALES.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + LOCALES.length) % LOCALES.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(LOCALES.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(LOCALES[active].code);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${compact ? "" : "w-full"}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${t("settings.language")}: ${current.native}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
        }}
        className={`glass-el flex items-center gap-2.5 rounded-field border border-hairline text-left text-ink-1 outline-none transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] focus-visible:ring-4 focus-visible:ring-accent-soft ${
          compact ? "min-h-10 px-3 text-sm" : "min-h-11 w-full px-3.5 text-base sm:text-[15px]"
        }`}
      >
        <Flag country={current.country} size={compact ? 14 : 16} />
        <span className="min-w-0 flex-1 truncate">{current.native}</span>
        <Icon
          name="chevronDown"
          size={15}
          strokeWidth={2.4}
          className={`text-ink-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={t("settings.language")}
          aria-activedescendant={`${listId}-${LOCALES[active].code}`}
          onKeyDown={onListKey}
          className="glass-strong absolute right-0 z-50 mt-1.5 max-h-80 min-w-full overflow-y-auto rounded-field border border-hairline p-1 shadow-lg outline-none"
          style={{ minWidth: 220 }}
        >
          {LOCALES.map((l, i) => {
            const selected = l.code === value;
            return (
              <li
                key={l.code}
                id={`${listId}-${l.code}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(l.code)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm ${
                  i === active ? "bg-fill-hover" : ""
                } ${selected ? "font-semibold text-ink-1" : "text-ink-2"}`}
              >
                <Flag country={l.country} size={15} />
                <span className="min-w-0 flex-1 truncate">{l.native}</span>
                {l.code !== value && <span className="text-xs text-ink-3">{l.english}</span>}
                {selected && <Icon name="check" size={14} strokeWidth={2.6} className="text-accent" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
