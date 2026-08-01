"use client";

import { useRef, useState } from "react";
import {
  Button,
  ConfirmDialog,
  Field,
  FieldSet,
  GlassCard,
  OptionChips,
  PageHeader,
  SegmentedControl,
  Sheet,
  TextInput,
  useRadioGroupKeys,
} from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { CURRENCIES, CURRENCY_SYMBOL, DEFAULT_STATE, ICON_CHOICES } from "@/lib/constants";
import { formatDateTime, todayISO } from "@/lib/date";
import { exportBackup, parseBackup } from "@/lib/backup";
import { parseAmount } from "@/lib/money";
import { fetchLiveRates } from "@/lib/rates";
import { uid, useStore } from "@/lib/store";
import type { AppState, Category, CategoryKind, Currency, ThemePref } from "@/lib/types";

const THEME_OPTIONS: Array<{ value: ThemePref; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const KIND_OPTIONS: Array<{ value: CategoryKind; label: string }> = [
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
];

interface CategoryForm {
  name: string;
  icon: string;
  colorSlot: number;
}

function emptyCategoryForm(nextSlot: number): CategoryForm {
  return { name: "", icon: ICON_CHOICES[0], colorSlot: nextSlot };
}

export function SettingsPage() {
  const { state, update, replace } = useStore();
  const { settings } = state;

  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [kindTab, setKindTab] = useState<CategoryKind>("expense");
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catForm, setCatForm] = useState<CategoryForm>(() => emptyCategoryForm(1));
  const [catDeleteId, setCatDeleteId] = useState<string | null>(null);

  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<AppState | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleCategories = state.categories.filter((c) => c.kind === kindTab);
  const expenseCount = state.categories.filter((c) => c.kind === "expense").length;
  const kindOptions = KIND_OPTIONS.map((o) => ({
    ...o,
    label: `${o.label} (${o.value === "expense" ? expenseCount : state.categories.length - expenseCount})`,
  }));

  const setRate = (currency: "USD" | "EUR", value: number) =>
    update((s) => ({
      ...s,
      settings: {
        ...s.settings,
        rates: { ...s.settings.rates, [currency]: value },
        // a hand-typed rate is nobody's quote but yours: drop the bank's
        // buy/sell detail so the card cannot claim a source it no longer has
        ratesSource: "manual",
        ratesMeta: undefined,
        ratesUpdatedAt: new Date().toISOString(),
      },
    }));

  const setTax = (key: "ratePct" | "fixedUAH", value: number) =>
    update((s) => ({ ...s, settings: { ...s.settings, tax: { ...s.settings.tax, [key]: value } } }));

  const refreshRates = async () => {
    setRatesLoading(true);
    setRatesError(null);
    try {
      const fetched = await fetchLiveRates();
      update((s) => ({
        ...s,
        settings: {
          ...s.settings,
          // conversion uses the bank buy rate — same convention as the
          // user's spreadsheets (what you get when selling $ or €)
          rates: { USD: fetched.USD.buy, EUR: fetched.EUR.buy },
          ratesMeta: { USD: fetched.USD, EUR: fetched.EUR },
          ratesSource: fetched.source,
          ratesUpdatedAt: new Date().toISOString(),
        },
      }));
    } catch (err) {
      // say what actually went wrong — "rate limited" and "you are offline"
      // call for different next steps, and the old text always claimed the first
      setRatesError(
        `${err instanceof Error ? err.message : "Both rate sources were unreachable."} You can type the rates in by hand below.`,
      );
    } finally {
      setRatesLoading(false);
    }
  };

  /* ---------- categories ---------- */

  /** the colour slot this kind of category leans on least, so a new one stands apart */
  const leastUsedSlot = (kind: CategoryKind): number => {
    const counts = new Array(9).fill(0);
    for (const c of state.categories) if (c.kind === kind) counts[c.colorSlot] = (counts[c.colorSlot] ?? 0) + 1;
    let best = 1;
    for (let slot = 2; slot <= 8; slot++) if (counts[slot] < counts[best]) best = slot;
    return best;
  };

  const openAddCategory = () => {
    setEditingCatId(null);
    setCatForm(emptyCategoryForm(leastUsedSlot(kindTab)));
    setCatSheetOpen(true);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCatId(cat.id);
    setCatForm({ name: cat.name, icon: cat.icon, colorSlot: cat.colorSlot });
    setCatSheetOpen(true);
  };

  const closeCatSheet = () => {
    setCatSheetOpen(false);
    setEditingCatId(null);
  };

  const catProblem = catForm.name.trim() === "" ? "Name the category." : null;

  const submitCategory = () => {
    const name = catForm.name.trim();
    if (!name) return;
    if (editingCatId) {
      update((s) => ({
        ...s,
        categories: s.categories.map((c) =>
          c.id === editingCatId
            ? { ...c, name, icon: catForm.icon, colorSlot: catForm.colorSlot }
            : c,
        ),
      }));
    } else {
      const cat: Category = {
        id: uid(),
        name,
        icon: catForm.icon,
        colorSlot: catForm.colorSlot,
        kind: kindTab,
      };
      update((s) => ({ ...s, categories: [...s.categories, cat] }));
    }
    closeCatSheet();
  };

  /**
   * What still points at each category. Deleting one of these would leave
   * transactions pointing at a category that no longer exists, so the row says
   * so up front instead of letting the button fail after the click.
   */
  const categoryUse = new Map<string, { records: number; rules: number; budgets: number }>();
  const bump = (id: string, key: "records" | "rules" | "budgets") => {
    if (!id) return;
    const entry = categoryUse.get(id) ?? { records: 0, rules: 0, budgets: 0 };
    entry[key]++;
    categoryUse.set(id, entry);
  };
  for (const t of state.transactions) bump(t.categoryId, "records");
  for (const r of state.recurring) bump(r.categoryId, "rules");
  for (const b of state.budgets) bump(b.categoryId, "budgets");

  const blockedReason = (id: string): string | null => {
    const use = categoryUse.get(id);
    if (!use) return null;
    const parts = [
      use.records && `${use.records} ${use.records === 1 ? "record" : "records"}`,
      use.rules && `${use.rules} recurring ${use.rules === 1 ? "rule" : "rules"}`,
      use.budgets && "a budget",
    ].filter(Boolean);
    return `In use by ${parts.join(", ")} — reassign them before deleting`;
  };

  const confirmDeleteCategory = () => {
    if (!catDeleteId) return;
    update(
      (s) => ({
        ...s,
        categories: s.categories.filter((c) => c.id !== catDeleteId),
      }),
      "Category deleted",
    );
    setCatDeleteId(null);
  };

  const deletingCat = state.categories.find((c) => c.id === catDeleteId);

  const colorGroupRef = useRef<HTMLDivElement>(null);
  const onColorKeyDown = useRadioGroupKeys(
    colorGroupRef,
    ["1", "2", "3", "4", "5", "6", "7", "8"],
    String(catForm.colorSlot),
    (slot) => setCatForm((f) => ({ ...f, colorSlot: Number(slot) })),
  );

  /* ---------- data ---------- */

  const exportData = () => {
    const blob = new Blob([exportBackup(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // revoked on the next turn, not inline: Safari reads the blob after the
    // click returns, and pulling the URL out from under it downloads nothing
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
      setImportError(err instanceof Error ? err.message : "Could not read the file.");
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    const { transactions, categories, savings, investments } = pendingImport;
    // the one action in the app that discards everything at once, so it is also
    // the one that most needs a way back before the write settles
    replace(pendingImport, "Data replaced from file");
    setPendingImport(null);
    // a silent swap of the whole dataset leaves you guessing whether the file
    // was the one you meant — say what came in
    setImportSummary(
      `Imported ${transactions.length} records, ${categories.length} categories, ${
        savings.length + investments.length
      } accounts and investments.`,
    );
  };

  const confirmReset = () => {
    replace({ ...DEFAULT_STATE }, "Everything reset");
    setResetOpen(false);
  };

  const meta = settings.ratesMeta;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Currencies, taxes, categories and your data — all in one place"
      />
      {/* CSS columns balance the cards by height on their own — hand-packed
          columns always left one side short */}
      <div className="stagger min-w-0 xl:columns-2 xl:gap-5 *:mb-4 sm:*:mb-5 *:break-inside-avoid">
        <GlassCard title="General" subtitle="Currency and appearance" icon={<Icon name="gear" />}>
          <div className="min-w-0 space-y-4">
            <FieldSet label="Base currency" hint="Totals and charts are shown in it">
              <SegmentedControl
                label="Base currency"
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                value={settings.baseCurrency}
                onChange={(v: Currency) =>
                  update((s) => ({ ...s, settings: { ...s.settings, baseCurrency: v } }))
                }
              />
            </FieldSet>
            <FieldSet label="Theme">
              <SegmentedControl
                label="Theme"
                options={THEME_OPTIONS}
                value={settings.theme}
                onChange={(v: ThemePref) =>
                  update((s) => ({ ...s, settings: { ...s.settings, theme: v } }))
                }
              />
            </FieldSet>
          </div>
        </GlassCard>

        <GlassCard title="Exchange rates" subtitle="How ₴ / $ / € convert" icon={<Icon name="exchange" />}>
          {/* the two read-only tiles that used to sit here printed the same two
              numbers as the fields directly below them */}
          <div className="grid gap-4 sm:grid-cols-2">
            {(["USD", "EUR"] as const).map((c) => (
              <NumericSetting
                key={c}
                label={`${c} → UAH`}
                hint={
                  meta?.[c]
                    ? `bank buy ${meta[c].buy} · sell ${meta[c].sell}`
                    : `₴ for 1 ${CURRENCY_SYMBOL[c]}`
                }
                value={settings.rates[c]}
                isValid={(v) => v > 0}
                onCommit={(v) => setRate(c, v)}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={refreshRates} disabled={ratesLoading}>
              {ratesLoading ? "Updating…" : "Update rates"}
            </Button>
            <span className="text-xs text-ink-3">{ratesOrigin(settings)}</span>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Fetched from Monobank, falling back to the official NBU rate. Conversions use
            the bank buy rate — what you actually get when selling $ or €.
          </p>
          {ratesError && <p className="mt-2 text-sm text-expense">{ratesError}</p>}
        </GlassCard>

        <GlassCard title="Salary tax (ФОП)" subtitle="Deductions applied to income" icon={<Icon name="receipt" />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumericSetting
              label="Tax rate"
              hint="% removed (single tax + military levy)"
              value={settings.tax.ratePct}
              isValid={(v) => v >= 0 && v < 100}
              onCommit={(v) => setTax("ratePct", v)}
            />
            <NumericSetting
              label="Fixed deduction"
              hint="₴ per entry (ЄСВ)"
              value={settings.tax.fixedUAH}
              isValid={(v) => v >= 0}
              onCommit={(v) => setTax("fixedUAH", v)}
            />
          </div>
          <p className="mt-3 text-xs text-ink-3">
            Used by the “Apply ФОП tax” toggle when logging income: take-home = gross ×{" "}
            {(1 - settings.tax.ratePct / 100).toFixed(2)} − {settings.tax.fixedUAH} ₴ (the fixed
            part converted into the income currency).
          </p>
        </GlassCard>

        <GlassCard
          title="Categories"
          subtitle={`${state.categories.length} total · tap a row to edit`}
          icon={<Icon name="tag" />}
          action={
            <Button variant="ghost" onClick={openAddCategory}>
              + Add
            </Button>
          }
        >
          <SegmentedControl
            label="Category kind"
            options={kindOptions}
            value={kindTab}
            onChange={setKindTab}
          />
          {/* two abreast once there is room: a single column of twenty rows made
              this card twice the height of the page's other column, and the CSS
              columns cannot split a card to make up for it */}
          <ul className="mt-4 grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
            {visibleCategories.length === 0 && (
              <li className="py-6 text-center text-sm text-ink-2 sm:col-span-2">
                No categories of this kind yet.
              </li>
            )}
            {visibleCategories.map((cat) => {
              const blocked = blockedReason(cat.id);
              const records = categoryUse.get(cat.id)?.records ?? 0;
              return (
                <li key={cat.id} className="flex items-center gap-1">
                  {/* the whole row opens the editor, like every other list in
                      the app — the separate pencil button was the only way in */}
                  <button
                    type="button"
                    onClick={() => openEditCategory(cat)}
                    className="row-tap flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left"
                  >
                    <span
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg"
                      style={{
                        backgroundColor: `color-mix(in oklab, var(--series-${cat.colorSlot}) 20%, transparent)`,
                      }}
                    >
                      {cat.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-1">
                      {cat.name}
                    </span>
                    {records > 0 && (
                      // the bare count, so the name keeps the width: spelling
                      // out "records" truncated "Subscriptions" to "Subscri…"
                      <span
                        className="tnum shrink-0 text-xs text-ink-3"
                        title={`${records} ${records === 1 ? "record" : "records"}`}
                      >
                        {records}
                      </span>
                    )}
                  </button>
                  <IconAction
                    label={`Delete ${cat.name}`}
                    reason={blocked}
                    icon="trash"
                    danger
                    onClick={() => setCatDeleteId(cat.id)}
                  />
                </li>
              );
            })}
          </ul>
        </GlassCard>

        <GlassCard title="Data" subtitle="Backup, restore, reset" icon={<Icon name="database" />}>
          <div className="divide-y divide-hairline">
            <DataRow
              title="Export to file"
              caption="JSON backup of everything"
              action={<Button variant="ghost" onClick={exportData}>Download</Button>}
            />
            <DataRow
              title="Import from file"
              caption="Replaces all current data"
              action={
                <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
                  Choose file
                </Button>
              }
            />
          </div>
          {importError && <p className="mt-3 text-sm text-expense">{importError}</p>}
          {importSummary && <p className="mt-3 text-sm text-income">{importSummary}</p>}
          {/* destructive action, set apart in its own danger zone */}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-field border border-expense/20 bg-expense/8 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-expense">Reset everything</p>
              <p className="text-xs text-ink-3">Deletes all data permanently</p>
            </div>
            <Button variant="danger" onClick={() => setResetOpen(true)}>
              Reset
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

        <GlassCard title="About" subtitle="What lives in your database" icon={<Icon name="info" />}>
          {/* "Categories" moved out — the card above already counts them, and
              "Holdings" lumped two different things into one number */}
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <AtAGlance label="Records" value={state.transactions.length} />
            <AtAGlance label="Accounts" value={state.savings.length} />
            <AtAGlance label="Investments" value={state.investments.length} />
          </div>
          <p className="text-sm leading-relaxed text-ink-2">
            All data is stored in your own PostgreSQL database and is never sent anywhere
            else. Changes are saved automatically a moment after you make them. Export a
            backup before migrating or resetting the database. Exchange rates are only used
            to convert between currencies.
          </p>
        </GlassCard>

      </div>

      {/* category add/edit */}
      <Sheet
        open={catSheetOpen}
        onClose={closeCatSheet}
        onSubmit={submitCategory}
        problem={catProblem}
        title={editingCatId ? "Edit category" : "New category"}
        footer={
          <>
            <Button variant="ghost" onClick={closeCatSheet}>
              Cancel
            </Button>
            <Button type="submit" disabled={catProblem !== null}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Name">
          <TextInput
            value={catForm.name}
            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
            placeholder="e.g. Sports"
          />
        </Field>
        <FieldSet label="Icon">
          <OptionChips
            label="Icon"
            options={ICON_CHOICES.map((icon) => ({ value: icon, label: icon }))}
            value={catForm.icon}
            onChange={(icon) => setCatForm({ ...catForm, icon })}
          />
        </FieldSet>
        <FieldSet label="Color" hint="Used by this category's slice in every chart">
          {/* one choice out of eight: a radiogroup, like the chips above it.
              As eight independent toggle buttons it announced "pressed" on one
              swatch and said nothing about the other seven. */}
          {/* Columns that divide the width, the same rule the icon grid above
              uses — a hard `grid-cols-8` gave each swatch 34px of column on a
              360px phone to draw a 36px circle in, so the grid overflowed and
              the sheet grew a horizontal scrollbar. */}
          <div
            ref={colorGroupRef}
            onKeyDown={onColorKeyDown}
            role="radiogroup"
            aria-label="Color"
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
                  aria-label={`Colour ${slot}`}
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
        title="Delete this category?"
        message={`“${deletingCat?.name ?? ""}” will be removed permanently.`}
      />

      <ConfirmDialog
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        onConfirm={confirmImport}
        title="Replace all data from the file?"
        message="Your current data will be lost."
        confirmLabel="Replace"
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={confirmReset}
        title="Reset all data?"
        // the counts are the point: "all your data" is abstract until it says
        // how many years of records are about to go
        message={`${state.transactions.length} records, ${state.savings.length} accounts, ${state.investments.length} investments and ${state.debts.length} debts will be deleted from the database. Export a backup first if you might want any of it back.`}
        confirmLabel="Reset"
      />
    </>
  );
}

/**
 * The row actions used to be bare emoji, which read as decoration rather than
 * as buttons. Same footprint, but a stroked icon in a real target with the
 * app's hover language on it.
 *
 * A disabled button explains itself in its accessible name rather than only in
 * a `title`: hover text is not announced and does not exist on touch, so "why
 * can't I delete this?" had no answer on a phone.
 */
function IconAction({
  label,
  reason,
  onClick,
  icon,
  danger,
}: {
  label: string;
  /** why the action is unavailable; its presence is what disables the button */
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

/**
 * A number that lives in the store, edited through a text field.
 *
 * The draft only exists while you are typing in it: everywhere else the field
 * reads straight from the store. Keeping the text in its own state instead
 * meant an import or a reset changed the setting underneath the field while it
 * went on showing the old number — and blurring it, with nothing typed, wrote
 * that stale number back over what had just come in.
 */
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
    if (draft === null) return; // untouched — nothing to write
    const parsed = parseAmount(draft);
    if (Number.isFinite(parsed) && isValid(parsed)) onCommit(parsed);
    // either way the field goes back to mirroring the store, so a rejected
    // entry visibly snaps back instead of sitting there looking accepted
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

/** where the rates on screen came from, and when */
function ratesOrigin(settings: AppState["settings"]): string {
  if (!settings.ratesUpdatedAt) return "Starting rates — not updated yet";
  const source =
    settings.ratesSource === "monobank"
      ? "Monobank, buy rate"
      : settings.ratesSource === "nbu"
        ? "NBU official"
        : "typed in by hand";
  return `Updated ${formatDateTime(settings.ratesUpdatedAt)} · ${source}`;
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
