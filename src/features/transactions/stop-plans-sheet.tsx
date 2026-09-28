"use client";

import { useState } from "react";
import { Button, IconDisc, Sheet } from "@/components/ui";
import { looksLikeFixedPayment } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { currentMonth } from "@/lib/date";
import { stopSchedules, useStore } from "@/lib/state/store";
import type { RecurringRule } from "@/lib/types";

/**
 * Picks which of the rules that book their budget as spent are really plans. Bills
 * (rent, utilities, a loan) start unticked: posting them at their budget is usually
 * the real payment.
 */
export function StopPlansSheet({ rules, onClose }: { rules: RecurringRule[]; onClose: () => void }) {
  const { state, update } = useStore();
  const { t, tp, category } = useT();
  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(rules.filter((r) => !looksLikeFixedPayment(catById.get(r.categoryId))).map((r) => r.id)),
  );

  const stop = () => {
    update((s) => stopSchedules(s, [...picked], currentMonth()), t("tx.rec.plans.done"));
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("tx.rec.plans.sheetTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={stop} disabled={picked.size === 0}>
            {tp("tx.rec.plans.stopCount", picked.size)}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{t("tx.rec.plans.confirm")}</p>
      <ul className="rows">
        {rules.map((rule) => {
          const cat = catById.get(rule.categoryId);
          const on = picked.has(rule.id);
          return (
            <li key={rule.id}>
              <label className="row-tap flex cursor-pointer items-center gap-3 px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(rule.id);
                      else next.delete(rule.id);
                      return next;
                    })
                  }
                  className="size-4 accent-(--accent)"
                />
                <IconDisc colorSlot={cat?.colorSlot} className="size-8 rounded-full text-sm">
                  {cat?.icon ?? "❓"}
                </IconDisc>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-1">
                    {category(cat)}
                    {rule.note && <span className="font-normal text-ink-3"> · {rule.note}</span>}
                  </span>
                  {looksLikeFixedPayment(cat) && <span className="block text-xs text-ink-3">{t("tx.rec.plans.fixed")}</span>}
                </span>
                <span className="tnum shrink-0 text-sm font-semibold text-ink-1">
                  {formatMoney(rule.amount, rule.currency, { compact: true })}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
