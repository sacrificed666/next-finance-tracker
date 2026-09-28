"use client";

import { AddButton, Card, IconDisc, ProgressMeter, SummaryPanel } from "@/components/ui";
import { formatDate, todayISO } from "@/lib/date";
import { receivablesTotal } from "@/lib/finance/finmath";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { sortItems } from "@/lib/state/listing";
import { useStore } from "@/lib/state/store";
import type { Receivable } from "@/lib/types";

/**
 * Money lent to others: what is still to come back, who is late, and how far
 * each loan is repaid. Settled loans sink to the bottom. Renders nothing until
 * there is one.
 */
export function ReceivablesCard({ onAdd, onEdit }: { onAdd: () => void; onEdit: (r: Receivable) => void }) {
  const { state } = useStore();
  const { t } = useT();
  const base = state.settings.baseCurrency;
  const today = todayISO();
  if (state.receivables.length === 0) return null;

  const outstanding = receivablesTotal(state);
  const progress = (r: Receivable) =>
    t("receivables.repaidOf", {
      repaid: formatMoney(r.repaid, r.currency, { compact: true }),
      amount: formatMoney(r.amount, r.currency, { compact: true }),
    });
  const overdue = state.receivables.filter((r) => r.repaid < r.amount && r.dueDate && r.dueDate < today);
  const rows = sortItems(
    state.receivables,
    (r) => `${r.repaid >= r.amount ? 1 : 0}|${r.dueDate ?? "9999"}|${r.date}`,
    "asc",
  );

  return (
    <Card
      title={t("receivables.title")}
      subtitle={t("receivables.subtitle", { amount: formatMoney(outstanding, base, { compact: true }) })}
      icon="user"
      action={<AddButton onClick={onAdd} label={t("common.add")} />}
    >
      <SummaryPanel
        className="mb-3"
        value={formatMoney(outstanding, base, { compact: true })}
        tone={outstanding > 0 ? "income" : undefined}
        meta={overdue.length > 0 ? <span className="text-expense">{t("receivables.overdueCount", { n: overdue.length })}</span> : undefined}
      />
      <ul className="rows">
        {rows.map((r) => {
          const settled = r.repaid >= r.amount;
          const late = !settled && r.dueDate !== undefined && r.dueDate < today;
          return (
            <li key={r.id}>
              <button type="button" onClick={() => onEdit(r)} className={`row-tap block w-full px-2.5 py-2 text-left ${settled ? "opacity-60" : ""}`}>
                <span className="flex items-center gap-3">
                  <IconDisc colorSlot={late ? 13 : 4} className="size-9 rounded-field text-base">
                    {r.icon}
                  </IconDisc>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-1">{r.name}</span>
                    <span className={`block truncate text-xs ${late ? "text-expense" : "text-ink-3"}`}>
                      {settled
                        ? t("receivables.settled")
                        : late
                          ? t("receivables.overdue", { date: formatDate(r.dueDate!) })
                          : r.dueDate
                            ? t("receivables.dueOn", { date: formatDate(r.dueDate) })
                            : t("receivables.lentOn", { date: formatDate(r.date) })}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-sm font-semibold text-ink-1">
                    {formatMoney(Math.max(0, r.amount - r.repaid), r.currency, { compact: true })}
                  </span>
                </span>
                {r.repaid > 0 && !settled && (
                  <span className="mt-1.5 block pl-12">
                    <ProgressMeter value={r.repaid} max={r.amount} label={progress(r)} />
                    <span className="tnum mt-1 block text-xs text-ink-3">{progress(r)}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
