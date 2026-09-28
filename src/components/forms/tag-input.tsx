"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";

const MAX_TAGS = 8;

/**
 * Free labels as chips: type and press Enter or a comma to add, Backspace on
 * an empty field to take the last one back. Tags already used elsewhere are
 * offered underneath.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  removeLabel,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder: string;
  removeLabel: (tag: string) => string;
}) {
  const [draft, setDraft] = useState("");
  const has = (tag: string) => value.some((v) => v.toLocaleLowerCase() === tag.toLocaleLowerCase());

  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#/, "").slice(0, 24);
    setDraft("");
    if (!tag || has(tag) || value.length >= MAX_TAGS) return;
    onChange([...value, tag]);
  };
  const offered = suggestions.filter((s) => !has(s)).slice(0, 6);

  return (
    <div>
      <div className="glass-el flex min-h-10 flex-wrap items-center gap-1.5 rounded-field border border-hairline px-2 py-1.5 focus-within:border-accent/60">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-xs font-semibold text-accent">
            #{tag}
            <button
              type="button"
              aria-label={removeLabel(tag)}
              onClick={() => onChange(value.filter((v) => v !== tag))}
              className="icon-btn size-5 text-accent"
            >
              <Icon name="close" size={11} strokeWidth={2.6} />
            </button>
          </span>
        ))}
        {value.length < MAX_TAGS && (
          <input
            value={draft}
            onChange={(e) => {
              const text = e.target.value;
              if (text.endsWith(",")) add(text.slice(0, -1));
              else setDraft(text);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
                onChange(value.slice(0, -1));
              }
            }}
            onBlur={() => add(draft)}
            placeholder={value.length === 0 ? placeholder : undefined}
            className="min-w-24 flex-1 bg-transparent px-1 text-sm text-ink-1 outline-none placeholder:text-ink-3"
          />
        )}
      </div>
      {offered.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {offered.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-full bg-ghost px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-fill-hover hover:text-ink-1"
            >
              +#{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
