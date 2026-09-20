"use client";

import { useRef, useState } from "react";
import {
  AddButton,
  Badge,
  Button,
  ConfirmDialog,
  Field,
  FieldSet,
  GlassCard,
  OptionChips,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Select,
  Sheet,
  TextInput,
  useRadioGroupKeys,
} from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { LanguagePicker } from "@/components/language-picker";
import {
  CURRENCIES,
  CURRENCY_SYMBOL,
  DEFAULT_STATE,
  FOREIGN_CURRENCIES,
  ICON_CHOICES,
  mergeDefaultCategories,
} from "@/lib/constants";
import { formatDateTime, formatTime, todayISO } from "@/lib/date";
import { exportBackup, parseBackup } from "@/lib/backup";
import { parseAmount } from "@/lib/money";
import { uid, useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { AppState, Category, CategoryKind, Currency, Locale, ThemePref } from "@/lib/types";

interface CategoryForm {
  name: string;
  icon: string;
  colorSlot: number;
  parentId: string;
}

function emptyCategoryForm(nextSlot: number, parentId = ""): CategoryForm {
  return { name: "", icon: ICON_CHOICES[0], colorSlot: nextSlot, parentId };
}

export function SettingsPage() {
  const { state, update, replace } = useStore();
  const { settings } = state;
  const { t, tp, category } = useT();

  const [kindTab, setKindTab] = useState<CategoryKind>("expense");
  const [catQuery, setCatQuery] = useState("");
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catForm, setCatForm] = useState<CategoryForm>(() => emptyCategoryForm(1));
  const [catDeleteId, setCatDeleteId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [defaultsNote, setDefaultsNote] = useState<string | null>(null);

  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<AppState | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const themeOptions: Array<{ value: ThemePref; label: string }> = [
    { value: "system", label: t("theme.system.short") },
    { value: "light", label: t("theme.light.short") },
    { value: "dark", label: t("theme.dark.short") },
  ];

  const expenseCount = state.categories.filter((c) => c.kind === "expense").length;
  const kindOptions: Array<{ value: CategoryKind; label: string }> = [
    { value: "expense", label: `${t("settings.categories.expenses")} (${expenseCount})` },
    {
      value: "income",
      label: `${t("settings.categories.income")} (${state.categories.length - expenseCount})`,
    },
  ];

  const setRate = (currency: (typeof FOREIGN_CURRENCIES)[number], value: number) =>
    update((s) => ({
      ...s,
      settings: {
        ...s.settings,
        rates: { ...s.settings.rates, [currency]: value },
        ratesSource: "manual",
        ratesMeta: undefined,
        ratesUpdatedAt: new Date().toISOString(),
      },
    }));

  const setLocale = (locale: Locale) =>
    update((s) => ({ ...s, settings: { ...s.settings, locale } }));

  const leastUsedSlot = (kind: CategoryKind): number => {
    const counts = new Array(9).fill(0);
    for (const c of state.categories) if (c.kind === kind) counts[c.colorSlot] = (counts[c.colorSlot] ?? 0) + 1;
    let best = 1;
    for (let slot = 2; slot <= 8; slot++) if (counts[slot] < counts[best]) best = slot;
    return best;
  };

  const parentsOfKind = state.categories.filter((c) => c.kind === kindTab && !c.parentId);
  const childrenOf = (id: string) =>
    state.categories.filter((c) => c.parentId === id && c.kind === kindTab);

  const openAddCategory = (parentId = "") => {
    const parent = state.categories.find((c) => c.id === parentId);
    setEditingCatId(null);
    setCatForm(emptyCategoryForm(parent?.colorSlot ?? leastUsedSlot(kindTab), parentId));
    setCatSheetOpen(true);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCatId(cat.id);
    setCatForm({
      name: category(cat),
      icon: cat.icon,
      colorSlot: cat.colorSlot,
      parentId: cat.parentId ?? "",
    });
    setCatSheetOpen(true);
  };

  const closeCatSheet = () => {
    setCatSheetOpen(false);
    setEditingCatId(null);
  };

  const editingHasChildren =
    editingCatId !== null && state.categories.some((c) => c.parentId === editingCatId);

  const catProblem = catForm.name.trim() === "" ? t("settings.categories.nameIt") : null;

  const submitCategory = () => {
    const name = catForm.name.trim();
    if (!name) return;
    const parentId = catForm.parentId && !editingHasChildren ? catForm.parentId : undefined;
    if (editingCatId) {
      update((s) => ({
        ...s,
        categories: s.categories.map((c) => {
          if (c.id !== editingCatId) return c;
          const unchangedName = name === category(c) ? c.name : name;
          const next: Category = {
            id: c.id,
            name: unchangedName,
            icon: catForm.icon,
            colorSlot: catForm.colorSlot,
            kind: c.kind,
          };
          return parentId ? { ...next, parentId } : next;
        }),
      }));
    } else {
      const base: Category = {
        id: uid(),
        name,
        icon: catForm.icon,
        colorSlot: catForm.colorSlot,
        kind: kindTab,
      };
      const cat = parentId ? { ...base, parentId } : base;
      update((s) => ({ ...s, categories: [...s.categories, cat] }));
      if (parentId) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
    }
    closeCatSheet();
  };

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

  const confirmDeleteCategory = () => {
    if (!catDeleteId) return;
    update(
      (s) => ({
        ...s,
        categories: s.categories.filter((c) => c.id !== catDeleteId),
      }),
      t("settings.categories.deleted"),
    );
    setCatDeleteId(null);
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
    setDefaultsNote(
      t("settings.categories.defaultsSummary", { added: merged.added, linked: merged.linked }),
    );
  };

  const deletingCat = state.categories.find((c) => c.id === catDeleteId);

  const colorGroupRef = useRef<HTMLDivElement>(null);
  const onColorKeyDown = useRadioGroupKeys(
    colorGroupRef,
    ["1", "2", "3", "4", "5", "6", "7", "8"],
    String(catForm.colorSlot),
    (slot) => setCatForm((f) => ({ ...f, colorSlot: Number(slot) })),
  );

  const exportData = () => {
    const blob = new Blob([exportBackup(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    setImportSummary(null);
    try {
      const text = await file.text();
      const parsed = parseBackup(text);
      setPendingImport(parsed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("settings.data.readFailed"));
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    const { transactions, categories, savings, investments } = pendingImport;
    replace(pendingImport, t("settings.data.replacedUndo"));
    setPendingImport(null);
    setImportSummary(
      t("settings.data.imported", {
        records: transactions.length,
        categories: categories.length,
        holdings: savings.length + investments.length,
      }),
    );
  };

  const confirmReset = () => {
    replace({ ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, locale: settings.locale } }, t("settings.data.resetUndo"));
    setResetOpen(false);
  };

  const meta = settings.ratesMeta;

  const q = catQuery.trim().toLowerCase();
  const matches = (c: Category) => q === "" || category(c).toLowerCase().includes(q);

  const nested = parentsOfKind.some((p) => childrenOf(p.id).length > 0);

  const renderRow = (cat: Category, child: boolean) => {
    const blocked = blockedReason(cat.id);
    const records = categoryUse.get(cat.id)?.records ?? 0;
    const kids = child ? [] : childrenOf(cat.id);
    const isCollapsed = collapsed.has(cat.id);
    return (
      <li key={cat.id} className="flex items-center gap-1">
        {!nested ? null : !child && kids.length > 0 ? (
          <button
            type="button"
            aria-label={isCollapsed ? t("common.expand") : t("common.collapse")}
            aria-expanded={!isCollapsed}
            onClick={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(cat.id)) next.delete(cat.id);
                else next.add(cat.id);
                return next;
              })
            }
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
          onClick={() => openEditCategory(cat)}
          className={`row-tap flex min-w-0 flex-1 items-center gap-3 py-2 pr-2 text-left ${child ? "pl-6" : "pl-2"}`}
        >
          <span
            aria-hidden
            className={`flex shrink-0 items-center justify-center rounded-full ${child ? "size-8 text-base" : "size-9 text-lg"}`}
            style={{
              backgroundColor: `color-mix(in oklab, var(--series-${cat.colorSlot}) 20%, transparent)`,
            }}
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
            onClick={() => openAddCategory(cat.id)}
          />
        )}
        <IconAction
          label={t("settings.categories.deleteNamed", { name: category(cat) })}
          reason={blocked}
          icon="trash"
          danger
          onClick={() => setCatDeleteId(cat.id)}
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

  const parentChoices = state.categories.filter(
    (c) =>
      c.kind === (editingCatId ? state.categories.find((x) => x.id === editingCatId)?.kind : kindTab) &&
      !c.parentId &&
      c.id !== editingCatId,
  );

  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <div className="stagger min-w-0 xl:columns-2 xl:gap-5 *:mb-4 sm:*:mb-5 *:break-inside-avoid">
        <GlassCard title={t("settings.general.title")} subtitle={t("settings.general.subtitle")} icon="gear">
          <div className="min-w-0 space-y-4">
            <FieldSet label={t("settings.language")} hint={t("settings.language.hint")}>
              <LanguagePicker value={settings.locale} onChange={setLocale} />
            </FieldSet>
            <FieldSet label={t("settings.baseCurrency")} hint={t("settings.baseCurrency.hint")}>
              <SegmentedControl
                label={t("settings.baseCurrency")}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                value={settings.baseCurrency}
                onChange={(v: Currency) =>
                  update((s) => ({ ...s, settings: { ...s.settings, baseCurrency: v } }))
                }
              />
            </FieldSet>
            <FieldSet label={t("theme.label")}>
              <SegmentedControl
                label={t("theme.label")}
                options={themeOptions}
                value={settings.theme}
                onChange={(v: ThemePref) =>
                  update((s) => ({ ...s, settings: { ...s.settings, theme: v } }))
                }
              />
            </FieldSet>
          </div>
        </GlassCard>

        <GlassCard title={t("settings.rates.title")} subtitle={t("settings.rates.subtitle")} icon="exchange">
          <div className="grid gap-4 sm:grid-cols-3">
            {FOREIGN_CURRENCIES.map((c) => (
              <NumericSetting
                key={c}
                label={`${c} → UAH`}
                hint={
                  meta?.[c]
                    ? t("settings.rates.buySell", { buy: meta[c].buy, sell: meta[c].sell })
                    : t("settings.rates.per", { symbol: CURRENCY_SYMBOL[c] })
                }
                value={settings.rates[c]}
                isValid={(v) => v > 0}
                onCommit={(v) => setRate(c, v)}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-xs text-ink-3">
            <Icon name="refresh" size={14} className="shrink-0" />
            <span>{ratesOrigin(settings, t)}</span>
            <span aria-hidden>·</span>
            <span>{t("prices.nextUpdate", { time: nextHourLabel() })}</span>
          </div>
          <p className="mt-2 text-xs text-ink-3">{t("settings.rates.explain")}</p>
        </GlassCard>

        <GlassCard
          title={t("settings.categories.title")}
          subtitle={t("settings.categories.subtitle", { count: state.categories.length })}
          icon="tag"
          action={<AddButton onClick={() => openAddCategory()} label={t("common.add")} />}
        >
          <SegmentedControl
            label={t("settings.categories.kind")}
            options={kindOptions}
            value={kindTab}
            onChange={setKindTab}
          />
          <div className="mt-3">
            <SearchInput
              value={catQuery}
              onChange={setCatQuery}
              placeholder={t("settings.categories.search")}
            />
          </div>
          <ul className="mt-3 space-y-0.5">
            {tree.length === 0 && (
              <li className="py-6 text-center text-sm text-ink-2">
                {q ? t("filter.noMatches") : t("settings.categories.none")}
              </li>
            )}
            {tree}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
            <Button variant="ghost" size="sm" onClick={restoreDefaults}>
              <Icon name="layers" size={14} />
              {t("settings.categories.restoreDefaults")}
            </Button>
            {defaultsNote && <span className="text-xs text-ink-3">{defaultsNote}</span>}
          </div>
        </GlassCard>

        <GlassCard title={t("settings.data.title")} subtitle={t("settings.data.subtitle")} icon="database">
          <div className="divide-y divide-hairline">
            <DataRow
              title={t("settings.data.export")}
              caption={t("settings.data.export.caption")}
              action={<Button variant="ghost" onClick={exportData}>{t("settings.data.download")}</Button>}
            />
            <DataRow
              title={t("settings.data.import")}
              caption={t("settings.data.import.caption")}
              action={
                <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
                  {t("settings.data.chooseFile")}
                </Button>
              }
            />
          </div>
          {importError && <p className="mt-3 text-sm text-expense">{importError}</p>}
          {importSummary && <p className="mt-3 text-sm text-income">{importSummary}</p>}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-field border border-expense/20 bg-expense/8 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-expense">{t("settings.data.reset")}</p>
              <p className="text-xs text-ink-3">{t("settings.data.reset.caption")}</p>
            </div>
            <Button variant="danger" onClick={() => setResetOpen(true)}>
              {t("settings.data.resetButton")}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onFileChosen}
          />
        </GlassCard>

        <GlassCard title={t("settings.about.title")} subtitle={t("settings.about.subtitle")} icon="info">
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <AtAGlance label={t("settings.about.records")} value={state.transactions.length} />
            <AtAGlance label={t("settings.about.accounts")} value={state.savings.length} />
            <AtAGlance label={t("settings.about.investments")} value={state.investments.length} />
          </div>
          <p className="text-sm leading-relaxed text-ink-2">{t("settings.about.body")}</p>
        </GlassCard>
      </div>

      <Sheet
        open={catSheetOpen}
        onClose={closeCatSheet}
        onSubmit={submitCategory}
        problem={catProblem}
        title={editingCatId ? t("settings.categories.edit") : t("settings.categories.new")}
        footer={
          <>
            <Button variant="ghost" onClick={closeCatSheet}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={catProblem !== null}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <Field label={t("common.name")}>
          <TextInput
            value={catForm.name}
            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
            placeholder={t("settings.categories.namePlaceholder")}
          />
        </Field>
        <Field
          label={t("settings.categories.parent")}
          hint={
            editingHasChildren
              ? t("settings.categories.parentLocked")
              : t("settings.categories.parent.hint")
          }
        >
          <Select
            value={editingHasChildren ? "" : catForm.parentId}
            disabled={editingHasChildren}
            onChange={(e) => {
              const parent = state.categories.find((c) => c.id === e.target.value);
              setCatForm({
                ...catForm,
                parentId: e.target.value,
                colorSlot: parent?.colorSlot ?? catForm.colorSlot,
              });
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
            value={catForm.icon}
            onChange={(icon) => setCatForm({ ...catForm, icon })}
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
            {Array.from({ length: 8 }, (_, i) => i + 1).map((slot) => {
              const active = catForm.colorSlot === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  aria-label={t("settings.categories.colorN", { n: slot })}
                  onClick={() => setCatForm({ ...catForm, colorSlot: slot })}
                  className={`flex size-9 items-center justify-center justify-self-center rounded-full text-white outline-none transition-[transform,box-shadow] duration-150 focus-visible:ring-4 focus-visible:ring-accent-soft active:scale-95 ${
                    active
                      ? "ring-2 ring-ink-1 ring-offset-2 ring-offset-(--card-strong)"
                      : "hover:scale-110"
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

      <ConfirmDialog
        open={catDeleteId !== null}
        onClose={() => setCatDeleteId(null)}
        onConfirm={confirmDeleteCategory}
        title={t("settings.categories.deleteTitle")}
        message={t("settings.categories.deleteMessage", { name: deletingCat ? category(deletingCat) : "" })}
      />

      <ConfirmDialog
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        onConfirm={confirmImport}
        title={t("settings.data.replaceTitle")}
        message={t("settings.data.replaceMessage")}
        confirmLabel={t("settings.data.replace")}
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={confirmReset}
        title={t("settings.data.resetTitle")}
        message={t("settings.data.resetMessage", {
          records: state.transactions.length,
          accounts: state.savings.length,
          investments: state.investments.length,
          debts: state.debts.length,
        })}
        confirmLabel={t("settings.data.resetButton")}
      />
    </>
  );
}

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

function NumericSetting({
  label,
  hint,
  value,
  isValid,
  onCommit,
}: {
  label: string;
  hint?: string;
  value: number;
  isValid: (v: number) => boolean;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseAmount(draft);
    if (Number.isFinite(parsed) && isValid(parsed)) onCommit(parsed);
    setDraft(null);
  };

  return (
    <Field label={label} hint={hint}>
      <TextInput
        inputMode="decimal"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(null);
        }}
      />
    </Field>
  );
}

function nextHourLabel(): string {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return formatTime(next.toISOString());
}

function ratesOrigin(
  settings: AppState["settings"],
  t: ReturnType<typeof useT>["t"],
): string {
  if (!settings.ratesUpdatedAt) return t("settings.rates.starting");
  const source =
    settings.ratesSource === "monobank"
      ? t("settings.rates.source.monobank")
      : settings.ratesSource === "nbu"
        ? t("settings.rates.source.nbu")
        : t("settings.rates.source.manual");
  return t("settings.rates.updated", { when: formatDateTime(settings.ratesUpdatedAt), source });
}

function AtAGlance({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-field bg-ghost px-2 py-3">
      <p className="num-sm text-ink-1">{value}</p>
      <p className="mt-0.5 text-xs text-ink-3">{label}</p>
    </div>
  );
}

function DataRow({
  title,
  caption,
  action,
}: {
  title: string;
  caption: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-ink-1">{title}</p>
        <p className="text-xs text-ink-3">{caption}</p>
      </div>
      {action}
    </div>
  );
}
