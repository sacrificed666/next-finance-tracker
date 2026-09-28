"use client";

import { useState } from "react";
import {
  AddButton,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Icon,
  SearchInput,
  SegmentedControl,
  type IconName,
} from "@/components/ui";
import { mergeDefaultCategories } from "@/lib/constants";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { Category, CategoryKind } from "@/lib/types";
import { CategorySheet } from "./category-sheet";

function IconAction({
  label,
  reason,
  onClick,
  icon,
  danger,
}: {
  label: string;
  reason?: string | null;
  onClick: () => void;
  icon: IconName;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={reason ? `${label} — ${reason}` : label}
      title={reason ?? label}
      onClick={onClick}
      disabled={reason != null}
      className={`icon-btn size-9 shrink-0 text-ink-3 disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? "icon-btn-danger" : ""
      }`}
    >
      <Icon name={icon} size={17} strokeWidth={1.9} />
    </button>
  );
}

type SheetTarget = { editing: Category | null; parentId: string };

/** The category tree: search, collapse, add subcategories, and delete only what nothing uses. */
export function CategoriesCard() {
  const { state, update } = useStore();
  const { t, tp, category } = useT();

  const [kindTab, setKindTab] = useState<CategoryKind>("expense");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [defaultsNote, setDefaultsNote] = useState<string | null>(null);

  const expenseCount = state.categories.filter((c) => c.kind === "expense").length;
  const kindOptions: Array<{ value: CategoryKind; label: string }> = [
    { value: "expense", label: `${t("settings.categories.expenses")} (${expenseCount})` },
    { value: "income", label: `${t("settings.categories.income")} (${state.categories.length - expenseCount})` },
  ];

  const parentsOfKind = state.categories.filter((c) => c.kind === kindTab && !c.parentId);
  const childrenOf = (id: string) => state.categories.filter((c) => c.parentId === id && c.kind === kindTab);

  const categoryUse = new Map<string, { records: number; rules: number; budgets: number }>();
  const bump = (id: string, key: "records" | "rules" | "budgets") => {
    if (!id) return;
    const entry = categoryUse.get(id) ?? { records: 0, rules: 0, budgets: 0 };
    entry[key]++;
    categoryUse.set(id, entry);
  };
  for (const tx of state.transactions) bump(tx.categoryId, "records");
  for (const r of state.recurring) bump(r.categoryId, "rules");
  for (const b of state.budgets) bump(b.categoryId, "budgets");

  const blockedReason = (id: string): string | null => {
    const kids = state.categories.filter((c) => c.parentId === id).length;
    if (kids > 0) return tp("settings.categories.hasChildren", kids);
    const use = categoryUse.get(id);
    if (!use) return null;
    const parts = [
      use.records && tp("settings.categories.records", use.records),
      use.rules && tp("settings.categories.rules", use.rules),
      use.budgets && t("settings.categories.aBudget"),
    ].filter(Boolean);
    return t("settings.categories.inUse", { parts: parts.join(", ") });
  };

  const expand = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirmDelete = () => {
    if (!deleteId) return;
    update((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== deleteId) }), t("settings.categories.deleted"));
    setDeleteId(null);
  };

  const restoreDefaults = () => {
    const merged = mergeDefaultCategories(state.categories);
    if (merged.added === 0 && merged.linked === 0) {
      setDefaultsNote(t("settings.categories.defaultsUpToDate"));
      return;
    }
    update(
      (s) => ({ ...s, categories: mergeDefaultCategories(s.categories).categories }),
      t("settings.categories.defaultsRestored"),
    );
    setDefaultsNote(t("settings.categories.defaultsSummary", { added: merged.added, linked: merged.linked }));
  };

  const q = query.trim().toLowerCase();
  const matches = (c: Category) => q === "" || category(c).toLowerCase().includes(q);
  const nested = parentsOfKind.some((p) => childrenOf(p.id).length > 0);

  const renderRow = (cat: Category, child: boolean) => {
    const blocked = blockedReason(cat.id);
    const records = categoryUse.get(cat.id)?.records ?? 0;
    const kids = child ? [] : childrenOf(cat.id);
    const isCollapsed = collapsed.has(cat.id);
    return (
      <li key={cat.id} className="flex items-center gap-1 px-1">
        {!nested ? null : !child && kids.length > 0 ? (
          <button
            type="button"
            aria-label={isCollapsed ? t("common.expand") : t("common.collapse")}
            aria-expanded={!isCollapsed}
            onClick={() => toggle(cat.id)}
            className="icon-btn size-7 shrink-0 text-ink-3"
          >
            <Icon
              name="chevronRight"
              size={14}
              strokeWidth={2.4}
              className={`transition-transform duration-150 ${isCollapsed ? "" : "rotate-90"}`}
            />
          </button>
        ) : (
          <span aria-hidden className="size-7 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => setSheet({ editing: cat, parentId: cat.parentId ?? "" })}
          className={`row-tap flex min-w-0 flex-1 items-center gap-3 py-2 pr-2 text-left ${child ? "pl-6" : "pl-2"}`}
        >
          <span
            aria-hidden
            className={`flex shrink-0 items-center justify-center rounded-full ${child ? "size-8 text-base" : "size-9 text-lg"}`}
            style={{ backgroundColor: `color-mix(in oklab, var(--series-${cat.colorSlot}) 20%, transparent)` }}
          >
            {cat.icon}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-medium text-ink-1">{category(cat)}</span>
            {kids.length > 0 && <Badge>{kids.length}</Badge>}
          </span>
          <span
            className="tnum w-10 shrink-0 text-right text-xs text-ink-3"
            title={records > 0 ? tp("settings.categories.records", records) : undefined}
          >
            {records > 0 ? records : ""}
          </span>
        </button>
        {child ? (
          <span aria-hidden className="size-9 shrink-0" />
        ) : (
          <IconAction
            label={t("settings.categories.addSub", { name: category(cat) })}
            icon="plus"
            onClick={() => setSheet({ editing: null, parentId: cat.id })}
          />
        )}
        <IconAction
          label={t("settings.categories.deleteNamed", { name: category(cat) })}
          reason={blocked}
          icon="trash"
          danger
          onClick={() => setDeleteId(cat.id)}
        />
      </li>
    );
  };

  const tree = parentsOfKind.flatMap((parent) => {
    const kids = childrenOf(parent.id);
    const kidMatches = kids.filter(matches);
    if (!matches(parent) && kidMatches.length === 0) return [];
    const showKids = q !== "" ? kidMatches : collapsed.has(parent.id) ? [] : kids;
    return [renderRow(parent, false), ...showKids.map((k) => renderRow(k, true))];
  });

  const deleting = state.categories.find((c) => c.id === deleteId);

  return (
    <Card
      title={t("settings.categories.title")}
      subtitle={t("settings.categories.subtitle", { count: state.categories.length })}
      icon="tag"
      action={<AddButton onClick={() => setSheet({ editing: null, parentId: "" })} label={t("common.add")} />}
    >
      <SegmentedControl label={t("settings.categories.kind")} options={kindOptions} value={kindTab} onChange={setKindTab} />
      <div className="mt-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t("settings.categories.search")} />
      </div>
      <ul className="rows mt-3">
        {tree.length === 0 && (
          <li className="py-6 text-center text-sm text-ink-2">{q ? t("filter.noMatches") : t("settings.categories.none")}</li>
        )}
        {tree}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={restoreDefaults}>
          <Icon name="layers" size={14} />
          {t("settings.categories.restoreDefaults")}
        </Button>
        {defaultsNote && <span className="text-xs text-ink-3">{defaultsNote}</span>}
      </div>

      {sheet && (
        <CategorySheet
          key={sheet.editing?.id ?? `new:${sheet.parentId}`}
          editing={sheet.editing}
          parentId={sheet.parentId}
          kind={kindTab}
          onClose={() => setSheet(null)}
          onAddedChild={expand}
        />
      )}
      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title={t("settings.categories.deleteTitle")}
        message={t("settings.categories.deleteMessage", { name: deleting ? category(deleting) : "" })}
      />
    </Card>
  );
}
