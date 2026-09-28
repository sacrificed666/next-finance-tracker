"use client";

import { useT } from "@/lib/i18n";
import { categoryTree } from "@/lib/finance/categories";
import type { PickerGroup, PickerItem } from "./option-picker";
import type { Category, CategoryKind, SavingsAccount } from "@/lib/types";

export function useCategoryGroups(
  categories: Category[],
  kinds: CategoryKind[],
  lead: PickerItem[] = [],
): PickerGroup[] {
  const { t, category } = useT();
  const groups: PickerGroup[] = lead.length > 0 ? [{ items: lead }] : [];
  for (const kind of kinds) {
    const items: PickerItem[] = [];
    for (const { parent, children } of categoryTree(categories, kind)) {
      items.push({
        value: parent.id,
        label: category(parent),
        icon: parent.icon,
        hint: children.length > 0 ? t("category.general") : undefined,
      });
      for (const child of children) {
        items.push({ value: child.id, label: category(child), icon: child.icon, child: true });
      }
    }
    if (items.length > 0) {
      groups.push({ label: kinds.length > 1 ? t(`tx.type.${kind}`) : undefined, items });
    }
  }
  return groups;
}

export function useAccountGroups(
  accounts: SavingsAccount[],
  lead: PickerItem[] = [],
): PickerGroup[] {
  const { t } = useT();
  const groups: PickerGroup[] = lead.length > 0 ? [{ items: lead }] : [];
  if (accounts.length > 0) {
    groups.push({
      items: accounts.map((a) => ({
        value: a.id,
        label: a.name,
        icon: a.icon,
        hint: `${t(`accountKind.${a.kind}`)} · ${a.currency}`,
      })),
    });
  }
  return groups;
}
