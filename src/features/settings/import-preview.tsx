"use client";

import { OptionPicker } from "@/components/forms/option-picker";
import { useCategoryGroups } from "@/components/forms/picker-groups";
import { Badge, Button, Sheet } from "@/components/ui";
import { formatDateShort } from "@/lib/date";
import { formatMoney } from "@/lib/finance/money";
import type { ImportCandidate } from "@/lib/finance/import";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";

/**
 * Everything a statement would add, before it is added: tick what to keep,
 * fix a category, then import. Entries already in the ledger start unticked.
 */
export function ImportPreviewSheet({
  title,
  candidates,
  selected,
  onChange,
  onToggle,
  onImport,
  onClose,
}: {
  title: string;
  candidates: ImportCandidate[];
  selected: Set<string>;
  onChange: (externalId: string, categoryId: string) => void;
  onToggle: (externalIds: string[], on: boolean) => void;
  onImport: () => void;
  onClose: () => void;
}) {
  const { state } = useStore();
  const { t, tp } = useT();
  const expenseGroups = useCategoryGroups(state.categories, ["expense"]);
  const incomeGroups = useCategoryGroups(state.categories, ["income"]);
  const fresh = candidates.filter((c) => !c.duplicate);
  const picked = candidates.filter((c) => selected.has(c.externalId));
  const allOn = fresh.length > 0 && fresh.every((c) => selected.has(c.externalId));

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onImport} disabled={picked.length === 0}>
            {tp("import.add", picked.length)}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="caption">
          {tp("import.found", candidates.length)}
          {candidates.length > fresh.length && ` · ${tp("import.duplicates", candidates.length - fresh.length)}`}
        </p>
        {fresh.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onToggle(fresh.map((c) => c.externalId), !allOn)}>
            {allOn ? t("import.none") : t("import.all")}
          </Button>
        )}
      </div>
      {candidates.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-2">{t("import.empty")}</p>
      ) : (
        <ul className="rows">
          {candidates.map((c) => {
            const on = selected.has(c.externalId);
            return (
              <li key={c.externalId} className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-2.5 py-2 sm:grid-cols-[auto_minmax(0,1fr)_12rem_7rem] ${on ? "" : "opacity-55"}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => onToggle([c.externalId], e.target.checked)}
                  aria-label={c.description || formatDateShort(c.date)}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink-1">{c.description || "—"}</span>
                  <span className="flex items-center gap-1.5 text-xs text-ink-3">
                    {formatDateShort(c.date)}
                    {c.mcc ? ` · MCC ${c.mcc}` : ""}
                    {c.duplicate && <Badge>{t("import.already")}</Badge>}
                  </span>
                </span>
                <span className="col-start-2 sm:col-start-auto">
                  <OptionPicker
                    size="sm"
                    label={t("common.category")}
                    value={c.categoryId}
                    onChange={(categoryId) => onChange(c.externalId, categoryId)}
                    groups={c.type === "income" ? incomeGroups : expenseGroups}
                  />
                </span>
                <span
                  className={`tnum col-start-2 text-right text-sm font-semibold sm:col-start-auto ${
                    c.type === "income" ? "text-income" : "text-expense"
                  }`}
                >
                  {formatMoney(c.type === "income" ? c.amount : -c.amount, c.currency, { sign: true })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
