"use client";

import { useRef, useState } from "react";
import {
  Button,
  ConfirmDialog,
  Field,
  GlassCard,
  PageHeader,
  SegmentedControl,
  Sheet,
  TextInput,
} from "@/components/ui";
import { CURRENCIES, CURRENCY_SYMBOL, DEFAULT_STATE, ICON_CHOICES } from "@/lib/constants";
import { formatDate, todayISO } from "@/lib/date";
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

  const [usdStr, setUsdStr] = useState(() => String(settings.rates.USD));
  const [eurStr, setEurStr] = useState(() => String(settings.rates.EUR));
  const [taxRateStr, setTaxRateStr] = useState(() => String(settings.tax.ratePct));
  const [taxFixedStr, setTaxFixedStr] = useState(() => String(settings.tax.fixedUAH));
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [kindTab, setKindTab] = useState<CategoryKind>("expense");
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catForm, setCatForm] = useState<CategoryForm>(() => emptyCategoryForm(1));
  const [catError, setCatError] = useState<string | null>(null);
  const [catDeleteId, setCatDeleteId] = useState<string | null>(null);
  const [catBlockedMsg, setCatBlockedMsg] = useState<string | null>(null);

  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<AppState | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleCategories = state.categories.filter((c) => c.kind === kindTab);
  const expenseCount = state.categories.filter((c) => c.kind === "expense").length;
  const kindOptions = KIND_OPTIONS.map((o) => ({
    ...o,
    label: `${o.label} (${o.value === "expense" ? expenseCount : state.categories.length - expenseCount})`,
  }));

  const commitUsd = () => {
    const v = parseAmount(usdStr);
    if (!Number.isFinite(v) || v <= 0) {
      setUsdStr(String(settings.rates.USD));
      return;
    }
    update((s) => ({
      ...s,
      settings: {
        ...s.settings,
        rates: { ...s.settings.rates, USD: v },
        ratesSource: "manual",
        ratesMeta: undefined,
      },
    }));
  };

  const commitEur = () => {
    const v = parseAmount(eurStr);
    if (!Number.isFinite(v) || v <= 0) {
      setEurStr(String(settings.rates.EUR));
      return;
    }
    update((s) => ({
      ...s,
      settings: {
        ...s.settings,
        rates: { ...s.settings.rates, EUR: v },
        ratesSource: "manual",
        ratesMeta: undefined,
      },
    }));
  };

  const commitTaxRate = () => {
    const v = parseAmount(taxRateStr);
    if (!Number.isFinite(v) || v < 0 || v >= 100) {
      setTaxRateStr(String(settings.tax.ratePct));
      return;
    }
    update((s) => ({ ...s, settings: { ...s.settings, tax: { ...s.settings.tax, ratePct: v } } }));
  };

  const commitTaxFixed = () => {
    const v = parseAmount(taxFixedStr);
    if (!Number.isFinite(v) || v < 0) {
      setTaxFixedStr(String(settings.tax.fixedUAH));
      return;
    }
    update((s) => ({ ...s, settings: { ...s.settings, tax: { ...s.settings.tax, fixedUAH: v } } }));
  };

  const refreshRates = async () => {
    setRatesLoading(true);
    setRatesError(null);
    try {
      const fetched = await fetchLiveRates();
      setUsdStr(String(fetched.USD.buy));
      setEurStr(String(fetched.EUR.buy));
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
    } catch {
      setRatesError(
        "Could not fetch live rates (Monobank limits requests to one per 5 minutes). Try again later or enter rates manually.",
      );
    } finally {
      setRatesLoading(false);
    }
  };

  /* ---------- categories ---------- */

  const openAddCategory = () => {
    setEditingCatId(null);
    setCatForm(emptyCategoryForm((state.categories.length % 8) + 1));
    setCatError(null);
    setCatSheetOpen(true);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCatId(cat.id);
    setCatForm({ name: cat.name, icon: cat.icon, colorSlot: cat.colorSlot });
    setCatError(null);
    setCatSheetOpen(true);
  };

  const closeCatSheet = () => {
    setCatSheetOpen(false);
    setEditingCatId(null);
    setCatError(null);
  };

  const submitCategory = () => {
    const name = catForm.name.trim();
    if (!name) {
      setCatError("Name the category.");
      return;
    }
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

  const categoryInUse = (id: string): boolean =>
    state.transactions.some((t) => t.categoryId === id) ||
    state.recurring.some((r) => r.categoryId === id) ||
    state.budgets.some((b) => b.categoryId === id);

  const requestDeleteCategory = (id: string) => {
    if (categoryInUse(id)) {
      setCatBlockedMsg(
        "This category is used by transactions, recurring rules or budgets — reassign them first.",
      );
      return;
    }
    setCatDeleteId(id);
  };

  const confirmDeleteCategory = () => {
    if (!catDeleteId) return;
    update((s) => ({
      ...s,
      categories: s.categories.filter((c) => c.id !== catDeleteId),
    }));
    setCatDeleteId(null);
  };

  const deletingCat = state.categories.find((c) => c.id === catDeleteId);

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
    URL.revokeObjectURL(url);
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
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
    replace(pendingImport);
    setPendingImport(null);
  };

  const confirmReset = () => {
    replace({ ...DEFAULT_STATE });
    setResetOpen(false);
  };

  const meta = settings.ratesMeta;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Currencies, taxes, categories and your data — all in one place"
      />
      <div className="stagger grid min-w-0 items-start gap-4 xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
        <GlassCard title="General" subtitle="Currency and appearance" icon="⚙️">
          <div className="min-w-0 space-y-4">
            <Field label="Base currency" hint="Totals and charts are shown in it">
              <SegmentedControl
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                value={settings.baseCurrency}
                onChange={(v: Currency) =>
                  update((s) => ({ ...s, settings: { ...s.settings, baseCurrency: v } }))
                }
              />
            </Field>
            <Field label="Theme">
              <SegmentedControl
                options={THEME_OPTIONS}
                value={settings.theme}
                onChange={(v: ThemePref) =>
                  update((s) => ({ ...s, settings: { ...s.settings, theme: v } }))
                }
              />
            </Field>
          </div>
        </GlassCard>

        <GlassCard title="Exchange rates" subtitle="How ₴ / $ / € convert" icon="💱">
          <div className="mb-4 grid grid-cols-2 gap-3">
            {(["USD", "EUR"] as const).map((c) => (
              <div key={c} className="rounded-field bg-ghost px-3.5 py-3 text-center">
                <p className="text-xs text-ink-3">1 {CURRENCY_SYMBOL[c]}</p>
                <p className="tnum mt-0.5 text-lg font-bold text-ink-1">
                  {settings.rates[c].toFixed(2)} ₴
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="USD → UAH" hint={meta?.USD ? `buy ${meta.USD.buy} · sell ${meta.USD.sell}` : undefined}>
              <TextInput
                inputMode="decimal"
                value={usdStr}
                onChange={(e) => setUsdStr(e.target.value)}
                onBlur={commitUsd}
              />
            </Field>
            <Field label="EUR → UAH" hint={meta?.EUR ? `buy ${meta.EUR.buy} · sell ${meta.EUR.sell}` : undefined}>
              <TextInput
                inputMode="decimal"
                value={eurStr}
                onChange={(e) => setEurStr(e.target.value)}
                onBlur={commitEur}
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={refreshRates} disabled={ratesLoading}>
              {ratesLoading ? "Updating…" : "Update from Monobank"}
            </Button>
            {settings.ratesUpdatedAt && (
              <span className="text-xs text-ink-3">
                Updated {formatDate(settings.ratesUpdatedAt.slice(0, 10))}
                {settings.ratesSource === "monobank"
                  ? " (Monobank, buy rate)"
                  : settings.ratesSource === "nbu"
                    ? " (NBU official)"
                    : ""}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Conversions use the bank buy rate — what you actually get when selling $ or €.
            Falls back to the official NBU rate if Monobank is unavailable.
          </p>
          {ratesError && <p className="mt-2 text-sm text-expense">{ratesError}</p>}
        </GlassCard>

        <GlassCard title="Salary tax (ФОП)" subtitle="Deductions applied to income" icon="🧾">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tax rate" hint="% removed (single tax + military levy)">
              <TextInput
                inputMode="decimal"
                value={taxRateStr}
                onChange={(e) => setTaxRateStr(e.target.value)}
                onBlur={commitTaxRate}
              />
            </Field>
            <Field label="Fixed deduction" hint="₴ per entry (ЄСВ)">
              <TextInput
                inputMode="decimal"
                value={taxFixedStr}
                onChange={(e) => setTaxFixedStr(e.target.value)}
                onBlur={commitTaxFixed}
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-ink-3">
            Used by the “Apply ФОП tax” toggle when logging income: take-home = gross ×{" "}
            {(1 - settings.tax.ratePct / 100).toFixed(2)} − {settings.tax.fixedUAH} ₴ (the fixed
            part converted into the income currency).
          </p>
        </GlassCard>

        </div>

        <div className="min-w-0 space-y-4">
        <GlassCard
          title="Categories"
          subtitle={`${state.categories.length} total · tap to edit`}
          icon="🏷️"
          action={
            <Button variant="ghost" onClick={openAddCategory}>
              + Add
            </Button>
          }
        >
          <SegmentedControl options={kindOptions} value={kindTab} onChange={setKindTab} />
          <ul className="mt-4 space-y-0.5">
            {visibleCategories.length === 0 && (
              <li className="py-6 text-center text-sm text-ink-2">
                No categories of this kind yet.
              </li>
            )}
            {visibleCategories.map((cat) => (
              <li
                key={cat.id}
                className="group flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-ghost"
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
                <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100">
                  <IconAction label={`Edit ${cat.name}`} onClick={() => openEditCategory(cat)}>
                    ✏️
                  </IconAction>
                  <IconAction
                    label={`Delete ${cat.name}`}
                    danger
                    onClick={() => requestDeleteCategory(cat.id)}
                  >
                    🗑️
                  </IconAction>
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard title="Data" subtitle="Backup, restore, reset" icon="💾">
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
          {/* destructive action, set apart in its own danger zone */}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-expense/20 bg-expense/8 px-4 py-3">
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

        <GlassCard title="About" subtitle="What lives in your database" icon="ℹ️">
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <AtAGlance label="Transactions" value={state.transactions.length} />
            <AtAGlance label="Categories" value={state.categories.length} />
            <AtAGlance
              label="Holdings"
              value={state.savings.length + state.investments.length}
            />
          </div>
          <p className="text-sm leading-relaxed text-ink-2">
            All data is stored in your own PostgreSQL database and is never sent anywhere
            else. Changes are saved automatically a moment after you make them. Export a
            backup before migrating or resetting the database. Exchange rates are only used
            to convert between currencies.
          </p>
        </GlassCard>
        </div>
      </div>

      {/* category add/edit */}
      <Sheet
        open={catSheetOpen}
        onClose={closeCatSheet}
        title={editingCatId ? "Edit category" : "New category"}
        footer={
          <>
            <Button variant="ghost" onClick={closeCatSheet}>
              Cancel
            </Button>
            <Button onClick={submitCategory}>Save</Button>
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
        <Field label="Icon">
          <div className="grid grid-cols-7 gap-2 sm:grid-cols-9">
            {ICON_CHOICES.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setCatForm({ ...catForm, icon })}
                aria-pressed={catForm.icon === icon}
                className={`flex size-9 items-center justify-center rounded-full text-lg transition-colors ${
                  catForm.icon === icon ? "bg-accent-soft ring-2 ring-accent" : "bg-ghost hover:bg-ghost-2"
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }, (_, i) => i + 1).map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setCatForm({ ...catForm, colorSlot: slot })}
                aria-label={`Color ${slot}`}
                aria-pressed={catForm.colorSlot === slot}
                className={`size-8 rounded-full transition-transform hover:scale-110 active:scale-95 ${
                  catForm.colorSlot === slot ? "ring-2 ring-offset-2 ring-offset-bg ring-ink-1" : ""
                }`}
                style={{ backgroundColor: `var(--series-${slot})` }}
              />
            ))}
          </div>
        </Field>
        {catError && <p className="text-sm text-expense">{catError}</p>}
      </Sheet>

      <ConfirmDialog
        open={catDeleteId !== null}
        onClose={() => setCatDeleteId(null)}
        onConfirm={confirmDeleteCategory}
        title="Delete this category?"
        message={`“${deletingCat?.name ?? ""}” will be removed permanently.`}
      />

      <Sheet
        open={catBlockedMsg !== null}
        onClose={() => setCatBlockedMsg(null)}
        title="Category cannot be deleted"
        footer={<Button onClick={() => setCatBlockedMsg(null)}>Got it</Button>}
      >
        <p className="text-sm text-ink-2">{catBlockedMsg}</p>
      </Sheet>

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
        message="All transactions, accounts and investments will be deleted permanently. This cannot be undone."
        confirmLabel="Reset"
      />
    </>
  );
}

function IconAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-full text-sm transition-colors hover:bg-ghost-2 active:scale-90 ${
        danger ? "hover:bg-expense/15" : ""
      }`}
    >
      {children}
    </button>
  );
}

function AtAGlance({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-field bg-ghost px-2 py-3">
      <p className="tnum text-xl font-bold text-ink-1">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-3">{label}</p>
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
