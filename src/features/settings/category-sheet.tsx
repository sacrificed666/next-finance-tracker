"use client";

import { useRef, useState } from "react";
import {
  Button,
  Field,
  FieldSet,
  Icon,
  OptionChips,
  Select,
  Sheet,
  TextInput,
  useRadioGroupKeys,
} from "@/components/ui";
import { ICON_CHOICES } from "@/lib/constants";
import { useT } from "@/lib/i18n";
import { uid, useStore } from "@/lib/state/store";
import type { AppState, Category, CategoryKind } from "@/lib/types";

const COLOR_SLOTS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

interface CategoryForm {
  name: string;
  icon: string;
  colorSlot: number;
  parentId: string;
}

/** The chart slot this kind of category uses least, so a new one stands apart. */
function leastUsedSlot(state: AppState, kind: CategoryKind): number {
  const counts = new Array(9).fill(0);
  for (const c of state.categories) if (c.kind === kind) counts[c.colorSlot] = (counts[c.colorSlot] ?? 0) + 1;
  let best = 1;
  for (let slot = 2; slot <= 8; slot++) if (counts[slot] < counts[best]) best = slot;
  return best;
}

export function CategorySheet({
  editing,
  parentId,
  kind,
  onClose,
  onAddedChild,
}: {
  editing: Category | null;
  parentId: string;
  kind: CategoryKind;
  onClose: () => void;
  onAddedChild: (parentId: string) => void;
}) {
  const { state, update } = useStore();
  const { t, category } = useT();

  const [form, setForm] = useState<CategoryForm>(() => {
    if (editing) {
      return { name: category(editing), icon: editing.icon, colorSlot: editing.colorSlot, parentId: editing.parentId ?? "" };
    }
    const parent = state.categories.find((c) => c.id === parentId);
    return { name: "", icon: ICON_CHOICES[0], colorSlot: parent?.colorSlot ?? leastUsedSlot(state, kind), parentId };
  });

  const colorGroupRef = useRef<HTMLDivElement>(null);
  const onColorKeyDown = useRadioGroupKeys(colorGroupRef, COLOR_SLOTS, String(form.colorSlot) as (typeof COLOR_SLOTS)[number], (slot) =>
    setForm((f) => ({ ...f, colorSlot: Number(slot) })),
  );

  const editingHasChildren = editing !== null && state.categories.some((c) => c.parentId === editing.id);
  const problem = form.name.trim() === "" ? t("settings.categories.nameIt") : null;
  const parentChoices = state.categories.filter(
    (c) => c.kind === (editing?.kind ?? kind) && !c.parentId && c.id !== editing?.id,
  );

  const submit = () => {
    const name = form.name.trim();
    if (!name) return;
    const nextParent = form.parentId && !editingHasChildren ? form.parentId : undefined;
    if (editing) {
      update((s) => ({
        ...s,
        categories: s.categories.map((c) => {
          if (c.id !== editing.id) return c;
          // Keep the stored default name while it still reads the same, so it keeps translating.
          const unchangedName = name === category(c) ? c.name : name;
          const next: Category = { id: c.id, name: unchangedName, icon: form.icon, colorSlot: form.colorSlot, kind: c.kind };
          return nextParent ? { ...next, parentId: nextParent } : next;
        }),
      }));
    } else {
      const base: Category = { id: uid(), name, icon: form.icon, colorSlot: form.colorSlot, kind };
      const cat = nextParent ? { ...base, parentId: nextParent } : base;
      update((s) => ({ ...s, categories: [...s.categories, cat] }));
      if (nextParent) onAddedChild(nextParent);
    }
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      onSubmit={submit}
      problem={problem}
      title={editing ? t("settings.categories.edit") : t("settings.categories.new")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={problem !== null}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <Field label={t("common.name")}>
        <TextInput
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t("settings.categories.namePlaceholder")}
        />
      </Field>
      <Field
        label={t("settings.categories.parent")}
        hint={editingHasChildren ? t("settings.categories.parentLocked") : t("settings.categories.parent.hint")}
      >
        <Select
          value={editingHasChildren ? "" : form.parentId}
          disabled={editingHasChildren}
          onChange={(e) => {
            const parent = state.categories.find((c) => c.id === e.target.value);
            setForm({ ...form, parentId: e.target.value, colorSlot: parent?.colorSlot ?? form.colorSlot });
          }}
        >
          <option value="">{t("settings.categories.topLevel")}</option>
          {parentChoices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {category(p)}
            </option>
          ))}
        </Select>
      </Field>
      <FieldSet label={t("common.icon")}>
        <OptionChips
          label={t("common.icon")}
          options={ICON_CHOICES.map((icon) => ({ value: icon, label: icon }))}
          value={form.icon}
          onChange={(icon) => setForm({ ...form, icon })}
        />
      </FieldSet>
      <FieldSet label={t("common.color")} hint={t("settings.categories.color.hint")}>
        <div
          ref={colorGroupRef}
          onKeyDown={onColorKeyDown}
          role="radiogroup"
          aria-label={t("common.color")}
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(2.25rem, 1fr))" }}
        >
          {COLOR_SLOTS.map(Number).map((slot) => {
            const active = form.colorSlot === slot;
            return (
              <button
                key={slot}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                aria-label={t("settings.categories.colorN", { n: slot })}
                onClick={() => setForm({ ...form, colorSlot: slot })}
                className={`flex size-9 items-center justify-center justify-self-center rounded-full text-white outline-none transition-[transform,box-shadow] duration-150 focus-visible:ring-4 focus-visible:ring-accent-soft active:scale-95 ${
                  active ? "ring-2 ring-ink-1 ring-offset-2 ring-offset-(--card-strong)" : "hover:scale-110"
                }`}
                style={{ backgroundColor: `var(--series-${slot})` }}
              >
                {active && <Icon name="check" size={14} strokeWidth={3.2} />}
              </button>
            );
          })}
        </div>
      </FieldSet>
    </Sheet>
  );
}
